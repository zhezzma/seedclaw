# 桌面端内置 seedagent 服务端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打包脚本把 seedagent（Node 23）+ Node 运行时打进 Windows 桌面安装包，桌面端启动时由 Rust 自动拉起服务端，前端网关设置支持「本地（托管）/远程（手填）」模式。

**Architecture:** Tauri resources 携带 `node.exe + dist/ + node_modules/`；Rust `server.rs` 负责资源检测（`bundled`）、选端口（读 `~/.seedagent/.env` 的 `PORT` 意向 → 18789~18798 一次性探测）、spawn 注入环境变量（seedagent env-loader 已改为进程环境优先）、子进程退出监控重拉、退出杀进程树。前端经 `server_status` invoke + `server://status` 事件感知状态，`gatewayMode` 守卫未打包构建强制 remote。

**Tech Stack:** Tauri 2 (Rust, std::process)、Vue 3 + Pinia、PowerShell 打包脚本、seedagent (Node 23 + Hono + vitest)。

**Spec:** `docs/superpowers/specs/2026-09-06-bundled-server-desktop-design.md`（本计划从 spec 出发，执行者须同时阅读 spec）

## Global Constraints

- **两个仓库**：seedclaw（`D:\Workspace\seedclaw`）与 seedagent（`D:\Workspace\seedagent`）。seedclaw 的一切工作在 worktree 分支 `feat/bundled-server` 进行（用 superpowers:using-git-worktrees 创建）；seedagent 在分支 `feat/desktop-env-loader` 进行（直接在该仓库创建分支即可）。两仓库各自独立提交。
- Windows 先行；`~/.seedagent` 全平台统一（Windows 为 `%USERPROFILE%\.seedagent`）。
- Node 运行时锁 23.x（原生模块 ABI），打包脚本默认 `23.11.0`。
- **不做 HTTP 健康检查轮询**；就绪靠既有 WS 退避重连，崩溃靠子进程退出监控。
- 端口候选：`~/.seedagent/.env` 的 `PORT`（若解析成功）→ 18789~18798。
- 对前端的接口名固定：invoke `server_status` / `server_restart`，事件 `server://status`。
- 事件/状态枚举：`state ∈ starting|running|restarting|failed|unavailable`；`bundled=false` 时恒为 `unavailable`。
- seedagent 配置注入**只用进程环境变量**（`PORT`/`BEARER_TOKEN`/`DATA_DIR`），不写 `.env`，不加 CLI 参数。
- token 为 uuid v4，持久化在 `~/.seedagent/desktop.json` 的 `bearerToken`。
- localStorage key 保持 `openclaw_config` 不变；迁移逻辑在 loadConfig 内完成。
- i18n 文案 zh/en 两个文件都要加。
- 前端验证方式：`npm run tcs`（无前端单测基建）；Rust：`cargo test`；seedagent：`npx vitest run`。

---

### Task 1: seedagent env-loader 语义修正（进程环境优先 + 删遗留路径）

**Repo:** seedagent，分支 `feat/desktop-env-loader`（从当前工作分支切出）。

**Files:**
- Modify: `src/config/env-loader.ts`（全文替换逻辑）
- Test: `tests/config/env-loader.test.ts`（新建）

**Interfaces:**
- Consumes: 无。
- Produces: `loadEnvironmentFiles(): boolean` 签名不变（模块加载时自动执行的行为不变）；seedclaw Task 3 依赖其新语义——spawn 注入的 `PORT`/`BEARER_TOKEN`/`DATA_DIR` 不被任何 `.env` 覆盖；seedclaw Task 2 的 `read_env_port` 依赖路径约定 `~/.seedagent/.env`。

- [ ] **Step 1: 创建分支**

```bash
cd /d/Workspace/seedagent && git checkout -b feat/desktop-env-loader
```

- [ ] **Step 2: 写失败测试**

新建 `tests/config/env-loader.test.ts`：

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * env-loader 在模块加载时自动执行且读 os.homedir()/process.cwd()，
 * 因此用临时目录伪造 HOME/USERPROFILE 与 cwd，resetModules 后动态 import。
 */
