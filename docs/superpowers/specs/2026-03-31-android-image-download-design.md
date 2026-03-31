# Android 图片下载改为 Tauri Download 目录设计

日期：2026-03-31

## 背景

`seedclaw` 在提交 `fc2c000 update` 中，对图片预览层新增了两个行为：

- 图片下载在 iOS / Android WebView 分支改为 `window.open(url, '_blank')`
- 图片复制按钮调用浏览器 `ClipboardItem` 写入图片

结合当前项目运行环境，这两个改动在移动端存在明显问题：

- 安卓端点击下载并不会真正保存到系统下载目录
- `window.open(...)` 会把 Tauri Android App 顶到后台，副作用过大
- 移动端图片复制并不是当前刚需，且 WebView 能力不稳定

用户确认后的目标是：

- 下载按钮在 **所有 Tauri 平台** 统一走原生文件写入
- 安卓端点击下载后，图片应真正写入系统 `Download` 目录
- 纯 Web 环境继续保留浏览器下载行为
- 图片复制按钮 **仅桌面端显示**
- 移动端隐藏图片复制按钮，本次不再处理移动端图片复制
- 本次 **不执行构建与测试命令**

## 目标

- 移除安卓端依赖 `window.open(...)` 的下载方案
- 为 Tauri 平台接入 `plugin-fs`
- 在 Tauri 环境中将图片保存到 `BaseDirectory.Download`
- 保留桌面端现有图片复制按钮与逻辑
- 移动端隐藏图片复制按钮，避免暴露无效能力
- 尽量复用现有 `downloadImage(...)` 入口，减少波及面

## 非目标

- 不引入 `clipboard-manager`
- 不增强移动端图片复制能力
- 不改聊天消息文本复制逻辑
- 不改图片预览缩放、拖拽、双击行为
- 不新增自定义 Rust 下载 command
- 不做图片保存后自动打开、分享、媒体扫描等扩展行为
- 不执行构建命令或测试命令

## 需求结论

用户确认后的最终行为如下：

1. **Tauri 平台**：图片下载统一写入 `Download` 目录
2. **纯 Web**：继续走浏览器下载
3. **桌面端**：图片复制按钮保留
4. **移动端**：图片复制按钮隐藏
5. 安卓端下载失败时不再 fallback 到 `window.open(...)`

## 方案对比

### 方案 A：仅安卓 Tauri 使用 `plugin-fs`

安卓端下载改走 `plugin-fs`，桌面 Tauri 与纯 Web 继续保留浏览器下载。

**优点**
- 改动较小
- 能快速修复安卓切后台问题

**缺点**
- Tauri 内部行为分裂
- 桌面 Tauri 仍依赖浏览器下载，不够一致
- 后续维护要持续区分 Android / Desktop Tauri

### 方案 B：所有 Tauri 平台统一使用 `plugin-fs`

只要运行在 Tauri 环境，就统一通过 `plugin-fs` 写入 `Download`；只有纯 Web 保留浏览器下载。

**优点**
- Tauri 内行为统一
- 安卓端能真正写入下载目录
- 桌面端也获得一致的下载路径策略
- 后续扩展文件命名和冲突处理更容易

**缺点**
- 需要新增 fs 插件与 capability 配置
- 需要补充 Android Download 目录权限

### 方案 C：改为自定义 Rust command 处理下载

前端只传 URL 或字节，全部由 Rust 自行完成文件写入。

**优点**
- 控制力最高
- 可完全绕开前端 fs 权限模型

**缺点**
- 对当前需求属于过度设计
- 比 `plugin-fs` 实现更重
- 增加 Rust 面维护成本

## 推荐方案

采用 **方案 B：所有 Tauri 平台统一使用 `plugin-fs`，纯 Web 保留浏览器下载**。

理由：

- 本次需求的核心不是“给安卓单独打补丁”，而是让 **Tauri 环境中的下载语义统一为本地文件保存**
- 这样能从根上移除移动端 `window.open(...)` 的副作用
- 相比自定义 Rust command，`plugin-fs` 足够满足当前需求，复杂度更低

## 受影响文件

### 前端

- `src/composables/useMediaPreview.ts`
- `src/components/chat/MediaPreviewOverlay.vue`

### Tauri 配置

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

## 组件与数据流设计

### 下载入口

继续复用现有的 `useMediaPreview().downloadImage(src, defaultName?)`。

这样以下两个调用点会一起受益：

- 图片预览层右上角下载按钮
- 聊天消息中的图片下载按钮

### 平台分支

#### Tauri 分支

判断条件沿用现有项目里的 Tauri 环境判断方式：

- `!!window.__TAURI_INTERNALS__ || !!window.__TAURI__`

命中 Tauri 后，下载流程改为：

1. `fetch(src)` 获取图片数据
2. 读取为 `Blob`
3. 转为 `Uint8Array`
4. 根据 `blob.type` 推断扩展名
5. 生成下载文件名
6. 调用 `plugin-fs` 将字节写入 `BaseDirectory.Download`
7. toast 提示下载成功或失败

#### 纯 Web 分支

继续使用现有浏览器下载方式：

1. `fetch(src)` 获取 `Blob`
2. `URL.createObjectURL(blob)`
3. 创建 `<a>` 元素并设置 `download`
4. 触发点击后回收 URL

## 文件命名策略

