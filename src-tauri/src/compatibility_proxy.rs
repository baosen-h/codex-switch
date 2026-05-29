use crate::agent_writer::AGENT_CODEX;
use crate::database::Database;
use crate::models::Provider;
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
    let provider = select_provider_for_request(&db, &request)?;

    let response = route_request(&provider, request)?;
    stream
        .write_all(&response)
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn select_provider_for_request(
    db: &Arc<Mutex<Database>>,
    request: &HttpRequest,
) -> Result<Provider, String> {
    let db = db.lock().map_err(|_| "database lock failed".to_string())?;
    let current = db
        .current_provider_for_agent(AGENT_CODEX)
        .map_err(|error| error.to_string())?;
    let path = request.path.split('?').next().unwrap_or("");
    if request.method != "POST" || !(path == "/v1/responses" || path.ends_with("/responses")) {
        return Ok(current);
    }

    let Some(model) = extract_model(&request.body).map(|model| model.to_ascii_lowercase()) else {
        return Ok(current);
    };
    let providers = db.providers().map_err(|error| error.to_string())?;
    Ok(providers
        .iter()
        .filter(|provider| provider.agent == AGENT_CODEX)
        .filter(|provider| provider.model.trim().eq_ignore_ascii_case(&model))
        .find(|provider| provider.wire_api.trim() == "chat")
        .cloned()
        .or_else(|| {
            providers
                .iter()
                .filter(|provider| provider.agent == AGENT_CODEX)
                .find(|provider| provider.model.trim().eq_ignore_ascii_case(&model))
                .cloned()
        })
        .unwrap_or(current))
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

    Ok(HttpRequest {
        method,
        path,
        body,
    })
}

fn find_header_end(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|window| window == b"\r\n\r\n")
}

fn route_request(provider: &Provider, request: HttpRequest) -> Result<Vec<u8>, String> {
    let path = request.path.split('?').next().unwrap_or("");

    if request.method == "GET" && (path == "/v1/models" || path.ends_with("/models")) {
        let model = if provider.model.trim().is_empty() {
            "model"
        } else {
            provider.model.trim()
        };
        return Ok(http_response(
            200,
            "application/json",
            relay_translate::synthetic_models_response(model),
        ));
    }

    if request.method != "POST" || !(path == "/v1/responses" || path.ends_with("/responses")) {
        return Ok(http_response(
            404,
            "application/json",
            br#"{"error":{"message":"unsupported compatibility proxy route"}}"#.to_vec(),
        ));
    }

    if uses_chat_completions(provider) {
        handle_chat_completions_provider(provider, request)
    } else {
        handle_responses_provider(provider, request)
    }
}

fn handle_chat_completions_provider(
    provider: &Provider,
    request: HttpRequest,
) -> Result<Vec<u8>, String> {
    let upstream_model = if provider.model.trim().is_empty() {
        extract_model(&request.body).unwrap_or_else(|| "model".to_string())
    } else {
        provider.model.trim().to_string()
    };

    let (mut chat_body, mut translator_state) =
        relay_translate::translate_request(&request.body, &upstream_model)
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
    let response = post_json(&upstream_url, &provider.api_key, chat_body.clone())?;
    if !response.status.is_success() {
        write_debug_snapshot(
            "upstream_error",
            provider,
            Some(&request.body),
            Some(&chat_body),
            Some((response.status.as_u16(), &response.body)),
        );
        return Ok(http_response(
            response.status.as_u16(),
            "application/json",
            response.body,
        ));
    }

    let stream_requested = request_body_stream_requested(&request.body);
    if stream_requested {
        let mut out = Vec::new();
        out.extend(relay_translate::emit_created(&translator_state));
        let content_type = response
            .content_type
            .to_ascii_lowercase();
        if content_type.contains("text/event-stream") {
            let mut buffer = ChatSseBuffer::new();
            buffer.push(&response.body);
            for event in buffer.drain_events() {
                match event {
                    ChatSseEvent::Data(payload) => {
                        for chunk in relay_translate::handle_chunk(&mut translator_state, &payload) {
                            out.extend(chunk);
                        }
                    }
                    ChatSseEvent::Done => break,
                }
            }
            out.extend(relay_translate::emit_completed(&mut translator_state));
        } else {
            out = relay_translate::translate_sync_response(&translator_state, &response.body)
                .map(|body| synthetic_sse_from_response(&body))
                .unwrap_or(out);
        }
        return Ok(http_response(200, "text/event-stream", out));
    }

    let body = relay_translate::translate_sync_response(&translator_state, &response.body)
        .map_err(|error| error.to_string())?;
    Ok(http_response(200, "application/json", body))
}

fn handle_responses_provider(provider: &Provider, request: HttpRequest) -> Result<Vec<u8>, String> {
    let upstream_url = responses_url(&provider.base_url)?;
    let response = post_json(&upstream_url, &provider.api_key, request.body)?;
    Ok(http_response(
        response.status.as_u16(),
        if response.content_type.is_empty() {
            "application/json"
        } else {
            &response.content_type
        },
        response.body,
    ))
}

struct UpstreamResponse {
    status: reqwest::StatusCode,
    content_type: String,
    body: Vec<u8>,
}

fn post_json(url: &str, api_key: &str, body: Vec<u8>) -> Result<UpstreamResponse, String> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert("Accept", HeaderValue::from_static("application/json, text/event-stream"));
    headers.insert("User-Agent", HeaderValue::from_static("codex-switch-proxy/0.1.7"));
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
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let body = response.bytes().map_err(|error| error.to_string())?.to_vec();
    Ok(UpstreamResponse {
        status,
        content_type,
        body,
    })
}

fn ensure_chat_model_and_stream(body: &mut Vec<u8>, model: &str) -> Result<(), String> {
    let mut value: Value = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    if let Some(object) = value.as_object_mut() {
        object.insert("model".to_string(), Value::String(model.to_string()));
        if object.get("stream").and_then(Value::as_bool).unwrap_or(false) {
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
        .and_then(|value| value.get("model").and_then(Value::as_str).map(str::to_string))
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
    } else if lower.ends_with("/v1") {
        Ok(format!("{base}/chat/completions"))
    } else {
        Ok(format!("{base}/v1/chat/completions"))
    }
}

fn responses_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    if base.to_ascii_lowercase().ends_with("/v1") {
        Ok(format!("{base}/responses"))
    } else {
        Ok(format!("{base}/v1/responses"))
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
    let dir = home.join(".codex-switch");
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
