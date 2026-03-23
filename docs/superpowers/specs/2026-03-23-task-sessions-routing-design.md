# 任务会话路由与命名解耦设计

日期：2026-03-23
项目：seedclaw / seedagent
状态：草案（主人已确认命名方向，待最终审阅）

## 1. 问题背景

当前前后端把多个不同层次的概念混在了一起：

- 前端页面模式使用 `type=cron`
- 前端列表状态命名为 `cronSessionsResult`
- 后端列表接口命名为 `/api/sessions/crons`
- 但这个列表实际承载的并不是“cron 专属会话”，而是统一的一类**自动产出的特殊会话**
- 这些会话目前同时包含：
  - 定时任务产出
  - Agent 心跳任务产出

同时，用户层面又把这个入口理解成“消息列表”，这也不准确，因为它本质上并不是消息实体，而是某类 session 列表。

因此，问题不在于要不要区分 cron / heartbeat，而在于要把：

1. **页面入口语义**
2. **会话类别语义**
3. **技术实现词 cron**

彻底拆开。

## 2. 设计目标

本轮只做语义与路由解耦，不做业务拆分。

目标：

- 对外把该入口统一命名为 **任务会话**
- 前端不再使用 `type=cron` 作为页面模式
- 后端不再使用 `/api/sessions/crons` 作为接口名
- 会话类别字段从 `sessionType` 改为 `sessionCategory`
- 不兼容旧逻辑，直接切换到新的路由/字段/API 语义

非目标：

- 不区分 cron 与 heartbeat 的前端展示
- 不引入 `sessionSource=cron|heartbeat`
- 不拆新的详情页组件
- 不改变“任务会话列表里同时包含 cron 和 heartbeat”这一业务事实

## 3. 核心结论

### 3.1 对外概念

统一命名为：**任务会话**

它表示一类统一的特殊 session 集合，不再叫“消息列表”，也不再暴露 `cron` 这个技术实现词。

### 3.2 会话类别字段

后端与前端统一使用：

```ts
sessionCategory: 'default' | 'task'
```

含义：

- `default`：普通聊天会话
- `task`：任务会话

### 3.3 独立并列入口

导航上，**聊天** 与 **任务会话** 是两个平级入口，而不是同一个 `chat` 页面下的 query 模式变体。

## 4. 路由设计

### 4.1 最终路由

- 普通聊天：`/chat/:sessionkey?`
- 任务会话：`/tasks/:sessionkey?`

路由名：

- `chat`
- `tasks`

### 4.2 组件复用

两条路由都复用同一个页面组件：`HomeView.vue`

即：

```ts
{
  path: 'chat/:sessionkey?',
  name: 'chat',
  component: HomeView,
},
{
  path: 'tasks/:sessionkey?',
  name: 'tasks',
  component: HomeView,
}
```

理由：

- 本轮重点是语义解耦，而不是视图层重构
- 当前详情页承载逻辑一致，复用组件最稳
- Vue Router 支持多个路由复用同一个组件，不是问题

### 4.3 HomeView 内部判断

`HomeView` 不再依赖 query 判断模式，而是直接依赖路由名：

```ts
const isTaskSessionsRoute = computed(() => route.name === 'tasks')
```

行为：

- `chat` 路由 -> 加载普通会话列表
- `tasks` 路由 -> 加载任务会话列表

## 5. 前端状态设计

### 5.1 状态命名

保留：

- `sessionsResult`

新增/替换：

- `taskSessionsResult`
- `loadTaskSessions()`

移除：

- `cronSessionsResult`
- `loadCronSessions()`

### 5.2 SessionRow 字段

前端 `SessionRow` 从：

```ts
sessionType?: 'default' | 'cron'
```

改成：

```ts
sessionCategory?: 'default' | 'task'
```

### 5.3 列表加载规则

- 普通聊天页使用 `sessionsResult`
- 任务会话页使用 `taskSessionsResult`

删除当前任务会话后，回退到：

- `/tasks`

删除普通聊天会话后，回退到：

- `/chat`

## 6. 后端 API 设计

### 6.1 普通会话接口

保持不变：

- `GET /api/sessions`

### 6.2 任务会话接口

新接口：

- `GET /api/sessions/tasks`

直接替换：

- `GET /api/sessions/crons`

不保留兼容路径。

### 6.3 返回字段

后端 `buildSessionDetail(...)` 改为返回：

```ts
sessionCategory: 'default' | 'task'
```

当前判定逻辑可保持不变：

- 原先凡是进入 `/crons` 集合、或依据 `task_execution` 自定义条目识别出来的，会话
- 统一视作 `task`

即：**这轮只改语义命名，不改筛选逻辑本身**。

