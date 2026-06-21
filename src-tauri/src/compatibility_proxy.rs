use crate::agent_writer::{AGENT_CLAUDE, AGENT_CODEX, AGENT_GEMINI};
use crate::app_config::{APP_HOME_DIR, PROXY_USER_AGENT};
use crate::database::Database;
use crate::models::{ApiProvider, Provider, WebSearchResponse, WebSearchSettings};
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
const LOCAL_WEB_SEARCH_TOOL: &str = "web__search";
const LOCAL_WEB_FETCH_TOOL: &str = "web__fetch";
const LOCAL_WEB_MAX_STEPS: usize = 8;

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
    let (provider, vision, web_search) = {
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
        (provider, vision, settings.web_search)
    };

    route_request(
        &provider,
        vision.as_ref(),
        &web_search,
        request,
        &mut stream,
    )?;
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
    web_search: &WebSearchSettings,
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
        handle_chat_completions_provider(provider, vision, web_search, request, stream)?
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
    web_search: &WebSearchSettings,
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
    let stream_requested = request_body_stream_requested(&codex_body);
    let local_web_enabled = should_enable_local_web(stream_requested, web_search, &chat_body);
    if local_web_enabled {
        prepare_local_web_agent_body(&mut chat_body)?;
    }
    write_debug_snapshot(
        "translated_request",
        provider,
        Some(&request.body),
        Some(&chat_body),
        None,
    );

    let upstream_url = chat_completions_url(&provider.base_url)?;
    if local_web_enabled {
        let response = run_local_web_agent(provider, &upstream_url, chat_body, web_search)?;
        if !response.status.is_success() {
            return Ok(Some(http_response(
                response.status.as_u16(),
                if response.content_type.is_empty() {
                    "application/json"
                } else {
                    &response.content_type
                },
                response.body,
            )));
        }
        let body = relay_translate::translate_sync_response(&translator_state, &response.body)
            .map_err(|error| error.to_string())?;
        let (content_type, body) = if stream_requested {
            ("text/event-stream", synthetic_sse_from_response(&body))
        } else {
            ("application/json", body)
        };
        return Ok(Some(http_response(200, content_type, body)));
    }
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

fn should_enable_local_web(
    _stream_requested: bool,
    settings: &WebSearchSettings,
    _chat_body: &[u8],
) -> bool {
    settings.enabled && !settings.search_provider_id.trim().is_empty()
}

fn prepare_local_web_agent_body(body: &mut Vec<u8>) -> Result<(), String> {
    let mut value: Value = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| "Translated chat request is not an object".to_string())?;
    object.insert("stream".to_string(), Value::Bool(false));
    object.remove("stream_options");
    object.insert("parallel_tool_calls".to_string(), Value::Bool(false));
    let tools = object
        .entry("tools")
        .or_insert_with(|| Value::Array(Vec::new()))
        .as_array_mut()
        .ok_or_else(|| "Translated chat tools are not an array".to_string())?;
    tools.retain(|tool| {
        let name = tool.pointer("/function/name").and_then(Value::as_str);
        let tool_type = tool.get("type").and_then(Value::as_str);
        !matches!(name, Some(LOCAL_WEB_SEARCH_TOOL | LOCAL_WEB_FETCH_TOOL))
            && !matches!(tool_type, Some("web_search" | "web_search_preview"))
    });
    tools.push(serde_json::json!({
        "type": "function",
        "function": {
            "name": LOCAL_WEB_SEARCH_TOOL,
            "description": "Search the web for current or uncertain information. Call only when fresh external information is needed. The result contains numbered sources; cite them as [N] in the final answer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A focused web search query."
                    }
                },
                "required": ["query"],
                "additionalProperties": false
            }
        }
    }));
    tools.push(serde_json::json!({
        "type": "function",
        "function": {
            "name": LOCAL_WEB_FETCH_TOOL,
            "description": "Fetch readable content from known public URLs. Use after search when snippets are insufficient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "urls": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 1,
                        "maxItems": 5
                    }
                },
                "required": ["urls"],
                "additionalProperties": false
            }
        }
    }));
    *body = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
    Ok(())
}

