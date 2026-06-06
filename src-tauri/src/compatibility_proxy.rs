use crate::agent_writer::{AGENT_CLAUDE, AGENT_CODEX, AGENT_GEMINI};
use crate::app_config::{APP_HOME_DIR, PROXY_USER_AGENT};
use crate::database::Database;
use crate::models::{ApiProvider, Provider};
use crate::relay_translate::{self, ChatSseBuffer, ChatSseEvent};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const PROXY_HOST: &str = "127.0.0.1";
pub const PROXY_PORT: u16 = 47632;
const UPSTREAM_MAX_RETRIES: usize = 3;
const UPSTREAM_RETRY_BASE_MS: u64 = 500;

pub fn proxy_base_url() -> String {
    format!("http://{}:{}/v1", PROXY_HOST, PROXY_PORT)
}

pub fn start(db: Arc<Mutex<Database>>) {
    thread::spawn(move || {
        let addr = format!("{}:{}", PROXY_HOST, PROXY_PORT);
        let listener = match TcpListener::bind(&addr) {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("[compatibility_proxy] failed to bind {addr}: {error}");
                return;
            }
        };

        for stream in listener.incoming().flatten() {
            let db = Arc::clone(&db);
            thread::spawn(move || {
                if let Err(error) = handle_connection(stream, db) {
                    eprintln!("[compatibility_proxy] request failed: {error}");
                }
            });
        }
    });
}

fn handle_connection(mut stream: TcpStream, db: Arc<Mutex<Database>>) -> Result<(), String> {
    let request = read_http_request(&mut stream)?;
    let path = request.path.split('?').next().unwrap_or("");
    let agent = if path.starts_with("/anthropic/") {
        AGENT_CLAUDE
    } else if path.starts_with("/gemini/") {
        AGENT_GEMINI
    } else {
        AGENT_CODEX
    };
    let (provider, vision) = {
        let db = db.lock().map_err(|_| "database lock failed".to_string())?;
        let mut provider = db
            .current_provider_for_agent(agent)
            .map_err(|error| error.to_string())?;
        if agent == AGENT_CODEX {
            let model = extract_model(&request.body);
            let providers = db.providers().map_err(|error| error.to_string())?;
            provider = select_responses_provider_for_model(&provider, &providers, model.as_deref());
        }
        let settings = db.settings().map_err(|error| error.to_string())?;
        let main_vision_capability = db
            .api_provider_by_id(&provider.api_provider_id)
            .ok()
            .map(|api| crate::vision_fallback::model_vision_capability(&api, &provider.model))
            .unwrap_or(crate::vision_fallback::VisionCapability::Unknown);
        let agent_fallback_enabled = match agent {
            AGENT_CLAUDE => settings.vision_claude_enabled,
            AGENT_GEMINI => settings.vision_gemini_enabled,
            _ => settings.vision_codex_enabled,
        };
        let vision = if settings.vision_fallback_enabled
            && agent_fallback_enabled
            && main_vision_capability == crate::vision_fallback::VisionCapability::TextOnly
            && !settings.vision_api_provider_id.trim().is_empty()
            && !settings.vision_model.trim().is_empty()
        {
            db.api_provider_by_id(&settings.vision_api_provider_id)
                .ok()
                .map(|api| (api, settings.vision_model))
        } else {
            None
        };
        (provider, vision)
    };

    route_request(&provider, vision.as_ref(), request, &mut stream)?;
    Ok(())
}

fn select_responses_provider_for_model(
    current: &Provider,
    providers: &[Provider],
    model: Option<&str>,
) -> Provider {
    let Some(model) = model.map(str::trim).filter(|model| !model.is_empty()) else {
        return current.clone();
    };

    if current.agent == AGENT_CODEX && current.model.trim().eq_ignore_ascii_case(model) {
        return current.clone();
    }

    let mut first_match: Option<&Provider> = None;
    let mut first_chat_match: Option<&Provider> = None;
    for provider in providers {
        if provider.agent != AGENT_CODEX || !provider.model.trim().eq_ignore_ascii_case(model) {
            continue;
        }
        first_match.get_or_insert(provider);
        if uses_chat_completions(provider) {
            first_chat_match = Some(provider);
            break;
        }
    }

    first_chat_match
        .or(first_match)
        .cloned()
        .unwrap_or_else(|| current.clone())
}

struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| error.to_string())?;

    let mut data = Vec::new();
    let mut buf = [0_u8; 8192];
    let header_end = loop {
        let n = stream.read(&mut buf).map_err(|error| error.to_string())?;
        if n == 0 {
            return Err("connection closed before headers".to_string());
        }
        data.extend_from_slice(&buf[..n]);
        if let Some(pos) = find_header_end(&data) {
            break pos;
        }
        if data.len() > 1024 * 1024 {
            return Err("request headers too large".to_string());
        }
    };

    let header_bytes = &data[..header_end];
    let header_text = String::from_utf8_lossy(header_bytes);
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or("").to_string();
    let path = request_parts.next().unwrap_or("").to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let body_start = header_end + 4;
    let mut body = data.get(body_start..).unwrap_or_default().to_vec();
    while body.len() < content_length {
        let n = stream.read(&mut buf).map_err(|error| error.to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&buf[..n]);
    }
    body.truncate(content_length);

    Ok(HttpRequest { method, path, body })
}

fn find_header_end(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|window| window == b"\r\n\r\n")
}

fn route_request(
    provider: &Provider,
    vision: Option<&(ApiProvider, String)>,
    request: HttpRequest,
    stream: &mut TcpStream,
) -> Result<(), String> {
    let path = request.path.split('?').next().unwrap_or("");

    if path.starts_with("/anthropic/") {
        return handle_anthropic_provider(provider, vision, request, stream);
    }
    if path.starts_with("/gemini/") {
        return handle_gemini_provider(provider, vision, request, stream);
    }

    if request.method == "GET" && (path == "/v1/models" || path.ends_with("/models")) {
        let model = if provider.model.trim().is_empty() {
            "model"
        } else {
            provider.model.trim()
        };
        return write_http_response(
            stream,
            200,
            "application/json",
            relay_translate::synthetic_models_response(model),
        );
    }

    if request.method != "POST" || !(path == "/v1/responses" || path.ends_with("/responses")) {
        return write_http_response(
            stream,
            404,
            "application/json",
            br#"{"error":{"message":"unsupported compatibility proxy route"}}"#.to_vec(),
        );
    }

    let response = if uses_chat_completions(provider) {
        handle_chat_completions_provider(provider, vision, request, stream)?
    } else {
        handle_responses_provider(provider, vision, request, stream)?
    };
    if let Some(response) = response {
        stream
            .write_all(&response)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn handle_chat_completions_provider(
    provider: &Provider,
    vision: Option<&(ApiProvider, String)>,
    request: HttpRequest,
    client_stream: &mut TcpStream,
) -> Result<Option<Vec<u8>>, String> {
    let upstream_model = if provider.model.trim().is_empty() {
        extract_model(&request.body).unwrap_or_else(|| "model".to_string())
    } else {
        provider.model.trim().to_string()
    };

    let codex_body = if let Some((vision_provider, vision_model)) = vision {
        crate::vision_fallback::preprocess_codex_body(&request.body, vision_provider, vision_model)?
    } else {
        request.body.clone()
    };
    let (mut chat_body, translator_state) =
        relay_translate::translate_request(&codex_body, &upstream_model)
            .map_err(|error| error.to_string())?;
    ensure_chat_model_and_stream(&mut chat_body, &upstream_model)?;
    write_debug_snapshot(
        "translated_request",
        provider,
        Some(&request.body),
        Some(&chat_body),
        None,
    );

    let upstream_url = chat_completions_url(&provider.base_url)?;
    let stream_requested = request_body_stream_requested(&codex_body);
    if stream_requested {
        return handle_chat_completions_streaming(
            provider,
            &upstream_url,
            chat_body,
            translator_state,
            client_stream,
            &codex_body,
        )
        .map(|()| None);
    }

    let response = post_json(&upstream_url, &provider.api_key, chat_body.clone())?;
    if !response.status.is_success() {
        write_debug_snapshot(
            "upstream_error",
            provider,
            Some(&request.body),
            Some(&chat_body),
            Some((response.status.as_u16(), &response.body)),
        );
        return Ok(Some(http_response(
            response.status.as_u16(),
            "application/json",
            response.body,
        )));
    }

    let body = relay_translate::translate_sync_response(&translator_state, &response.body)
        .map_err(|error| error.to_string())?;
    Ok(Some(http_response(200, "application/json", body)))
}

fn handle_chat_completions_streaming(
    provider: &Provider,
    upstream_url: &str,
    chat_body: Vec<u8>,
    mut translator_state: relay_translate::TranslatorState,
    client_stream: &mut TcpStream,
    codex_body: &[u8],
) -> Result<(), String> {
    let mut upstream = post_json_stream(upstream_url, &provider.api_key, chat_body.clone())?;
    if !upstream.status().is_success() {
        let status = upstream.status().as_u16();
        let content_type = upstream
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("application/json")
            .to_string();
        let mut body = Vec::new();
        upstream
            .read_to_end(&mut body)
            .map_err(|error| error.to_string())?;
        write_debug_snapshot(
            "upstream_error",
            provider,
            Some(codex_body),
            Some(&chat_body),
            Some((status, &body)),
        );
        return write_http_response(client_stream, status, &content_type, body);
    }

    write_sse_headers(client_stream)?;
    client_stream
        .write_all(&relay_translate::emit_created(&translator_state))
        .map_err(|error| error.to_string())?;

    let content_type = upstream
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_ascii_lowercase();

    if content_type.contains("text/event-stream") {
        let mut buffer = ChatSseBuffer::new();
        let mut bytes = [0_u8; 8192];
        loop {
            let n = upstream
                .read(&mut bytes)
                .map_err(|error| error.to_string())?;
            if n == 0 {
                break;
            }
            buffer.push(&bytes[..n]);
            for event in buffer.drain_events() {
                match event {
                    ChatSseEvent::Data(payload) => {
                        for chunk in relay_translate::handle_chunk(&mut translator_state, &payload)
                        {
                            client_stream
                                .write_all(&chunk)
                                .map_err(|error| error.to_string())?;
                        }
                    }
                    ChatSseEvent::Done => {
                        client_stream
                            .write_all(&relay_translate::emit_completed(&mut translator_state))
                            .map_err(|error| error.to_string())?;
                        return Ok(());
                    }
                }
            }
        }
        client_stream
            .write_all(&relay_translate::emit_completed(&mut translator_state))
            .map_err(|error| error.to_string())?;
    } else {
        let mut body = Vec::new();
        upstream
            .read_to_end(&mut body)
            .map_err(|error| error.to_string())?;
        let body = relay_translate::translate_sync_response(&translator_state, &body)
            .map(|body| synthetic_sse_from_response(&body))
            .unwrap_or_else(|_| relay_translate::emit_completed(&mut translator_state));
        client_stream
            .write_all(&body)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn handle_responses_provider(
    provider: &Provider,
    vision: Option<&(ApiProvider, String)>,
    request: HttpRequest,
    stream: &mut TcpStream,
) -> Result<Option<Vec<u8>>, String> {
    let upstream_url = responses_url(&provider.base_url)?;
    let body = if let Some((vision_provider, vision_model)) = vision {
        crate::vision_fallback::preprocess_codex_body(&request.body, vision_provider, vision_model)?
    } else {
        request.body
    };
    if request_body_stream_requested(&body) {
        let response = post_json_stream(&upstream_url, &provider.api_key, body)?;
        relay_response(response, stream)?;
        return Ok(None);
    }
    let response = post_json(&upstream_url, &provider.api_key, body)?;
    Ok(Some(http_response(
        response.status.as_u16(),
        if response.content_type.is_empty() {
            "application/json"
        } else {
            &response.content_type
        },
        response.body,
    )))
}

fn handle_anthropic_provider(
    provider: &Provider,
    vision: Option<&(ApiProvider, String)>,
    request: HttpRequest,
    stream: &mut TcpStream,
) -> Result<(), String> {
    if request.method != "POST"
        || !request
            .path
            .split('?')
            .next()
            .unwrap_or("")
            .ends_with("/messages")
    {
        return write_http_response(
            stream,
            404,
            "application/json",
            br#"{"error":{"message":"unsupported Anthropic gateway route"}}"#.to_vec(),
        );
    }
    let body = if let Some((vision_provider, vision_model)) = vision {
        crate::vision_fallback::preprocess_anthropic_body(
            &request.body,
            vision_provider,
            vision_model,
        )?
    } else {
        request.body
    };
    let url = anthropic_messages_url(&provider.base_url)?;
    let response = post_protocol_stream(&url, &provider.api_key, body, ProtocolAuth::Anthropic)?;
    relay_response(response, stream)
}

fn handle_gemini_provider(
    provider: &Provider,
    vision: Option<&(ApiProvider, String)>,
    request: HttpRequest,
    stream: &mut TcpStream,
) -> Result<(), String> {
    if request.method != "POST" {
        return write_http_response(
            stream,
            404,
            "application/json",
            br#"{"error":{"message":"unsupported Gemini gateway route"}}"#.to_vec(),
        );
    }
    let body = if let Some((vision_provider, vision_model)) = vision {
        crate::vision_fallback::preprocess_gemini_body(
            &request.body,
            vision_provider,
            vision_model,
        )?
    } else {
        request.body
    };
    let suffix = request
        .path
        .strip_prefix("/gemini")
        .ok_or_else(|| "Invalid Gemini gateway path".to_string())?;
    let url = gemini_upstream_url(&provider.base_url, suffix)?;
    let response = post_protocol_stream(&url, &provider.api_key, body, ProtocolAuth::Gemini)?;
    relay_response(response, stream)
}

struct UpstreamResponse {
    status: reqwest::StatusCode,
    content_type: String,
    body: Vec<u8>,
}

fn post_json(url: &str, api_key: &str, body: Vec<u8>) -> Result<UpstreamResponse, String> {
    let mut response = post_json_stream(url, api_key, body)?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let mut body = Vec::new();
    response
        .read_to_end(&mut body)
        .map_err(|error| error.to_string())?;
    Ok(UpstreamResponse {
        status,
        content_type,
        body,
    })
}

fn post_json_stream(
    url: &str,
    api_key: &str,
    body: Vec<u8>,
) -> Result<reqwest::blocking::Response, String> {
    let mut attempt = 0usize;
    loop {
        match post_json_stream_once(url, api_key, body.clone()) {
            Ok(mut response)
                if is_retryable_status(response.status().as_u16())
                    && attempt < UPSTREAM_MAX_RETRIES =>
            {
                let delay = retry_delay_ms(response.headers(), attempt);
                let mut discard = Vec::new();
                let _ = response.read_to_end(&mut discard);
                thread::sleep(Duration::from_millis(delay));
                attempt += 1;
            }
            Ok(response) => return Ok(response),
            Err(error) if attempt < UPSTREAM_MAX_RETRIES => {
                let delay = retry_delay_ms(&HeaderMap::new(), attempt);
                thread::sleep(Duration::from_millis(delay));
                attempt += 1;
                if attempt > UPSTREAM_MAX_RETRIES {
                    return Err(error);
                }
            }
            Err(error) => return Err(error),
        }
    }
}

fn post_json_stream_once(
    url: &str,
    api_key: &str,
    body: Vec<u8>,
) -> Result<reqwest::blocking::Response, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "Accept",
        HeaderValue::from_static("application/json, text/event-stream"),
    );
    headers.insert("User-Agent", HeaderValue::from_static(PROXY_USER_AGENT));
    if !api_key.trim().is_empty() {
        let bearer = HeaderValue::from_str(&format!("Bearer {}", api_key.trim()))
            .map_err(|error| error.to_string())?;
        headers.insert(AUTHORIZATION, bearer);
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(url)
        .headers(headers)
        .body(body)
        .send()
        .map_err(|error| error.to_string())?;
    Ok(response)
}

#[derive(Clone, Copy)]
enum ProtocolAuth {
    Anthropic,
    Gemini,
}

fn post_protocol_stream(
    url: &str,
    api_key: &str,
    body: Vec<u8>,
    auth: ProtocolAuth,
) -> Result<reqwest::blocking::Response, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "Accept",
        HeaderValue::from_static("application/json, text/event-stream"),
    );
    headers.insert("User-Agent", HeaderValue::from_static(PROXY_USER_AGENT));
    if !api_key.trim().is_empty() {
        let raw = HeaderValue::from_str(api_key.trim()).map_err(|error| error.to_string())?;
        let bearer = HeaderValue::from_str(&format!("Bearer {}", api_key.trim()))
            .map_err(|error| error.to_string())?;
        match auth {
            ProtocolAuth::Anthropic => {
                headers.insert("x-api-key", raw.clone());
                headers.insert("api-key", raw);
                headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
                headers.insert(AUTHORIZATION, bearer);
            }
            ProtocolAuth::Gemini => {
                headers.insert("x-goog-api-key", raw);
                headers.insert(AUTHORIZATION, bearer);
            }
        }
    }

    Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|error| error.to_string())?
        .post(url)
        .headers(headers)
        .body(body)
        .send()
        .map_err(|error| error.to_string())
}

