# 桌面端内置 seedagent 服务端 — 设计文档

- 日期：2026-09-06
- 状态：待评审
- 仓库：seedclaw（桌面端），联动 seedagent（服务端，路径默认 `D:\Workspace\seedagent`，可用环境变量覆盖）

## 1. 背景与目标

SeedClaw 是 Tauri 2 桌面应用，目前 seedagent 服务端是外部独立进程，用户需手动部署并手填 `apiBaseUrl` + token。目标是：

1. 新增桌面打包脚本（`scripts/`），把 seedagent 服务端连同 Node 运行时一起打进安装包。
2. 桌面端启动时由 Rust 侧自动拉起内置服务端，健康检查通过后前端自动连接。
3. 前端网关设置改为「本地 / 远程」下拉：本地模式地址与 token 只读、由应用托管；远程模式保持现有手填行为。

## 2. 范围

**目标：**
- 平台：Windows 先行（NSIS 安装包 + 便携版），staging 脚本结构上预留 macOS/Linux（Node runtime 按目标三元组采集）。
- 打包对象仅桌面端，不涉及 Android / Web。

**非目标（后续扩展）：**
- CI（`ci.yml` / `release.yml`）三平台出带服务端的包。
- 把 seedagent 编译成单可执行文件（bun compile / yao-pkg / Node SEA）。

## 3. 方案选型

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 随包分发 Node 运行时 + 服务端文件 | `node.exe`（锁定 23.x）+ `dist/` + 生产裁剪后的 `node_modules/` 作为 Tauri resources；启动时子进程 spawn | **采用**。原生 `.node` 模块天然可跑，seedagent 几乎零改动，VS Code 同款路线 |
| B. 编译成单可执行文件 | SEA / pkg / bun compile | 否决。seedagent 运行时动态加载 skills/extensions + ESM + 原生模块 + Node 23 ABI 锁定，快照打包极易踩坑 |
| C. 要求用户自备 Node / 连远程 | 不打包 | 不符合需求 |

代价：安装包增重约 100~200MB（node.exe 压缩后约 30MB + 裁剪后 node_modules）。

## 4. 打包流程（seedclaw 侧新增）

### 4.1 `scripts/package-desktop.ps1`（一键入口）

参数：`-SeedagentDir`（默认 `D:\Workspace\seedagent` 或环境变量 `SEEDAGENT_DIR`）、`-SkipStage`、`-StageOnly`（只做 staging，供 `tauri dev` 联调用）。

步骤：
1. **构建 seedagent**：在其目录执行 `npm ci` → `npm run build`（vendor skills → tsc → 复制资产）→ `npm prune --omit=dev` 得到生产 node_modules。
2. **采集 Node 23 运行时**：本机 `node -v` 匹配 `23.x` 则直接拷贝 `node.exe`；否则从 nodejs.org 下载固定版本（如 `v23.11.0` win-x64 zip，pinned 在脚本常量）到 `scripts/.cache/`，校验后取 `node.exe`。
3. **staging 到 `src-tauri/resources/seedagent/`**：
   ```
   src-tauri/resources/seedagent/
     node.exe
     package.json          # 生产依赖清单（npm prune 后的）
     dist/                 # 编译产物 + md/skills 资产
     node_modules/         # 仅生产依赖
   ```
   该目录加入 `.gitignore`；不存在时其他构建（Android/Web/CI）不受影响。
4. `npm run tauri build`（桌面目标），从 `src-tauri/target/release/bundle/` 收集 NSIS / 便携版产物到 `dist-windows/`。

### 4.2 `tauri.conf.json` 变更

`bundle.resources` 增加 `"resources/seedagent/**"`。不使用 `externalBin`/sidecar 机制——服务端是目录而非单文件，直接 resources + 自管子进程更灵活。

## 5. 运行时（Rust 侧新增 `src-tauri/src/server.rs`）

### 5.1 启动序列

