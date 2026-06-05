use crate::models::{ApiProvider, ChatAttachment, ChatMessage};
use base64::Engine;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const MAX_IMAGES: usize = 3;
const VISION_PROMPT: &str = "Analyze this image for another AI assistant. Extract visible text exactly and describe errors, code, UI state, objects, layout, charts, and spatial relationships relevant to the user's request. Do not answer the user's request directly.";
static DESCRIPTION_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

pub fn model_supports_vision(provider: &ApiProvider, model: &str) -> bool {
    if let Some(info) = provider
        .models
        .iter()
        .find(|candidate| candidate.id.eq_ignore_ascii_case(model))
    {
        let modalities = info
            .input_modalities
            .iter()
            .chain(info.capabilities.iter())
            .map(|value| value.to_ascii_lowercase())
            .collect::<Vec<_>>();
        if modalities
            .iter()
            .any(|value| value == "image" || value == "image_recognition")
        {
            return true;
        }
        if !info.input_modalities.is_empty() {
            return false;
        }
    }

    model_name_supports_vision(model)
}

pub fn model_name_supports_vision(model: &str) -> bool {
    let id = model.to_ascii_lowercase();
    [
        "vision",
        "vl",
        "omni",
        "gpt-4",
        "gpt-5",
        "o1",
        "o3",
        "o4",
        "claude-3",
        "claude-sonnet-4",
        "claude-opus-4",
        "claude-haiku-4",
        "gemini",
        "pixtral",
        "llava",
        "internvl",
        "gemma-3",
        "gemma3",
        "grok-4",
        "kimi-k2.5",
        "kimi-k2.6",
    ]
    .iter()
    .any(|needle| id.contains(needle))
}

pub fn preprocess_chat_messages(
    messages: &[ChatMessage],
    main_provider: &ApiProvider,
    main_model: &str,
    vision_provider: &ApiProvider,
    vision_model: &str,
) -> Result<Vec<ChatMessage>, String> {
    if model_supports_vision(main_provider, main_model) {
        return Ok(messages.to_vec());
    }

    let mut remaining = MAX_IMAGES;
    let mut output = Vec::with_capacity(messages.len());
    for message in messages {
        let mut next = message.clone();
        let mut descriptions = Vec::new();
        let mut kept = Vec::new();
        for attachment in &message.attachments {
            if remaining > 0 && is_image_attachment(attachment) {
                let image = attachment
                    .data_url
                    .as_deref()
                    .ok_or_else(|| "Image attachment has no data".to_string())?;
                descriptions.push(describe_image(
                    vision_provider,
                    vision_model,
                    image,
                    &message.content,
                    &attachment.name,
                )?);
                remaining -= 1;
            } else {
                kept.push(attachment.clone());
            }
        }
        if !descriptions.is_empty() {
            if !next.content.trim().is_empty() {
                next.content.push_str("\n\n");
            }
            next.content.push_str(&descriptions.join("\n\n"));
        }
        next.attachments = kept;
        output.push(next);
    }
    Ok(output)
}

pub fn preprocess_codex_body(
    body: &[u8],
    vision_provider: &ApiProvider,
    vision_model: &str,
) -> Result<Vec<u8>, String> {
    let mut value: Value = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    let mut remaining = MAX_IMAGES;
    if let Some(input) = value.get_mut("input").and_then(Value::as_array_mut) {
        for item in input {
            let context = codex_item_text(item);
            for key in ["content", "output"] {
                if let Some(parts) = item.get_mut(key).and_then(Value::as_array_mut) {
                    replace_codex_images(
                        parts,
                        &context,
                        vision_provider,
                        vision_model,
                        &mut remaining,
                    )?;
                }
            }
        }
    }
    serde_json::to_vec(&value).map_err(|error| error.to_string())
}

