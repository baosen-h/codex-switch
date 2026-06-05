use crate::agent_writer::{
    resolve_claude_dir, resolve_codex_dir, resolve_gemini_dir, write_provider, AgentDirs,
    AGENT_CLAUDE, AGENT_CODEX, AGENT_GEMINI,
};
use crate::app_config::{
    APP_HOME_DIR, APP_ID, APP_NAME, LATEST_RELEASE_API_URL, RELEASES_URL, RELEASE_DOWNLOAD_PREFIX,
    USER_AGENT, WINDOWS_EXE_NAME,
};
use crate::database::Database;
use crate::error::AppError;
use crate::handoff;
use crate::models::{
    ApiProvider, AppSettings, AppUpdateInfo, ChatAttachment, ChatMessage, ChatRequest,
    ChatResponse, DashboardState, HandoffPreview, ImageGenerationRequest, ImageGenerationResponse,
    LaunchRequest, ModelListRequest, Provider, ProviderBalance, RemoteModel, SessionMessage,
    SessionRecord, UpdateDownloadProgress,
};
use crate::session_manager;
use base64::Engine;
use reqwest::blocking::multipart::{Form, Part};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Arc<Mutex<Database>>,
}

impl AppState {
    pub fn new() -> Result<Self, AppError> {
        let db = Arc::new(Mutex::new(Database::new()?));
        crate::compatibility_proxy::start(Arc::clone(&db));
        Ok(Self { db })
    }
}

fn notify_tray(app: &AppHandle) {
    let _ = app.emit("providers-changed", ());
}

#[tauri::command]
pub fn get_dashboard(state: State<'_, AppState>) -> Result<DashboardState, String> {
    let mut dashboard = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .dashboard()
        .map_err(|error| error.to_string())?;

    enrich_dashboard_models(&mut dashboard);
    Ok(dashboard)
}

#[tauri::command]
pub fn save_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    provider: Provider,
) -> Result<Provider, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;

    let saved = db
        .save_provider(provider)
        .map_err(|error| error.to_string())?;

    if saved.is_current {
        let settings = db.settings().map_err(|error| error.to_string())?;
        let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
        let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
        let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
        write_provider(
            &saved,
            &AgentDirs {
                codex: &codex_dir,
                claude: &claude_dir,
                gemini: &gemini_dir,
                vision_codex: settings.vision_fallback_enabled,
                vision_claude: settings.vision_fallback_enabled,
                vision_gemini: settings.vision_fallback_enabled,
            },
        )
        .map_err(|error| error.to_string())?;
    }
    drop(db);
    notify_tray(&app);
    Ok(saved)
}

#[tauri::command]
pub fn delete_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let ok = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .delete_provider(&id)
        .map_err(|error| error.to_string())?;
    notify_tray(&app);
    Ok(ok)
}

#[tauri::command]
pub fn save_api_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    provider: ApiProvider,
) -> Result<ApiProvider, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;
    let saved = db
        .save_api_provider(provider)
        .map_err(|error| error.to_string())?;

    let active_linked_providers: Vec<Provider> = db
        .providers()
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter(|provider| provider.api_provider_id == saved.id && provider.is_current)
        .collect();

    if !active_linked_providers.is_empty() {
        let settings = db.settings().map_err(|error| error.to_string())?;
        let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
        let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
        let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
        let dirs = AgentDirs {
            codex: &codex_dir,
            claude: &claude_dir,
            gemini: &gemini_dir,
            vision_codex: settings.vision_fallback_enabled,
            vision_claude: settings.vision_fallback_enabled,
            vision_gemini: settings.vision_fallback_enabled,
        };
        for provider in &active_linked_providers {
            write_provider(provider, &dirs).map_err(|error| error.to_string())?;
        }
    }
    drop(db);
    notify_tray(&app);
    Ok(saved)
}

