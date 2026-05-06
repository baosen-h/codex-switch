use crate::agent_writer::{
    resolve_claude_dir, resolve_codex_dir, resolve_gemini_dir, write_provider, AgentDirs,
    AGENT_CODEX,
};
use crate::database::Database;
use crate::error::AppError;
use crate::handoff;
use crate::models::{
    AppSettings, DashboardState, HandoffPreview, LaunchRequest, ModelListRequest, Provider,
    RemoteModel, SessionMessage,
};
use crate::session_manager;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Mutex<Database>,
}

impl AppState {
    pub fn new() -> Result<Self, AppError> {
        Ok(Self {
            db: Mutex::new(Database::new()?),
        })
    }
}

fn notify_tray(app: &AppHandle) {
    let _ = app.emit("providers-changed", ());
}

#[tauri::command]
pub fn get_dashboard(state: State<'_, AppState>) -> Result<DashboardState, String> {
    state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .dashboard()
        .map_err(|error| error.to_string())
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
        },
    )
    .map_err(|error| error.to_string())?;
    drop(db);
    notify_tray(&app);

    Ok(provider)
}

#[tauri::command]
pub fn list_provider_models(request: ModelListRequest) -> Result<Vec<RemoteModel>, String> {
    let url = model_list_url(&request.base_url)?;
    let api_key = request.api_key.trim();

    let mut headers = HeaderMap::new();
    headers.insert("Accept", HeaderValue::from_static("application/json"));
    headers.insert(
        "User-Agent",
        HeaderValue::from_static("codex-switch/0.1.3"),
    );

    if !api_key.is_empty() {
        let bearer = HeaderValue::from_str(&format!("Bearer {api_key}"))
            .map_err(|error| format!("Invalid API key header: {error}"))?;
        let x_api_key = HeaderValue::from_str(api_key)
            .map_err(|error| format!("Invalid API key header: {error}"))?;
        headers.insert(AUTHORIZATION, bearer);
        headers.insert("X-Api-Key", x_api_key);
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(&url)
        .headers(headers)
        .send()
        .map_err(|error| format!("Failed to fetch model list: {error}"))?;

    let status = response.status();
    let body: Value = response
        .json()
        .map_err(|error| format!("Failed to parse model list response: {error}"))?;

    if !status.is_success() {
        return Err(extract_api_error(&body).unwrap_or_else(|| {
            format!("Model list request failed with HTTP status {status}")
        }));
    }

    Ok(extract_models(&body))
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
        },
    )
    .map_err(|error| error.to_string())?;

    launch_terminal(&settings.terminal_program, &request.workspace_path)
        .map_err(|error| error.to_string())?;

    Ok(true)
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .save_settings(settings)
        .map_err(|error| error.to_string())
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

fn model_list_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Base URL is empty".to_string());
    }

    let lower = trimmed.to_ascii_lowercase();
    let base = if let Some(prefix) = lower.strip_suffix("/chat/completions") {
        &trimmed[..prefix.len()]
    } else if let Some(prefix) = lower.strip_suffix("/responses") {
        &trimmed[..prefix.len()]
    } else {
        trimmed
    };

    let lower_base = base.to_ascii_lowercase();
    if lower_base.ends_with("/models") {
        Ok(base.to_string())
    } else if lower_base.ends_with("/v1") || lower_base.ends_with("/v1beta") {
        Ok(format!("{base}/models"))
    } else {
        Ok(format!("{base}/v1/models"))
    }
}

fn extract_api_error(value: &Value) -> Option<String> {
    value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .map(str::to_string)
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

fn model_from_value(value: &Value) -> Option<RemoteModel> {
    if let Some(id) = value.as_str().map(str::trim).filter(|id| !id.is_empty()) {
        return Some(RemoteModel {
            id: id.to_string(),
            name: None,
            owned_by: None,
            description: None,
        });
    }

    let id = first_string(value, &["id", "model", "name", "model_id"])?;
    let name =
        first_string(value, &["display_name", "displayName", "model_name"]).filter(|name| name != &id);
    let owned_by = first_string(value, &["owned_by", "ownedBy", "organization", "publisher"]);
    let description = first_string(value, &["description", "summary", "desc"]);

    Some(RemoteModel {
        id,
        name,
        owned_by,
        description,
    })
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

fn launch_terminal(terminal_program: &str, workspace_path: &str) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let command = format!("cd /d \"{}\" && codex", workspace_path);
        Command::new("cmd")
            .args([
                "/C",
                "start",
                "",
                terminal_program,
                "-NoExit",
                "-Command",
                &command,
            ])
            .spawn()?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(terminal_program)
            .args(["-lc", &format!("cd {:?} && codex", workspace_path)])
            .spawn()?;
        Ok(())
    }
}
