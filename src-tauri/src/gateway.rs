use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;

// --- Constants ---
const NOTIFY_LENGTH_THRESHOLD: usize = 20;

// --- Types ---

#[derive(Clone, Debug)]
pub enum GatewayCommand {
    Connect {
        url: String,
        _token: Option<String>,
        origin: String,
    },
    Disconnect,
    Send(String),
}

pub struct GatewayState {
    pub tx: mpsc::Sender<GatewayCommand>,
}

// Global state container for the background task to access
struct GatewayContext<R: Runtime> {
    app_handle: AppHandle<R>,
    // Track tracking for notifications
    pending_cron_sessions: HashSet<String>,
}

impl<R: Runtime> GatewayContext<R> {
    fn new(app: AppHandle<R>) -> Self {
        Self {
            app_handle: app,
            pending_cron_sessions: HashSet::new(),
        }
    }

    fn check_notification(&mut self, text: &str) {
        // Parse JSON mainly to check for "event": "agent"
        if let Ok(processed) = serde_json::from_str::<Value>(text) {
            if let Some(type_str) = processed.get("type").and_then(|v| v.as_str()) {
                if type_str == "event" {
                    if let Some(event_str) = processed.get("event").and_then(|v| v.as_str()) {
                        if event_str == "agent" {
                            if let Some(payload) = processed.get("payload") {
                                // Logic ported from useNotify.ts
                                // 1. Check for stream="lifecycle", data.phase="start", isCronSession
                                let stream = payload.get("stream").and_then(|v| v.as_str());
                                let data = payload.get("data");
                                let session_key =
                                    payload.get("sessionKey").and_then(|v| v.as_str());

                                if let (Some("lifecycle"), Some(d), Some(key)) =
                                    (stream, data, session_key)
                                {
                                    if d.get("phase").and_then(|v| v.as_str()) == Some("start") {
                                        if key.contains(":cron:") {
                                            self.pending_cron_sessions.insert(key.to_string());
                                            return;
                                        }
                                    }
                                }

                                // 2. Check for follow-up event
                                if let Some(key) = session_key {
                                    if self.pending_cron_sessions.contains(key) {
                                        let current_text = data
                                            .and_then(|d| d.get("text"))
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        if current_text.len() > NOTIFY_LENGTH_THRESHOLD {
                                            self.pending_cron_sessions.remove(key);

                                            // Extract Job Name (if possible) or generic title
                                            // In Rust we might not have access to full cron state easily unless we pass it or fetch it.
                                            // For now, use a generic title or try to parse if possible.
                                            // The original code looked up `cronState.cronJobs`.
                                            // We'll use a generic title for now to avoid complex state sharing.
                                            let title = "你收到了一条定时消息";

                                            let _ = self
                                                .app_handle
                                                .notification()
                                                .builder()
                                                .title(title)
                                                .body(current_text)
                                                .show();
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> GatewayState {
    let (tx, mut rx) = mpsc::channel::<GatewayCommand>(32);
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        // Only one connection at a time
        // We use an Option to hold the current connection's "stopper" or "sender"
        // But since we want the loop to be persistent, we handle connection inside logic
        // Actually, we need to handle "Disconnect" clearing the internal loop

        // Simpler: The outer loop handles commands.
        // When 'Connect' is received, we spawn a connection task.
        // If 'Disconnect' or 'Connect' (new) is received, we abort the old one.

        let mut connection_task: Option<tauri::async_runtime::JoinHandle<()>> = None;
        let mut ws_tx_channel: Option<mpsc::Sender<String>> = None; // To send to the WS write task

        while let Some(cmd) = rx.recv().await {
            match cmd {
                GatewayCommand::Connect {
                    url,
                    _token,
                    origin,
                } => {
                    // Abort previous
                    if let Some(h) = connection_task.take() {
                        h.abort();
                    }
                    // ws_tx_channel = None; // Redundant assignment removed

                    let (internal_tx, mut internal_rx) = mpsc::channel::<String>(32);
                    ws_tx_channel = Some(internal_tx);

                    let app_clone = app_handle.clone();
                    let url_clone = url.clone();
                    let origin_clone = origin.clone();

                    // Spawn reconnection loop
                    connection_task = Some(tauri::async_runtime::spawn(async move {
                        let mut backoff = 1000u64;
                        let mut context = GatewayContext::new(app_clone.clone());

                        loop {
                            println!("[Rust Gateway] Connecting to {}", url_clone);

                            let mut request = url_clone.clone().into_client_request().unwrap();
                            request
                                .headers_mut()
                                .insert("Origin", HeaderValue::from_str(&origin_clone).unwrap());

                            match tokio_tungstenite::connect_async(request).await {
                                Ok((ws_stream, _)) => {
                                    println!("[Rust Gateway] Connected");
                                    backoff = 1000;
                                    let _ =
                                        app_clone.emit("gateway://connection-state", "connected");

                                    let (mut write, mut read) = ws_stream.split();

                                    // Use a select loop to handle both reading from WS and writing to WS
                                    loop {
                                        tokio::select! {
                                            // Write to WS
                                            Some(msg) = internal_rx.recv() => {
                                                if let Err(e) = write.send(tokio_tungstenite::tungstenite::Message::Text(msg)).await {
                                                     eprintln!("[Rust Gateway] Send error: {}", e);
                                                     break;
                                                }
                                            }

                                            // Read from WS
                                            Some(msg_result) = read.next() => {
                                                match msg_result {
                                                    Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                                                        context.check_notification(&text);
                                                        let _ = app_clone.emit("gateway://message", &text);
                                                    }
                                                    Ok(tokio_tungstenite::tungstenite::Message::Close(_)) => {
                                                        println!("[Rust Gateway] Server closed connection");
                                                        break;
                                                    }
                                                    Err(e) => {
                                                        eprintln!("[Rust Gateway] Read error: {}", e);
                                                        break;
                                                    }
                                                    _ => {}
                                                }
                                            }

                                            else => break, // Channels closed
                                        }
                                    }
                                    let _ = app_clone
                                        .emit("gateway://connection-state", "disconnected");
                                }
                                Err(e) => {
                                    eprintln!("[Rust Gateway] Connect error: {}", e);
                                    let _ =
                                        app_clone.emit("gateway://connection-error", e.to_string());
                                }
                            }

                            // Reconnect logic
                            tokio::time::sleep(Duration::from_millis(backoff)).await;
                            backoff = (backoff * 2).min(15000);
                        }
                    }));
                }
                GatewayCommand::Disconnect => {
                    if let Some(h) = connection_task.take() {
                        h.abort();
                    }
                    ws_tx_channel = None;
                    let _ = app_handle.emit("gateway://connection-state", "disconnected");
                }
                GatewayCommand::Send(msg) => {
                    if let Some(tx) = &ws_tx_channel {
                        let _ = tx.send(msg).await;
                    }
                }
            }
        }
    });

    GatewayState { tx }
}

// --- Commands ---

#[tauri::command]
pub async fn gateway_connect(
    state: tauri::State<'_, GatewayState>,
    url: String,
    token: Option<String>,
    origin: Option<String>,
) -> Result<(), String> {
    let origin = origin.unwrap_or_else(|| "http://localhost".to_string());
    state
        .tx
        .send(GatewayCommand::Connect {
            url,
            _token: token,
            origin,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gateway_disconnect(state: tauri::State<'_, GatewayState>) -> Result<(), String> {
    state
        .tx
        .send(GatewayCommand::Disconnect)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gateway_send(
    state: tauri::State<'_, GatewayState>,
    message: String,
) -> Result<(), String> {
    state
        .tx
        .send(GatewayCommand::Send(message))
        .await
        .map_err(|e| e.to_string())
}