fn run_local_web_agent(
    provider: &Provider,
    upstream_url: &str,
    initial_body: Vec<u8>,
    settings: &WebSearchSettings,
) -> Result<UpstreamResponse, String> {
    let mut request: Value =
        serde_json::from_slice(&initial_body).map_err(|error| error.to_string())?;
    let mut next_source_id = 1usize;

    for _ in 0..LOCAL_WEB_MAX_STEPS {
        let body = serde_json::to_vec(&request).map_err(|error| error.to_string())?;
        let response = post_json(upstream_url, &provider.api_key, body)?;
        if !response.status.is_success() {
            return Ok(response);
        }
        let response_value: Value = serde_json::from_slice(&response.body)
            .map_err(|error| format!("Invalid chat response during web search: {error}"))?;
        let calls = local_web_tool_calls(&response_value)?;
        if calls.is_empty() {
            return Ok(response);
        }

        let messages = request
            .get_mut("messages")
            .and_then(Value::as_array_mut)
            .ok_or_else(|| "Chat request messages are missing".to_string())?;
        let assistant_message = response_value
            .pointer("/choices/0/message")
            .cloned()
            .ok_or_else(|| "Chat response message is missing".to_string())?;
        messages.push(assistant_message);
        for call in calls {
            let output = execute_local_web_tool(settings, &call, &mut next_source_id);
            messages.push(serde_json::json!({
                "role": "tool",
                "tool_call_id": call.id,
                "content": output,
            }));
        }
    }

    Err(format!(
        "Web search exceeded the {LOCAL_WEB_MAX_STEPS} step limit"
    ))
}

#[derive(Debug, PartialEq, Eq)]
struct LocalWebToolCall {
    id: String,
    name: String,
    arguments: Value,
}

fn local_web_tool_calls(response: &Value) -> Result<Vec<LocalWebToolCall>, String> {
    let Some(calls) = response
        .pointer("/choices/0/message/tool_calls")
        .and_then(Value::as_array)
    else {
        return Ok(Vec::new());
    };
    let mut local_calls = Vec::new();
    let mut has_external_call = false;
    for call in calls {
        let name = call
            .pointer("/function/name")
            .and_then(Value::as_str)
            .unwrap_or("");
        let Some(name) = canonical_local_web_tool_name(name) else {
            has_external_call = true;
            continue;
        };
        let id = call
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "Web tool call is missing an id".to_string())?;
        let arguments = call
            .pointer("/function/arguments")
            .and_then(Value::as_str)
            .unwrap_or("{}");
        let arguments = serde_json::from_str(arguments)
            .map_err(|error| format!("Invalid arguments for {name}: {error}"))?;
        local_calls.push(LocalWebToolCall {
            id: id.to_string(),
            name: name.to_string(),
            arguments,
        });
    }
    if has_external_call && !local_calls.is_empty() {
        return Err("Model returned local web and client tool calls in the same step".to_string());
    }
    if has_external_call {
        return Ok(Vec::new());
    }
    Ok(local_calls)
}

fn canonical_local_web_tool_name(name: &str) -> Option<&'static str> {
    match name {
        LOCAL_WEB_SEARCH_TOOL | "web_search" => Some(LOCAL_WEB_SEARCH_TOOL),
        LOCAL_WEB_FETCH_TOOL | "web_fetch" => Some(LOCAL_WEB_FETCH_TOOL),
        _ => None,
    }
}