fn relay_response(
    mut response: reqwest::blocking::Response,
    stream: &mut TcpStream,
) -> Result<(), String> {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    if content_type
        .to_ascii_lowercase()
        .contains("text/event-stream")
    {
        let reason = if status == 200 {
            "OK"
        } else {
            "Upstream Error"
        };
        stream
            .write_all(
                format!(
                    "HTTP/1.1 {status} {reason}\r\ncontent-type: {content_type}\r\ncache-control: no-cache\r\nconnection: close\r\n\r\n"
                )
                .as_bytes(),
            )
            .map_err(|error| error.to_string())?;
        let mut buffer = [0_u8; 8192];
        loop {
            let read = response
                .read(&mut buffer)
                .map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            stream
                .write_all(&buffer[..read])
                .map_err(|error| error.to_string())?;
        }
        return Ok(());
    }

    let mut body = Vec::new();
    response
        .read_to_end(&mut body)
        .map_err(|error| error.to_string())?;
    write_http_response(stream, status, &content_type, body)
}

fn is_retryable_status(status: u16) -> bool {
    matches!(status, 429 | 500 | 502 | 503 | 504)
}

fn retry_delay_ms(headers: &HeaderMap, attempt: usize) -> u64 {
    if let Some(value) = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_retry_after_ms)
    {
        return value.min(10_000);
    }
    let shift = attempt.min(5) as u32;
    let factor = 1_u64.checked_shl(shift).unwrap_or(32);
    (UPSTREAM_RETRY_BASE_MS * factor).min(12_000)
}