#[tauri::command]
pub fn delete_api_provider(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .delete_api_provider(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn activate_provider(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<Provider, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;

    let provider = db
        .activate_provider(&id)
        .map_err(|error| error.to_string())?;
    let settings = db.settings().map_err(|error| error.to_string())?;
    let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
    let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
    let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
    write_provider(
        &provider,
        &AgentDirs {
            codex: &codex_dir,
            claude: &claude_dir,
            gemini: &gemini_dir,
            vision_codex: settings.vision_fallback_enabled,
            vision_claude: settings.vision_fallback_enabled,
            vision_gemini: settings.vision_fallback_enabled,
        },
    )
    .map_err(|error| error.to_string())?;
    drop(db);
    notify_tray(&app);

    Ok(provider)
}

#[tauri::command]
pub async fn list_provider_models(request: ModelListRequest) -> Result<Vec<RemoteModel>, String> {
    tauri::async_runtime::spawn_blocking(move || list_provider_models_blocking(request))
        .await
        .map_err(|error| format!("Model list task failed: {error}"))?
}

fn list_provider_models_blocking(request: ModelListRequest) -> Result<Vec<RemoteModel>, String> {
    let provider_type = normalized_provider_type(&request.provider_type);
    let endpoint = model_list_endpoint(&provider_type, &request.base_url)?;
    let api_key = request.api_key.trim();

    let mut headers = HeaderMap::new();
    headers.insert("Accept", HeaderValue::from_static("application/json"));
    headers.insert("User-Agent", HeaderValue::from_static(USER_AGENT));

    if !api_key.is_empty() {
        match endpoint.auth {
            ModelListAuthStyle::Anthropic => add_anthropic_auth_headers(&mut headers, api_key)?,
            ModelListAuthStyle::Gemini => add_gemini_auth_headers(&mut headers, api_key)?,
            ModelListAuthStyle::OpenAi => add_openai_auth_headers(&mut headers, api_key)?,
        }
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(&endpoint.url)
        .headers(headers)
        .send()
        .map_err(|error| format!("Failed to fetch model list: {error}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|error| format!("Failed to parse model list response: {error}"))?;

    if !status.is_success() {
        return Err(extract_api_error(&body)
            .unwrap_or_else(|| format!("Model list request failed with HTTP status {status}")));
    }

    Ok(enrich_models_with_openrouter_metadata(
        &client,
        extract_models(&body),
    ))
}

#[tauri::command]
pub async fn send_chat_message(
    state: State<'_, AppState>,
    request: ChatRequest,
) -> Result<ChatResponse, String> {
    let db = Arc::clone(&state.db);
    tauri::async_runtime::spawn_blocking(move || {
        let request = {
            let db = db
                .lock()
                .map_err(|_| "Failed to lock database".to_string())?;
            let settings = db.settings().map_err(|error| error.to_string())?;
            if settings.vision_fallback_enabled
                && !settings.vision_api_provider_id.trim().is_empty()
                && !settings.vision_model.trim().is_empty()
            {
                let vision_provider = db
                    .api_provider_by_id(&settings.vision_api_provider_id)
                    .map_err(|error| error.to_string())?;
                let messages = crate::vision_fallback::preprocess_chat_messages(
                    &request.messages,
                    &request.provider,
                    &request.model,
                    &vision_provider,
                    &settings.vision_model,
                )?;
                ChatRequest {
                    messages,
                    ..request
                }
            } else {
                request
            }
        };
        send_chat_message_blocking(request)
    })
    .await
    .map_err(|error| format!("Chat task failed: {error}"))?
}

fn send_chat_message_blocking(request: ChatRequest) -> Result<ChatResponse, String> {
    let provider_type = normalized_provider_type(&request.provider.provider_type);
    let api_key = request.provider.api_key.trim();
    let client = Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| error.to_string())?;

    let response = if is_anthropic_protocol(&provider_type) {
        let url = anthropic_messages_url(&request.provider.base_url)?;
        let mut headers = json_headers();
        add_anthropic_auth_headers_for_base(&mut headers, api_key, &request.provider.base_url)?;
        client
            .post(url)
            .headers(headers)
            .json(&serde_json::json!({
                "model": request.model.trim(),
                "max_tokens": 4096,
                "messages": anthropic_chat_messages(&request.messages)?,
            }))
            .send()
    } else if provider_type == "gemini" {
        let url = gemini_generate_url(&request.provider.base_url, &request.model)?;
        let mut headers = json_headers();
        add_gemini_auth_headers(&mut headers, api_key)?;
        client
            .post(url)
            .headers(headers)
            .json(&serde_json::json!({
                "contents": gemini_chat_messages(&request.messages)?,
            }))
            .send()
    } else {
        let url = chat_completions_url(&provider_type, &request.provider.base_url)?;
        let mut headers = json_headers();
        add_openai_auth_headers(&mut headers, api_key)?;
        client
            .post(url)
            .headers(headers)
            .json(&serde_json::json!({
                "model": request.model.trim(),
                "messages": openai_chat_messages(&request.messages),
            }))
            .send()
    }
    .map_err(|error| format!("Failed to send chat request: {error}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|error| format!("Failed to parse chat response: {error}"))?;
    if !status.is_success() {
        return Err(extract_api_error(&body)
            .unwrap_or_else(|| format!("Chat request failed with HTTP status {status}")));
    }

    let content = extract_chat_content(&provider_type, &body)
        .ok_or_else(|| "Chat response did not contain text content".to_string())?;
    Ok(ChatResponse { content })
}

#[tauri::command]
pub async fn generate_image(
    request: ImageGenerationRequest,
) -> Result<ImageGenerationResponse, String> {
    tauri::async_runtime::spawn_blocking(move || generate_image_blocking(request))
        .await
        .map_err(|error| format!("Image generation task failed: {error}"))?
}

fn generate_image_blocking(
    request: ImageGenerationRequest,
) -> Result<ImageGenerationResponse, String> {
    let provider_type = normalized_provider_type(&request.provider.provider_type);
    if is_anthropic_protocol(&provider_type) {
        return Err("This provider does not expose an image generation endpoint here.".to_string());
    }
    if provider_type == "gemini" {
        return Err("Gemini image generation is not wired in this page yet.".to_string());
    }

    let url = if request.input_images.is_empty() {
        images_generations_url(&request.provider.base_url)?
    } else {
        images_edits_url(&request.provider.base_url)?
    };
    let mut headers = if request.input_images.is_empty() {
        json_headers()
    } else {
        api_headers()
    };
    add_openai_auth_headers(&mut headers, request.provider.api_key.trim())?;
    let count = request.count.clamp(1, 4);

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;
    let response = if request.input_images.is_empty() {
        let mut payload = serde_json::json!({
            "model": request.model.trim(),
            "prompt": request.prompt.trim(),
            "n": count,
        });
        add_optional_json_string(&mut payload, "size", &request.size);
        add_optional_json_string(&mut payload, "quality", &request.quality);
        add_optional_json_string(&mut payload, "background", &request.background);
        client.post(url).headers(headers).json(&payload).send()
    } else {
        let mut form = Form::new()
            .text("model", request.model.trim().to_string())
            .text("prompt", request.prompt.trim().to_string())
            .text("n", count.to_string());
        if !request.size.trim().is_empty() && request.size.trim() != "auto" {
            form = form.text("size", request.size.trim().to_string());
        }
        if !request.quality.trim().is_empty() && request.quality.trim() != "auto" {
            form = form.text("quality", request.quality.trim().to_string());
        }
        if !request.background.trim().is_empty() && request.background.trim() != "auto" {
            form = form.text("background", request.background.trim().to_string());
        }
        for (index, image) in request.input_images.iter().enumerate() {
            let part = image_data_url_part(image, index)?;
            form = form.part("image", part);
        }
        client.post(url).headers(headers).multipart(form).send()
    }
    .map_err(|error| format!("Failed to send image request: {error}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|error| format!("Failed to parse image response: {error}"))?;
    if !status.is_success() {
        return Err(extract_api_error(&body)
            .unwrap_or_else(|| format!("Image request failed with HTTP status {status}")));
    }

    let images = persist_generated_images(extract_images(&body));
    if images.is_empty() {
        return Err("Image response did not contain image URLs or base64 data.".to_string());
    }
    Ok(ImageGenerationResponse { images })
}

#[tauri::command]
pub fn launch_codex(state: State<'_, AppState>, request: LaunchRequest) -> Result<bool, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;

    let provider = db
        .current_provider_for_agent(AGENT_CODEX)
        .map_err(|error| error.to_string())?;
    let settings = db.settings().map_err(|error| error.to_string())?;
    let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
    let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
    let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
    write_provider(
        &provider,
        &AgentDirs {
            codex: &codex_dir,
            claude: &claude_dir,
            gemini: &gemini_dir,
            vision_codex: settings.vision_fallback_enabled,
            vision_claude: settings.vision_fallback_enabled,
            vision_gemini: settings.vision_fallback_enabled,
        },
    )
    .map_err(|error| error.to_string())?;

    launch_terminal(&settings.terminal_program, &request.workspace_path)
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn launch_session(state: State<'_, AppState>, session: SessionRecord) -> Result<bool, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;
    let settings = db.settings().map_err(|error| error.to_string())?;
    if session.agent == AGENT_CODEX {
        let source_path = PathBuf::from(&session.source_path);
        let resume_record = session_manager::session_record_for_path(&source_path)
            .unwrap_or_else(|_| session.clone());
        if let Some(provider) = provider_for_session(&db, &resume_record) {
            let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
            let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
            let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
            write_provider(
                &provider,
                &AgentDirs {
                    codex: &codex_dir,
                    claude: &claude_dir,
                    gemini: &gemini_dir,
                    vision_codex: settings.vision_fallback_enabled,
                    vision_claude: settings.vision_fallback_enabled,
                    vision_gemini: settings.vision_fallback_enabled,
                },
            )
            .map_err(|error| error.to_string())?;
        }
    }
    drop(db);

    launch_terminal_command(
        &settings.terminal_program,
        &session.workspace_path,
        &session.resume_command,
    )
    .map_err(|error| error.to_string())?;
    Ok(true)
}

fn provider_for_session(db: &Database, session: &SessionRecord) -> Option<Provider> {
    let providers = db.providers().ok()?;
    let session_model = session.provider_model.trim();
    let session_provider = session.provider_name.trim();
    let session_provider_id = session.provider_id.trim();

    if !session_model.is_empty() {
        if let Some(provider) = providers.iter().find(|provider| {
            provider.agent == AGENT_CODEX
                && provider.model.trim().eq_ignore_ascii_case(session_model)
        }) {
            return Some(provider.clone());
        }
    }

    let normalized_provider = normalize_lookup(session_provider);
    let normalized_provider_id = normalize_lookup(session_provider_id);
    providers
        .into_iter()
        .filter(|provider| provider.agent == AGENT_CODEX)
        .find(|provider| {
            normalize_lookup(&provider.name) == normalized_provider
                || normalize_lookup(&provider.id) == normalized_provider_id
                || normalize_lookup(&provider.api_provider_id) == normalized_provider_id
        })
}

fn normalize_lookup(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

#[tauri::command]
pub fn launch_provider(state: State<'_, AppState>, provider_id: String) -> Result<bool, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;

    let provider = db
        .provider_by_id(&provider_id)
        .map_err(|error| error.to_string())?;
    let settings = db.settings().map_err(|error| error.to_string())?;
    let codex_dir = resolve_codex_dir(&settings.codex_config_dir);
    let claude_dir = resolve_claude_dir(&settings.claude_config_dir);
    let gemini_dir = resolve_gemini_dir(&settings.gemini_config_dir);
    write_provider(
        &provider,
        &AgentDirs {
            codex: &codex_dir,
            claude: &claude_dir,
            gemini: &gemini_dir,
            vision_codex: settings.vision_fallback_enabled,
            vision_claude: settings.vision_fallback_enabled,
            vision_gemini: settings.vision_fallback_enabled,
        },
    )
    .map_err(|error| error.to_string())?;

    let workspace = if settings.default_workspace.trim().is_empty() {
        ".".to_string()
    } else {
        settings.default_workspace.clone()
    };
    let command = match provider.agent.as_str() {
        AGENT_CLAUDE => "claude",
        AGENT_GEMINI => "gemini",
        _ => "codex",
    };
    launch_terminal_command(&settings.terminal_program, &workspace, command)
        .map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;
    let saved = db
        .save_settings(settings)
        .map_err(|error| error.to_string())?;
    let codex_dir = resolve_codex_dir(&saved.codex_config_dir);
    let claude_dir = resolve_claude_dir(&saved.claude_config_dir);
    let gemini_dir = resolve_gemini_dir(&saved.gemini_config_dir);
    let dirs = AgentDirs {
        codex: &codex_dir,
        claude: &claude_dir,
        gemini: &gemini_dir,
        vision_codex: saved.vision_fallback_enabled,
        vision_claude: saved.vision_fallback_enabled,
        vision_gemini: saved.vision_fallback_enabled,
    };
    for agent in [AGENT_CODEX, AGENT_CLAUDE, AGENT_GEMINI] {
        if let Ok(provider) = db.current_provider_for_agent(agent) {
            write_provider(&provider, &dirs).map_err(|error| error.to_string())?;
        }
    }
    Ok(saved)
}

#[tauri::command]
pub fn get_session_messages(source_path: String) -> Result<Vec<SessionMessage>, String> {
    let path = PathBuf::from(&source_path);
    session_manager::session_messages_for_path(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn build_session_handoff(
    state: State<'_, AppState>,
    source_path: String,
    mode: String,
) -> Result<HandoffPreview, String> {
    let path = PathBuf::from(&source_path);
    let use_codex_provider = mode.trim().eq_ignore_ascii_case("slow");
    let source_record = if use_codex_provider {
        None
    } else {
        Some(session_manager::session_record_for_path(&path).map_err(|e| e.to_string())?)
    };
    let provider_agent = source_record
        .as_ref()
        .map(|record| record.agent.as_str())
        .unwrap_or(AGENT_CODEX);
    let provider = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .current_provider_for_agent(provider_agent)
        .ok();
    handoff::build_session_handoff(&path, &mode, provider.as_ref())
}

#[tauri::command]
pub fn delete_session(source_path: String) -> Result<bool, String> {
    std::fs::remove_file(&source_path).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn get_provider_balance(provider: ApiProvider) -> Result<ProviderBalance, String> {
    fetch_provider_balance(&provider).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn check_app_update(current_version: String) -> Result<Option<AppUpdateInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || check_app_update_blocking(&current_version))
        .await
        .map_err(|error| error.to_string())?
}

fn check_app_update_blocking(current_version: &str) -> Result<Option<AppUpdateInfo>, String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;

    let response: Value = client
        .get(LATEST_RELEASE_API_URL)
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .map_err(|error| error.to_string())?;

    let latest_version = response
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();

    if latest_version.is_empty() || compare_versions(&latest_version, current_version) <= 0 {
        return Ok(None);
    }

    let release_url = response
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or(RELEASES_URL)
        .to_string();
    let asset = select_update_asset(response.get("assets").and_then(Value::as_array));

    Ok(Some(AppUpdateInfo {
        latest_version,
        release_url,
        installer_url: asset.as_ref().map(|item| item.url.clone()),
        installer_name: asset.as_ref().map(|item| item.name.clone()),
        installer_digest: asset.as_ref().and_then(|item| item.digest.clone()),
        release_name: response
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| !name.trim().is_empty())
            .map(str::to_string),
        published_at: response
            .get("published_at")
            .and_then(Value::as_str)
            .map(str::to_string),
    }))
}

#[derive(Debug, Clone)]
struct UpdateAsset {
    name: String,
    url: String,
    digest: Option<String>,
}

fn select_update_asset(assets: Option<&Vec<Value>>) -> Option<UpdateAsset> {
    let assets = assets?;
    let arch_hint = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "x86",
        "aarch64" => "arm64",
        other => other,
    };

    assets
        .iter()
        .filter_map(|asset| {
            let name = asset.get("name")?.as_str()?.to_string();
            let url = asset.get("browser_download_url")?.as_str()?.to_string();
            let lower = name.to_ascii_lowercase();
            let digest = asset
                .get("digest")
                .and_then(Value::as_str)
                .map(str::to_string);

            let mut score = 0;
            if lower.ends_with(".exe") && lower.contains("setup") {
                score += 80;
            } else if lower.ends_with(".msi") {
                score += 60;
            } else {
                return None;
            }
            if lower.contains(arch_hint) {
                score += 20;
            }

            Some((score, UpdateAsset { name, url, digest }))
        })
        .max_by_key(|(score, _)| *score)
        .map(|(_, asset)| asset)
}

#[tauri::command]
pub async fn download_and_install_update(
    app: AppHandle,
    update: AppUpdateInfo,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || download_and_install_update_blocking(app, update))
        .await
        .map_err(|error| error.to_string())?
}

fn download_and_install_update_blocking(
    app: AppHandle,
    update: AppUpdateInfo,
) -> Result<bool, String> {
    let installer_url = update
        .installer_url
        .as_deref()
        .ok_or_else(|| "No installer asset is available for this release.".to_string())?;
    let installer_name = update
        .installer_name
        .as_deref()
        .ok_or_else(|| "Installer asset name is missing.".to_string())?;

    if !installer_url.starts_with(RELEASE_DOWNLOAD_PREFIX) {
        return Err("Refusing to download update from an unexpected URL.".to_string());
    }

    let file_name = sanitize_asset_name(installer_name);
    let update_dir = dirs::home_dir()
        .ok_or_else(|| "Unable to determine home directory".to_string())?
        .join(APP_HOME_DIR)
        .join("updates")
        .join(format!(
            "v{}",
            update.latest_version.trim_start_matches('v')
        ));
    fs::create_dir_all(&update_dir).map_err(|error| error.to_string())?;

    let installer_path = update_dir.join(&file_name);
    let partial_path = update_dir.join(format!("{file_name}.part"));
    download_update_file(
        &app,
        installer_url,
        update.installer_digest.as_deref(),
        &partial_path,
        &installer_path,
    )?;

    emit_update_progress(&app, "launching", Some(100));
    launch_update_installer(&installer_path)?;
    crate::remove_tray_icon(&app);
    app.exit(0);
    Ok(true)
}

fn sanitize_asset_name(name: &str) -> String {
    name.chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            other => other,
        })
        .collect()
}

fn download_update_file(
    app: &AppHandle,
    url: &str,
    expected_digest: Option<&str>,
    partial_path: &PathBuf,
    target_path: &PathBuf,
) -> Result<(), String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?;
    let mut response = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .send()
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?;

    let total = response.content_length().unwrap_or(0);
    let mut loaded: u64 = 0;
    let mut hasher = Sha256::new();
    let mut file = fs::File::create(partial_path).map_err(|error| error.to_string())?;
    let mut buffer = [0_u8; 64 * 1024];

    emit_update_progress(app, "downloading", Some(0));
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
        hasher.update(&buffer[..read]);
        loaded += read as u64;
        if total > 0 {
            let percent = ((loaded as f64 / total as f64) * 100.0).round() as i32;
            emit_update_progress(app, "downloading", Some(percent.clamp(0, 99)));
        }
    }
    file.flush().map_err(|error| error.to_string())?;

    emit_update_progress(app, "verifying", Some(100));
    if let Some(expected) = expected_digest.and_then(|value| value.strip_prefix("sha256:")) {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(partial_path);
            return Err(format!(
                "Downloaded installer failed SHA-256 verification. expected {expected}, got {actual}"
            ));
        }
    }

    if target_path.exists() {
        fs::remove_file(target_path).map_err(|error| error.to_string())?;
    }
    fs::rename(partial_path, target_path).map_err(|error| error.to_string())
}

fn emit_update_progress(app: &AppHandle, status: &str, percent: Option<i32>) {
    let _ = app.emit(
        "update-download-progress",
        UpdateDownloadProgress {
            status: status.to_string(),
            percent,
        },
    );
}

#[cfg(target_os = "windows")]
fn launch_update_installer(path: &PathBuf) -> Result<(), String> {
    let installer = ps_single_quote(&path.to_string_lossy());
    let app_exe = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .to_string();
    let app_exe = ps_single_quote(&app_exe);
    let local_app_exe = ps_single_quote(&format!(
        r"%LOCALAPPDATA%\Programs\{APP_NAME}\{WINDOWS_EXE_NAME}"
    ));
    let program_files_exe =
        ps_single_quote(&format!(r"%ProgramFiles%\{APP_NAME}\{WINDOWS_EXE_NAME}"));
    let program_files_x86_exe = ps_single_quote(&format!(
        r"%ProgramFiles(x86)%\{APP_NAME}\{WINDOWS_EXE_NAME}"
    ));
    let pid = std::process::id();
    let lower = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let install_command = if lower.ends_with(".msi") {
        format!(
            "Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i','{installer}','/passive') -Verb RunAs -Wait -WindowStyle Hidden"
        )
    } else {
        format!(
            "Start-Process -FilePath '{installer}' -ArgumentList @('/S','--force-run') -Verb RunAs -Wait -WindowStyle Hidden"
        )
    };

    let command = format!(
        "$ErrorActionPreference='Stop'; \
         Wait-Process -Id {pid} -ErrorAction SilentlyContinue; \
         Get-Process | Where-Object {{ $_.Id -ne $PID -and ($_.ProcessName -eq '{APP_ID}' -or $_.ProcessName -eq '{APP_NAME}') }} | Stop-Process -Force -ErrorAction SilentlyContinue; \
         {install_command}; \
         Start-Sleep -Milliseconds 900; \
         $candidates = @('{local_app_exe}', '{program_files_exe}', '{program_files_x86_exe}', '{app_exe}'); \
         foreach ($candidate in $candidates) {{ \
           $expanded = [Environment]::ExpandEnvironmentVariables($candidate); \
           if (Test-Path $expanded) {{ Start-Process -FilePath $expanded; break }} \
         }}"
    );

    Command::new("powershell")
        .args(["-NoProfile", "-NoLogo", "-Command", &command])
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn ps_single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(not(target_os = "windows"))]
fn launch_update_installer(_path: &PathBuf) -> Result<(), String> {
    Err("In-app installation is currently only supported on Windows.".to_string())
}

fn compare_versions(a: &str, b: &str) -> i32 {
    let left = parse_version_parts(a);
    let right = parse_version_parts(b);
    let max_len = left.len().max(right.len());

    for index in 0..max_len {
        let left_part = left.get(index).copied().unwrap_or(0);
        let right_part = right.get(index).copied().unwrap_or(0);
        if left_part > right_part {
            return 1;
        }
        if left_part < right_part {
            return -1;
        }
    }

    0
}

fn parse_version_parts(version: &str) -> Vec<i32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            part.split(|ch: char| !ch.is_ascii_digit())
                .next()
                .unwrap_or("0")
                .parse::<i32>()
                .unwrap_or(0)
        })
        .collect()
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<bool, String> {
    if url.trim().is_empty() {
        return Err("URL is empty".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(true);
    }
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn pick_directory(initial_path: Option<String>) -> Result<Option<String>, String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.ShowNewFolderButton = $true
$initial = $env:CODEX_SWITCH_INITIAL_DIR
if (-not [string]::IsNullOrWhiteSpace($initial) -and (Test-Path -LiteralPath $initial)) {
  $dialog.SelectedPath = $initial
}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.SelectedPath
}
"#;

    let output = Command::new("powershell")
        .creation_flags(CREATE_NO_WINDOW)
        .env("CODEX_SWITCH_INITIAL_DIR", initial_path.unwrap_or_default())
        .args(["-NoProfile", "-NoLogo", "-STA", "-Command", script])
        .output()
        .map_err(|error| format!("Failed to open folder picker: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Folder picker failed".to_string()
        } else {
            stderr
        });
    }

    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if selected.is_empty() {
        None
    } else {
        Some(selected)
    })
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn pick_directory(_initial_path: Option<String>) -> Result<Option<String>, String> {
    Err("Folder picker is only implemented on Windows in this build.".to_string())
}

