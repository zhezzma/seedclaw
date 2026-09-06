use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// 从 ~/.seedagent/.env 解析用户显式指定的 PORT 意向（桌面端只读不写该文件）。
pub fn read_env_port(home: &Path) -> Option<u16> {
    let content = std::fs::read_to_string(home.join(".env")).ok()?;
    for line in content.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("PORT=") {
            let rest = rest.trim().trim_matches('"').trim_matches('\'');
            if let Ok(port) = rest.parse::<u16>() {
                return Some(port);
            }
        }
    }
    None
}

/// 端口候选：用户意向优先，随后 18789~18798（去重）。
pub fn port_candidates(preferred: Option<u16>) -> Vec<u16> {
    let mut out = Vec::new();
    if let Some(p) = preferred {
        out.push(p);
    }
    for p in 18789..=18798 {
        if !out.contains(&p) {
            out.push(p);
        }
    }
    out
}

/// 读取/生成 ~/.seedagent/desktop.json 的 bearerToken（uuid v4），首次生成后固定复用。
pub fn load_or_create_token(home: &Path) -> String {
    let file = home.join("desktop.json");
    if let Ok(content) = std::fs::read_to_string(&file) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(token) = v.get("bearerToken").and_then(|t| t.as_str()) {
                if !token.trim().is_empty() {
                    return token.to_string();
                }
            }
        }
    }
    let token = uuid::Uuid::new_v4().to_string();
    let _ = std::fs::create_dir_all(home);
    let json = serde_json::json!({ "bearerToken": token });
    let _ = std::fs::write(&file, serde_json::to_string_pretty(&json).unwrap());
    token
}

const INTENT_RUN: u8 = 0;
const INTENT_RESTART: u8 = 1;
const INTENT_STOP: u8 = 2;

#[derive(Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerPhase {
    Starting,
    Running,
    Restarting,
    Failed,
    Unavailable,
}

#[derive(Clone, Serialize)]
pub struct ServerStatus {
    pub bundled: bool,
    pub state: ServerPhase,
    pub port: Option<u16>,
    pub url: Option<String>,
    pub token: Option<String>,
    pub pid: Option<u32>,
    pub last_error: Option<String>,
    /// 数据目录（~/.seedagent）绝对路径，供前端展示/复制日志路径
    pub data_dir: Option<String>,
}

pub struct ServerManager {
    bundled: bool,
    home: PathBuf,
    server_dir: Option<PathBuf>,
    token: String,
    status: Mutex<ServerStatus>,
    intent: AtomicU8,
}

fn home_dir() -> PathBuf {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// resources/seedagent 里的 node 可执行文件名（非 Windows 平台也要能编译，本期只打 Windows 包）。
#[cfg(target_os = "windows")]
fn node_binary_name() -> &'static str {
    "node.exe"
}

#[cfg(not(target_os = "windows"))]
fn node_binary_name() -> &'static str {
    "node"
}

