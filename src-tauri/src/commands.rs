use crate::agent_writer::{
    resolve_claude_dir, resolve_codex_dir, resolve_gemini_dir, write_provider, AgentDirs,
    AGENT_CODEX,
};
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