fn normalized_provider_type(provider_type: &str) -> String {
    let trimmed = provider_type.trim();
    if trimmed.is_empty() {
        "openai-compatible".to_string()
    } else if trimmed.eq_ignore_ascii_case("new-api") {
        "openai-compatible".to_string()
    } else if trimmed.eq_ignore_ascii_case("glm")
        || trimmed.eq_ignore_ascii_case("deepseek")
        || trimmed.eq_ignore_ascii_case("mimo")
    {
        "openai-compatible".to_string()
    } else {
        trimmed.to_ascii_lowercase()
    }
}

fn is_anthropic_protocol(provider_type: &str) -> bool {
    provider_type == "anthropic" || provider_type == "anthropic-compatible"
}

fn json_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("Accept", HeaderValue::from_static("application/json"));
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    headers.insert("User-Agent", HeaderValue::from_static(USER_AGENT));
    headers
}

fn api_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("Accept", HeaderValue::from_static("application/json"));
    headers.insert("User-Agent", HeaderValue::from_static(USER_AGENT));
    headers
}

fn add_openai_auth_headers(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if api_key.is_empty() {
        return Ok(());
    }
    let bearer = HeaderValue::from_str(&format!("Bearer {api_key}"))
        .map_err(|error| format!("Invalid API key header: {error}"))?;
    let x_api_key = HeaderValue::from_str(api_key)
        .map_err(|error| format!("Invalid API key header: {error}"))?;
    headers.insert(AUTHORIZATION, bearer);
    headers.insert("X-Api-Key", x_api_key);
    Ok(())
}