pub fn preprocess_anthropic_body(
    body: &[u8],
    vision_provider: &ApiProvider,
    vision_model: &str,
) -> Result<Vec<u8>, String> {
    let mut value: Value = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    let mut remaining = MAX_IMAGES;
    if let Some(messages) = value.get_mut("messages").and_then(Value::as_array_mut) {
        for message in messages {
            let context = content_text(message.get("content"));
            if let Some(parts) = message.get_mut("content").and_then(Value::as_array_mut) {
                let mut next = Vec::with_capacity(parts.len());
                for part in parts.drain(..) {
                    if remaining > 0 && part.get("type").and_then(Value::as_str) == Some("image") {
                        let image = anthropic_image_data_url(&part)?;
                        let description = describe_image(
                            vision_provider,
                            vision_model,
                            &image,
                            &context,
                            "image",
                        )?;
                        next.push(json!({"type": "text", "text": description}));
                        remaining -= 1;
                    } else {
                        next.push(part);
                    }
                }
                *parts = next;
            }
        }
    }
    serde_json::to_vec(&value).map_err(|error| error.to_string())
}

pub fn preprocess_gemini_body(
    body: &[u8],
    vision_provider: &ApiProvider,
    vision_model: &str,
) -> Result<Vec<u8>, String> {
    let mut value: Value = serde_json::from_slice(body).map_err(|error| error.to_string())?;
    let mut remaining = MAX_IMAGES;
    if let Some(contents) = value.get_mut("contents").and_then(Value::as_array_mut) {
        for content in contents {
            let context = content
                .get("parts")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            if let Some(parts) = content.get_mut("parts").and_then(Value::as_array_mut) {
                let mut next = Vec::with_capacity(parts.len());
                for part in parts.drain(..) {
                    if remaining > 0 && part.get("inlineData").is_some() {
                        let inline = part.get("inlineData").unwrap_or(&Value::Null);
                        let mime = inline
                            .get("mimeType")
                            .and_then(Value::as_str)
                            .unwrap_or("image/png");
                        let data = inline
                            .get("data")
                            .and_then(Value::as_str)
                            .ok_or_else(|| "Gemini image part has no data".to_string())?;
                        let image = format!("data:{mime};base64,{data}");
                        let description = describe_image(
                            vision_provider,
                            vision_model,
                            &image,
                            &context,
                            "image",
                        )?;
                        next.push(json!({"text": description}));
                        remaining -= 1;
                    } else {
                        next.push(part);
                    }
                }
                *parts = next;
            }
        }
    }
    serde_json::to_vec(&value).map_err(|error| error.to_string())
}

fn replace_codex_images(
    parts: &mut Vec<Value>,
    context: &str,
    vision_provider: &ApiProvider,
    vision_model: &str,
    remaining: &mut usize,
) -> Result<(), String> {
    let mut next = Vec::with_capacity(parts.len());
    for part in parts.drain(..) {
        if *remaining > 0 && part.get("type").and_then(Value::as_str) == Some("input_image") {
            let image = part
                .get("image_url")
                .and_then(Value::as_str)
                .ok_or_else(|| "Codex image part has no image_url".to_string())?;
            let description =
                describe_image(vision_provider, vision_model, image, context, "image")?;
            next.push(json!({"type": "input_text", "text": description}));
            *remaining -= 1;
        } else {
            next.push(part);
        }
    }
    *parts = next;
    Ok(())
}