1. 应用启动（已有 `tauri-plugin-single-instance`，天然防双实例双服务）。
2. 解析数据目录 `~/.seedagent`（全平台统一；Windows 为 `%USERPROFILE%\.seedagent`），确保目录存在。
3. 读取/生成 `~/.seedagent/desktop.json`：`{ bearerToken: uuid-v4, lastPort: number }`。token 首次生成后固定复用。
4. 选端口：优先尝试 `lastPort`（初始 18789）。端口探测用 seedagent 现有端点：
   - `GET /api/health` 带 token 返回 200 → 是自己残留的旧实例（同 token），**直接复用**，不重复 spawn；
   - `GET /`（无鉴权存活探针）有响应但 `/api/health` 带 token 返回 401 → 端口上是别人的服务，换下一个候选（18789 起递增，最多 10 个：18789~18798）；
   - 连接被拒 → 端口空闲，选用；全部被占 → 状态置 `failed` 并给出明确错误。
5. spawn `node.exe dist/index.js`，参数：`--port <port> --data-dir <DATA_DIR> --bearer-token <token>`；Windows 加 `CREATE_NO_WINDOW`；`NODE_ENV=production`；stdout/stderr 重定向追加到 `~/.seedagent/logs/desktop-stdout.log`（按启动截断）。
6. 健康检查：每 500ms 轮询 `GET /`（seedagent 的无鉴权存活探针，`src/index.ts:116`），HTTP 200 即视为进程已监听；再以 `GET /api/health` 带 token 确认身份。30s 超时 → 状态置 `failed`，保留日志路径供前端展示。
7. 就绪后 emit `server://status`，前端据此连接。

### 5.2 生命周期

- **退出**：托盘退出 / 窗口销毁时 `taskkill /PID <pid> /T /F` 杀进程树（seedagent 会派生 subagent 子进程，必须杀树）。
- **崩溃**：退出码非 0 且非用户主动停止 → 指数退避自动重启（1s 起、上限 15s）；连续 5 次失败停止重启，状态置 `failed`。
- **重启命令**：`server_restart` invoke，杀树 → 回到步骤 4。

### 5.3 对前端的接口

- invoke：`server_status` → `{ state: starting|running|failed|unavailable, port, url, token, pid, lastError }`（`unavailable` = resources 缺失，如 dev 构建或非打包形态）；`server_restart`。
- 事件：`server://status`，状态变化即推。

## 6. seedagent 侧小改动（约 20 行）

`src/index.ts` 增加命令行参数解析：`--port`、`--data-dir`、`--bearer-token`，优先级最高。

原因：env-loader 使用 `dotenv.config({ override: true })` 且按序后加载覆盖先加载（`~/deploy/.env`、`~/.seedagent/.env`、`~/.env` 都可能覆盖进程环境变量），单纯 spawn 时注入 `PORT`/`BEARER_TOKEN` 会被用户机器上的历史 `.env` 覆盖，导致服务监听端口与桌面端预期不一致。CLI 参数不受 dotenv 影响，是唯一可靠的注入通道。

## 7. 前端改动（seedclaw）

### 7.1 设置模型（`src/stores/setting.ts`）

- `UiSettings` 新增：`gatewayMode: 'local' | 'remote'`、`remoteApiBaseUrl: string`、`remoteToken: string`。
- 迁移：已有 `apiBaseUrl` 非空 → `remote`（原值挪入 `remoteApiBaseUrl`/`remoteToken`）；为空 → `local`。
- `apiBaseUrl`/`token` 保持现有字段语义不变（消费方 `api-client.ts`、`notify-client.ts`、SSE 等零改动）：
  - `remote` 模式 = 用户手填值（编辑 `remoteApiBaseUrl`，保存时同步到 `apiBaseUrl`）；
  - `local` 模式 = 由 `server://status` 事件写入的运行时值（url = `http://127.0.0.1:<port>`，token = desktop.json 中的 uuid）。

### 7.2 连接设置 UI（`SettingsView.vue` 连接弹窗）