describe('env-loader', () => {
    let fakeHome: string;
    let fakeCwd: string;
    let realHome: string;
    let realCwd: string;
    const savedEnv: Record<string, string | undefined> = {};

    const preserve = (key: string) => { savedEnv[key] = process.env[key]; };
    const restore = (key: string) => {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    };
    const writeEnv = (dir: string, name: string, content: string) => {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), content, 'utf-8');
    };

    beforeEach(() => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'env-loader-'));
        fakeHome = path.join(base, 'home');
        fakeCwd = path.join(base, 'cwd');
        fs.mkdirSync(fakeHome, { recursive: true });
        fs.mkdirSync(fakeCwd, { recursive: true });
        realHome = os.homedir();
        realCwd = process.cwd();
        for (const k of ['HOME', 'USERPROFILE', 'PROC_ONLY', 'LATER_KEY', 'FROM_SEEDAGENT', 'FROM_DELETED_PATH']) preserve(k);
        delete process.env.PROC_ONLY;
        delete process.env.LATER_KEY;
        delete process.env.FROM_SEEDAGENT;
        delete process.env.FROM_DELETED_PATH;
    });

    afterEach(() => {
        process.chdir(realCwd);
        for (const k of ['HOME', 'USERPROFILE', 'PROC_ONLY', 'LATER_KEY', 'FROM_SEEDAGENT', 'FROM_DELETED_PATH']) restore(k);
        vi.resetModules();
    });

    it('进程环境已存在的键不被 .env 覆盖（桌面端 spawn 注入场景）', async () => {
        process.env.PROC_ONLY = 'from-process';
        writeEnv(fakeHome, path.join('.seedagent', '.env'), 'PROC_ONLY=from-file\nFROM_SEEDAGENT=1\n');
        process.env.HOME = fakeHome;
        process.env.USERPROFILE = fakeHome;
        process.chdir(fakeCwd);

        await import('../../src/config/env-loader.js');

        expect(process.env.PROC_ONLY).toBe('from-process');
        expect(process.env.FROM_SEEDAGENT).toBe('1');
    });

    it('文件之间 later-wins：~/.seedagent/.env 覆盖 cwd/.env', async () => {
        writeEnv(fakeCwd, '.env', 'LATER_KEY=from-cwd\n');
        writeEnv(fakeHome, path.join('.seedagent', '.env'), 'LATER_KEY=from-seedagent\n');
        process.env.HOME = fakeHome;
        process.env.USERPROFILE = fakeHome;
        process.chdir(fakeCwd);

        await import('../../src/config/env-loader.js');

        expect(process.env.LATER_KEY).toBe('from-seedagent');
    });

    it('已删除的搜索路径 ~/deploy/.env 与 ~/.env 不再加载', async () => {
        writeEnv(fakeHome, path.join('deploy', '.env'), 'FROM_DELETED_PATH=1\n');
        writeEnv(fakeHome, '.env', 'FROM_DELETED_PATH=2\n');
        process.env.HOME = fakeHome;
        process.env.USERPROFILE = fakeHome;
        process.chdir(fakeCwd);

        await import('../../src/config/env-loader.js');

        expect(process.env.FROM_DELETED_PATH).toBeUndefined();
    });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd /d/Workspace/seedagent && npx vitest run tests/config/env-loader.test.ts`
Expected: 第 1 个用例 FAIL（现状 `override: true` 会把 `PROC_ONLY` 覆盖成 `from-file`）；第 3 个用例 FAIL（现状仍加载 `~/.env`）。第 2 个可能 PASS。

- [ ] **Step 4: 改 env-loader**

`src/config/env-loader.ts` 全文替换为：

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from "node:url";
import * as dotenv from 'dotenv';

/**
 * Loads .env files from various locations in order of priority.
 * 文件之间 later-wins（后加载的文件覆盖先加载的文件的键），
 * 但进程环境变量（桌面端 spawn 注入 / Docker ENV / systemd Environment=）优先级最高，
 * 只填充尚未设置的键。
 */
export function loadEnvironmentFiles(): boolean {
    const homeDir = os.homedir() || process.env.HOME || process.env.USERPROFILE || "";
    const currentDir = process.cwd();
    // 当前文件位于 src/config/env-loader.ts（或 dist/config/env-loader.js）。
    // 向上取两级后 entryDir 是 src/（或 dist/），保持原有 .env 搜索根不变。
    const entryDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

    // ~/deploy/.env 与 ~/.env 为手动部署时代遗留路径，已删除。
    const envPaths = [
        path.join(entryDir, '.env'),
        path.join(entryDir, '.env.local'),
        path.join(currentDir, '.env'),
        path.join(currentDir, '.env.local'),
        path.join(homeDir, '.seedagent', '.env'),
        path.join(homeDir, '.seedagent', '.env.local'),
    ];

    // 先把所有文件按序解析合并（later-wins），再统一填充进程环境未设置的键
    const merged: Record<string, string> = {};
    let loadedAnyFile = false;
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            try {
                const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
                Object.assign(merged, parsed);
                loadedAnyFile = true;
            } catch {
                // 静默忽略：交互式 CLI/TUI 启动阶段不应向终端输出环境文件探测日志。
            }
        }
    }
    if (loadedAnyFile) {
        for (const [key, value] of Object.entries(merged)) {
            if (process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    }
    return loadedAnyFile;
}

// Auto-execute when imported
loadEnvironmentFiles();
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/config/env-loader.test.ts`
Expected: 3 个用例全 PASS。

- [ ] **Step 6: 回归——全量测试 + 类型检查**

Run: `npx vitest run && npm run typecheck`
Expected: 全部 PASS（若仓库既有测试因环境变量行为受影响，逐个核对是否与本改动语义相关，相关则修正测试，无关则上报）。

- [ ] **Step 7: Commit**

```bash
git add src/config/env-loader.ts tests/config/env-loader.test.ts
git commit -m "fix(config): env-loader 进程环境变量优先，删除 ~/deploy 与 ~/.env 遗留搜索路径"
```

---

### Task 2: seedclaw Rust — server 模块（纯逻辑 + bundled 检测 + 状态命令）

**Repo:** seedclaw，**worktree 分支 `feat/bundled-server`**（执行本任务前用 superpowers:using-git-worktrees 技能创建；后续 Task 2~7 都在此 worktree）。

**Files:**
- Create: `src-tauri/src/server.rs`
- Modify: `src-tauri/Cargo.toml`（加 uuid 依赖）
- Modify: `src-tauri/src/lib.rs:9`（`mod notify;` 后加 `mod server;`）、`lib.rs:93-98`（invoke_handler 注册）

