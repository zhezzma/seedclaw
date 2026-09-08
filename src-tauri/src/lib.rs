use tauri::{Manager, WindowEvent};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};

mod notify;
mod server;

// Windows 原生 Toast 的 AUMID 快捷方式自愈注册（仅桌面 Windows 编译）
#[cfg(target_os = "windows")]
mod win_toast;

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
        .plugin(tauri_plugin_notifications::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 便携版/dev 无安装器，开始菜单快捷方式是 Windows Toast 的 AUMID 注册点；
            // 启动时自建/自愈，否则系统通知会被 Windows 静默拒绝（Element not found）。
            // lnk 文件名用 productName（与 NSIS 安装器命名一致）：客户端/Server 两版
            // 可并存（release.yml），各自的 AUMID 快捷方式互不覆盖
            #[cfg(target_os = "windows")]
            {
                let config = app.config();
                let shortcut_name = config
                    .product_name
                    .clone()
                    .unwrap_or_else(|| config.identifier.clone());
                if let Err(e) = win_toast::ensure_aumid_shortcut(&shortcut_name, &config.identifier)
                {
                    log::warn!("[win_toast] ensure_aumid_shortcut failed: {e}");
                }
            }

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
            let server_manager = server::init(app.handle());
            app.manage(server_manager);
            server::start_background(app.handle());
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
        .invoke_handler(tauri::generate_handler![
            greet,
            notify::notify_connect,
            notify::notify_disconnect,
            notify::notify_send,
            server::server_status,
            server::server_restart
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                server::shutdown(app);
            }
        });
}
