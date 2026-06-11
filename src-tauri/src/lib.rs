mod agent_writer;
mod app_config;
mod capabilities;
mod commands;
mod compatibility_proxy;
mod database;
mod error;
mod handoff;
mod models;
mod oauth;
mod relay_translate;
mod session_manager;
mod vision_fallback;
mod web_search;

use agent_writer::{AGENT_CLAUDE, AGENT_CODEX, AGENT_GEMINI};
use commands::{
    activate_provider, build_session_handoff, check_app_update, delete_api_provider,
    delete_mcp_preset, delete_mcp_server, delete_provider, delete_session, delete_skill,
    download_and_install_update, fetch_web_urls, generate_image, get_capabilities_state,
    get_dashboard, get_provider_balance, get_session_messages, import_skill, launch_codex,
    launch_provider, launch_session, list_provider_models, open_external_url, pick_directory,
    preview_mcp_config, preview_skill, save_api_provider, save_mcp_preset, save_mcp_server,
    save_provider, save_settings, save_skill, search_skill_market, search_web, send_chat_message,
    sync_mcp_capabilities, sync_skill_capabilities, test_mcp_server, AppState,
};
use models::Provider;
use oauth::{complete_openai_oauth, start_openai_oauth, submit_openai_oauth_callback};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager, State, WindowEvent};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";
const TRAY_PROVIDER_PREFIX: &str = "provider:";
const SINGLE_INSTANCE_ADDR: &str = "127.0.0.1:47631";
const SINGLE_INSTANCE_SHOW_REQUEST: &[u8] = b"show\n";

struct TrayHolder(Mutex<Option<TrayIcon>>);

pub fn run() {
    let Some(single_instance_listener) = acquire_single_instance() else {
        return;
    };
    let state = AppState::new().expect("failed to initialize application state");

    tauri::Builder::default()
        .manage(state)
        .manage(TrayHolder(Mutex::new(None)))
        .setup(move |app| {
            let icon = load_app_icon()?;
            let menu = build_menu(app.handle())?;

            apply_main_window_icon(app.handle());
            start_single_instance_listener(single_instance_listener, app.handle().clone());

            let tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Codex Switch")
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
            save_api_provider,
            delete_api_provider,
            save_provider,
            delete_provider,
            activate_provider,
            send_chat_message,
            generate_image,
            launch_codex,
            launch_provider,
            launch_session,
            get_session_messages,
            build_session_handoff,
            delete_session,
            get_provider_balance,
            check_app_update,
            download_and_install_update,
            list_provider_models,
            open_external_url,
            start_openai_oauth,
            submit_openai_oauth_callback,
            complete_openai_oauth,
            pick_directory,
            save_settings,
            search_web,
            fetch_web_urls,
            get_capabilities_state,
            save_mcp_server,
            delete_mcp_server,
            test_mcp_server,
            preview_mcp_config,
            sync_mcp_capabilities,
            save_mcp_preset,
            delete_mcp_preset,
            import_skill,
            search_skill_market,
            save_skill,
            delete_skill,
            preview_skill,
            sync_skill_capabilities,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex Switch");
}

fn acquire_single_instance() -> Option<TcpListener> {
    match TcpListener::bind(SINGLE_INSTANCE_ADDR) {
        Ok(listener) => Some(listener),
        Err(_) => {
            notify_existing_instance();
            None
        }
    }
}

fn notify_existing_instance() {
    if let Ok(mut stream) = TcpStream::connect(SINGLE_INSTANCE_ADDR) {
        let _ = stream.write_all(SINGLE_INSTANCE_SHOW_REQUEST);
    }
}

fn start_single_instance_listener(listener: TcpListener, app: AppHandle) {
    thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                let mut message = Vec::new();
                if stream.read_to_end(&mut message).is_ok()
                    && message.starts_with(SINGLE_INSTANCE_SHOW_REQUEST)
                {
                    let app_for_window = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        show_main_window(&app_for_window);
                    });
                }
            }
        }
    });
}

fn load_app_icon() -> tauri::Result<Image<'static>> {
    Image::from_bytes(include_bytes!("../icons/icon.ico"))
}

fn apply_main_window_icon(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(icon) = load_app_icon() {
            let _ = window.set_icon(icon);
        }
    }
}

fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref().to_string();
    match id.as_str() {
        TRAY_SHOW_ID => show_main_window(app),
        TRAY_QUIT_ID => quit_app(app),
        other => {
            if let Some(provider_id) = other.strip_prefix(TRAY_PROVIDER_PREFIX) {
                activate_provider_from_tray(app, provider_id);
            }
        }
    }
}

fn quit_app(app: &AppHandle) {
    remove_tray_icon(app);
    app.exit(0);
}

pub(crate) fn remove_tray_icon(app: &AppHandle) {
    let holder: State<'_, TrayHolder> = app.state();
    let tray = holder.0.lock().ok().and_then(|mut guard| guard.take());
    drop(tray);
    thread::sleep(Duration::from_millis(80));
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
        let codex_dir = agent_writer::resolve_codex_dir(&settings.codex_config_dir);
        let claude_dir = agent_writer::resolve_claude_dir(&settings.claude_config_dir);
        let gemini_dir = agent_writer::resolve_gemini_dir(&settings.gemini_config_dir);
        agent_writer::write_provider(
            &provider,
            &agent_writer::AgentDirs {
                codex: &codex_dir,
                claude: &claude_dir,
                gemini: &gemini_dir,
                vision_codex: settings.vision_fallback_enabled && settings.vision_codex_enabled,
                vision_claude: settings.vision_fallback_enabled && settings.vision_claude_enabled,
                vision_gemini: settings.vision_fallback_enabled && settings.vision_gemini_enabled,
            },
        )
    };
    if result.is_ok() {
        rebuild_tray(app);
    }
}

fn rebuild_tray(app: &AppHandle) {
    let Ok(menu) = build_menu(app) else { return };
    let holder: State<'_, TrayHolder> = app.state();
    if let Some(tray) = holder
        .0
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().cloned())
    {
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
        if let Ok(icon) = load_app_icon() {
            let _ = window.set_icon(icon);
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
