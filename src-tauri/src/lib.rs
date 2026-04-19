mod agent_writer;
mod commands;
mod database;
mod error;
mod models;
mod session_manager;

use agent_writer::{AGENT_CLAUDE, AGENT_CODEX, AGENT_GEMINI};
use commands::{
    activate_provider, delete_provider, delete_session, get_dashboard, get_session_messages,
    launch_codex, save_provider, save_settings, AppState,
};
use models::Provider;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager, State, WindowEvent};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";
const TRAY_PROVIDER_PREFIX: &str = "provider:";

struct TrayHolder(Mutex<Option<TrayIcon>>);

pub fn run() {
    let state = AppState::new().expect("failed to initialize application state");

    tauri::Builder::default()
        .manage(state)
        .manage(TrayHolder(Mutex::new(None)))
        .setup(|app| {
            let icon = Image::from_bytes(include_bytes!("../icons/icon.ico"))?;
            let menu = build_menu(app.handle())?;

            let tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Codex Switch Mini")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(on_menu_event)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            {
                let holder: State<'_, TrayHolder> = app.state();
                *holder.0.lock().unwrap() = Some(tray);
            }

            let app_handle = app.handle().clone();
            app.listen("providers-changed", move |_| {
                rebuild_tray(&app_handle);
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            save_provider,
            delete_provider,
            activate_provider,
            launch_codex,
            get_session_messages,
            delete_session,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex Switch Mini");
}

fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref().to_string();
    match id.as_str() {
        TRAY_SHOW_ID => show_main_window(app),
        TRAY_QUIT_ID => app.exit(0),
        other => {
            if let Some(provider_id) = other.strip_prefix(TRAY_PROVIDER_PREFIX) {
                activate_provider_from_tray(app, provider_id);
            }
        }
    }
}

fn activate_provider_from_tray(app: &AppHandle, provider_id: &str) {
    let state: State<'_, AppState> = app.state();
    let result = {
        let db = match state.db.lock() {
            Ok(db) => db,
            Err(_) => return,
        };
        let provider = match db.activate_provider(provider_id) {
            Ok(provider) => provider,
            Err(_) => return,
        };
        let settings = match db.settings() {
            Ok(settings) => settings,
            Err(_) => return,
        };
        agent_writer::write_provider(&provider, &PathBuf::from(settings.codex_config_dir))
    };
    if result.is_ok() {
        rebuild_tray(app);
    }
}

fn rebuild_tray(app: &AppHandle) {
    let Ok(menu) = build_menu(app) else { return };
    let holder: State<'_, TrayHolder> = app.state();
    if let Some(tray) = holder.0.lock().ok().and_then(|guard| guard.as_ref().cloned()) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let providers = load_providers(app);
    let codex_items = providers_for_agent(&providers, AGENT_CODEX);
    let claude_items = providers_for_agent(&providers, AGENT_CLAUDE);
    let gemini_items = providers_for_agent(&providers, AGENT_GEMINI);

    let codex_sub = build_agent_submenu(app, "Codex", &codex_items)?;
    let claude_sub = build_agent_submenu(app, "Claude Code", &claude_items)?;
    let gemini_sub = build_agent_submenu(app, "Gemini", &gemini_items)?;

    let show_item = MenuItem::with_id(app, TRAY_SHOW_ID, "Show", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[&codex_sub, &claude_sub, &gemini_sub, &show_item, &quit_item],
    )
}

fn build_agent_submenu(
    app: &AppHandle,
    label: &str,
    providers: &[Provider],
) -> tauri::Result<Submenu<tauri::Wry>> {
    let sub = Submenu::new(app, label, true)?;
    if providers.is_empty() {
        let empty = MenuItem::with_id(
            app,
            format!("{TRAY_PROVIDER_PREFIX}__empty__{label}"),
            "(none configured)",
            false,
            None::<&str>,
        )?;
        sub.append(&empty)?;
    } else {
        for provider in providers {
            let marker = if provider.is_current { "● " } else { "   " };
            let label = format!("{marker}{}", provider.name);
            let item = MenuItem::with_id(
                app,
                format!("{TRAY_PROVIDER_PREFIX}{}", provider.id),
                label,
                true,
                None::<&str>,
            )?;
            sub.append(&item)?;
        }
    }
    Ok(sub)
}

fn load_providers(app: &AppHandle) -> Vec<Provider> {
    let state: State<'_, AppState> = app.state();
    state
        .db
        .lock()
        .ok()
        .and_then(|db| db.providers().ok())
        .unwrap_or_default()
}

fn providers_for_agent(providers: &[Provider], agent: &str) -> Vec<Provider> {
    providers
        .iter()
        .filter(|p| p.agent == agent)
        .cloned()
        .collect()
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
