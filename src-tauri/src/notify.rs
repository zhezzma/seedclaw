use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;

// --- Types ---

#[derive(Clone, Debug)]
pub enum NotifyCommand {
    Connect {
        url: String,
        token: Option<String>,
        origin: String,
    },
    Disconnect,
    Send(String),
}

pub struct NotifyState {
    pub tx: mpsc::Sender<NotifyCommand>,
}

// Context for the background WebSocket task
struct NotifyContext<R: Runtime> {
    app_handle: AppHandle<R>,
}

impl<R: Runtime> NotifyContext<R> {
    fn new(app: AppHandle<R>) -> Self {
        Self { app_handle: app }
    }

    /// Send a system notification and emit an event to the frontend
    fn trigger_notification(&self, session_key: &str, title: &str, body: &str) {
        // Generate a unique notification ID from session_key
        let mut hasher = DefaultHasher::new();
        session_key.hash(&mut hasher);
        let id = hasher.finish() as i32;

        // Send system notification (Android / Desktop)
        let _ = self
            .app_handle
            .notification()
            .builder()
            .title(title)
            .body(body)
            .id(id)
            .show();

        // Emit event to frontend so it can map notification ID -> session key
        let _ = self.app_handle.emit(
            "notify://notification-sent",
            serde_json::json!({
                "id": id,
                "sessionKey": session_key
            }),
        );
    }