fn parse_retry_after_ms(value: &str) -> Option<u64> {
    let seconds = value.trim().parse::<f64>().ok()?;
    if seconds.is_sign_negative() || !seconds.is_finite() {
        return None;
    }
    Some((seconds * 1000.0) as u64)
}

fn ensure_chat_model_and_stream(body: &mut Vec<u8>, model: &str) -> Result<(), String> {
    let mut value: Value = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    if let Some(object) = value.as_object_mut() {
        object.insert("model".to_string(), Value::String(model.to_string()));
        if object
            .get("stream")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            object.insert(
                "stream_options".to_string(),
                serde_json::json!({ "include_usage": true }),
            );
        }
    }
    *body = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
    Ok(())
}

fn extract_model(body: &[u8]) -> Option<String> {
    serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("model")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn request_body_stream_requested(body: &[u8]) -> bool {
    serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|value| value.get("stream").and_then(Value::as_bool))
        .unwrap_or(false)
}

fn api_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("provider base URL is empty".to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    for suffix in ["/chat/completions", "/responses", "/models"] {
        if let Some(prefix) = lower.strip_suffix(suffix) {
            return Ok(trimmed[..prefix.len()].trim_end_matches('/').to_string());
        }
    }
    Ok(trimmed.to_string())
}

