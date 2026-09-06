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

1. 应用启动（已有 `tauri-plugin-single-instance`，天然防双实例双服务）。首先检测 resources/seedagent 是否存在，得到 `bundled`；`bundled=false` 则后续步骤全部跳过（不建目录、不 spawn），只对 `server_status` 查询返回 `{ bundled: false, state: 'unavailable' }`。
2. `bundled=true` 时：解析数据目录 `~/.seedagent`（全平台统一；Windows 为 `%USERPROFILE%\.seedagent`），确保目录存在。
3. 读取/生成 `~/.seedagent/desktop.json`：`{ bearerToken: uuid-v4 }`，token 首次生成后固定复用。token 不写入 `.env`——`~/.seedagent/.env` 是用户手写 API key 的地方，桌面端只读不写，避免与用户手动部署的 `BEARER_TOKEN` 打架。
4. 选端口：候选顺序 = `~/.seedagent/.env` 中的 `PORT`（若用户显式指定，尊重其意向）→ 18789~18798。端口探测用 seedagent 现有端点（一次性探测，非轮询）：
   - `GET /api/health` 带 token 返回 200 → 是自己残留的旧实例（同 token），**直接复用**，不重复 spawn；
   - `GET /`（无鉴权存活探针）有响应但 `/api/health` 带 token 返回 401 → 端口上是别人的服务，换下一个候选；
   - 连接被拒 → 端口空闲，选用；全部被占 → 状态置 `failed` 并给出明确错误。
5. spawn `node.exe dist/index.js`，以**进程环境变量**注入 `PORT` / `BEARER_TOKEN` / `DATA_DIR`（配合 §6 的 env-loader 语义修正，优先级最高，不被任何 `.env` 覆盖）；cwd = resources/seedagent；Windows 加 `CREATE_NO_WINDOW`；`NODE_ENV=production`；stdout/stderr 重定向追加到 `~/.seedagent/logs/desktop-stdout.log`（按启动截断）。
6. spawn 成功 → 状态置 `running`（进程存活语义），emit `server://status`。前端拿到 url/token 即配置连接，服务端 1~3 秒的启动窗口由既有机制消化：WS 通知连接本就有 1s→15s 指数退避重连（`notify.rs`），REST 请求失败有 toast + 调用方重试。**不做 HTTP 健康检查轮询。**
7. 子进程退出监控（非 HTTP）：Rust 持有 child 句柄，独立线程阻塞 `wait`；进程退出且非用户主动停止 → 指数退避自动重启（1s 起、上限 15s）；连续 5 次快速退出 → 停止重启，状态置 `failed`，记录退出码与日志路径。

### 5.2 生命周期

- **退出**：托盘退出 / 窗口销毁时 `taskkill /PID <pid> /T /F` 杀进程树（seedagent 会派生 subagent 子进程，必须杀树）。
- **崩溃**：由子进程退出监控触发（见 §5.1 步骤 7），与 HTTP 无关。
- **重启命令**：`server_restart` invoke，杀树 → 回到步骤 4。

### 5.3 对前端的接口

- invoke：`server_status` → `{ bundled: boolean, state, port, url, token, pid, lastError, dataDir }`（`dataDir` = `~/.seedagent` 绝对路径，供前端展示/复制日志路径）。`bundled` = resources/seedagent 是否存在（启动时检测一次）；`bundled=false` 时不做任何 spawn、state 恒为 `unavailable`——Android、未 staging 的 dev 构建、Web 版都属此类（同一 Rust 代码在 Android 上编译，资源目录里没有 seedagent，自然返回 false，不 panic、不报错）。`server_restart` 仅 `bundled=true` 时有意义。
- 事件：`server://status`，状态变化即推。

## 6. seedagent 侧改动（env-loader，约 15 行）

替代原「CLI 参数」方案，改 `src/config/env-loader.ts` 两处：

1. **删除搜索路径** `~/deploy/.env(.local)` 与 `~/.env(.local)`——手动部署时代的遗留路径。保留项目目录、cwd 与 `~/.seedagent/.env(.local)`（后者是用户配置位，也是桌面端读取 PORT 意向的位置）。
2. **修正覆盖语义**：现状 `dotenv.config({ override: true })` 逐个加载，后文件覆盖前文件**且覆盖已存在的进程环境变量**——这是注入不可靠的根因。改为：所有文件先按序解析合并（文件之间 later-wins 语义不变），再**只填充进程环境中尚未设置的键**。进程环境变量（桌面端 spawn 注入、Docker `ENV`、systemd `Environment=`）优先级最高。

选此而非 CLI 参数的原因：改动更小、修的是根因（`.env` 本不应覆盖进程环境变量）；`~/.seedagent/.env` 保持为用户手写配置的唯一入口，桌面端只读它的 `PORT`、不写它。

回归核对（实现时确认）：HF Space Docker 镜像（容器内无上述 `.env` 文件，行为不变）与 systemd 部署（单元仅设少量环境变量，`.env` 填充未设置键的语义与现状等价）。