fn add_anthropic_auth_headers(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if api_key.is_empty() {
        return Ok(());
    }
    let x_api_key = HeaderValue::from_str(api_key)
        .map_err(|error| format!("Invalid API key header: {error}"))?;
    headers.insert("x-api-key", x_api_key);
    headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
    Ok(())
}

fn add_anthropic_auth_headers_for_base(
    headers: &mut HeaderMap,
    api_key: &str,
    base_url: &str,
) -> Result<(), String> {
    if is_mimo_api_base(&base_url.to_ascii_lowercase()) {
        return add_mimo_auth_headers(headers, api_key);
    }
    add_anthropic_auth_headers(headers, api_key)
}

fn add_mimo_auth_headers(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if api_key.is_empty() {
        return Ok(());
    }
    let api_key_header = HeaderValue::from_str(api_key)
        .map_err(|error| format!("Invalid API key header: {error}"))?;
    let bearer = HeaderValue::from_str(&format!("Bearer {api_key}"))
        .map_err(|error| format!("Invalid API key header: {error}"))?;
    headers.insert("api-key", api_key_header);
    headers.insert(AUTHORIZATION, bearer);
    Ok(())
}

fn add_gemini_auth_headers(headers: &mut HeaderMap, api_key: &str) -> Result<(), String> {
    if api_key.is_empty() {
        return Ok(());
    }
    let x_api_key = HeaderValue::from_str(api_key)
        .map_err(|error| format!("Invalid API key header: {error}"))?;
    headers.insert("x-goog-api-key", x_api_key);
    Ok(())
}

fn api_base_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL is empty".to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    let base = if let Some(prefix) = lower.strip_suffix("/chat/completions") {
        &trimmed[..prefix.len()]
    } else if let Some(prefix) = lower.strip_suffix("/images/generations") {
        &trimmed[..prefix.len()]
    } else if let Some(prefix) = lower.strip_suffix("/messages") {
        &trimmed[..prefix.len()]
    } else if let Some(prefix) = lower.strip_suffix("/responses") {
        &trimmed[..prefix.len()]
    } else if let Some(prefix) = lower.strip_suffix("/models") {
        &trimmed[..prefix.len()]
    } else {
        trimmed
    };
    Ok(base.trim_end_matches('/').to_string())
}

fn is_glm_api_base(lower_base: &str) -> bool {
    lower_base.ends_with("/api/paas/v4") || lower_base.ends_with("/api/coding/paas/v4")
}

fn is_zhipu_api_base(lower_base: &str) -> bool {
    lower_base.contains("bigmodel.cn") || lower_base.contains("zhipuai.cn")
}

fn is_deepseek_api_base(lower_base: &str) -> bool {
    lower_base.contains("deepseek.com")
}

fn is_mimo_api_base(lower_base: &str) -> bool {
    lower_base.contains("xiaomimimo.com")
}

fn chat_completions_url(provider_type: &str, base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    let lower = base.to_ascii_lowercase();
    if provider_type == "glm" || is_glm_api_base(&lower) {
        Ok(format!("{base}/chat/completions"))
    } else if lower.ends_with("/v1") || lower.ends_with("/v1beta") {
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
    let escaped_model = model.trim().trim_start_matches("models/");
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/v1") || lower.ends_with("/v1beta") {
        Ok(format!("{base}/models/{escaped_model}:generateContent"))
    } else {
        Ok(format!(
            "{base}/v1beta/models/{escaped_model}:generateContent"
        ))
    }
}

fn images_generations_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/v1") || lower.ends_with("/v1beta") {
        Ok(format!("{base}/images/generations"))
    } else {
        Ok(format!("{base}/v1/images/generations"))
    }
}

fn images_edits_url(base_url: &str) -> Result<String, String> {
    let base = api_base_url(base_url)?;
    let lower = base.to_ascii_lowercase();
    if lower.ends_with("/v1") || lower.ends_with("/v1beta") {
        Ok(format!("{base}/images/edits"))
    } else {
        Ok(format!("{base}/v1/images/edits"))
    }
}

fn add_optional_json_string(value: &mut Value, key: &str, raw: &str) {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "auto" {
        return;
    }
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), Value::String(trimmed.to_string()));
    }
}

fn openai_chat_messages(messages: &[ChatMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|message| {
            let role = chat_role(message, "assistant");
            let text = message_text_with_files(message);
            let image_attachments = message
                .attachments
                .iter()
                .filter(|attachment| is_image_attachment(attachment))
                .collect::<Vec<&ChatAttachment>>();

            if image_attachments.is_empty() {
                serde_json::json!({
                    "role": role,
                    "content": text,
                })
            } else {
                let mut content = vec![serde_json::json!({
                    "type": "text",
                    "text": text,
                })];
                for attachment in image_attachments {
                    if let Some(data_url) = attachment.data_url.as_deref() {
                        content.push(serde_json::json!({
                            "type": "image_url",
                            "image_url": { "url": data_url },
                        }));
                    }
                }
                serde_json::json!({
                    "role": role,
                    "content": content,
                })
            }
        })
        .collect()
}

fn anthropic_chat_messages(messages: &[ChatMessage]) -> Result<Vec<Value>, String> {
    messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            let mut content = vec![serde_json::json!({
                "type": "text",
                "text": message_text_with_files(message),
            })];
            for attachment in message
                .attachments
                .iter()
                .filter(|attachment| is_image_attachment(attachment))
            {
                let Some(data_url) = attachment.data_url.as_deref() else {
                    continue;
                };
                let (media_type, data) = image_data_url(data_url)?;
                content.push(serde_json::json!({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": data,
                    },
                }));
            }
            Ok(serde_json::json!({
                "role": if message.role == "assistant" { "assistant" } else { "user" },
                "content": content,
            }))
        })
        .collect()
}

fn gemini_chat_messages(messages: &[ChatMessage]) -> Result<Vec<Value>, String> {
    messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            let mut parts = vec![serde_json::json!({ "text": message_text_with_files(message) })];
            for attachment in message
                .attachments
                .iter()
                .filter(|attachment| is_image_attachment(attachment))
            {
                let Some(data_url) = attachment.data_url.as_deref() else {
                    continue;
                };
                let (mime_type, data) = image_data_url(data_url)?;
                parts.push(serde_json::json!({
                    "inlineData": {
                        "mimeType": mime_type,
                        "data": data,
                    },
                }));
            }
            Ok(serde_json::json!({
                "role": if message.role == "assistant" { "model" } else { "user" },
                "parts": parts,
            }))
        })
        .collect()
}

