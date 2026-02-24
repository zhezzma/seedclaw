use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WindowEvent};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};

mod gotify;
mod notify;

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
    let builder = tauri::Builder::default();

    #[cfg(target_os = "windows")]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        // When a second instance is launched, show and focus the existing window
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            if cfg!(desktop) {
                let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } => {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            app.manage(notify::init(app.handle()));
            Ok(())
        })
        .on_window_event(|_window, event| match event {
            #[cfg(desktop)]
            WindowEvent::CloseRequested { api, .. } => {
                _window.hide().unwrap();
                api.prevent_close();
            }
            #[cfg(not(desktop))]
            WindowEvent::CloseRequested { .. } => {}
            _ => {}
        })
        .manage(AppState {
            gotify: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_gotify,
            stop_gotify,
            notify::notify_connect,
            notify::notify_disconnect,
            notify::notify_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
