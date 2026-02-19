use futures_util::StreamExt;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tokio::time::sleep;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
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

        tauri::async_runtime::spawn(async move {
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
                        match connect_async(url.to_string()).await {
                            Ok((ws_stream, _)) => {
                                println!("Connected to Gotify");
                                retry_delay = Duration::from_secs(5); // Reset retry delay

                                let (_, mut read) = ws_stream.split();

                                while let Some(msg_result) = read.next().await {
                                    if !*running.lock().unwrap() {
                                        break;
                                    }

                                    match msg_result {
                                        Ok(msg) => match msg {
                                            Message::Text(text) => {
                                                if let Ok(gotify_msg) =
                                                    serde_json::from_str::<GotifyMessage>(&text)
                                                {
                                                    println!(
                                                        "Received Gotify message: {}",
                                                        gotify_msg.message
                                                    );

                                                    let _ = handle
                                                        .notification()
                                                        .builder()
                                                        .title(gotify_msg.title.trim())
                                                        .body(gotify_msg.message.trim())
                                                        .show();
                                                }
                                            }
                                            Message::Binary(_) => {}
                                            Message::Close(_) => {
                                                break;
                                            }
                                            _ => {}
                                        },
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
                    }
                }

                if *running.lock().unwrap() {
                    println!("Reconnecting to Gotify in {:?}...", retry_delay);
                    sleep(retry_delay).await;
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
        // The async loop checks the flag and will exit eventually.
        // For immediate cancellation, we would need a CancellationToken or AbortHandle,
        // but checking the flag on next loop iteration or message receive is sufficient here
        // as long as the connection doesn't hang indefinitely without heartbeats.
    }
}