## 7. 通知跳转设计

### 7.1 精确 session 跳转

当通知已知目标 session：

- `sessionCategory === 'default'` -> 跳 `chat/:sessionkey`
- `sessionCategory === 'task'` -> 跳 `tasks/:sessionkey`

### 7.2 Android 裸 tap 降级

当无法精确定位目标 session 时：

- 降级进入：`/tasks`

原因：

- 任务会话列表是通知相关自动会话的自然容器
- 独立路由后，不再需要借用 `chat + query` 的特殊模式

### 7.3 通知路由工具命名

建议前端工具函数命名改成：

- `buildChatLocation(sessionKey)`
- `buildTaskSessionLocation(sessionKey?)`

不再保留“message list”或“cron”相关命名。

## 8. 导航与文案设计

### 8.1 导航入口

并列两个入口：

- 聊天
- 任务会话

不再出现“名为 chat，实际是 cron 特殊模式”的入口。

### 8.2 i18n 命名

新增或替换文案：

#### 中文
- `sidebar.taskSessions`：任务会话
- `home.taskSessionList`：任务会话列表
- `home.noTaskSessions`：暂无任务会话
- `home.notificationsNoCandidates`：未能确定通知对应会话，已打开任务会话列表
- `home.notificationsMultipleCandidates`：检测到多条待处理通知，已打开任务会话列表

#### 英文
- `sidebar.taskSessions`: `Task Sessions`
- `home.taskSessionList`: `Task Session List`
- `home.noTaskSessions`: `No task sessions yet`
- `home.notificationsNoCandidates`: `Could not determine the target session, opened the task session list instead`
- `home.notificationsMultipleCandidates`: `Detected multiple pending notifications, opened the task session list instead`

### 8.3 不再使用的文案

应清理所有把该列表称为：

- 消息列表
- Messages
- cron（作为用户可见概念）

的场景。

## 9. 导航高亮与页面模式判断

`useNavActive.ts` 不再依赖 query 参数判断，而是直接依赖路由名：

- `chat` -> 高亮聊天
- `tasks` -> 高亮任务会话

这样可以移除当前围绕 `query.type` 的复杂判断。

## 10. 迁移范围

### seedclaw

预计会修改：

- `src/router/index.ts`
- `src/config/navigation.ts`
- `src/views/HomeView.vue`
- `src/composables/useSessionsState.ts`
- `src/composables/useNavActive.ts`
- `src/composables/useNotify.ts`
- `src/App.vue`
- `src/utils/notification-routing.ts`
- `src/i18n/zh.ts`
- `src/i18n/en.ts`
- 相关测试文件

### seedagent

预计会修改：

- `src/server/routes/sessions.ts`
- 如有必要，同步受 `sessionType` 影响的类型定义或调用点

## 11. 实施顺序

1. 后端字段与接口改名
   - `sessionType` -> `sessionCategory`
   - `/api/sessions/crons` -> `/api/sessions/tasks`
2. 前端状态层改名
   - `cronSessionsResult` -> `taskSessionsResult`
   - `loadCronSessions()` -> `loadTaskSessions()`
3. 路由层新增 `/tasks/:sessionkey?`
4. `HomeView` 改为按 `route.name` 分流
5. 通知跳转改为 `chat` / `tasks` 两套明确落点
6. 导航高亮与文案统一切换
7. 跑测试、类型检查、真机验证通知路径

## 12. 风险与注意事项

### 12.1 同组件复用导致的状态残留

`HomeView.vue` 同时承载 `chat` 和 `tasks` 两条路由，必须确保：

- 路由切换时正确刷新列表来源
- 删除当前会话后回退到正确路由
- 滚动恢复与 session 切换逻辑不误判为“同一路由”

### 12.2 一次性硬切无兼容层

由于本轮明确不兼容旧逻辑，所有以下旧语义都必须一次性清理：

- `type=cron`
- `/api/sessions/crons`
- `sessionType`
- `cronSessionsResult`
- 前端任何把它叫消息列表的文案

### 12.3 通知与任务会话路由的联动

Android 通知裸 tap 的降级落点要同步改为 `/tasks`，否则会出现：

- 页面命名已改
- 通知却仍跳旧聊天域

## 13. 最终判断

本轮最正确的重构方向是：

- 不再把“任务会话”隐藏在 `chat + query` 下面
- 直接把它提升为独立路由与独立导航入口
- 同时把会话字段与接口语义从 `cron` 拉正为 `task`

这样能一次性解决三个问题：

1. 用户可见文案不准确
2. 页面模式与会话类别耦合
3. 技术实现词 `cron` 外泄到产品层