**Interfaces:**
- Consumes: 无（Task 3 在本任务的状态结构上加进程管理）。
- Produces（Task 3/4/5 依赖的精确签名）:
  - `pub struct ServerStatus { pub bundled: bool, pub state: ServerPhase, pub port: Option<u16>, pub url: Option<String>, pub token: Option<String>, pub pid: Option<u32>, pub last_error: Option<String>, pub data_dir: Option<String> }`
  - `pub enum ServerPhase { Starting, Running, Restarting, Failed, Unavailable }`（serde lowercase）
  - `pub fn init(app: &tauri::AppHandle) -> ServerManager`
  - `impl ServerManager { pub fn status(&self) -> ServerStatus; pub fn set_intent_restart(&self); pub fn set_intent_stop(&self); pub fn request_restart(&self, app: &tauri::AppHandle) }`
  - `pub fn server_status(state: tauri::State<'_, ServerManager>) -> ServerStatus`（tauri command）
  - `pub fn server_restart(app: tauri::AppHandle, state: tauri::State<'_, ServerManager>)`（tauri command）
  - 事件名 `server://status`，payload 为 `ServerStatus` 的 JSON。
  - 内部纯函数（Task 3 复用）：`fn read_env_port(home: &std::path::Path) -> Option<u16>`、`fn port_candidates(preferred: Option<u16>) -> Vec<u16>`、`fn load_or_create_token(home: &std::path::Path) -> String`

- [ ] **Step 1: 建 worktree**

用 superpowers:using-git-worktrees 技能，分支名 `feat/bundled-server`，基于 `master`。之后所有 seedclaw 操作都在 worktree 目录内。

- [ ] **Step 2: 加依赖**

`src-tauri/Cargo.toml` 的 `[dependencies]` 段（serde_json 之后）加：

```toml
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 3: 写失败测试**

创建 `src-tauri/src/server.rs`，只放测试（函数尚未定义，编译失败即红灯）：

```rust
use std::path::PathBuf;

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
    fn token_created_then_reused() {
        let home = temp_home("token");
        let t1 = load_or_create_token(&home);
        assert!(uuid::Uuid::parse_str(&t1).is_ok());
        let t2 = load_or_create_token(&home);
        assert_eq!(t1, t2);
        let _ = std::fs::remove_dir_all(&home);
    }
}
```

`src-tauri/src/lib.rs:9` 的 `mod notify;` 后加一行 `mod server;`。

- [ ] **Step 4: 跑测试确认失败（编译期红灯）**

Run: `cd <worktree>/src-tauri && cargo test server`
Expected: 编译 FAIL——`cannot find function read_env_port` 等 4 个未定义符号。

- [ ] **Step 5: 写纯函数实现**

`server.rs` 顶部（tests 模块之前）加：

```rust
use std::path::Path;

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
        if !(18789..=18798).contains(&p) {
            out.push(p);
        }
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
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cargo test server`
Expected: 4 个测试 PASS。

- [ ] **Step 7: 实现 ServerManager + bundled 检测 + 命令**

在 `server.rs` 追加（放在纯函数之后）：

```rust
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

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

