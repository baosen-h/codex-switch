mod codex;
mod commands;
mod database;
mod error;
mod models;

use commands::{
    activate_provider, delete_provider, get_dashboard, launch_codex, save_provider, save_settings,
    update_session, AppState,
};

pub fn run() {
    let state = AppState::new().expect("failed to initialize application state");

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            save_provider,
            delete_provider,
            activate_provider,
            launch_codex,
            save_settings,
            update_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex Switch Mini");
}