- 顶部下拉：「本地服务 / 远程服务器」。
- **本地**：URL 与 token 输入框 disabled，下方状态行展示 `运行中 · 127.0.0.1:<port>` / `启动中…` / `失败：<原因>`（附「重启服务」「查看日志」按钮，日志路径 `~/.seedagent/logs/`）。
- **远程**：现有手填表单，值读写 `remoteApiBaseUrl`/`remoteToken`。
- 保存：沿用现状 `saveConnection()` 后 `window.location.reload()` 的机制（见 §7.4）。

### 7.3 启动流程

- App 挂载时（Tauri 环境）invoke `server_status` **拉取**一次当前状态——不能只依赖事件，`reload()` 后会错过启动早期的事件；此后以 `server://status` 事件增量更新。
- `local` 模式下，状态到达 `running` 前连接相关 UI 显示「服务启动中」，避免旧 token/url 请求报错刷屏。
- `SetupView`（首次设置向导）：Tauri 桌面端默认 `gatewayMode = 'local'` 直接进入主界面；Web 版保持现状。

### 7.4 关于「保存后是否刷新」

现状事实（已核对代码）：
- 设置持久化在 localStorage（Pinia `save()` 即写），REST 客户端 `api-client.ts` **每次请求实时读取** store，改完不刷新 REST 也生效；
- 但 WS 通知连接（`notify-server-connection.ts` → Rust `notify_connect`）和 SSE 在**建立时固化** url/token，不监听 store 变化；
- 所以现有代码在 `SettingsView.saveConnection()` 里保存后直接 `window.location.reload()` 整页重建所有连接。

本设计**沿用该机制**：模式下拉切换保存后同样 reload 一次；`local` 模式 reload 后靠 §7.3 的主动拉取拿到服务端状态，不存在时序问题。

## 8. 错误与边界

| 场景 | 处理 |
|---|---|
| 端口被占 | §5.1 步骤 4 的探测/复用/换端口逻辑 |
| 残留旧实例（升级后重启应用） | 同 token 探测命中 → 复用；`server_restart` 或退出时统一杀树 |
| MSI 装进 Program Files（只读） | 服务端代码从只读 resources 目录运行，可变数据全在 `~/.seedagent`，不写安装目录 |
| 升级 | 重装覆盖 resources；`~/.seedagent` 数据与 token 不动 |
| resources 缺失（`tauri dev` / 未 staging 的构建） | 状态 `unavailable`，前端提示并可切 `remote` 模式；dev 联调可先跑 `package-desktop.ps1 -StageOnly` |
| 用户另有手动部署的 seedagent | 内置实例独立端口 + 独立 token（desktop.json），互不干扰；手动部署的 `.env`/数据不受影响 |
| Node ABI | node_modules 原生模块锁 Node 23，staging 时校验 runtime 大版本，不符即报错 |

## 9. 测试计划

- **脚本**：模拟无本机 Node 环境（改 PATH）验证下载路径；`-StageOnly` 产物完整性（node.exe 可执行、dist/index.js 存在、node_modules 无 devDependencies 大件）。
- **Rust 单元测试**（`cargo test`）：端口选择状态机、desktop.json 读写与 token 持久化。
- **手动集成清单**：首次启动（自动生成 token/选端口/健康检查/前端自动连接）；二次启动复用；服务端崩溃自动重启；退出杀进程树（含 subagent 子进程）；本地↔远程切换 + reload；`-StageOnly` + `tauri dev` 联调；重装升级数据保留。
- **seedagent**：`--port/--data-dir/--bearer-token` 参数的 vitest 用例（覆盖 `.env` 冲突场景：参数值必须赢）。

## 10. 后续扩展（不在本期）

1. CI：`publish-desktop` / `release` workflow 增加 seedagent checkout（pinned ref）+ staging 步骤，三平台矩阵出完整包。
2. macOS / Linux：staging 脚本跨平台化（Node runtime 按目标三元组下载），Rust 侧平台分支（进程树终止用进程组）。
3. 方案 B（单可执行文件）作为体积优化实验。