/// server 目录候选，覆盖三种形态：
/// 1. NSIS 安装目录（tauri.conf resources 映射保留源相对路径 → <install>/resources/seedagent）
/// 2. 便携/其他打包布局（<exe_dir>/seedagent）
/// 3. dev（cwd=src-tauri，staging 原地生效）
fn resolve_server_dir(resource_dir: &Path) -> Option<PathBuf> {
    [
        resource_dir.join("resources").join("seedagent"),
        resource_dir.join("seedagent"),
        std::env::current_dir()
            .unwrap_or_default()
            .join("src-tauri")
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

#[tauri::command]
pub fn server_status(state: tauri::State<'_, ServerManager>) -> ServerStatus {
    state.status()
}

#[tauri::command]
pub fn server_restart(app: AppHandle, state: tauri::State<'_, ServerManager>) {
    state.request_restart(&app);
}
```

注意：`kill_tree`/`set_intent_*` 本任务先落地（编译需要），spawn 监控循环（消费 intent）在 Task 3。

- [ ] **Step 8: lib.rs 注册**

`src-tauri/src/lib.rs`：
- 第 9 行 `mod notify;` 后加 `mod server;`（Step 3 已加则跳过）
- `setup` 闭包内 `app.manage(notify::init(app.handle()));`（lib.rs:80）后加：

```rust
            let server_manager = server::init(app.handle());
            app.manage(server_manager);
```

- `invoke_handler`（lib.rs:93-98）加入 `server::server_status, server::server_restart`。

- [ ] **Step 9: 编译验证**

Run: `cd <worktree>/src-tauri && cargo check && cargo test server`
Expected: 编译通过，4 个测试 PASS。

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/server.rs src-tauri/src/lib.rs src-tauri/Cargo.toml Cargo.lock
git commit -m "feat(desktop): server 模块——bundled 检测、desktop.json token、端口候选与 server_status/server_restart 命令"
```

---

### Task 3: seedclaw Rust — spawn、退出监控、退出杀树

**Files:**
- Modify: `src-tauri/src/server.rs`（追加 spawn/monitor）
- Modify: `src-tauri/src/lib.rs:99-100`（`.run(ctx)` 改为 `.build(ctx).run(callback)` 以接 RunEvent::Exit）

**Interfaces:**
- Consumes: Task 2 的 `ServerManager`/`ServerStatus`/`kill_tree`/`read_env_port`/`port_candidates`/`emit_status`/intent 常量。
- Produces: `pub fn start_background(app: &AppHandle)`（lib.rs setup 调用）；运行期行为——`bundled=true` 时 spawn `node.exe dist/index.js` 并在崩溃时退避重拉、`server://status` 推送状态变化。

- [ ] **Step 1: 实现探测 + spawn + 监控循环**

`server.rs` 追加：

```rust
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

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
    let Ok(mut stream) = TcpStream::connect_timeout(&sock_addr, Duration::from_millis(300))
    else {
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

fn spawn_child(server_dir: &Path, home: &Path, port: u16, token: &str) -> std::io::Result<std::process::Child> {
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
            Ok(child) => {
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
```

- [ ] **Step 2: lib.rs 接入启动与退出钩子**

`src-tauri/src/lib.rs`：
- setup 闭包里 `app.manage(server_manager);`（Task 2 加的）之后加：

```rust
            server::start_background(app.handle());
```

- 文件尾部 `.run(tauri::generate_context!())`（lib.rs:99-100）改为：

```rust
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                server::shutdown(app);
            }
        });
```

说明：托盘 quit 走 `app.exit(0)`，同样触发 `RunEvent::Exit`，因此杀树统一在 Exit 钩子里做；`CloseRequested` 只是隐藏到托盘（现状不变），服务端持续运行。

- [ ] **Step 3: 编译 + 单测回归**

Run: `cd <worktree>/src-tauri && cargo check && cargo test server`
Expected: 编译通过，既有 4 测试仍 PASS。

- [ ] **Step 4: 手动冒烟（dev，无 staged 资源 → bundled=false 路径）**

Run: `cd <worktree> && npm run tauri dev`，在 webview devtools console 执行：

```js
await window.__TAURI_INTERNALS__.invoke('server_status')
```

Expected: `{ bundled: false, state: "unavailable", ... }`，应用行为与现状一致（无 spawn、无报错）。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/server.rs src-tauri/src/lib.rs
git commit -m "feat(desktop): 内置服务端 spawn、端口一次性探测、退出监控退避重拉、Exit 杀进程树"
```

---

### Task 4: seedclaw 前端 — 设置模型、local-server composable、路由接入

**Files:**
- Create: `src/composables/local-server.ts`
- Modify: `src/stores/setting.ts`（UiSettings 字段、默认值、迁移）
- Modify: `src/router/index.ts:100-117`（beforeEach 接入）

**Interfaces:**
- Consumes: Rust `server_status`/`server_restart`（Task 2）、`server://status` 事件、`isTauri`（`src/composables/notify-server-connection.ts:18` 已导出）。
- Produces（Task 5 依赖）:
  - `export interface ServerStatus { bundled: boolean; state: 'starting'|'running'|'restarting'|'failed'|'unavailable'; port: number|null; url: string|null; token: string|null; pid: number|null; lastError: string|null; dataDir: string|null }`
  - `export const localServer: ServerStatus & Record<string, unknown>`（reactive 对象，直接读字段）
  - `export function ensureLocalServerLoaded(): Promise<void>`（幂等，非 Tauri 立即 resolve）
  - `export function effectiveGatewayMode(): 'local' | 'remote'`
  - `export function restartLocalServer(): Promise<void>`
  - settings store 新字段：`gatewayMode: 'local' | 'remote'`、`remoteApiBaseUrl: string`、`remoteToken: string`

- [ ] **Step 1: settings store 字段与迁移**

`src/stores/setting.ts`：
1. `UiSettings` 接口（`token: string` 之后，setting.ts:16-17 附近）加：

```typescript
    gatewayMode: 'local' | 'remote'
    remoteApiBaseUrl: string
    remoteToken: string
```

2. `getDefaultSettings()`（setting.ts:229-266）`token: '',` 之后加：

```typescript
    gatewayMode: 'local',
    remoteApiBaseUrl: '',
    remoteToken: '',
```

3. `loadConfig()` 里（setting.ts:296-302，`const merged: UiSettings = {...}` 之前）加迁移——已有远程配置的老用户保持 remote，新用户默认 local：

```typescript
            // 迁移：老版本没有 gatewayMode；已配置远程地址的保持 remote 并保留原值，否则默认 local
            if (parsed.gatewayMode !== 'local' && parsed.gatewayMode !== 'remote') {
                parsed.gatewayMode = (typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim() !== '') ? 'remote' : 'local'
            }
            if (typeof parsed.remoteApiBaseUrl !== 'string') parsed.remoteApiBaseUrl = parsed.apiBaseUrl ?? ''
            if (typeof parsed.remoteToken !== 'string') parsed.remoteToken = parsed.token ?? ''
```

- [ ] **Step 2: 写 local-server composable**

新建 `src/composables/local-server.ts`：

```typescript
/**
 * 内置服务端（bundled seedagent）状态桥。
 * Rust 侧 server.rs 通过 server://status 事件推送，前端启动时 invoke server_status 拉取一次
 * （reload 后会错过早期事件，必须主动拉）。
 */
import { reactive } from 'vue'
import { useUiSettingsStore } from '../stores/setting'
import { isTauri } from './notify-server-connection'

export interface ServerStatus {
    bundled: boolean
    state: 'starting' | 'running' | 'restarting' | 'failed' | 'unavailable'
    port: number | null
    url: string | null
    token: string | null
    pid: number | null
    lastError: string | null
    dataDir: string | null
}

export const localServer: ServerStatus = reactive({
    bundled: false,
    state: 'unavailable',
    port: null,
    url: null,
    token: null,
    pid: null,
    lastError: null,
    dataDir: null,
})

/** 模式守卫：未打包服务端的构建（Android/Web/dev 未 staging）强制 remote。 */
export function effectiveGatewayMode(): 'local' | 'remote' {
    if (!localServer.bundled) return 'remote'
    const settings = useUiSettingsStore()
    return settings.gatewayMode === 'local' ? 'local' : 'remote'
}

/** local 模式下把 Rust 侧托管地址写进 settings（消费方 api-client/notify 等零改动）。 */
function syncSettings() {
    const settings = useUiSettingsStore()
    if (effectiveGatewayMode() !== 'local') return
    if (!localServer.url || !localServer.token) return
    if (settings.apiBaseUrl !== localServer.url || settings.token !== localServer.token) {
        settings.apiBaseUrl = localServer.url
        settings.token = localServer.token
        settings.persist()
    }
}

function applyStatus(s: Partial<ServerStatus>) {
    Object.assign(localServer, s)
    syncSettings()
}

let loaded = false
let loadPromise: Promise<void> | null = null

/** 幂等初始化：拉一次状态 + 订阅事件。非 Tauri 环境立即完成。 */
export function ensureLocalServerLoaded(): Promise<void> {
    if (loaded) return Promise.resolve()
    if (loadPromise) return loadPromise
    if (!isTauri) {
        loaded = true
        return Promise.resolve()
    }
    loadPromise = (async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core')
            const { listen } = await import('@tauri-apps/api/event')
            await listen<Partial<ServerStatus>>('server://status', (event) => {
                // Rust 侧字段是 snake_case（last_error/data_dir）
                const p = event.payload as any
                applyStatus({
                    bundled: p.bundled,
                    state: p.state,
                    port: p.port ?? null,
                    url: p.url ?? null,
                    token: p.token ?? null,
                    pid: p.pid ?? null,
                    lastError: p.last_error ?? p.lastError ?? null,
                    dataDir: p.data_dir ?? null,
                })
            })
            const initial = await invoke<any>('server_status')
            applyStatus({
                bundled: initial.bundled,
                state: initial.state,
                port: initial.port ?? null,
                url: initial.url ?? null,
                token: initial.token ?? null,
                pid: initial.pid ?? null,
                lastError: initial.last_error ?? null,
                dataDir: initial.data_dir ?? null,
            })
            loaded = true
        } catch (e) {
            console.error('[local-server] failed to load status:', e)
            loaded = true
        }
    })()
    return loadPromise
}

export async function restartLocalServer(): Promise<void> {
    if (!isTauri) return
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('server_restart')
}
```

- [ ] **Step 3: 路由守卫接入**

`src/router/index.ts` 的 `router.beforeEach`（index.ts:101）闭体开头加：

```typescript
    await ensureLocalServerLoaded()
```

文件顶部加 `import { ensureLocalServerLoaded, effectiveGatewayMode } from '../composables/local-server'`。

`requiresConfig` 分支（index.ts:105-108）改为（local 模式视为已配置，跳过设置向导）：

```typescript
    if (to.meta.requiresConfig && !configStore.isConfigured) {
        if (effectiveGatewayMode() !== 'local') {
            next({ name: 'setup' })
            return
        }
    }
```

- [ ] **Step 4: 类型检查 + 手动冒烟**

Run: `cd <worktree> && npm run tcs`
Expected: 无错误。

Run: `npm run tauri dev`（此时未 staging，bundled=false）
Expected:
- 新用户：`localStorage` 的 config 里 `gatewayMode` 为 `"local"`（默认值），但因 bundled=false 守卫回落 remote → 首次进入仍跳 `/setup`，行为同现状；
- 老用户（localStorage 已有 apiBaseUrl）：config 里 `gatewayMode` 迁移为 `"remote"`，`remoteApiBaseUrl` 保留原值，使用不受影响。

- [ ] **Step 5: Commit**

```bash
git add src/composables/local-server.ts src/stores/setting.ts src/router/index.ts
git commit -m "feat(ui): gatewayMode 设置模型迁移、local-server 状态桥与路由守卫接入"
```

---

### Task 5: seedclaw 前端 — 连接设置下拉与本地状态 UI + i18n

**Files:**
- Modify: `src/views/SettingsView.vue`（editForm、openConnectionModal、saveConnection、连接弹窗模板 379-408）
- Modify: `src/i18n/zh.ts`、`src/i18n/en.ts`（settings 段，约 752 行附近）

**Interfaces:**
- Consumes: Task 4 的 `localServer`/`effectiveGatewayMode`/`restartLocalServer`、settings 新字段。
- Produces: 最终用户 UI——「本地服务/远程服务器」下拉（仅 bundled 可选本地）、本地只读展示 + 状态行 + 重启按钮。

- [ ] **Step 1: i18n 文案**

`src/i18n/zh.ts` settings 段（`gatewayUrlPlaceholder` 同级）加：

```typescript
        gatewayMode: '网关模式',
        gatewayModeLocal: '本地服务',
        gatewayModeRemote: '远程服务器',
        localServerStarting: '服务启动中…',
        localServerRunning: '运行中',
        localServerRestarting: '重启中…',
        localServerFailed: '启动失败',
        localServerUnavailable: '此构建未内置服务端',
        restartServer: '重启服务',
        localServerManagedHint: '本地服务由应用自动管理，地址与令牌不可修改',
        localServerLogHint: '日志目录',
        copyLogPath: '复制日志路径',
```

`src/i18n/en.ts` 对应加：

```typescript
        gatewayMode: 'Gateway mode',
        gatewayModeLocal: 'Local server',
        gatewayModeRemote: 'Remote server',
        localServerStarting: 'Starting…',
        localServerRunning: 'Running',
        localServerRestarting: 'Restarting…',
        localServerFailed: 'Failed to start',
        localServerUnavailable: 'No bundled server in this build',
        restartServer: 'Restart server',
        localServerManagedHint: 'The local server is managed by the app; URL and token are read-only',
        localServerLogHint: 'Log directory',
        copyLogPath: 'Copy log path',
```

- [ ] **Step 2: SettingsView 脚本改造**

`src/views/SettingsView.vue` script 部分：

1. 顶部 import 加：

```typescript
import { localServer, effectiveGatewayMode, restartLocalServer } from '../composables/local-server'
import { useUiSettingsStore } from '../stores/setting'
```

（`useUiSettingsStore` 若已 import 则跳过；`configStore` 即其实例。）

2. `editForm` 初始对象（SettingsView.vue:30-50 附近，含 `apiBaseUrl: ''`）加字段：

```typescript
        gatewayMode: 'remote' as 'local' | 'remote',
```

3. `openConnectionModal`（SettingsView.vue:67-75）改为：

```typescript
const openConnectionModal = () => {
    const mode = effectiveGatewayMode()
    editForm.value = {
        ...editForm.value,
        gatewayMode: mode,
        apiBaseUrl: mode === 'remote' ? configStore.remoteApiBaseUrl : (localServer.url ?? ''),
        token: mode === 'remote' ? configStore.remoteToken : (localServer.token ?? ''),
    }
    const modal = document.getElementById('basic_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}
```

4. `saveConnection`（SettingsView.vue:97-105）改为：

```typescript
const saveConnection = () => {
    const mode = editForm.value.gatewayMode
    if (mode === 'local') {
        configStore.save({ gatewayMode: 'local' })
    } else {
        configStore.save({
            gatewayMode: 'remote',
            remoteApiBaseUrl: editForm.value.apiBaseUrl.trim(),
            remoteToken: editForm.value.token,
            apiBaseUrl: editForm.value.apiBaseUrl.trim(),
            token: editForm.value.token,
        })
    }
    if (window.location.protocol !== 'file:') {
        window.location.reload()
    }
}
```

说明：切到 local 时 `apiBaseUrl/token` 不在此写——由 `local-server.ts` 的 `syncSettings()` 在状态到达后写入（reload 后初始化时执行），避免把启动中的空值固化。

5. 加状态展示辅助（script 任意合适位置）：

```typescript
const localStateText = () => {
    switch (localServer.state) {
        case 'running': return `${t('settings.localServerRunning')} · ${localServer.url ?? ''}`
        case 'starting': return t('settings.localServerStarting')
        case 'restarting': return t('settings.localServerRestarting')
        case 'failed': return `${t('settings.localServerFailed')}${localServer.lastError ? `：${localServer.lastError}` : ''}`
        default: return t('settings.localServerUnavailable')
    }
}
const onRestartServer = () => { restartLocalServer() }
const onCopyLogPath = () => {
    const dir = localServer.dataDir ? `${localServer.dataDir}\\logs` : '~/.seedagent/logs'
    navigator.clipboard.writeText(dir)
}
```

- [ ] **Step 3: 连接弹窗模板改造**

`basic_settings_modal`（SettingsView.vue:379-408）中 `<div class="form-control w-full space-y-4">` 内、网关 URL 输入框之前加模式下拉：

```html
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.gatewayMode') }}</span>
                    </label>
                    <select v-model="editForm.gatewayMode" class="select select-bordered w-full">
                        <option v-if="localServer.bundled" value="local">{{ $t('settings.gatewayModeLocal') }}</option>
                        <option value="remote">{{ $t('settings.gatewayModeRemote') }}</option>
                    </select>
                </div>
```

URL 与 token 两个 `input` 加 `:disabled="editForm.gatewayMode === 'local'"`；URL 输入框所在 div 之后插入状态行：

```html
                <div v-if="editForm.gatewayMode === 'local'" class="text-sm space-y-2">
                    <p class="text-base-content/70">
                        {{ localStateText() }}
                        <span v-if="localServer.bundled" class="block text-xs text-base-content/50 mt-1">
                            {{ $t('settings.localServerManagedHint') }}
                        </span>
                    </p>
                    <p class="text-xs text-base-content/50 flex items-center gap-2">
                        <span>{{ $t('settings.localServerLogHint') }}: {{ localServer.dataDir ? localServer.dataDir + '\\logs' : '~/.seedagent/logs' }}</span>
                        <button class="btn btn-ghost btn-xs" @click="onCopyLogPath">{{ $t('settings.copyLogPath') }}</button>
                    </p>
                    <button v-if="localServer.state === 'failed' || localServer.state === 'running'"
                        class="btn btn-outline btn-sm" @click="onRestartServer">
                        {{ $t('settings.restartServer') }}
                    </button>
                </div>
```

- [ ] **Step 4: 类型检查 + 手动验证**

Run: `npm run tcs`，Expected: 无错误。
Run: `npm run tauri dev`（未 staging）→ 设置 → 连接：下拉只有「远程服务器」，表单可编辑，保存后 reload 行为同现状。

- [ ] **Step 5: Commit**

```bash
git add src/views/SettingsView.vue src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat(ui): 网关设置本地/远程下拉，本地模式只读托管展示与重启入口"
```

---

### Task 6: 打包脚本 + tauri.conf resources + staging

**Files:**
- Create: `scripts/package-desktop.ps1`
- Modify: `src-tauri/tauri.conf.json`（bundle 段）
- Modify: `.gitignore`

**Interfaces:**
- Consumes: seedagent 构建产物（`dist/`、`package.json`）；本机或 nodejs.org 的 node.exe。
- Produces: `src-tauri/resources/seedagent/{node.exe, package.json, dist/, node_modules/}`（gitignore）；`dist-windows/` 下 NSIS 安装包 + 便携版 zip。

- [ ] **Step 1: tauri.conf.json 与 .gitignore**

`src-tauri/tauri.conf.json` 的 `"bundle"` 段改为：

```json
    "bundle": {
        "active": true,
        "targets": "all",
        "resources": ["resources/seedagent/**"],
        "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
    }
```

（icon 数组以文件现状为准，勿改动现有值；只新增 `resources` 一行。）

`.gitignore` 末尾加：

```
src-tauri/resources/
```

- [ ] **Step 2: 写打包脚本**

新建 `scripts/package-desktop.ps1`：

```powershell
#Requires -Version 5.1
<#
桌面打包：构建 seedagent → 采集 Node 23 运行时 → staging 到 src-tauri/resources/seedagent → tauri build
用法：
  powershell -File scripts/package-desktop.ps1                      # 完整打包（staging + build + 收集）
  powershell -File scripts/package-desktop.ps1 -StageOnly           # 只 staging（供 tauri dev 联调内置服务）
  powershell -File scripts/package-desktop.ps1 -SkipStage           # 复用已有 staging，直接 build
  powershell -File scripts/package-desktop.ps1 -RebuildServer       # 强制重跑 seedagent 构建
#>
param(
    [string]$SeedagentDir = $(if ($env:SEEDAGENT_DIR) { $env:SEEDAGENT_DIR } else { "D:\Workspace\seedagent" }),
    [string]$NodeVersion = "23.11.0",
    [switch]$StageOnly,
    [switch]$SkipStage,
    [switch]$RebuildServer
)
$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot | Split-Path
$staging = Join-Path $root 'src-tauri\resources\seedagent'
$cache = Join-Path $PSScriptRoot '.cache'

function Assert-Staging([string]$Dir) {
    foreach ($p in @('node.exe', 'dist\index.js', 'node_modules')) {
        if (-not (Test-Path (Join-Path $Dir $p))) { throw "staging incomplete at ${Dir}: missing $p" }
    }
}

if ($SkipStage) {
    Write-Host "==> -SkipStage: reuse staging at $staging"
    Assert-Staging $staging
}
else {
    Write-Host "==> seedagent: $SeedagentDir"
    if (-not (Test-Path (Join-Path $SeedagentDir 'package.json'))) {
        throw "seedagent not found at $SeedagentDir (use -SeedagentDir or env SEEDAGENT_DIR)"
    }

    # 1. 构建 seedagent（dist 缺失或 -RebuildServer 时）
    $distIndex = Join-Path $SeedagentDir 'dist\index.js'
    if ($RebuildServer -or -not (Test-Path $distIndex)) {
        Write-Host "==> building seedagent"
        Push-Location $SeedagentDir
        try {
            if (-not (Test-Path (Join-Path $SeedagentDir 'node_modules'))) { npm ci }
            npm run build
            if ($LASTEXITCODE -ne 0) { throw "seedagent build failed" }
        } finally { Pop-Location }
    } else {
        Write-Host "==> seedagent dist up-to-date (skip build; use -RebuildServer to force)"
    }

    # 2. 采集 node.exe：本机版本匹配则直接拷，否则下载 pinned 版本
    function Get-LocalNodePath([string]$WantVersion) {
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCmd) { return $null }
        $v = (& node -v) 2>$null
        if ($v -eq "v$WantVersion") { return $nodeCmd.Source }
        return $null
    }
    $nodeExe = Get-LocalNodePath $NodeVersion
    if (-not $nodeExe) {
        $cached = Join-Path $cache "node-v$NodeVersion.exe"
        if (-not (Test-Path $cached)) {
            New-Item -ItemType Directory -Force -Path $cache | Out-Null
            $url = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"
            Write-Host "==> downloading $url"
            Invoke-WebRequest -Uri $url -OutFile $cached
        }
        $nodeExe = $cached
    }

    # 3. staging（不在 seedagent 仓库里 prune，staging 目录内独立 npm ci --omit=dev）
    Write-Host "==> staging into $staging"
    if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null

    Copy-Item (Join-Path $SeedagentDir 'dist') (Join-Path $staging 'dist') -Recurse
    Copy-Item (Join-Path $SeedagentDir 'package.json') (Join-Path $staging 'package.json')
    Copy-Item (Join-Path $SeedagentDir 'package-lock.json') (Join-Path $staging 'package-lock.json')
    Copy-Item $nodeExe (Join-Path $staging 'node.exe')

    Write-Host "==> npm ci --omit=dev (production node_modules in staging)"
    Push-Location $staging
    try {
        npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { throw "npm ci --omit=dev failed" }
    } finally { Pop-Location }

    # 4. 校验 staging
    Assert-Staging $staging
    Write-Host "==> staging OK: $staging"
}

if ($StageOnly) {
    Write-Host "==> -StageOnly: done. Run 'npm run tauri dev' to test the bundled server."
    exit 0
}

# 5. tauri build（仅桌面）
Write-Host "==> npm run tauri build"
Push-Location $root
try {
    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "tauri build failed" }
} finally { Pop-Location }

# 6. 收集产物：NSIS/MSI + 便携版（裸 exe + resources 目录，resource_dir 按 exe 同目录解析）
$outDir = Join-Path $root 'dist-windows'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle'
Get-ChildItem "$bundleDir\nsis\*.exe", "$bundleDir\msi\*.msi" -ErrorAction SilentlyContinue |
    ForEach-Object { Copy-Item $_.FullName $outDir -Force; Write-Host "==> collected $($_.Name)" }

$portable = Join-Path $outDir 'portable'
if (Test-Path $portable) { Remove-Item -Recurse -Force $portable }
New-Item -ItemType Directory -Force -Path $portable | Out-Null
Copy-Item (Join-Path $root 'src-tauri\target\release\seedclaw.exe') $portable
Copy-Item (Join-Path $root 'src-tauri\resources') (Join-Path $portable 'resources') -Recurse
Compress-Archive -Path (Join-Path $portable '*') -DestinationPath (Join-Path $outDir 'seedclaw-portable-windows.zip') -Force
Remove-Item -Recurse -Force $portable
Write-Host "==> portable zip: dist-windows\seedclaw-portable-windows.zip"
Write-Host "==> done. Artifacts in $outDir"
```

- [ ] **Step 3: 跑 StageOnly 验证 staging**

Run: `powershell -ExecutionPolicy Bypass -File scripts/package-desktop.ps1 -StageOnly`
Expected: 输出 `staging OK`；`src-tauri/resources/seedagent/` 下有 node.exe、dist/index.js、node_modules。

- [ ] **Step 4: dev 冒烟（bundled=true 路径）**

Run: `npm run tauri dev`
Expected（依次核对）：
- Rust 日志无 panic；`~/.seedagent/desktop.json` 生成且含 uuid；
- `~/.seedagent/logs/desktop-stdout.log` 出现 seedagent 启动日志（端口 18789 或候选）；
- devtools `invoke('server_status')` 返回 `{ bundled: true, state: "running", ... }`；
- 设置 → 连接：下拉出现「本地服务」，选中后表单只读并显示 `运行中 · http://127.0.0.1:18789`，保存 reload 后直接进入主界面且数据可用（会话列表能拉到）。
- 退出 dev（Ctrl+C 或关窗口杀掉 tauri 进程树）：`tasklist | findstr node` 确认无残留 node.exe（dev 下 Ctrl+C 不触发 RunEvent::Exit 属已知限制，若有残留手动 taskkill；记录到验收清单）。

- [ ] **Step 5: Commit**

```bash
git add scripts/package-desktop.ps1 src-tauri/tauri.conf.json .gitignore
git commit -m "build(desktop): package-desktop 打包脚本——seedagent 构建+Node 采集+staging+tauri build"
```

---

### Task 7: 完整打包 + 端到端验收清单

**Files:** 无新文件（验收任务，产出验收记录到 PR 描述或提交信息）。

**Interfaces:**
- Consumes: Task 1~6 全部产出（seedagent env-loader 改动 + seedclaw worktree 全部提交）。
- Produces: 验收通过的安装包（dist-windows/）+ 手动清单勾选记录。

- [ ] **Step 1: 完整打包**

Run: `powershell -ExecutionPolicy Bypass -File scripts/package-desktop.ps1 -RebuildServer`
Expected: `dist-windows/` 出现 NSIS exe（体积明显增大，含 node_modules）。

- [ ] **Step 2: 安装并逐项验收（对照 spec §9）**

安装 NSIS 包（或解包便携目录），逐项核对：

1. 首次启动：托盘图标出现；`~/.seedagent/desktop.json` 生成；设置 → 连接显示「本地服务 · 运行中 · 127.0.0.1:18789」；主界面会话列表可用（连接自动建立）。
2. 二次启动：desktop.json token 复用；若上次异常退出，孤儿实例被探测复用（状态 running、pid 为空）。
3. 崩溃重拉：`taskkill /PID <node pid> /F`（pid 从 server_status 拿）→ 数秒内状态回到 running。
4. 退出杀树：托盘 Quit → `tasklist | findstr node` 无残留；确认 subagent 子进程同样被清（可先发起一个长任务再退出）。
5. 本地↔远程切换：设置切「远程」填外部地址保存 reload → 连外部；切回「本地」保存 reload → 自动回到内置实例。
6. 重启服务按钮：running 状态点击 → 状态短暂 restarting 后 running；failed 状态（临时改名 resources 里 node.exe 模拟）点击 → 恢复 running。
7. 升级：重跑打包脚本重装（或覆盖安装）→ `~/.seedagent` 数据与 token 不丢。
8. 老用户迁移：用旧版 localStorage（有 apiBaseUrl）启动 → gatewayMode 迁移为 remote，行为不变。

- [ ] **Step 3: 收尾提交（如有小修）+ 汇报**

修复验收中发现的问题（各自独立提交）；全部通过后在 worktree 汇总：
```bash
git log --oneline master..feat/bundled-server
```
将清单结果与分支提交列表汇报给用户，等待合并决定（用 superpowers:finishing-a-development-branch）。

---

## 执行注意（给执行者）

- seedclaw 全程在 worktree（superpowers:using-git-worktrees 创建 `feat/bundled-server`）；**不要**在主工作区操作。
- seedagent 只改 Task 1 一个文件 + 测试，在 `feat/desktop-env-loader` 分支；两个仓库的提交分开，勿混。
- **staging 时序**：Task 3/4/5 的 dev 冒烟依赖"未 staging"状态（`src-tauri/resources/` 不存在 → bundled=false），因此**不要**提前执行 Task 6 的 staging；到 Task 6 才运行 `package-desktop.ps1 -StageOnly`。
- Task 3/6 依赖本机装有 Node 23 与可用网络（下载 node.exe）；无网络时本机 node -v 必须匹配 `23.11.0`，否则用 `-NodeVersion` 指向本机实际版本。
- 前端无单测基建，验证靠 `npm run tcs` + dev 冒烟；Rust 靠 `cargo test` + dev 冒烟；seedagent 靠 vitest。
- Tauri resources 在安装包内的落点路径（`<install>/resources/seedagent/`）由 Task 6 Step 4 与 Task 7 Step 2 的运行时冒烟验证兜底；若实际落点不同，只需调整 `resolve_server_dir` 的候选列表。
