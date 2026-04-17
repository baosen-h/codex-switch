mod codex;
mod commands;
mod database;
mod error;
mod models;
mod session_manager;

use commands::{
    activate_provider, delete_provider, get_dashboard, get_session_messages, launch_codex,
    save_provider, save_settings, AppState,
};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

const TRAY_SHOW_ID: &str = "show";
const TRAY_QUIT_ID: &str = "quit";

pub fn run() {
    let state = AppState::new().expect("failed to initialize application state");

    tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            let show_item = MenuItem::with_id(app, TRAY_SHOW_ID, "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let icon = Image::from_bytes(include_bytes!("../icons/icon.ico"))?;

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Codex Switch Mini")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    TRAY_SHOW_ID => show_main_window(app),
                    TRAY_QUIT_ID => app.exit(0),
                    _ => {}
                })
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
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex Switch Mini");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