fn chat_completions_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    let lower = base.to_ascii_lowercase();
    if lower == "https://api.deepseek.com" || lower == "https://api.deepseek.com/v1" {
        Ok("https://api.deepseek.com/chat/completions".to_string())
    } else if is_glm_api_base(&lower) {
        Ok(format!("{base}/chat/completions"))
    } else if lower.ends_with("/v1") {
        Ok(format!("{base}/chat/completions"))
    } else {
        Ok(format!("{base}/v1/chat/completions"))
    }
}

fn is_glm_api_base(lower_base: &str) -> bool {
    lower_base.ends_with("/api/paas/v4") || lower_base.ends_with("/api/coding/paas/v4")
}

fn responses_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    if base.to_ascii_lowercase().ends_with("/v1") {
        Ok(format!("{base}/responses"))
    } else {
        Ok(format!("{base}/v1/responses"))
    }
}

fn anthropic_messages_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    if base.to_ascii_lowercase().ends_with("/v1") {
        Ok(format!("{base}/messages"))
    } else {
        Ok(format!("{base}/v1/messages"))
    }
}

fn gemini_upstream_url(base_url: &str, suffix: &str) -> Result<String, String> {
    let mut root = base_url.trim().trim_end_matches('/').to_string();
    for version in ["/v1beta", "/v1"] {
        if root.to_ascii_lowercase().ends_with(version) {
            root.truncate(root.len() - version.len());
            break;
        }
    }
    if root.is_empty() {
        return Err("provider base URL is empty".to_string());
    }
    let (path, query) = suffix.split_once('?').unwrap_or((suffix, ""));
    let filtered_query = query
        .split('&')
        .filter(|pair| !pair.is_empty() && !pair.to_ascii_lowercase().starts_with("key="))
        .collect::<Vec<_>>()
        .join("&");
    if filtered_query.is_empty() {
        Ok(format!("{root}{path}"))
    } else {
        Ok(format!("{root}{path}?{filtered_query}"))
    }
}