fn chat_role<'a>(message: &'a ChatMessage, assistant_role: &'a str) -> &'a str {
    if message.role == "assistant" {
        assistant_role
    } else if message.role == "system" {
        "system"
    } else {
        "user"
    }
}

fn message_text_with_files(message: &ChatMessage) -> String {
    let mut text = message.content.trim().to_string();
    let file_blocks = message
        .attachments
        .iter()
        .filter(|attachment| attachment.kind != "image")
        .filter_map(|attachment| {
            attachment.text.as_ref().map(|content| {
                format!(
                    "Attached file: {}\nMIME: {}\n\n{}",
                    attachment.name, attachment.mime_type, content
                )
            })
        })
        .collect::<Vec<String>>();

    if !file_blocks.is_empty() {
        if !text.is_empty() {
            text.push_str("\n\n");
        }
        text.push_str(&file_blocks.join("\n\n---\n\n"));
    }

    text
}

fn is_image_attachment(attachment: &ChatAttachment) -> bool {
    attachment.kind == "image" && attachment.data_url.is_some()
}

fn image_data_url(data_url: &str) -> Result<(&str, &str), String> {
    let trimmed = data_url.trim();
    let Some(rest) = trimmed.strip_prefix("data:") else {
        return Err("Invalid uploaded image data URL".to_string());
    };
    let Some((meta, body)) = rest.split_once(',') else {
        return Err("Invalid uploaded image data URL".to_string());
    };
    let mime = meta
        .split(';')
        .next()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("image/png");
    Ok((mime, body))
}

fn image_data_url_part(data_url: &str, index: usize) -> Result<Part, String> {
    let trimmed = data_url.trim();
    let (mime, data) = if trimmed.starts_with("data:") {
        image_data_url(trimmed)?
    } else {
        ("image/png", trimmed)
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|error| format!("Failed to decode uploaded image: {error}"))?;
    let extension = match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    };
    Part::bytes(bytes)
        .file_name(format!("input-{index}.{extension}"))
        .mime_str(mime)
        .map_err(|error| format!("Invalid uploaded image MIME type: {error}"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelListAuthStyle {
    OpenAi,
    Anthropic,
    Gemini,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ModelListEndpoint {
    url: String,
    auth: ModelListAuthStyle,
}

#[cfg(test)]
fn model_list_url(provider_type: &str, base_url: &str) -> Result<String, String> {
    model_list_endpoint(provider_type, base_url).map(|endpoint| endpoint.url)
}

fn model_list_endpoint(provider_type: &str, base_url: &str) -> Result<ModelListEndpoint, String> {
    let base = api_base_url(base_url)?;
    let lower_base = base.to_ascii_lowercase();

    if provider_type == "gemini" {
        return Ok(ModelListEndpoint {
            url: gemini_model_list_url(&base),
            auth: ModelListAuthStyle::Gemini,
        });
    }

    if is_anthropic_protocol(provider_type) {
        if let Some(catalog_base) = strip_anthropic_catalog_base(&base) {
            return Ok(ModelListEndpoint {
                url: openai_style_model_list_url(provider_type, &catalog_base),
                auth: ModelListAuthStyle::OpenAi,
            });
        }

        return Ok(ModelListEndpoint {
            url: anthropic_model_list_url(&base, &lower_base),
            auth: ModelListAuthStyle::Anthropic,
        });
    }

    Ok(ModelListEndpoint {
        url: openai_style_model_list_url(provider_type, &base),
        auth: ModelListAuthStyle::OpenAi,
    })
}

fn strip_anthropic_catalog_base(base: &str) -> Option<String> {
    let lower = base.to_ascii_lowercase();
    for suffix in ["/anthropic/v1", "/anthropic"] {
        if lower.ends_with(suffix) {
            return Some(
                base[..base.len() - suffix.len()]
                    .trim_end_matches('/')
                    .to_string(),
            );
        }
    }
    None
}

fn anthropic_model_list_url(base: &str, lower_base: &str) -> String {
    if lower_base.ends_with("/models") {
        base.to_string()
    } else if lower_base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    }
}

fn gemini_model_list_url(base: &str) -> String {
    let lower_base = base.to_ascii_lowercase();
    if lower_base.ends_with("/models") {
        base.to_string()
    } else if lower_base.ends_with("/v1") || lower_base.ends_with("/v1beta") {
        format!("{base}/models")
    } else {
        format!("{base}/v1beta/models")
    }
}

fn openai_style_model_list_url(provider_type: &str, base: &str) -> String {
    let base = strip_anthropic_catalog_base(base).unwrap_or_else(|| base.to_string());
    let lower_base = base.to_ascii_lowercase();

    if provider_type == "glm" || is_glm_api_base(&lower_base) || is_zhipu_api_base(&lower_base) {
        return zhipu_model_list_url(&base, &lower_base);
    }

    if is_deepseek_api_base(&lower_base) && !lower_base.ends_with("/v1") {
        if lower_base.ends_with("/models") {
            base
        } else {
            format!("{base}/models")
        }
    } else if lower_base.ends_with("/models") {
        base
    } else if lower_base.ends_with("/v1") || lower_base.ends_with("/v1beta") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    }
}

fn zhipu_model_list_url(base: &str, lower_base: &str) -> String {
    if lower_base.ends_with("/models") {
        base.to_string()
    } else if is_glm_api_base(lower_base) {
        format!("{base}/models")
    } else if lower_base.ends_with("/api") {
        format!("{base}/paas/v4/models")
    } else {
        format!("{base}/api/paas/v4/models")
    }
}

fn extract_api_error(value: &Value) -> Option<String> {
    value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .map(str::to_string)
}

fn extract_chat_content(provider_type: &str, value: &Value) -> Option<String> {
    if is_anthropic_protocol(provider_type) {
        return value
            .get("content")
            .and_then(Value::as_array)
            .and_then(|items| {
                let parts = items
                    .iter()
                    .filter_map(|item| item.get("text").and_then(Value::as_str))
                    .collect::<Vec<&str>>();
                if parts.is_empty() {
                    None
                } else {
                    Some(parts.join("\n"))
                }
            });
    }

    if provider_type == "gemini" {
        return value
            .pointer("/candidates/0/content/parts")
            .and_then(Value::as_array)
            .and_then(|parts| {
                let text = parts
                    .iter()
                    .filter_map(|part| part.get("text").and_then(Value::as_str))
                    .collect::<Vec<&str>>();
                if text.is_empty() {
                    None
                } else {
                    Some(text.join("\n"))
                }
            });
    }

    value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/choices/0/text").and_then(Value::as_str))
        .map(str::to_string)
}

fn extract_images(value: &Value) -> Vec<String> {
    value
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    item.get("url")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .or_else(|| {
                            item.get("b64_json")
                                .and_then(Value::as_str)
                                .map(|data| format!("data:image/png;base64,{data}"))
                        })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn persist_generated_images(images: Vec<String>) -> Vec<String> {
    images
        .into_iter()
        .enumerate()
        .map(|(index, image)| persist_generated_image(&image, index).unwrap_or(image))
        .collect()
}

fn persist_generated_image(image: &str, index: usize) -> Result<String, String> {
    let trimmed = image.trim();
    let (mime, bytes) = if trimmed.starts_with("data:") {
        let (mime, data) = image_data_url(trimmed)?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|error| format!("Failed to decode generated image: {error}"))?;
        (mime.to_string(), bytes)
    } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let response = Client::builder()
            .timeout(Duration::from_secs(45))
            .build()
            .map_err(|error| error.to_string())?
            .get(trimmed)
            .send()
            .map_err(|error| format!("Failed to download generated image: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Generated image download failed with HTTP status {}",
                response.status()
            ));
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .filter(|value| value.starts_with("image/"))
            .unwrap_or("image/png")
            .to_string();
        let bytes = response
            .bytes()
            .map_err(|error| format!("Failed to read generated image: {error}"))?
            .to_vec();
        (mime, bytes)
    } else {
        return Err("Unsupported generated image format".to_string());
    };

    if let Some(dir) = drawing_image_dir() {
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create image folder: {error}"))?;
        let extension = image_extension(&mime);
        let filename = format!(
            "drawing-{}-{}.{extension}",
            chrono_like_timestamp(),
            index + 1
        );
        let path = dir.join(filename);
        fs::write(&path, &bytes)
            .map_err(|error| format!("Failed to save generated image: {error}"))?;
        return Ok(path.to_string_lossy().to_string());
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn drawing_image_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|dir| dir.join("codex-switch").join("drawing-images"))
}

