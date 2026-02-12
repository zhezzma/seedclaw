# SeedClaw (OpenClaw Desktop)

SeedClaw 是 OpenClaw 的桌面端实现，基于 Tauri 构建，专为高性能、低延迟的本地 AI
智能体交互而设计。它结合了现代 Web 前端技术与
Rust后端能力，提供了一个安全、可扩展的智能体交互环境。

## 技术架构

本项目采用了经典的前后端分离架构，但在桌面端进行了深度集成：

- **前端 (Frontend)**: 基于 **Vue 3** + **TypeScript** + **Vite** 构建。
  - 负责用户界面渲染、交互逻辑以及与 WebSocket 网关的通信。
  - 使用了 Tailwind CSS 进行样式开发，Heroicons 作为图标库。
  - 集成了 Markdown 渲染、代码高亮等富文本功能，用于展示 Agent 的响应。

- **后端 (Backend / Core)**: 基于 **Rust** (Tauri) 构建。
  - **Gateway (网关)**: 项目的核心组件，运行在本地的 WebSocket
    服务器。负责管理所有连接、路由消息、调度 Agent 任务。
  - **Tauri 桥接**:
    提供系统级能力的访问（如文件系统、系统通知、原生窗口管理等）。

- **通信机制**:
  - 前端与 Rust 后端主要通过 **WebSocket** 进行实时双向通信。
  - Tauri 的 IPC 机制作为补充，用于特定的系统级操作。

## 开发环境配置

### 核心配置：Tauri 跨域访问 (Allowed Origins)

在 Tauri 开发模式下，前端页面和后端 Gateway
服务运行在不同的端口或协议上，因此必须正确配置 Gateway 的 CORS 策略，否则
WebSocket 连接会被拒绝。

请确保你的 Gateway 配置文件中包含以下 `allowedOrigins` 设置：

```json
"gateway": {
  "port": 18789,        // Gateway 默认端口
  "mode": "local",
  "bind": "lan",
  "controlUi": {
    "allowedOrigins": [
      "https://tauri.localhost",  // Tauri 生产环境 (macOS/Linux)
      "tauri://localhost",        // Tauri 生产环境 (Windows WebView2)
      "http://tauri.localhost",   // Tauri 开发环境标准协议
      "http://localhost:1420",    // Vite 开发服务器默认端口
      "http://localhost:18081"    // 备用开发端口
    ],
    "allowInsecureAuth": true     // 允许本地开发的非 HTTPS 连接鉴权
  }
}
```

> **注意**: 如果 `allowedOrigins` 配置不正确，你可能会在控制台中看到 WebSocket
> 连接失败或 `403 Forbidden` 错误，导致无法与 Agent 进行对话。

## 快速开始

1. **安装依赖**:
   ```bash
   npm install
   # 或者
   pnpm install
   ```

2. **启动开发环境**:
   ```bash
   npm run tauri dev
   # 这将同时启动 Vite 前端服务和 Tauri Rust 后端
   ```

3. **构建发布**:
   ```bash
   npm run tauri build
   ```
