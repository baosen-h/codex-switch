use crate::agent_writer::{write_provider, AGENT_CODEX};
use crate::database::Database;
use crate::error::AppError;
use crate::models::{AppSettings, DashboardState, LaunchRequest, Provider, SessionMessage};
use crate::session_manager;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
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
    let saved = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?
        .save_provider(provider)
        .map_err(|error| error.to_string())?;
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

    let provider = db.activate_provider(&id).map_err(|error| error.to_string())?;
    let settings = db.settings().map_err(|error| error.to_string())?;
    write_provider(&provider, &PathBuf::from(settings.codex_config_dir))
        .map_err(|error| error.to_string())?;
    drop(db);
    notify_tray(&app);

    Ok(provider)
}

#[tauri::command]
pub fn launch_codex(
    state: State<'_, AppState>,
    request: LaunchRequest,
) -> Result<bool, String> {
    let db = state
        .db
        .lock()
        .map_err(|_| "Failed to lock database".to_string())?;

    let provider = db
        .current_provider_for_agent(AGENT_CODEX)
        .map_err(|error| error.to_string())?;
    let settings = db.settings().map_err(|error| error.to_string())?;
    write_provider(&provider, &PathBuf::from(settings.codex_config_dir.clone()))
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
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let in_claude = path
        .components()
        .any(|c| c.as_os_str().to_string_lossy() == ".claude");

    if ext == "json" {
        return session_manager::load_gemini_messages(&path).map_err(|e| e.to_string());
    }
    if in_claude {
        return session_manager::load_claude_messages(&path).map_err(|e| e.to_string());
    }
    session_manager::load_codex_messages(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_session(source_path: String) -> Result<bool, String> {
    std::fs::remove_file(&source_path).map_err(|error| error.to_string())?;
    Ok(true)
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