fn image_extension(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn extract_models(value: &Value) -> Vec<RemoteModel> {
    let candidates = value
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| value.get("models").and_then(Value::as_array));

    let mut seen = HashSet::new();
    let mut models = Vec::new();

    if let Some(items) = candidates {
        for item in items {
            if let Some(model) = model_from_value(item) {
                if seen.insert(model.id.clone()) {
                    models.push(model);
                }
            }
        }
        return models;
    }

    if let Some(items) = value.as_array() {
        for item in items {
            if let Some(model) = model_from_value(item) {
                if seen.insert(model.id.clone()) {
                    models.push(model);
                }
            }
        }
    }

    models
}

fn enrich_models_with_openrouter_metadata(
    client: &Client,
    mut models: Vec<RemoteModel>,
) -> Vec<RemoteModel> {
    if models
        .iter()
        .all(|model| !model.input_modalities.is_empty() || !model.output_modalities.is_empty())
    {
        return models;
    }

    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .send();
    let Ok(response) = response else {
        return models;
    };
    if !response.status().is_success() {
        return models;
    }
    let Ok(body) = response.json::<Value>() else {
        return models;
    };

    enrich_models_from_catalog(&mut models, extract_models(&body));

    models
}

fn enrich_dashboard_models(dashboard: &mut DashboardState) {
    if dashboard
        .api_providers
        .iter()
        .flat_map(|provider| provider.models.iter())
        .all(|model| !model.input_modalities.is_empty() || !model.output_modalities.is_empty())
    {
        return;
    }

    let Ok(client) = Client::builder().timeout(Duration::from_secs(8)).build() else {
        return;
    };
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Accept", "application/json")
        .header("User-Agent", USER_AGENT)
        .send();
    let Ok(response) = response else {
        return;
    };
    if !response.status().is_success() {
        return;
    }
    let Ok(body) = response.json::<Value>() else {
        return;
    };
    let catalog = extract_models(&body);

    for provider in &mut dashboard.api_providers {
        enrich_models_from_catalog(&mut provider.models, catalog.clone());
    }
}

fn enrich_models_from_catalog(models: &mut [RemoteModel], catalog: Vec<RemoteModel>) {
    let mut by_id = HashMap::new();
    let mut by_suffix = HashMap::new();
    for model in catalog {
        let normalized_id = model.id.to_ascii_lowercase();
        if !model.input_modalities.is_empty() || !model.output_modalities.is_empty() {
            if let Some((_, suffix)) = normalized_id.rsplit_once('/') {
                by_suffix
                    .entry(suffix.to_string())
                    .or_insert_with(|| model.clone());
                by_suffix
                    .entry(model_match_key(suffix))
                    .or_insert_with(|| model.clone());
            }
            by_id
                .entry(model_match_key(&normalized_id))
                .or_insert_with(|| model.clone());
            by_id.entry(normalized_id).or_insert(model);
        }
    }

    for model in models {
        if !model.input_modalities.is_empty() || !model.output_modalities.is_empty() {
            continue;
        }

        let key = model.id.to_ascii_lowercase();
        let compact_key = model_match_key(&key);
        let source = by_id
            .get(&key)
            .or_else(|| by_suffix.get(&key))
            .or_else(|| by_id.get(&compact_key))
            .or_else(|| by_suffix.get(&compact_key));
        if let Some(source) = source {
            if model.name.is_none() {
                model.name = source.name.clone();
            }
            if model.owned_by.is_none() {
                model.owned_by = source.owned_by.clone();
            }
            if model.description.is_none() {
                model.description = source.description.clone();
            }
            model.input_modalities = source.input_modalities.clone();
            model.output_modalities = source.output_modalities.clone();
        }
    }
}

fn model_match_key(model_id: &str) -> String {
    model_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn model_from_value(value: &Value) -> Option<RemoteModel> {
    if let Some(id) = value.as_str().map(str::trim).filter(|id| !id.is_empty()) {
        return Some(RemoteModel {
            id: normalize_model_id(id.to_string()),
            name: None,
            owned_by: None,
            description: None,
            capabilities: Vec::new(),
            input_modalities: Vec::new(),
            output_modalities: Vec::new(),
        });
    }

    let id = normalize_model_id(first_string(value, &["id", "model", "name", "model_id"])?);
    let name = first_string(value, &["display_name", "displayName", "model_name"])
        .filter(|name| name != &id);
    let owned_by = first_string(value, &["owned_by", "ownedBy", "organization", "publisher"]);
    let description = first_string(value, &["description", "summary", "desc"]);
    let capabilities = string_array(
        value,
        &[
            "capabilities",
            "supported_features",
            "features",
            "capability",
            "abilities",
        ],
    )
    .unwrap_or_default();
    let architecture = value.get("architecture");
    let input_modalities = string_array(value, &["input_modalities", "inputModalities"])
        .or_else(|| {
            architecture
                .and_then(|item| string_array(item, &["input_modalities", "inputModalities"]))
        })
        .unwrap_or_default();
    let output_modalities = string_array(value, &["output_modalities", "outputModalities"])
        .or_else(|| {
            architecture
                .and_then(|item| string_array(item, &["output_modalities", "outputModalities"]))
        })
        .unwrap_or_default();

    Some(RemoteModel {
        id,
        name,
        owned_by,
        description,
        capabilities,
        input_modalities,
        output_modalities,
    })
}

fn normalize_model_id(id: String) -> String {
    id.strip_prefix("models/").map(str::to_string).unwrap_or(id)
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    })
}

fn string_array(value: &Value, keys: &[&str]) -> Option<Vec<String>> {
    keys.iter()
        .find_map(|key| {
            value.get(*key).map(|item| {
                if let Some(items) = item.as_array() {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::trim)
                        .filter(|text| !text.is_empty())
                        .map(str::to_string)
                        .collect::<Vec<String>>()
                } else if let Some(text) = item.as_str() {
                    text.split([',', ' '])
                        .map(str::trim)
                        .filter(|part| !part.is_empty())
                        .map(str::to_string)
                        .collect()
                } else {
                    Vec::new()
                }
            })
        })
        .filter(|items| !items.is_empty())
}

fn launch_terminal(terminal_program: &str, workspace_path: &str) -> Result<(), AppError> {
    launch_terminal_command(terminal_program, workspace_path, "codex")
}

fn launch_terminal_command(
    terminal_program: &str,
    workspace_path: &str,
    command_text: &str,
) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let terminal = terminal_program.trim();
        let terminal = if terminal.is_empty() {
            "pwsh"
        } else {
            terminal
        };
        let terminal_lower = terminal.to_ascii_lowercase();

        if terminal_lower == "cmd" || terminal_lower.ends_with("\\cmd.exe") {
            let command = format!(
                "cd /d \"{}\" && {}",
                workspace_path.replace('"', ""),
                command_text
            );
            Command::new("cmd")
                .args(["/C", "start", "", "cmd", "/K", &command])
                .spawn()?;
        } else if terminal_lower == "wt" || terminal_lower.ends_with("\\wt.exe") {
            let command = format!(
                "Set-Location -LiteralPath '{}'; {}",
                workspace_path.replace('\'', "''"),
                command_text
            );
            Command::new("cmd")
                .args([
                    "/C", "start", "", "wt", "pwsh", "-NoExit", "-Command", &command,
                ])
                .spawn()?;
        } else {
            let command = format!(
                "Set-Location -LiteralPath '{}'; {}",
                workspace_path.replace('\'', "''"),
                command_text
            );
            Command::new("cmd")
                .args(["/C", "start", "", terminal, "-NoExit", "-Command", &command])
                .spawn()?;
        }
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(terminal_program)
            .args([
                "-lc",
                &format!("cd {:?} && {}", workspace_path, command_text),
            ])
            .spawn()?;
        Ok(())
    }
}

fn fetch_provider_balance(provider: &ApiProvider) -> Result<ProviderBalance, AppError> {
    if provider.provider_type == "openai" {
        if let Some(auth_json) = provider
            .open_ai_auth_json
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return fetch_openai_oauth_usage(auth_json);
        }
    }

    let base = balance_root_url(&provider.base_url)?;
    if base.is_empty() || provider.api_key.trim().is_empty() {
        return Err(AppError::Message(
            "Base URL and API key are required. Official OpenAI quota requires provider OAuth login.".to_string(),
        ));
    }

    let mut errors = Vec::new();
    if provider.provider_type == "openai-compatible" || provider.provider_type == "new-api" {
        match fetch_new_api_dashboard_balance(&base, &provider.api_key) {
            Ok(balance) => return Ok(balance),
            Err(error) => errors.push(error.to_string()),
        }
    }

    match fetch_openai_compatible_balance(&base, &provider.api_key) {
        Ok(balance) => Ok(balance),
        Err(error) => {
            errors.push(error.to_string());
            Err(AppError::Message(format!(
                "No supported balance endpoint found. {}",
                errors.join(" | ")
            )))
        }
    }
}