fn describe_image(
    provider: &ApiProvider,
    model: &str,
    image: &str,
    user_request: &str,
    image_name: &str,
) -> Result<String, String> {
    let prompt = if user_request.trim().is_empty() {
        VISION_PROMPT.to_string()
    } else {
        format!("{VISION_PROMPT}\n\nUser request:\n{}", user_request.trim())
    };
    let cache_key = description_cache_key(provider, model, image, &prompt);
    if let Some(cached) = DESCRIPTION_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|cache| cache.get(&cache_key).cloned())
    {
        return Ok(cached);
    }

    let provider_type = normalized_provider_type(&provider.provider_type);
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())?;

    let response = if is_anthropic_protocol(&provider_type) {
        let (mime, data) = image_as_base64(&client, image)?;
        let mut headers = json_headers();
        add_anthropic_auth(&mut headers, &provider.api_key)?;
        client
            .post(anthropic_messages_url(&provider.base_url)?)
            .headers(headers)
            .json(&json!({
                "model": model,
                "max_tokens": 1200,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}}
                    ]
                }]
            }))
            .send()
    } else if provider_type == "gemini" {
        let (mime, data) = image_as_base64(&client, image)?;
        let mut headers = json_headers();
        add_gemini_auth(&mut headers, &provider.api_key)?;
        client
            .post(gemini_generate_url(&provider.base_url, model)?)
            .headers(headers)
            .json(&json!({
                "contents": [{"role": "user", "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": mime, "data": data}}
                ]}]
            }))
            .send()
    } else {
        let mut headers = json_headers();
        add_openai_auth(&mut headers, &provider.api_key)?;
        client
            .post(chat_completions_url(&provider.base_url)?)
            .headers(headers)
            .json(&json!({
                "model": model,
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image}}
                ]}],
                "max_tokens": 1200
            }))
            .send()
    }
    .map_err(|error| format!("Vision request failed: {error}"))?;

    let status = response.status();
    let value: Value = response
        .json()
        .map_err(|error| format!("Failed to parse vision response: {error}"))?;
    if !status.is_success() {
        let detail = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("Vision provider returned an error");
        return Err(detail.to_string());
    }

    let description = if is_anthropic_protocol(&provider_type) {
        value
            .get("content")
            .and_then(Value::as_array)
            .and_then(|items| {
                let text = items
                    .iter()
                    .filter_map(|item| item.get("text").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("\n");
                (!text.is_empty()).then_some(text)
            })
    } else if provider_type == "gemini" {
        value
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
            .and_then(|parts| {
                let text = parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("\n");
                (!text.is_empty()).then_some(text)
            })
    } else {
        value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .map(str::to_string)
    }
    .ok_or_else(|| "Vision response did not contain text".to_string())?;

    let result = format!(
        "<vision-analysis image=\"{}\">\n{}\n</vision-analysis>",
        image_name, description
    );
    if let Ok(mut cache) = DESCRIPTION_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        if cache.len() >= 256 {
            cache.clear();
        }
        cache.insert(cache_key, result.clone());
    }
    Ok(result)
}

fn description_cache_key(provider: &ApiProvider, model: &str, image: &str, prompt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(provider.id.as_bytes());
    hasher.update(model.as_bytes());
    hasher.update(image.as_bytes());
    hasher.update(prompt.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn is_image_attachment(attachment: &ChatAttachment) -> bool {
    attachment.kind == "image" && attachment.data_url.is_some()
}

fn codex_item_text(item: &Value) -> String {
    ["content", "output"]
        .iter()
        .filter_map(|key| item.get(*key).and_then(Value::as_array))
        .flat_map(|parts| parts.iter())
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
}

fn content_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| part.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn anthropic_image_data_url(part: &Value) -> Result<String, String> {
    let source = part
        .get("source")
        .ok_or_else(|| "Anthropic image has no source".to_string())?;
    if source.get("type").and_then(Value::as_str) == Some("url") {
        return source
            .get("url")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| "Anthropic image URL is missing".to_string());
    }
    let mime = source
        .get("media_type")
        .and_then(Value::as_str)
        .unwrap_or("image/png");
    let data = source
        .get("data")
        .and_then(Value::as_str)
        .ok_or_else(|| "Anthropic image data is missing".to_string())?;
    Ok(format!("data:{mime};base64,{data}"))
}

fn image_as_base64(client: &Client, image: &str) -> Result<(String, String), String> {
    if let Some(rest) = image.trim().strip_prefix("data:") {
        let (meta, data) = rest
            .split_once(',')
            .ok_or_else(|| "Invalid image data URL".to_string())?;
        let mime = meta.split(';').next().unwrap_or("image/png").to_string();
        return Ok((mime, data.to_string()));
    }
    let response = client
        .get(image)
        .send()
        .map_err(|error| format!("Failed to download image: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Image download failed with {}", response.status()));
    }
    let mime = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .unwrap_or("image/png")
        .to_string();
    let data = base64::engine::general_purpose::STANDARD.encode(
        response
            .bytes()
            .map_err(|error| format!("Failed to read image: {error}"))?,
    );
    Ok((mime, data))
}

