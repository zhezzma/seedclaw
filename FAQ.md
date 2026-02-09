### 1. 架构分析：插件是如何工作的？

当你使用 `@tauri-apps/plugin-websocket` 时，架构如下：

1. **Socket 句柄 (Rust)**: 真正的 TCP/WebSocket 连接确实是由 Rust 代码（Tauri
   插件后端）创建和维护的。这意味着，**连接本身**比纯前端 WebSocket
   更稳定，因为它不依赖浏览器的网络栈，而是依赖 App
   进程（而你的进程有前台服务保活）。
2. **指令桥接 (IPC)**: 当 Rust 收到消息时，它必须通过
   IPC（进程间通信）机制，把数据“发射”给 WebView。
3. **业务逻辑 (JS)**: 你的代码写在 JS
   里：`ws.addListener((msg) => { 弹出通知(msg) })`。

### 2. 切后台后的致命问题

当 App 切到后台（开启前台服务）时，情况如下：

- **Rust 层（插件后端）：** ✅ 依然活跃。
  - 服务器发来消息，Rust 插件成功接收到了 TCP 包。
  - Rust 插件准备把这个消息传给前端。
- **IPC 桥接：** ⚠️ 阻塞/排队。
  - Rust 试图调用 WebView 的接口注入事件。
- **WebView 层（前端 JS）：** ❌ **已冻结 (Frozen)**。
  - Android 系统为了省电，暂停了 WebView 的主线程。
  - **结果：** 虽然 Rust 收到了消息，但它试图唤醒 JS 执行回调函数时，JS
    根本不响应。
  - **后果：** 你的 `弹出通知(msg)` 这行 JS 代码**不会执行**。

### 3. 三种方案对比

为了让你看清区别，我们对比一下三种情况：

| 方案              | 连接维持者 | 消息接收者 | 业务逻辑(弹通知)位置 | 后台表现 (Android + 前台服务)                             |
| :---------------- | :--------- | :--------- | :------------------- | :-------------------------------------------------------- |
| **纯 WebView WS** | 浏览器内核 | 浏览器内核 | JS                   | **连接断开**，收不到消息。                                |
| **Tauri WS 插件** | **Rust**   | **Rust**   | **JS**               | **连接保持**，Rust 收到消息，但 **JS 不执行**，无法弹窗。 |
| **纯 Rust WS**    | **Rust**   | **Rust**   | **Rust**             | **完美工作**。Rust 收到消息 -> 直接调系统通知 API。       |

### 4. 为什么插件方案在后台弹不出通知？

因为“弹通知”这个动作，是你写在 JS 回调里的。

```javascript
// 你的前端代码
import WebSocket from "@tauri-apps/plugin-websocket";

const ws = await WebSocket.connect("ws://...");

ws.addListener((msg) => {
    // ❌ 当 App 在后台时，这行代码根本轮不到执行！
    // 因为 WebView 线程被挂起了。
    sendNotification(msg.data);
});
```

虽然 Rust 插件帮你拿到了数据，但它只是个搬运工，它等着把数据喂给 JS，而 JS
正在“睡觉”。

### 5. 解决方案建议

既然你已经开启了前台服务，说明你对后台保活有强需求。为了确保通知 100%
到达，你**不能依赖 JS 的执行**。

你不需要完全抛弃 Tauri 的开发模式，但你需要把 **WebSocket 接收** 和 **通知触发**
这两步下沉到 Rust。

**推荐的“混合”架构：**

1. **在 Rust (`src-tauri/src/lib.rs` 或 `main.rs`) 中实现 WebSocket
   客户端**（使用 `tungstenite` 或 `tokio-tungstenite` crate）。
2. **Rust 负责监听消息：**
   ```rust
   // 伪代码示意
   while let Some(msg) = socket.read().await {
       // 1. 无论前台后台，直接在 Rust 层触发系统通知
       // 使用 tauri-plugin-notification 的 Rust API 或者 Android 原生 JNI
       show_system_notification("新消息", &msg);

       // 2. 顺便尝试发给前端（如果前端活着，它能收到；如果死了，就忽略）
       app_handle.emit("ws-message", &msg);
   }
   ```
3. **前端只负责展示：** 前端监听 `ws-message` 事件来更新
   UI（比如聊天列表），而不再负责“提醒”用户。

### 总结

使用 Tauri WebSocket 插件**不能**解决后台通知问题。虽然它保住了连接（Socket
不断），但它保不住逻辑执行（JS 不跑）。

**必须在 Rust 层接收消息并直接调用通知 API。**
