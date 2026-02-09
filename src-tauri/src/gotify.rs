use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tungstenite::{connect, Message};
use url::Url;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct GotifyMessage {
    id: u64,
    appid: u64,
    message: String,
    title: String,
    priority: u64,
    date: String,
}

pub struct GotifyManager {
    handle: AppHandle,
    running: Arc<Mutex<bool>>,
}

impl GotifyManager {
    pub fn new(handle: AppHandle) -> Self {
        Self {
            handle,
            running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self, server_url: String, client_token: String) {
        let running = self.running.clone();
        let mut running_guard = running.lock().unwrap();
        if *running_guard {
            return;
        }
        *running_guard = true;
        drop(running_guard);

        let handle = self.handle.clone();

        thread::spawn(move || {
            let mut retry_delay = Duration::from_secs(5);

            while *running.lock().unwrap() {
                // Construct WebSocket URL
                let ws_url_str = if server_url.starts_with("https://") {
                    server_url.replacen("https://", "wss://", 1)
                } else if server_url.starts_with("http://") {
                    server_url.replacen("http://", "ws://", 1)
                } else if server_url.starts_with("ws://") || server_url.starts_with("wss://") {
                    server_url.clone()
                } else {
                    format!("ws://{}", server_url)
                };

                let ws_url = format!(
                    "{}/stream?token={}",
                    ws_url_str.trim_end_matches('/'),
                    client_token
                );

                match Url::parse(&ws_url) {
                    Ok(url) => {
                        println!("Connecting to Gotify: {}", url);
                        match connect(url.to_string()) {
                            Ok((mut socket, _)) => {
                                println!("Connected to Gotify");
                                retry_delay = Duration::from_secs(5); // Reset retry delay

                                loop {
                                    if !*running.lock().unwrap() {
                                        break;
                                    }

                                    // Set a timeout for reading to allow checking running state
                                    // socket.get_mut().set_read_timeout(Some(Duration::from_secs(5)));
                                    // Note: tungstenite generic stream might not support setting timeout easily depending on the stream type
                                    // For now, we blocking read. If we want to stop, we might need to close the socket from another thread or just wait for next message

                                    match socket.read() {
                                        Ok(msg) => {
                                            if msg.is_text() || msg.is_binary() {
                                                if let Ok(text) = msg.to_text() {
                                                    if let Ok(gotify_msg) =
                                                        serde_json::from_str::<GotifyMessage>(text)
                                                    {
                                                        println!(
                                                            "Received Gotify message: {}",
                                                            gotify_msg.message
                                                        );

                                                        let _ = handle
                                                            .notification()
                                                            .builder()
                                                            .title(&gotify_msg.title)
                                                            .body(&gotify_msg.message)
                                                            .show();
                                                    }
                                                }
                                            } else if msg.is_close() {
                                                break;
                                            }
                                        }
                                        Err(e) => {
                                            println!("Gotify WebSocket connection error: {}", e);
                                            break;
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                println!("Failed to connect to Gotify: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        println!("Invalid Gotify URL: {}", e);
                        // If URL is invalid, probably no point retrying unless config changes.
                        // But for simplicity of this loop, we just wait.
                    }
                }

                if *running.lock().unwrap() {
                    println!("Reconnecting to Gotify in {:?}...", retry_delay);
                    thread::sleep(retry_delay);
                    // Exponential backoff with cap
                    retry_delay = std::cmp::min(retry_delay * 2, Duration::from_secs(60));
                }
            }
            println!("Gotify worker stopped");
        });
    }

    pub fn stop(&self) {
        let mut running = self.running.lock().unwrap();
        *running = false;
        // Ideally we should also close the socket to wake up the blocked read,
        // but simple flag check on loop + eventually connection drop or keepalive is okayish for now.
        // A better approach would be using an async runtime or a channel to signal stop.
    }
}