考虑到当前图片很多是 base64 数据，没有稳定的原始文件名来源，本次采用简单可预测策略：

- 有 `defaultName` 时优先使用
- 无 `defaultName` 时使用 `image-${Date.now()}.${ext}`

扩展名由 MIME 推断：

- `image/png` -> `png`
- `image/jpeg` -> `jpg`
- `image/webp` -> `webp`
- `image/gif` -> `gif`
- 其他未知类型 -> `png`

如果 `defaultName` 已自带扩展名，则不重复追加。

## 图片复制按钮设计

### 桌面端

保留当前图片复制按钮与现有 `copyImageToClipboard(...)` 逻辑，不纳入本次重构范围。

### 移动端

移动端不再显示图片复制按钮。

移动端判断可沿用项目已存在的 UA 方案：

- `/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)`

在 `MediaPreviewOverlay.vue` 中仅控制按钮显隐，不改桌面端复制逻辑本身。

## Tauri 配置设计

### fs 插件接入

新增依赖并在 builder 中初始化：

- 前端：`@tauri-apps/plugin-fs`
- Rust：`tauri-plugin-fs`
- `src-tauri/src/lib.rs` 中增加 `.plugin(tauri_plugin_fs::init())`

### capability

当前 `src-tauri/capabilities/default.json` 尚未声明 fs 权限。

本次仅开放下载所需的最小权限：

- 启用 `fs` 写文件相关命令
- 作用域仅允许写入 `$DOWNLOAD/*`

如果实现中需要创建子目录，则 scope 需对应放开 `$DOWNLOAD/**/*`；如果直接写在下载目录根下，则保持根级文件范围即可。

本次优先选择 **直接写到下载目录根下**，避免扩大 scope。

### Android Manifest

根据 Tauri v2 fs 插件文档，访问 Android `Download` 等外部共享目录时，需要在 `AndroidManifest.xml` 中补充：

- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`

虽然较新的 Android 版本在部分目录上采用 scoped storage，但当前目标是先保证 `plugin-fs` 在 Download 目录可用，配置上按官方文档补齐权限。

## 错误处理

### Tauri 分支失败处理

失败时：

- 打印 `console.error('Download failed:', error)`
- toast 提示 `chat.downloadImageFailed`
- **不再 fallback 到 `window.open(...)`**

原因：

- 该 fallback 正是此次要移除的副作用来源
- 下载失败应该显式失败，而不是偷偷切到外部页面或后台

### Web 分支失败处理

保留现有浏览器侧失败处理思路，不扩展本次范围。

## 实现边界

### 允许修改

- `useMediaPreview.ts` 中下载逻辑的 Tauri / Web 分流
- `MediaPreviewOverlay.vue` 中图片复制按钮的移动端显隐
- Tauri fs 插件依赖、初始化、capability、Android 权限配置
- i18n 里若需补充下载结果文案，可做最小调整

### 不修改

- 桌面端图片复制逻辑
- 文本复制逻辑
- 其他聊天组件中的消息复制行为
- Lightbox 视觉布局与手势缩放行为
- 下载目录之外的路径策略

## 风险与规避

### 风险 1：fs capability 配置不完整，导致前端报权限错误

**原因**：Tauri v2 的 fs 插件默认不会开放写能力。

**规避**：在 `default.json` 中显式加入写文件权限与 `$DOWNLOAD/*` scope，只开放本次所需范围。

### 风险 2：Android Download 目录写入仍受系统权限限制

**原因**：Android 外部共享目录权限模型复杂，不同版本表现可能有差异。

**规避**：按 Tauri 官方 fs 文档补齐 Manifest 权限；路径固定使用 `BaseDirectory.Download`，不自行拼接外部存储根目录。

### 风险 3：`defaultName` 与 MIME 扩展名冲突导致文件名异常

**原因**：某些调用点可能传入无扩展名或已带扩展名的名称。

**规避**：新增文件名规范化逻辑，优先保留已有扩展名，没有时再根据 MIME 补齐。

### 风险 4：移动端复制按钮仅做模板隐藏，但逻辑残留导致维护混乱

**原因**：按钮不显示但组合式函数仍保留复制逻辑。

**规避**：本次只隐藏入口，不删除桌面端复制实现；同时在设计文档中明确“桌面保留、移动隐藏”的平台边界，避免后续误判。

## 验证策略

按用户明确要求：**本次不执行构建与测试命令**。

因此本次交付的验证方式限定为：

- 静态代码审查
- 依赖与配置一致性检查
- 调用链完整性检查

验证关注点：

- `downloadImage(...)` 在 Tauri 环境是否只走 fs 分支
- `BaseDirectory.Download` 是否作为唯一 Tauri 下载目录
- `MediaPreviewOverlay.vue` 是否在移动端隐藏复制按钮
- Tauri fs 插件依赖、初始化、capability、Manifest 是否都已补齐

## 成功标准

完成后应满足：

- 安卓端点击图片下载按钮时，不再通过 `window.open(...)` 打开新页面
- 安卓端图片能够写入系统 `Download` 目录
- 桌面 Tauri 也统一使用 `plugin-fs` 下载到 `Download` 目录
- 纯 Web 环境下载行为保持可用
- 图片复制按钮在桌面端仍可见
- 图片复制按钮在移动端不可见
- 本次改动不触及文本复制逻辑
- 全程不执行构建与测试命令