fn http_response(status: u16, content_type: &str, body: Vec<u8>) -> Vec<u8> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        _ => "OK",
    };
    let mut out = format!(
        "HTTP/1.1 {status} {reason}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\naccess-control-allow-origin: *\r\nconnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    out.extend(body);
    out
}

fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: Vec<u8>,
) -> Result<(), String> {
    stream
        .write_all(&http_response(status, content_type, body))
        .map_err(|error| error.to_string())
}

fn write_sse_headers(stream: &mut TcpStream) -> Result<(), String> {
    stream
        .write_all(
            b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncache-control: no-cache\r\naccess-control-allow-origin: *\r\nconnection: close\r\n\r\n",
        )
        .map_err(|error| error.to_string())
}

fn synthetic_sse_from_response(response_body: &[u8]) -> Vec<u8> {
    let response: Value = serde_json::from_slice(response_body).unwrap_or_else(|_| {
        serde_json::json!({
            "id": format!("resp_{}", unix_secs()),
            "type": "response",
            "status": "completed",
            "output": []
        })
    });
    let created = serde_json::json!({
        "type": "response.created",
        "response": response,
        "sequence_number": 0
    });
    let completed = serde_json::json!({
        "type": "response.completed",
        "response": created.get("response").cloned().unwrap_or(Value::Null),
        "sequence_number": 1
    });
    format!(
        "event: response.created\ndata: {}\n\nevent: response.completed\ndata: {}\n\n",
        created, completed
    )
    .into_bytes()
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn write_debug_snapshot(
    stage: &str,
    provider: &Provider,
    codex_body: Option<&[u8]>,
    chat_body: Option<&[u8]>,
    upstream_error: Option<(u16, &[u8])>,
) {
    let Some(home) = dirs::home_dir() else { return };
    let dir = home.join(APP_HOME_DIR);
    let _ = fs::create_dir_all(&dir);
    let snapshot = serde_json::json!({
        "stage": stage,
        "provider": {
            "id": provider.id,
            "name": provider.name,
            "model": provider.model,
            "wire_api": provider.wire_api,
            "base_url": provider.base_url,
        },
        "codex_body": codex_body.and_then(parse_debug_json),
        "chat_body": chat_body.and_then(parse_debug_json),
        "upstream_error": upstream_error.map(|(status, body)| serde_json::json!({
            "status": status,
            "body": String::from_utf8_lossy(body),
        })),
    });
    if let Ok(bytes) = serde_json::to_vec_pretty(&snapshot) {
        let _ = fs::write(dir.join("compatibility-proxy-debug.json"), bytes);
    }
}

fn parse_debug_json(bytes: &[u8]) -> Option<Value> {
    serde_json::from_slice(bytes).ok()
}

fn uses_chat_completions(provider: &Provider) -> bool {
    provider.wire_api.trim() == "chat"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str, model: &str, wire_api: &str, is_current: bool) -> Provider {
        Provider {
            id: id.to_string(),
            name: id.to_string(),
            agent: AGENT_CODEX.to_string(),
            api_provider_id: String::new(),
            base_url: format!("https://{id}.example/v1"),
            api_key: String::new(),
            website_url: String::new(),
            model: model.to_string(),
            wire_api: wire_api.to_string(),
            reasoning_effort: String::new(),
            extra_toml: String::new(),
            config_text: String::new(),
            is_current,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn current_responses_provider_wins_for_same_model() {
        let current = provider("packy", "gpt-5.5", "responses", true);
        let providers = vec![
            provider("deepseek-compatible", "gpt-5.5", "chat", false),
            current.clone(),
        ];

        let selected = select_responses_provider_for_model(&current, &providers, Some("gpt-5.5"));

        assert_eq!(selected.id, "packy");
        assert_eq!(selected.wire_api, "responses");
    }

    #[test]
    fn model_lookup_still_supports_chat_session_launches() {
        let current = provider("packy", "gpt-5.5", "responses", true);
        let providers = vec![
            current.clone(),
            provider("deepseek", "deepseek-v4-pro", "chat", false),
        ];

        let selected =
            select_responses_provider_for_model(&current, &providers, Some("deepseek-v4-pro"));

        assert_eq!(selected.id, "deepseek");
        assert_eq!(selected.wire_api, "chat");
    }

    #[test]
    fn responses_model_lookup_passes_through_responses_provider() {
        let current = provider("deepseek", "deepseek-v4-pro", "chat", true);
        let providers = vec![
            current.clone(),
            provider("packy", "gpt-5.5", "responses", false),
        ];

        let selected = select_responses_provider_for_model(&current, &providers, Some("gpt-5.5"));

        assert_eq!(selected.id, "packy");
        assert_eq!(selected.wire_api, "responses");
    }

    #[test]
    fn glm_chat_completions_url_uses_bigmodel_v4_path() {
        assert_eq!(
            chat_completions_url("https://open.bigmodel.cn/api/paas/v4").unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://open.bigmodel.cn/api/paas/v4/chat/completions").unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
    }
}