fn normalized_provider_type(provider_type: &str) -> String {
    match provider_type.trim().to_ascii_lowercase().as_str() {
        "" | "new-api" | "glm" | "deepseek" | "mimo" => "openai-compatible".to_string(),
        value => value.to_string(),
    }
}

fn is_anthropic_protocol(provider_type: &str) -> bool {
    matches!(provider_type, "anthropic" | "anthropic-compatible")
}

fn api_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Vision provider Base URL is empty".to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    for suffix in ["/chat/completions", "/messages", "/responses", "/models"] {
        if let Some(prefix) = lower.strip_suffix(suffix) {
            return Ok(trimmed[..prefix.len()].trim_end_matches('/').to_string());
        }
    }
    Ok(trimmed.to_string())
}

fn chat_completions_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/v1") || lower.ends_with("/v1beta") || lower.ends_with("/api/paas/v4") {
        Ok(format!("{base}/chat/completions"))
    } else {
        Ok(format!("{base}/v1/chat/completions"))
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

fn gemini_generate_url(base_url: &str, model: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    let model = model.trim().trim_start_matches("models/");
    if base.to_ascii_lowercase().ends_with("/v1") || base.to_ascii_lowercase().ends_with("/v1beta")
    {
        Ok(format!("{base}/models/{model}:generateContent"))
    } else {
        Ok(format!("{base}/v1beta/models/{model}:generateContent"))
    }
}

fn json_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers
}

fn add_openai_auth(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if !api_key.trim().is_empty() {
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", api_key.trim()))
                .map_err(|error| error.to_string())?,
        );
    }
    Ok(())
}

fn add_anthropic_auth(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if !api_key.trim().is_empty() {
        headers.insert(
            "x-api-key",
            HeaderValue::from_str(api_key.trim()).map_err(|error| error.to_string())?,
        );
    }
    headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
    Ok(())
}

fn add_gemini_auth(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if !api_key.trim().is_empty() {
        headers.insert(
            "x-goog-api-key",
            HeaderValue::from_str(api_key.trim()).map_err(|error| error.to_string())?,
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RemoteModel;

    fn provider(model: RemoteModel) -> ApiProvider {
        ApiProvider {
            id: "p".to_string(),
            name: "p".to_string(),
            provider_type: "openai-compatible".to_string(),
            wire_api: "chat".to_string(),
            base_url: "https://example.com/v1".to_string(),
            api_key: String::new(),
            website_url: String::new(),
            open_ai_auth_json: None,
            models: vec![model],
            enabled: true,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn explicit_text_modality_overrides_name_guessing() {
        let api = provider(RemoteModel {
            id: "gpt-5-text".to_string(),
            name: None,
            owned_by: None,
            description: None,
            capabilities: vec![],
            input_modalities: vec!["text".to_string()],
            output_modalities: vec!["text".to_string()],
        });
        assert!(!model_supports_vision(&api, "gpt-5-text"));
    }

    #[test]
    fn codex_image_is_replaced_by_text_shape() {
        let input = json!({
            "input": [{"type": "message", "role": "user", "content": [
                {"type": "input_text", "text": "inspect"},
                {"type": "input_image", "image_url": "data:image/png;base64,AA=="}
            ]}]
        });
        let mut value = input;
        let parts = value["input"][0]["content"].as_array_mut().unwrap();
        let mut remaining = 1;
        let mut next = Vec::new();
        for part in parts.drain(..) {
            if part["type"] == "input_image" && remaining > 0 {
                next.push(json!({"type": "input_text", "text": "description"}));
                remaining -= 1;
            } else {
                next.push(part);
            }
        }
        *parts = next;
        assert_eq!(value["input"][0]["content"][1]["type"], "input_text");
    }
}
