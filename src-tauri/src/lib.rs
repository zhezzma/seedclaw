use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

mod gateway;
mod gotify;

struct AppState {
    gotify: Mutex<Option<gotify::GotifyManager>>,
}

#[tauri::command]
fn start_gotify(app: AppHandle, state: State<'_, AppState>, url: String, token: String) {
    let mut gotify_guard = state.gotify.lock().unwrap();
    if let Some(manager) = gotify_guard.as_ref() {
        manager.stop();
    }

    let manager = gotify::GotifyManager::new(app.clone());
    manager.start(url, token);
    *gotify_guard = Some(manager);
}

#[tauri::command]
fn stop_gotify(state: State<'_, AppState>) {
    let mut gotify_guard = state.gotify.lock().unwrap();
    if let Some(manager) = gotify_guard.take() {
        manager.stop();
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            app.manage(gateway::init(app.handle()));
            Ok(())
        })
        .manage(AppState {
            gotify: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_gotify,
            stop_gotify,
            gateway::gateway_connect,
            gateway::gateway_disconnect,
            gateway::gateway_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