/// server 目录候选，覆盖四种形态：
/// 1. NSIS 安装目录（tauri.conf resources 映射保留源相对路径 → <install>/resources/seedagent）
/// 2. 便携/其他打包布局（<exe_dir>/seedagent）
/// 3. dev（cwd=仓库根，staging 到 src-tauri/resources/seedagent）
/// 4. dev（cwd=src-tauri，staging 原地生效 → cwd/resources/seedagent）
fn resolve_server_dir(resource_dir: &Path) -> Option<PathBuf> {
    [
        resource_dir.join("resources").join("seedagent"),
        resource_dir.join("seedagent"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri")
            .join("resources")
            .join("seedagent"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("resources")
            .join("seedagent"),
    ]
    .into_iter()
    .find(|d| d.join(node_binary_name()).exists())
}

impl ServerManager {
    pub fn status(&self) -> ServerStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn set_intent_restart(&self) {
        self.intent.store(INTENT_RESTART, Ordering::SeqCst);
    }

    pub fn set_intent_stop(&self) {
        self.intent.store(INTENT_STOP, Ordering::SeqCst);
    }

    /// 前端「重启服务」按钮：复用实例（无 pid）时仅广播当前状态，不强制动作。
    pub fn request_restart(&self, app: &AppHandle) {
        {
            let st = self.status.lock().unwrap();
            if !st.bundled {
                return;
            }
            if st.pid.is_none() {
                emit_status(app, &st);
                return;
            }
        }
        self.set_intent_restart();
        if let Some(pid) = self.status.lock().unwrap().pid {
            kill_tree(pid);
        }
    }

    fn update_status(&self, app: Option<&AppHandle>, mutate: impl FnOnce(&mut ServerStatus)) {
        let st = {
            let mut guard = self.status.lock().unwrap();
            mutate(&mut guard);
            guard.clone()
        };
        if let Some(app) = app {
            emit_status(app, &st);
        }
    }
}

fn emit_status(app: &AppHandle, st: &ServerStatus) {
    let _ = app.emit("server://status", st);
}

/// Windows 下杀进程树（seedagent 会派生 subagent 子进程）。
#[cfg(target_os = "windows")]
pub fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .status();
}

#[cfg(not(target_os = "windows"))]
pub fn kill_tree(pid: u32) {
    let _ = std::process::Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status();
}

/// setup 钩子调用：检测 bundled、准备 token；spawn/监控由 Task 3 的 start_background 接管。
pub fn init(app: &AppHandle) -> ServerManager {
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let server_dir = resolve_server_dir(&resource_dir);
    let bundled = server_dir.is_some();
    let home = home_dir().join(".seedagent");

    let token = if bundled { load_or_create_token(&home) } else { String::new() };

    let status = Mutex::new(ServerStatus {
        bundled,
        state: if bundled {
            ServerPhase::Starting
        } else {
            ServerPhase::Unavailable
        },
        port: None,
        url: None,
        token: if bundled { Some(token.clone()) } else { None },
        pid: None,
        last_error: None,
        data_dir: if bundled { Some(home.to_string_lossy().into_owned()) } else { None },
    });

    ServerManager { bundled, home, server_dir, token, status, intent: AtomicU8::new(INTENT_RUN) }
}

/// 应用退出（RunEvent::Exit / 托盘 quit）时调用。
pub fn shutdown(app: &AppHandle) {
    if let Some(mgr) = app.try_state::<ServerManager>() {
        mgr.set_intent_stop();
        if let Some(pid) = mgr.status().pid {
            kill_tree(pid);
        }
    }
}

enum PortProbe {
    /// 带 token 的 /api/health 返回 200 —— 自己残留的旧实例，直接复用
    Ours,
    /// 有 HTTP 响应但不是我们的实例 —— 端口被别人占用
    Foreign,
    /// 连接被拒 —— 端口空闲
    Free,
}

/// 一次性端口探测（纯 socket，零依赖；仅 127.0.0.1 明文 HTTP）。
fn probe_port(port: u16, token: &str) -> PortProbe {
    let addr = ("127.0.0.1", port);
    let Ok(mut addrs) = addr.to_socket_addrs() else {
        return PortProbe::Foreign;
    };
    let Some(sock_addr) = addrs.next() else {
        return PortProbe::Foreign;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&sock_addr, Duration::from_millis(300)) else {
        return PortProbe::Free;
    };
    let req = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return PortProbe::Foreign;
    }
    let mut buf = [0u8; 128];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    if head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200") {
        PortProbe::Ours
    } else {
        PortProbe::Foreign
    }
}

fn spawn_child(
    server_dir: &Path,
    home: &Path,
    port: u16,
    token: &str,
) -> std::io::Result<std::process::Child> {
    let logs = home.join("logs");
    std::fs::create_dir_all(&logs)?;
    let stdout = std::fs::OpenOptions::new()
        .create(true).write(true).truncate(true)
        .open(logs.join("desktop-stdout.log"))?;
    let stderr = std::fs::OpenOptions::new()
        .create(true).write(true).truncate(true)
        .open(logs.join("desktop-stderr.log"))?;
    let mut cmd = std::process::Command::new(server_dir.join(node_binary_name()));
    cmd.arg("dist/index.js")
        .current_dir(server_dir)
        .env("PORT", port.to_string())
        .env("BEARER_TOKEN", token)
        .env("DATA_DIR", home)
        .env("NODE_ENV", "production")
        .stdout(std::process::Stdio::from(stdout))
        .stderr(std::process::Stdio::from(stderr));
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.spawn()
}

/// setup 里调用：spawn + 退出监控（阻塞线程，不占 async 运行时）。
pub fn start_background(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || run_loop(app));
}