## 7. 前端改动（seedclaw）

### 7.1 设置模型（`src/stores/setting.ts`）

- `UiSettings` 新增：`gatewayMode: 'local' | 'remote'`、`remoteApiBaseUrl: string`、`remoteToken: string`。
- 迁移：已有 `apiBaseUrl` 非空 → `remote`（原值挪入 `remoteApiBaseUrl`/`remoteToken`）；为空 → `local`。
- **模式可用性守卫**：`effectiveMode = bundled && gatewayMode === 'local' ? 'local' : 'remote'`。`bundled=false`（Android / dev / Web）时强制 `remote` 且不可切 `local`；持久化的 `gatewayMode` 与实际能力不符时以守卫结果为准（不写回存储）。
- `apiBaseUrl`/`token` 保持现有字段语义不变（消费方 `api-client.ts`、`notify-client.ts`、SSE 等零改动）：
  - `remote` 模式 = 用户手填值（编辑 `remoteApiBaseUrl`，保存时同步到 `apiBaseUrl`）；
  - `local` 模式 = 由 `server://status` 事件写入的运行时值（url = `http://127.0.0.1:<port>`，token = desktop.json 中的 uuid）。

### 7.2 连接设置 UI（`SettingsView.vue` 连接弹窗）

- 顶部下拉：「本地服务 / 远程服务器」。**仅当 `bundled=true` 时可选「本地服务」**；`bundled=false`（Android / dev / Web）不显示本地选项，仅远程手填，与现状一致。`bundled` 在连接弹窗打开时从 `server_status` 已有的状态读取。
- **本地**：URL 与 token 输入框 disabled，下方状态行展示 `运行中 · 127.0.0.1:<port>` / `启动中…` / `失败：<原因>`（附「重启服务」按钮与「复制日志路径」按钮，日志在 `~/.seedagent/logs/`）。
- **远程**：现有手填表单，值读写 `remoteApiBaseUrl`/`remoteToken`。
- 保存：沿用现状 `saveConnection()` 后 `window.location.reload()` 的机制（见 §7.4）。

### 7.3 启动流程

- App 挂载时（Tauri 环境）invoke `server_status` **拉取**一次当前状态——不能只依赖事件，`reload()` 后会错过启动早期的事件；此后以 `server://status` 事件增量更新。
- `local` 模式下拿到 url/token 即配置连接，不做启动门控；启动窗口期的失败由既有 WS 退避重连与 REST 容错消化。若实际体验出现启动期错误 toast 刷屏，后续可加「stdout 监听 server-listening 日志行」作为零成本就绪信号（见 §10）。
- `SetupView`（首次设置向导）：Tauri 且 `bundled=true` → 默认 `gatewayMode = 'local'` 跳过向导直接进入主界面；`bundled=false`（Android）或 Web 版保持现状向导流程。

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
| resources 缺失（`tauri dev` / 未 staging 的构建） | `bundled=false`，网关强制 `remote` 模式、不显示本地选项；dev 联调可先跑 `package-desktop.ps1 -StageOnly` |
| Android / Web 构建 | 同上 `bundled=false`：不 spawn、不显示本地选项，行为与现状完全一致 |
| 用户另有手动部署的 seedagent | 内置实例独立端口 + 独立 token（desktop.json），互不干扰；手动部署的 `.env`/数据不受影响 |
| Node ABI | node_modules 原生模块锁 Node 23，staging 时校验 runtime 大版本，不符即报错 |

## 9. 测试计划

- **脚本**：模拟无本机 Node 环境（改 PATH）验证下载路径；`-StageOnly` 产物完整性（node.exe 可执行、dist/index.js 存在、node_modules 无 devDependencies 大件）。
- **Rust 单元测试**（`cargo test`）：端口选择状态机、desktop.json 读写与 token 持久化。
- **手动集成清单**：首次启动（自动生成 token/选端口/前端自动连接）；二次启动复用；服务端崩溃退出监控自动重启；退出杀进程树（含 subagent 子进程）；本地↔远程切换 + reload；`-StageOnly` + `tauri dev` 联调；重装升级数据保留。
- **seedagent**：env-loader 的 vitest 用例——文件之间 later-wins 保留；进程环境已存在的键（模拟桌面端 spawn 注入的 `PORT`）不被 `.env` 覆盖；被删除的搜索路径不再生效。

## 10. 后续扩展（不在本期）

1. CI：`publish-desktop` / `release` workflow 增加 seedagent checkout（pinned ref）+ staging 步骤，三平台矩阵出完整包。
2. macOS / Linux：staging 脚本跨平台化（Node runtime 按目标三元组下载），Rust 侧平台分支（进程树终止用进程组）。
3. 就绪信号优化（仅当启动期错误 toast 造成困扰时）：Rust 监听子进程 stdout 中 server 监听成功的日志行，作为事件式就绪信号，仍不做 HTTP 轮询。
4. 方案 B（单可执行文件）作为体积优化实验。