fn balance_root_url(base_url: &str) -> Result<String, AppError> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let mut root = trimmed.to_string();
    loop {
        let lower = root.to_ascii_lowercase();
        let suffixes = [
            "/dashboard/billing/subscription",
            "/dashboard/billing/usage",
            "/chat/completions",
            "/images/generations",
            "/images/edits",
            "/responses",
            "/messages",
            "/models",
            "/usage",
            "/v1beta",
            "/v1",
        ];
        if let Some(suffix) = suffixes.iter().find(|suffix| lower.ends_with(**suffix)) {
            let next_len = root.len().saturating_sub(suffix.len());
            root.truncate(next_len);
            root = root.trim_end_matches('/').to_string();
            continue;
        }
        break;
    }

    if root.is_empty() {
        return Err(AppError::Message("Base URL is empty".to_string()));
    }
    Ok(root)
}

fn get_balance_json(client: &Client, url: String, api_key: &str) -> Result<Value, AppError> {
    let response = client
        .get(&url)
        .bearer_auth(api_key)
        .header("Accept", "application/json")
        .send()
        .map_err(|error| AppError::message(error.to_string()))?;
    let status = response.status();
    let body_text = response
        .text()
        .map_err(|error| AppError::message(error.to_string()))?;
    let parsed = serde_json::from_str::<Value>(&body_text).ok();

    if !status.is_success() {
        let message = parsed
            .as_ref()
            .and_then(extract_api_error)
            .unwrap_or_else(|| body_text.chars().take(180).collect::<String>());
        return Err(AppError::Message(format!(
            "HTTP {} @ {} -> {}",
            status.as_u16(),
            url,
            message
        )));
    }

    parsed.ok_or_else(|| AppError::Message(format!("Invalid balance JSON @ {url}")))
}

fn fetch_new_api_dashboard_balance(base: &str, api_key: &str) -> Result<ProviderBalance, AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| AppError::message(error.to_string()))?;
    let body = get_balance_json(
        &client,
        format!("{base}/v1/dashboard/billing/subscription"),
        api_key,
    )?;
    let limit = body
        .get("hard_limit_usd")
        .or_else(|| body.get("soft_limit_usd"))
        .and_then(Value::as_f64)
        .ok_or_else(|| {
            AppError::Message("Dashboard billing response has no limit field.".to_string())
        })?;

    let used = match get_balance_json(
        &client,
        format!("{base}/v1/dashboard/billing/usage"),
        api_key,
    ) {
        Ok(value) => value
            .get("total_usage")
            .and_then(Value::as_f64)
            .map(|value| value / 100.0)
            .unwrap_or(0.0),
        Err(_) => 0.0,
    };

    let remaining = (limit - used).max(0.0);
    Ok(ProviderBalance {
        strategy: "new_api_dashboard".to_string(),
        remaining: Some(remaining),
        unit: "USD".to_string(),
        is_active: remaining > 0.0,
        next_reset_at: None,
        label: "Balance".to_string(),
        plan_type: None,
        five_hour_left: None,
        five_hour_reset: None,
        five_hour_reset_at: None,
        five_hour_label: None,
        weekly_left: None,
        weekly_reset: None,
        weekly_reset_at: None,
        weekly_label: None,
        credits_balance: None,
        has_credits: false,
    })
}