fn run_loop(app: AppHandle) {
    let mgr = match app.try_state::<ServerManager>() {
        Some(m) => m,
        None => return,
    };
    if !mgr.bundled {
        return;
    }
    let home = mgr.home.clone();
    let token = mgr.token.clone();
    let server_dir = match &mgr.server_dir {
        Some(d) => d.clone(),
        None => return,
    };

    // 选端口：.env PORT 意向 → 18789~18798，一次性探测
    let mut chosen: Option<u16> = None;
    let mut reused = false;
    for port in port_candidates(read_env_port(&home)) {
        match probe_port(port, &token) {
            PortProbe::Ours => {
                chosen = Some(port);
                reused = true;
                break;
            }
            PortProbe::Free => {
                chosen = Some(port);
                break;
            }
            PortProbe::Foreign => continue,
        }
    }
    let Some(port) = chosen else {
        mgr.update_status(Some(&app), |st| {
            st.state = ServerPhase::Failed;
            st.last_error = Some("端口 18789~18798 全被占用".into());
        });
        return;
    };
    let url = format!("http://127.0.0.1:{port}");

    if reused {
        // 桌面端上次崩溃留下的孤儿实例（同 token）：直接复用，无 pid 可管
        mgr.update_status(Some(&app), |st| {
            st.state = ServerPhase::Running;
            st.port = Some(port);
            st.url = Some(url);
        });
        return;
    }

    let mut backoff = Duration::from_secs(1);
    let mut consecutive_failures: u32 = 0;
    loop {
        match spawn_child(&server_dir, &home, port, &token) {
            Ok(mut child) => {
                let pid = child.id();
                let started = std::time::Instant::now();
                mgr.update_status(Some(&app), |st| {
                    st.state = ServerPhase::Running;
                    st.port = Some(port);
                    st.url = Some(url.clone());
                    st.pid = Some(pid);
                    st.last_error = None;
                });
                let exit = child.wait();
                let uptime = started.elapsed();
                let code = exit.ok().and_then(|s| s.code()).unwrap_or(-1);

                if mgr.intent.load(Ordering::SeqCst) == INTENT_STOP {
                    return; // 正常退出路径，进程已结束
                }
                if mgr.intent.load(Ordering::SeqCst) == INTENT_RESTART {
                    mgr.intent.store(INTENT_RUN, Ordering::SeqCst);
                    consecutive_failures = 0;
                    backoff = Duration::from_secs(1);
                    continue; // 用户请求的重启：立即重拉
                }

                if uptime >= Duration::from_secs(30) {
                    consecutive_failures = 0;
                } else {
                    consecutive_failures += 1;
                }
                if consecutive_failures >= 5 {
                    mgr.update_status(Some(&app), |st| {
                        st.state = ServerPhase::Failed;
                        st.pid = None;
                        st.last_error = Some(format!("连续快速退出 5 次，最后退出码 {code}"));
                    });
                    return;
                }
                mgr.update_status(Some(&app), |st| {
                    st.state = ServerPhase::Restarting;
                    st.pid = None;
                    st.last_error = Some(format!("进程退出（码 {code}），{}s 后重启", backoff.as_secs()));
                });
                std::thread::sleep(backoff);
                backoff = std::cmp::min(backoff * 2, Duration::from_secs(15));
            }
            Err(e) => {
                mgr.update_status(Some(&app), |st| {
                    st.state = ServerPhase::Failed;
                    st.last_error = Some(format!("spawn 失败: {e}"));
                });
                return;
            }
        }
    }
}

#[tauri::command]
pub fn server_status(state: tauri::State<'_, ServerManager>) -> ServerStatus {
    state.status()
}

#[tauri::command]
pub fn server_restart(app: AppHandle, state: tauri::State<'_, ServerManager>) {
    state.request_restart(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_home(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "seedclaw-server-test-{}-{}",
            tag,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn read_env_port_parses_port() {
        let home = temp_home("port-ok");
        std::fs::write(home.join(".env"), "BEARER_TOKEN=x\nPORT=18789\n").unwrap();
        assert_eq!(read_env_port(&home), Some(18789));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn read_env_port_missing_or_invalid() {
        let home = temp_home("port-miss");
        assert_eq!(read_env_port(&home), None);
        std::fs::write(home.join(".env"), "PORT=notanumber\n").unwrap();
        assert_eq!(read_env_port(&home), None);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn port_candidates_preferred_first_and_dedup() {
        assert_eq!(port_candidates(Some(9000)), {
            let mut v: Vec<u16> = vec![9000];
            v.extend(18789..=18798);
            v
        });
        assert_eq!(port_candidates(Some(18789)).first(), Some(&18789));
        assert_eq!(port_candidates(Some(18789)).len(), 10);
        assert_eq!(port_candidates(None).len(), 10);
    }

    #[test]
    fn port_candidates_in_range_preferred_first() {
        // 区间内的意向端口也必须排在候选首位（PORT 意向优先）
        assert_eq!(port_candidates(Some(18795)).first(), Some(&18795));
    }

    #[test]
    fn token_created_then_reused() {
        let home = temp_home("token");
        let t1 = load_or_create_token(&home);
        assert!(uuid::Uuid::parse_str(&t1).is_ok());
        let t2 = load_or_create_token(&home);
        assert_eq!(t1, t2);
        let _ = std::fs::remove_dir_all(&home);
    }
}