fn execute_local_web_tool(
    settings: &WebSearchSettings,
    call: &LocalWebToolCall,
    next_source_id: &mut usize,
) -> String {
    let result = match call.name.as_str() {
        LOCAL_WEB_SEARCH_TOOL => {
            let query = call
                .arguments
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            crate::web_search::search_keywords(settings, &[query])
        }
        LOCAL_WEB_FETCH_TOOL => {
            let urls = call
                .arguments
                .get("urls")
                .and_then(Value::as_array)
                .map(|urls| {
                    urls.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            crate::web_search::fetch_urls(settings, &urls)
        }
        _ => Err(format!("Unsupported local web tool: {}", call.name)),
    };

    match result {
        Ok(response) => web_tool_output(response, next_source_id),
        Err(error) => serde_json::json!({
            "error": error,
            "instruction": "The lookup failed. Retry with a different query or explain the failure to the user."
        })
        .to_string(),
    }
}

fn web_tool_output(response: WebSearchResponse, next_source_id: &mut usize) -> String {
    let results = response
        .results
        .into_iter()
        .map(|result| {
            let id = *next_source_id;
            *next_source_id += 1;
            serde_json::json!({
                "id": id,
                "title": result.title,
                "url": result.url,
                "content": result.content,
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "providerId": response.provider_id,
        "results": results,
        "citationInstruction": "Cite used sources as [N] and include their URLs in the answer."
    })
    .to_string()
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
    let suffix = gemini_suffix_with_provider_model(suffix, &provider.model);
    if suffix
        .split('?')
        .next()
        .unwrap_or("")
        .ends_with(":streamGenerateContent")
    {
        let suffix = gemini_generate_content_suffix(&suffix)?;
        let url = gemini_upstream_url(&provider.base_url, &suffix)?;
        let mut response =
            post_protocol_stream(&url, &provider.api_key, body, ProtocolAuth::Gemini)?;
        if !response.status().is_success() {
            return relay_response(response, stream);
        }
        let mut response_body = Vec::new();
        response
            .read_to_end(&mut response_body)
            .map_err(|error| error.to_string())?;
        return write_http_response(
            stream,
            200,
            "text/event-stream",
            gemini_sse_from_response(&response_body)?,
        );
    }
    let url = gemini_upstream_url(&provider.base_url, &suffix)?;
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

fn gemini_generate_content_suffix(suffix: &str) -> Result<String, String> {
    let (path, query) = suffix.split_once('?').unwrap_or((suffix, ""));
    let path = path
        .strip_suffix(":streamGenerateContent")
        .map(|prefix| format!("{prefix}:generateContent"))
        .ok_or_else(|| "Invalid Gemini streaming route".to_string())?;
    let query = query
        .split('&')
        .filter(|pair| {
            let key = pair.split_once('=').map(|(key, _)| key).unwrap_or(pair);
            !key.eq_ignore_ascii_case("alt")
        })
        .filter(|pair| !pair.is_empty())
        .collect::<Vec<_>>()
        .join("&");
    if query.is_empty() {
        Ok(path)
    } else {
        Ok(format!("{path}?{query}"))
    }
}

fn gemini_suffix_with_provider_model(suffix: &str, model: &str) -> String {
    let model = model.trim();
    let Some(models_start) = suffix.find("/models/") else {
        return suffix.to_string();
    };
    if model.is_empty() {
        return suffix.to_string();
    }
    let model_start = models_start + "/models/".len();
    let Some(action_offset) = suffix[model_start..].find(':') else {
        return suffix.to_string();
    };
    let action_start = model_start + action_offset;
    format!(
        "{}{}{}",
        &suffix[..model_start],
        urlencoding::encode(model),
        &suffix[action_start..]
    )
}

fn gemini_sse_from_response(response_body: &[u8]) -> Result<Vec<u8>, String> {
    let response: Value =
        serde_json::from_slice(response_body).map_err(|error| error.to_string())?;
    let response = serde_json::to_string(&response).map_err(|error| error.to_string())?;
    Ok(format!("data: {response}\n\n").into_bytes())
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
    let response_id = response
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("resp_synthetic");
    let created = serde_json::json!({
        "type": "response.created",
        "response": response.clone(),
        "sequence_number": 0
    });
    let mut sequence_number = 1u64;
    let mut events = format!("event: response.created\ndata: {created}\n\n");

    if let Some(output) = response.get("output").and_then(Value::as_array) {
        for (output_index, item) in output.iter().enumerate() {
            match item.get("type").and_then(Value::as_str) {
                Some("message") => append_synthetic_message_events(
                    &mut events,
                    response_id,
                    output_index,
                    item,
                    &mut sequence_number,
                ),
                Some("function_call") => append_synthetic_function_call_events(
                    &mut events,
                    response_id,
                    output_index,
                    item,
                    &mut sequence_number,
                ),
                _ => append_synthetic_item_events(
                    &mut events,
                    response_id,
                    output_index,
                    item,
                    &mut sequence_number,
                ),
            }
        }
    }

    let completed = serde_json::json!({
        "type": "response.completed",
        "response": created.get("response").cloned().unwrap_or(Value::Null),
        "sequence_number": sequence_number
    });
    events.push_str(&format!("event: response.completed\ndata: {completed}\n\n"));
    events.into_bytes()
}

fn append_synthetic_message_events(
    events: &mut String,
    response_id: &str,
    output_index: usize,
    item: &Value,
    sequence_number: &mut u64,
) {
    let output_text = response_item_output_text(item);
    if output_text.is_empty() {
        append_synthetic_item_events(events, response_id, output_index, item, sequence_number);
        return;
    }

    let item_id = item
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("msg_{}", unix_secs()));
    let output_item_added = serde_json::json!({
        "type": "response.output_item.added",
        "response_id": response_id,
        "output_index": output_index,
        "item": {
            "id": item_id,
            "type": "message",
            "role": "assistant",
            "status": "in_progress",
            "content": [{"type": "output_text", "text": ""}]
        },
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_item.added", output_item_added);

    let content_part_added = serde_json::json!({
        "type": "response.content_part.added",
        "response_id": response_id,
        "item_id": item_id,
        "output_index": output_index,
        "content_index": 0,
        "part": {"type": "output_text", "text": "", "annotations": []},
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.content_part.added", content_part_added);

    let text_delta = serde_json::json!({
        "type": "response.output_text.delta",
        "response_id": response_id,
        "item_id": item_id,
        "output_index": output_index,
        "content_index": 0,
        "delta": output_text,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_text.delta", text_delta);

    let text_done = serde_json::json!({
        "type": "response.output_text.done",
        "response_id": response_id,
        "item_id": item_id,
        "output_index": output_index,
        "content_index": 0,
        "text": output_text,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_text.done", text_done);

    let content_part_done = serde_json::json!({
        "type": "response.content_part.done",
        "response_id": response_id,
        "item_id": item_id,
        "output_index": output_index,
        "content_index": 0,
        "part": {"type": "output_text", "text": output_text, "annotations": []},
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.content_part.done", content_part_done);

    let mut done_item = item.clone();
    if let Some(done_obj) = done_item.as_object_mut() {
        done_obj.insert("status".to_string(), Value::String("completed".to_string()));
    }
    let output_item_done = serde_json::json!({
        "type": "response.output_item.done",
        "response_id": response_id,
        "output_index": output_index,
        "item": done_item,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_item.done", output_item_done);
}

fn append_synthetic_function_call_events(
    events: &mut String,
    response_id: &str,
    output_index: usize,
    item: &Value,
    sequence_number: &mut u64,
) {
    let item_id = item
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| item.get("call_id").and_then(Value::as_str))
        .map(str::to_string)
        .unwrap_or_else(|| format!("fc_{}", unix_secs()));
    let arguments = item
        .get("arguments")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            item.get("arguments")
                .map(|value| value.to_string())
                .unwrap_or_default()
        });

    let mut added_item = item.clone();
    if let Some(added_obj) = added_item.as_object_mut() {
        added_obj.insert(
            "status".to_string(),
            Value::String("in_progress".to_string()),
        );
        added_obj.insert("arguments".to_string(), Value::String(String::new()));
    }
    let output_item_added = serde_json::json!({
        "type": "response.output_item.added",
        "response_id": response_id,
        "output_index": output_index,
        "item": added_item,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_item.added", output_item_added);

    let arguments_done = serde_json::json!({
        "type": "response.function_call_arguments.done",
        "response_id": response_id,
        "item_id": item_id,
        "output_index": output_index,
        "arguments": arguments,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(
        events,
        "response.function_call_arguments.done",
        arguments_done,
    );

    let mut done_item = item.clone();
    if let Some(done_obj) = done_item.as_object_mut() {
        done_obj.insert("status".to_string(), Value::String("completed".to_string()));
    }
    let output_item_done = serde_json::json!({
        "type": "response.output_item.done",
        "response_id": response_id,
        "output_index": output_index,
        "item": done_item,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_item.done", output_item_done);
}

fn append_synthetic_item_events(
    events: &mut String,
    response_id: &str,
    output_index: usize,
    item: &Value,
    sequence_number: &mut u64,
) {
    let output_item_added = serde_json::json!({
        "type": "response.output_item.added",
        "response_id": response_id,
        "output_index": output_index,
        "item": item,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_item.added", output_item_added);

    let output_item_done = serde_json::json!({
        "type": "response.output_item.done",
        "response_id": response_id,
        "output_index": output_index,
        "item": item,
        "sequence_number": next_sequence(sequence_number)
    });
    push_synthetic_event(events, "response.output_item.done", output_item_done);
}

fn response_item_output_text(item: &Value) -> String {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find_map(|content| {
            content
                .get("text")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

fn next_sequence(sequence_number: &mut u64) -> u64 {
    let current = *sequence_number;
    *sequence_number = sequence_number.saturating_add(1);
    current
}

fn push_synthetic_event(events: &mut String, event: &str, data: Value) {
    events.push_str(&format!("event: {event}\ndata: {data}\n\n"));
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

    #[test]
    fn local_web_tools_are_injected_without_streaming() {
        let mut body = serde_json::to_vec(&serde_json::json!({
            "model": "test-model",
            "messages": [{"role": "user", "content": "latest news"}],
            "stream": true,
            "stream_options": {"include_usage": true},
            "tools": []
        }))
        .unwrap();

        prepare_local_web_agent_body(&mut body).unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(value.get("stream").and_then(Value::as_bool), Some(false));
        assert!(value.get("stream_options").is_none());
        assert_eq!(
            value.get("parallel_tool_calls").and_then(Value::as_bool),
            Some(false)
        );
        let names = value
            .get("tools")
            .and_then(Value::as_array)
            .unwrap()
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert_eq!(names, vec![LOCAL_WEB_SEARCH_TOOL, LOCAL_WEB_FETCH_TOOL]);
    }

    #[test]
    fn local_web_tool_calls_are_parsed() {
        let response = serde_json::json!({
            "choices": [{
                "message": {
                    "tool_calls": [{
                        "id": "call-1",
                        "type": "function",
                        "function": {
                            "name": LOCAL_WEB_SEARCH_TOOL,
                            "arguments": "{\"query\":\"Rust release\"}"
                        }
                    }]
                }
            }]
        });

        assert_eq!(
            local_web_tool_calls(&response).unwrap(),
            vec![LocalWebToolCall {
                id: "call-1".to_string(),
                name: LOCAL_WEB_SEARCH_TOOL.to_string(),
                arguments: serde_json::json!({"query": "Rust release"}),
            }]
        );
    }

    #[test]
    fn local_web_tool_call_aliases_are_parsed() {
        let response = serde_json::json!({
            "choices": [{
                "message": {
                    "tool_calls": [
                        {
                            "id": "call-search",
                            "type": "function",
                            "function": {
                                "name": "web_search",
                                "arguments": "{\"query\":\"Rust release\"}"
                            }
                        },
                        {
                            "id": "call-fetch",
                            "type": "function",
                            "function": {
                                "name": "web_fetch",
                                "arguments": "{\"urls\":[\"https://example.com\"]}"
                            }
                        }
                    ]
                }
            }]
        });

        assert_eq!(
            local_web_tool_calls(&response).unwrap(),
            vec![
                LocalWebToolCall {
                    id: "call-search".to_string(),
                    name: LOCAL_WEB_SEARCH_TOOL.to_string(),
                    arguments: serde_json::json!({"query": "Rust release"}),
                },
                LocalWebToolCall {
                    id: "call-fetch".to_string(),
                    name: LOCAL_WEB_FETCH_TOOL.to_string(),
                    arguments: serde_json::json!({"urls": ["https://example.com"]}),
                }
            ]
        );
    }

    #[test]
    fn native_web_search_is_replaced_by_local_tools_when_local_web_runs() {
        let mut body = serde_json::to_vec(&serde_json::json!({
            "model": "test-model",
            "messages": [{"role": "user", "content": "latest news"}],
            "tools": [
                {"type": "web_search", "web_search": {"enable": true}},
                {"type": "web_search_preview"},
                {
                    "type": "function",
                    "function": {
                        "name": "other_tool",
                        "parameters": {"type": "object"}
                    }
                }
            ]
        }))
        .unwrap();

        prepare_local_web_agent_body(&mut body).unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        let tools = value.get("tools").and_then(Value::as_array).unwrap();
        assert!(!tools.iter().any(|tool| matches!(
            tool.get("type").and_then(Value::as_str),
            Some("web_search" | "web_search_preview")
        )));
        let names = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec!["other_tool", LOCAL_WEB_SEARCH_TOOL, LOCAL_WEB_FETCH_TOOL]
        );
    }

    #[test]
    fn streaming_codex_requests_can_enter_local_web_loop() {
        let settings = WebSearchSettings {
            enabled: true,
            search_provider_id: "tavily".to_string(),
            ..WebSearchSettings::default()
        };
        let body = serde_json::to_vec(&serde_json::json!({"tools": []})).unwrap();
        assert!(should_enable_local_web(true, &settings, &body));
        assert!(should_enable_local_web(false, &settings, &body));
    }

    #[test]
    fn citation_ids_continue_across_tool_results() {
        let response = WebSearchResponse {
            provider_id: "test".to_string(),
            capability: crate::models::WebSearchCapability::SearchKeywords,
            inputs: vec!["query".to_string()],
            results: vec![crate::models::WebSearchResult {
                title: "Result".to_string(),
                url: "https://example.com".to_string(),
                content: "Content".to_string(),
                source_input: "query".to_string(),
            }],
        };
        let mut next_id = 3;
        let output: Value = serde_json::from_str(&web_tool_output(response, &mut next_id)).unwrap();
        assert_eq!(
            output.pointer("/results/0/id").and_then(Value::as_u64),
            Some(3)
        );
        assert_eq!(next_id, 4);
    }

    #[test]
    fn gemini_stream_route_is_rewritten_to_generate_content() {
        assert_eq!(
            gemini_generate_content_suffix(
                "/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse&trace=1"
            )
            .unwrap(),
            "/v1beta/models/gemini-3.5-flash:generateContent?trace=1"
        );
    }

    #[test]
    fn gemini_json_response_is_wrapped_as_one_sse_event() {
        let body = br#"{"candidates":[{"content":{"parts":[{"text":"OK"}]}}]}"#;

        assert_eq!(
            String::from_utf8(gemini_sse_from_response(body).unwrap()).unwrap(),
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"OK\"}]}}]}\n\n"
        );
    }

    #[test]
    fn synthetic_response_sse_includes_text_delta_events() {
        let response = serde_json::json!({
            "id": "resp_test",
            "object": "response",
            "status": "completed",
            "output": [{
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [{
                    "type": "output_text",
                    "text": "hello from synthetic sse",
                    "annotations": []
                }]
            }]
        });
        let body = serde_json::to_vec(&response).unwrap();
        let sse = String::from_utf8(synthetic_sse_from_response(&body)).unwrap();

        assert!(sse.contains("event: response.output_item.added"));
        assert!(sse.contains("event: response.content_part.added"));
        assert!(sse.contains("event: response.output_text.delta"));
        assert!(sse.contains("hello from synthetic sse"));
        assert!(sse.contains("event: response.completed"));
    }

    #[test]
    fn synthetic_response_sse_includes_function_call_events() {
        let response = serde_json::json!({
            "id": "resp_test",
            "object": "response",
            "status": "completed",
            "output": [{
                "id": "call_shell",
                "type": "function_call",
                "status": "completed",
                "name": "shell_command",
                "arguments": "{\"command\":\"Get-ChildItem\"}",
                "call_id": "call_shell"
            }]
        });
        let body = serde_json::to_vec(&response).unwrap();
        let sse = String::from_utf8(synthetic_sse_from_response(&body)).unwrap();

        assert!(sse.contains("event: response.output_item.added"));
        assert!(sse.contains("event: response.function_call_arguments.done"));
        assert!(sse.contains("event: response.output_item.done"));
        assert!(sse.contains("\"name\":\"shell_command\""));
        assert!(sse.contains("Get-ChildItem"));
        assert!(sse.contains("event: response.completed"));
    }

    #[test]
    fn gemini_route_uses_the_exact_selected_provider_model() {
        assert_eq!(
            gemini_suffix_with_provider_model(
                "/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse",
                "[福利]gemini-3.5-flash"
            ),
            "/v1beta/models/%5B%E7%A6%8F%E5%88%A9%5Dgemini-3.5-flash:streamGenerateContent?alt=sse"
        );
    }
}