    /// Parse incoming WS message and trigger notification for task_complete / task_error
    fn check_notification(&self, text: &str) {
        let msg: Value = match serde_json::from_str(text) {
            Ok(v) => v,
            Err(_) => return,
        };

        let msg_type = match msg.get("type").and_then(|v| v.as_str()) {
            Some(t) => t,
            None => return,
        };

        let data = match msg.get("data") {
            Some(d) => d,
            None => return,
        };

        let task_name = data
            .get("taskName")
            .and_then(|v| v.as_str())
            .unwrap_or("Task");
        let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");

        match msg_type {
            "task_complete" => {
                let title = format!("✅ {} Completed", task_name);
                let result_snippet = data
                    .get("resultSnippet")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Task finished successfully.");
                // Truncate if too long (char-safe for multi-byte UTF-8)
                let body = if result_snippet.chars().count() > 80 {
                    let end = result_snippet
                        .char_indices()
                        .nth(80)
                        .map(|(i, _)| i)
                        .unwrap_or(result_snippet.len());
                    format!("{}…", &result_snippet[..end])
                } else {
                    result_snippet.to_string()
                };
                self.trigger_notification(session_id, &title, &body);
            }
            _ => {
                // task_trigger, agent_start, etc. — informational, no notification
            }
        }
    }
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> NotifyState {
    let (tx, mut rx) = mpsc::channel::<NotifyCommand>(32);
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut connection_task: Option<tauri::async_runtime::JoinHandle<()>> = None;
        let mut ws_tx_channel: Option<mpsc::Sender<String>> = None;

        while let Some(cmd) = rx.recv().await {
            match cmd {
                NotifyCommand::Connect { url, token, origin } => {
                    // Abort previous connection
                    if let Some(h) = connection_task.take() {
                        h.abort();
                    }

                    let (internal_tx, mut internal_rx) = mpsc::channel::<String>(32);
                    ws_tx_channel = Some(internal_tx);

                    let app_clone = app_handle.clone();
                    let url_clone = url.clone();
                    let origin_clone = origin.clone();
                    let token_clone = token.clone();

                    // Spawn reconnection loop
                    connection_task = Some(tauri::async_runtime::spawn(async move {
                        let mut backoff = 1000u64;
                        let context = NotifyContext::new(app_clone.clone());

                        loop {
                            println!("[Rust Notify] Connecting to {}", url_clone);

                            let mut request = match url_clone.clone().into_client_request() {
                                Ok(r) => r,
                                Err(e) => {
                                    eprintln!("[Rust Notify] Invalid URL: {}", e);
                                    return;
                                }
                            };

                            // Set Origin header
                            request
                                .headers_mut()
                                .insert("Origin", HeaderValue::from_str(&origin_clone).unwrap());

                            // Set Authorization header if token provided
                            if let Some(ref tok) = token_clone {
                                if !tok.is_empty() {
                                    if let Ok(val) =
                                        HeaderValue::from_str(&format!("Bearer {}", tok))
                                    {
                                        request.headers_mut().insert("Authorization", val);
                                    }
                                }
                            }

                            match tokio_tungstenite::connect_async(request).await {
                                Ok((ws_stream, _)) => {
                                    println!("[Rust Notify] Connected");
                                    backoff = 1000;
                                    let _ =
                                        app_clone.emit("notify://connection-state", "connected");

                                    let (mut write, mut read) = ws_stream.split();

                                    loop {
                                        tokio::select! {
                                            // Write to WS
                                            Some(msg) = internal_rx.recv() => {
                                                if let Err(e) = write.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await {
                                                    eprintln!("[Rust Notify] Send error: {}", e);
                                                    break;
                                                }
                                            }

                                            // Read from WS
                                            msg_result = read.next() => {
                                                match msg_result {
                                                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                                                        // Check for notifications (system notification)
                                                        context.check_notification(&text);
                                                        // Forward to frontend (for in-app toast)
                                                        let _ = app_clone.emit("notify://message", &text);
                                                    }
                                                    Some(Ok(tokio_tungstenite::tungstenite::Message::Close(frame))) => {
                                                        // Check for auth failure (code 4401)
                                                        if let Some(ref f) = frame {
                                                            if f.code == tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode::from(4401) {
                                                                eprintln!("[Rust Notify] Authentication failed (4401). Stopping.");
                                                                let _ = app_clone.emit("notify://connection-state", "auth_failed");
                                                                return; // Don't reconnect
                                                            }
                                                        }
                                                        println!("[Rust Notify] Server closed connection");
                                                        break;
                                                    }
                                                    Some(Err(e)) => {
                                                        eprintln!("[Rust Notify] Read error: {}", e);
                                                        break;
                                                    }
                                                    None => {
                                                        println!("[Rust Notify] Stream ended");
                                                        break;
                                                    }
                                                    _ => {}
                                                }
                                            }

                                            else => break,
                                        }
                                    }
                                    let _ =
                                        app_clone.emit("notify://connection-state", "disconnected");
                                }
                                Err(e) => {
                                    eprintln!("[Rust Notify] Connect error: {}", e);
                                    let _ =
                                        app_clone.emit("notify://connection-error", e.to_string());
                                }
                            }

                            // Reconnect with exponential backoff
                            tokio::time::sleep(Duration::from_millis(backoff)).await;
                            backoff = (backoff * 2).min(15000);
                        }
                    }));
                }
                NotifyCommand::Disconnect => {
                    if let Some(h) = connection_task.take() {
                        h.abort();
                    }
                    ws_tx_channel = None;
                    let _ = app_handle.emit("notify://connection-state", "disconnected");
                }
                NotifyCommand::Send(msg) => {
                    if let Some(tx) = &ws_tx_channel {
                        let _ = tx.send(msg).await;
                    }
                }
            }
        }
    });

    NotifyState { tx }
}

// --- Commands ---

#[tauri::command]
pub async fn notify_connect(
    state: tauri::State<'_, NotifyState>,
    url: String,
    token: Option<String>,
    origin: Option<String>,
) -> Result<(), String> {
    let origin = origin.unwrap_or_else(|| "http://localhost".to_string());
    state
        .tx
        .send(NotifyCommand::Connect { url, token, origin })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn notify_disconnect(state: tauri::State<'_, NotifyState>) -> Result<(), String> {
    state
        .tx
        .send(NotifyCommand::Disconnect)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn notify_send(
    state: tauri::State<'_, NotifyState>,
    message: String,
) -> Result<(), String> {
    state
        .tx
        .send(NotifyCommand::Send(message))
        .await
        .map_err(|e| e.to_string())
}