fn fetch_openai_compatible_balance(base: &str, api_key: &str) -> Result<ProviderBalance, AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|error| AppError::message(error.to_string()))?;
    let body = get_balance_json(&client, format!("{base}/v1/usage"), api_key)?;

    let remaining = body
        .get("remaining")
        .and_then(Value::as_f64)
        .or_else(|| body.get("balance").and_then(Value::as_f64))
        .or_else(|| body.pointer("/quota/remaining").and_then(Value::as_f64))
        .ok_or_else(|| {
            AppError::Message("Usage response has no remaining or balance field.".to_string())
        })?;
    let unit = body
        .get("unit")
        .and_then(Value::as_str)
        .or_else(|| body.pointer("/quota/unit").and_then(Value::as_str))
        .unwrap_or("USD")
        .to_string();
    let is_active = body
        .get("is_active")
        .and_then(Value::as_bool)
        .or_else(|| body.get("isValid").and_then(Value::as_bool))
        .unwrap_or(remaining > 0.0);
    Ok(ProviderBalance {
        strategy: "openai_compat".to_string(),
        remaining: Some(remaining),
        unit: unit.clone(),
        is_active,
        next_reset_at: None,
        label: if unit.contains('%') {
            "Token quota"
        } else {
            "Balance"
        }
        .to_string(),
        plan_type: None,
        five_hour_left: None,
        five_hour_reset: None,
        five_hour_reset_at: None,
        five_hour_label: None,
        weekly_left: None,
        weekly_reset: None,
        weekly_reset_at: None,
        weekly_label: None,
        credits_balance: None,
        has_credits: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glm_chat_completions_url_uses_bigmodel_v4_path() {
        assert_eq!(
            chat_completions_url("glm", "https://open.bigmodel.cn/api/paas/v4").unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
        assert_eq!(
            chat_completions_url(
                "glm",
                "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            )
            .unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
    }

    #[test]
    fn glm_model_list_url_uses_bigmodel_v4_models_path() {
        assert_eq!(
            model_list_url("glm", "https://open.bigmodel.cn/api/paas/v4").unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/models"
        );
        assert_eq!(
            model_list_url(
                "glm",
                "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            )
            .unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/models"
        );
    }

    #[test]
    fn openai_compatible_chat_url_keeps_v1_default() {
        assert_eq!(
            chat_completions_url("openai-compatible", "https://api.example.com").unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn vendor_legacy_provider_types_normalize_to_openai_compatible() {
        assert_eq!(normalized_provider_type("glm"), "openai-compatible");
        assert_eq!(normalized_provider_type("deepseek"), "openai-compatible");
        assert_eq!(normalized_provider_type("mimo"), "openai-compatible");
    }

    #[test]
    fn anthropic_compatible_uses_messages_url_and_parser() {
        assert_eq!(
            anthropic_messages_url("https://api.vendor.example").unwrap(),
            "https://api.vendor.example/v1/messages"
        );
        assert_eq!(
            extract_chat_content(
                "anthropic-compatible",
                &serde_json::json!({ "content": [{ "type": "text", "text": "ok" }] })
            ),
            Some("ok".to_string())
        );
    }

    #[test]
    fn official_anthropic_model_list_stays_on_anthropic_models_endpoint() {
        let endpoint =
            model_list_endpoint("anthropic-compatible", "https://api.anthropic.com").unwrap();

        assert_eq!(endpoint.url, "https://api.anthropic.com/v1/models");
        assert_eq!(endpoint.auth, ModelListAuthStyle::Anthropic);
    }

    #[test]
    fn deepseek_anthropic_model_list_uses_catalog_outside_anthropic_path() {
        let endpoint =
            model_list_endpoint("anthropic-compatible", "https://api.deepseek.com/anthropic")
                .unwrap();

        assert_eq!(endpoint.url, "https://api.deepseek.com/models");
        assert_eq!(endpoint.auth, ModelListAuthStyle::OpenAi);
    }

    #[test]
    fn mimo_anthropic_model_list_uses_openai_catalog_path() {
        let endpoint = model_list_endpoint(
            "anthropic-compatible",
            "https://api.xiaomimimo.com/anthropic",
        )
        .unwrap();

        assert_eq!(endpoint.url, "https://api.xiaomimimo.com/v1/models");
        assert_eq!(endpoint.auth, ModelListAuthStyle::OpenAi);
    }

    #[test]
    fn zhipu_anthropic_model_list_uses_bigmodel_v4_catalog_path() {
        let endpoint = model_list_endpoint(
            "anthropic-compatible",
            "https://open.bigmodel.cn/api/anthropic",
        )
        .unwrap();

        assert_eq!(endpoint.url, "https://open.bigmodel.cn/api/paas/v4/models");
        assert_eq!(endpoint.auth, ModelListAuthStyle::OpenAi);
    }

    #[test]
    fn mimo_anthropic_chat_auth_uses_mimo_supported_headers() {
        let mut headers = json_headers();
        add_anthropic_auth_headers_for_base(
            &mut headers,
            "sk-test",
            "https://api.xiaomimimo.com/anthropic",
        )
        .unwrap();

        assert_eq!(headers.get("api-key").unwrap(), "sk-test");
        assert_eq!(headers.get(AUTHORIZATION).unwrap(), "Bearer sk-test");
        assert!(headers.get("x-api-key").is_none());
        assert!(headers.get("anthropic-version").is_none());
    }

    #[test]
    fn deepseek_and_zhipu_anthropic_chat_auth_use_anthropic_headers() {
        for base_url in [
            "https://api.deepseek.com/anthropic",
            "https://open.bigmodel.cn/api/anthropic",
        ] {
            let mut headers = json_headers();
            add_anthropic_auth_headers_for_base(&mut headers, "sk-test", base_url).unwrap();

            assert_eq!(headers.get("x-api-key").unwrap(), "sk-test");
            assert_eq!(headers.get("anthropic-version").unwrap(), "2023-06-01");
            assert!(headers.get("api-key").is_none());
        }
    }

    #[test]
    fn glm_openai_compatible_model_list_uses_bigmodel_path_by_base_url() {
        assert_eq!(
            model_list_url("openai-compatible", "https://open.bigmodel.cn/api/paas/v4").unwrap(),
            "https://open.bigmodel.cn/api/paas/v4/models"
        );
    }

    #[test]
    fn openrouter_model_parser_reads_architecture_modalities() {
        let body = serde_json::json!({
            "data": [{
                "id": "xiaomi/mimo-v2.5-pro",
                "name": "Xiaomi: MiMo-V2.5-Pro",
                "owned_by": "xiaomi",
                "architecture": {
                    "modality": "text->text",
                    "input_modalities": ["text"],
                    "output_modalities": ["text"]
                }
            }]
        });

        let models = extract_models(&body);
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].input_modalities, vec!["text"]);
        assert_eq!(models[0].output_modalities, vec!["text"]);
    }

    #[test]
    fn bare_model_ids_are_enriched_from_openrouter_suffixes() {
        let mut models = vec![
            RemoteModel {
                id: "gpt-5-5".to_string(),
                name: None,
                owned_by: Some("custom".to_string()),
                description: None,
                capabilities: Vec::new(),
                input_modalities: Vec::new(),
                output_modalities: Vec::new(),
            },
            RemoteModel {
                id: "mimo-v2.5".to_string(),
                name: None,
                owned_by: Some("xiaomi".to_string()),
                description: None,
                capabilities: Vec::new(),
                input_modalities: Vec::new(),
                output_modalities: Vec::new(),
            },
        ];
        let catalog = extract_models(&serde_json::json!({
            "data": [
                {
                    "id": "openai/gpt-5.5",
                    "architecture": {
                        "input_modalities": ["file", "image", "text"],
                        "output_modalities": ["text"]
                    }
                },
                {
                    "id": "xiaomi/mimo-v2.5",
                    "architecture": {
                        "input_modalities": ["text", "audio", "image", "video"],
                        "output_modalities": ["text"]
                    }
                }
            ]
        }));

        enrich_models_from_catalog(&mut models, catalog);

        assert_eq!(model_match_key("openai/gpt-5.5"), "openaigpt55");
        assert_eq!(models[0].input_modalities, vec!["file", "image", "text"]);
        assert_eq!(models[0].output_modalities, vec!["text"]);
        assert_eq!(
            models[1].input_modalities,
            vec!["text", "audio", "image", "video"]
        );
        assert_eq!(models[1].output_modalities, vec!["text"]);
    }

    #[test]
    fn update_version_comparison_detects_newer_release() {
        assert!(compare_versions("0.2.7", "0.2.6") > 0);
        assert_eq!(compare_versions("v0.2.6", "0.2.6"), 0);
        assert!(compare_versions("0.2.5", "0.2.6") < 0);
    }

    #[test]
    fn update_asset_selection_prefers_setup_for_current_arch() {
        let assets = vec![
            serde_json::json!({
                "name": "Codex.Switch_9.9.9_x64.msi",
                "browser_download_url": "https://github.com/baosen-h/codex-switch/releases/download/v9.9.9/app.msi"
            }),
            serde_json::json!({
                "name": "Codex.Switch_9.9.9_x64-setup.exe",
                "browser_download_url": "https://github.com/baosen-h/codex-switch/releases/download/v9.9.9/app.exe",
                "digest": "sha256:mock"
            }),
        ];

        let asset = select_update_asset(Some(&assets)).expect("asset selected");
        assert_eq!(asset.name, "Codex.Switch_9.9.9_x64-setup.exe");
        assert_eq!(asset.digest.as_deref(), Some("sha256:mock"));
    }

    #[test]
    fn update_asset_name_is_sanitized() {
        assert_eq!(
            sanitize_asset_name("bad/name:*?\"<>|.exe"),
            "bad_name_______.exe"
        );
    }
}

fn fetch_openai_oauth_usage(auth_json: &str) -> Result<ProviderBalance, AppError> {
    let auth: Value = serde_json::from_str(auth_json)
        .map_err(|error| AppError::Message(format!("Invalid OpenAI OAuth JSON: {error}")))?;
    let access_token = auth
        .pointer("/tokens/access_token")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Message("OpenAI OAuth data has no access token.".to_string()))?;
    let refresh_token = auth
        .pointer("/tokens/refresh_token")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());

    let body = match request_openai_usage(access_token) {
        Ok(value) => value,
        Err(first_error) => {
            let Some(refresh_token) = refresh_token else {
                return Err(first_error);
            };
            let refreshed = crate::oauth::refresh_access_token(refresh_token)
                .map_err(|error| AppError::Message(error.to_string()))?;
            request_openai_usage(&refreshed.access_token)?
        }
    };

    Ok(parse_openai_usage(&body))
}

fn request_openai_usage(access_token: &str) -> Result<Value, AppError> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| AppError::message(error.to_string()))?;
    let response = client
        .get("https://chatgpt.com/backend-api/wham/usage")
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .header("User-Agent", "codex_cli_rs/0.0.0 codex-cli")
        .header("originator", "codex_cli_rs")
        .send()
        .map_err(|error| AppError::message(error.to_string()))?;
    let status = response.status();
    let body_text = response
        .text()
        .map_err(|error| AppError::message(error.to_string()))?;
    let parsed = serde_json::from_str::<Value>(&body_text).ok();
    if !status.is_success() {
        let message = parsed
            .as_ref()
            .and_then(extract_api_error)
            .unwrap_or_else(|| body_text.chars().take(180).collect::<String>());
        return Err(AppError::Message(format!(
            "OpenAI quota request failed with HTTP {}: {}",
            status.as_u16(),
            message
        )));
    }
    parsed.ok_or_else(|| AppError::Message("Invalid OpenAI quota JSON.".to_string()))
}

fn parse_openai_usage(value: &Value) -> ProviderBalance {
    let plan_type = value
        .get("plan_type")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let primary = value.pointer("/rate_limit/primary_window");
    let secondary = value.pointer("/rate_limit/secondary_window");
    let (five_left, five_reset, five_label, five_reset_at) =
        parse_usage_window(primary, "5H quota");
    let (weekly_left, weekly_reset, weekly_label, weekly_reset_at) =
        parse_usage_window(secondary, "Weekly quota");
    let credits_balance = value.pointer("/credits/balance").and_then(number_value);
    let has_credits = value
        .pointer("/credits/has_credits")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || value
            .pointer("/credits/unlimited")
            .and_then(Value::as_bool)
            .unwrap_or(false);

    ProviderBalance {
        strategy: "openai_oauth_quota".to_string(),
        remaining: Some(five_left as f64),
        unit: "%".to_string(),
        is_active: five_left > 0 || weekly_left > 0 || has_credits,
        next_reset_at: five_reset_at,
        label: "OpenAI quota".to_string(),
        plan_type: Some(plan_type),
        five_hour_left: Some(five_left),
        five_hour_reset: Some(five_reset),
        five_hour_reset_at: five_reset_at,
        five_hour_label: Some(five_label),
        weekly_left: Some(weekly_left),
        weekly_reset: Some(weekly_reset),
        weekly_reset_at,
        weekly_label: Some(weekly_label),
        credits_balance,
        has_credits,
    }
}

fn parse_usage_window(
    window: Option<&Value>,
    default_label: &str,
) -> (i32, String, String, Option<i64>) {
    let Some(window) = window else {
        return (0, "Unknown".to_string(), default_label.to_string(), None);
    };
    let used = window
        .get("used_percent")
        .and_then(number_value)
        .unwrap_or(0.0)
        .round()
        .clamp(0.0, 100.0) as i32;
    let left = 100 - used;
    let reset_at = window
        .get("reset_at")
        .and_then(number_value)
        .map(|value| value as i64);
    let reset = reset_at
        .map(format_reset_seconds)
        .or_else(|| {
            window
                .get("reset_after_seconds")
                .or_else(|| window.get("reset_after_sec"))
                .and_then(number_value)
                .map(|value| format_duration_seconds(value as i64))
        })
        .unwrap_or_else(|| "Unknown".to_string());
    let label = window
        .get("limit_window_seconds")
        .and_then(number_value)
        .map(|seconds| usage_label_from_seconds(seconds as i64))
        .unwrap_or_else(|| default_label.to_string());
    (left, reset, label, reset_at)
}

fn number_value(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|text| text.parse::<f64>().ok()))
}

fn usage_label_from_seconds(seconds: i64) -> String {
    if seconds <= 5 * 3600 + 600 {
        "5H quota".to_string()
    } else if seconds <= 24 * 3600 + 600 {
        "24H quota".to_string()
    } else if seconds <= 7 * 24 * 3600 + 3600 {
        "Weekly quota".to_string()
    } else {
        format!("{}H quota", (seconds + 3599) / 3600)
    }
}

fn format_reset_seconds(reset_at: i64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    format_duration_seconds(reset_at - now)
}

fn format_duration_seconds(seconds: i64) -> String {
    if seconds <= 0 {
        return "Soon".to_string();
    }
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    if hours >= 24 {
        format!("{}d {}h", hours / 24, hours % 24)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes.max(1))
    }
}
