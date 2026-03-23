# Android 通知点击降级路由设计

日期：2026-03-23
项目：seedclaw / seedagent
状态：草案（已选定方案 C，待主人审阅）

## 1. 背景

当前 seedclaw 的通知点击逻辑在 Android/Tauri 上存在一个平台限制：

- `onAction` 在某些点击路径下只能返回通用 `tap`
- 无法稳定拿到 notification id
- 因而前端无法准确知道用户点的是哪一条通知

旧实现为了兜底，采用“取最后一个通知映射”的猜测策略。这在单通知场景下看似可用，但在多通知并发时会把用户点的 A 错误地跳到 B，对话上下文也会错乱。

## 2. 已排除方案

### 2.1 方案 A：点击动作直接携带目标 session

这是最理想方案，但主人已确认：该方向在当前 Tauri / Android 环境里尝试多次都很难稳定落地，因此本轮不继续投入。

### 2.2 方案 B：依赖 action button 精确传参

相比正文点击更容易携带 actionId，但仍要求用户改变点击习惯，而且不能解决“点正文”的默认交互。本轮不选。

## 3. 选定方案：方案 C（保守降级）

核心原则：

- **能精确识别时，才直达 session**
- **不能精确识别时，不猜**
- **多通知并发时优先正确，不优先“看起来方便”**

### 3.1 路由规则

#### 情况 A：点击事件能解析出明确 session 目标

例如：

- 有 notification id，且能从 `notificationMap` 找到 sessionKey
- 或 actionId 里直接带了 `open_session:<sessionId>`

则直接打开该 session，并根据 session 类型决定是否带 `?type=cron`。

#### 情况 B：点击事件无法解析 notification id，只得到通用 `tap`

此时不再使用“最后一个通知”的猜测逻辑，而是检查当前待处理通知目标数：

- **只有 1 个候选目标**：允许自动打开该 session
- **有 2 个及以上候选目标**：不直跳具体 session，改为打开消息列表页（`chat` + `type=cron` 的消息列表模式）
- **没有候选目标**：同样进入消息列表页，不直跳具体 session

### 3.2 为什么多候选时进入消息列表

因为此时系统没有给出足够信息去区分“用户点的是哪一条通知”。

若继续猜最后一个：

- 行为不可预测
- 可能把用户带到错误 session
- 比“不直跳具体会话，只打开列表”更糟

消息列表是当前信息不充分时最保守且可解释的落点。

## 4. 数据模型调整

前端需要把通知映射从“仅保留最后一个可猜项”提升为“待处理通知目标集合”。

建议结构：

```ts
notificationMap: Record<notificationId, { sessionKey: string; createdAt: number }>
```

并增加一个辅助视图：

```ts
pendingNotificationTargets = unique(sessionKey[])
```

用途：

- notification id 存在时：按 id 精确命中
- notification id 不存在时：统计当前可候选 session 数量，执行方案 C 的降级规则

### 4.1 候选集合生命周期

候选集合必须是**内存态、短生命周期、可过期**的数据，避免陈旧映射污染 `tap` 判定。

规则如下：

1. **加入时机**
   - 仅当收到 `notify://notification-sent` 时加入
   - 每条记录保存 `sessionKey + createdAt`

2. **有效性规则**
   - `tap` 判定只统计“未过期”的候选
   - 建议 TTL：5 分钟
   - 超过 TTL 的候选在读路径上直接忽略，并在机会合适时顺手清理

3. **移除时机**
   - 精确命中某个 notification id 并成功进入目标 session 后：移除该 id 对应记录
   - 无 id 的 `tap` 且候选数为 1，成功进入该 session 后：清空整个候选集合
   - 无 id 的 `tap` 且候选数为 0 或 >=2，进入消息列表页后：清空整个候选集合

4. **持久化规则**
   - 不跨重启持久化
   - App 冷启动后如果只有一个裸 `tap` 事件、但没有内存候选集合，则按“0 候选 -> 消息列表页”处理

5. **去重规则**
   - 候选目标数量按 **sessionKey 去重** 计算，避免同一 session 连发多次通知时被错误判成“多候选”

这样定义后，`tap` 的 0 / 1 / 多候选判断只依赖“当前运行期、近期、尚未消费”的候选集合，而不依赖历史残留数据。

## 5. 与 `type=cron` 的关系

通知路由不能再硬编码 `type=cron`。

### 5.1 session 直跳路由

当通知点击已经精确得到 `sessionKey` 时：

1. 先根据本地 `cronSessionsResult` / `sessionsResult` 判断 session 类型
2. 本地无缓存时调用 `/api/sessions/:id/info`
3. 仅当 sessionType === `cron` 时，才拼接 `query: { type: 'cron' }`
4. 若 `/info` 查询失败、超时或返回空值，则**保守地打开 `chat/:sessionKey`，不带 `type=cron`**

这条规则的核心是：**session 详情页绝不猜 `type=cron`**。

### 5.2 消息列表降级路由

当通知点击无法精确定位目标（0 候选或多候选）时：

- 不直跳 session
- 统一进入当前已有的消息列表模式，即 `chat` + `type=cron`

> 说明：这里的“消息列表页”在现有产品语义上就是 `type=cron` 的特殊列表模式。若后续产品将消息列表与 cron 任务历史解耦，应再抽象新的 route mode。

## 6. 与移动端前台 reload 的协同

通知点击与移动端回前台 reload 仍需互斥，避免：

- 用户点通知
- App focus
- 前台恢复逻辑立刻 reload
- 把通知跳转过程打断

实现要求：

- 通知点击开始时标记短时 suppress 窗口
- `tauri://focus` 中若检测到 suppress 仍有效，则跳过 reload
- 若 focus 先到、reload 尚未执行，则应设置短暂 grace period，让后到的通知 action 有机会取消 reload

这部分已被验证是本问题的必要配套，而不是附加优化。

## 7. 实现边界

本轮只做：

1. 去掉 Android `tap` 的“猜最后一个通知”逻辑
2. 增加“单候选直跳 / 多候选进消息列表”的降级策略
3. 保持现有精确通知路径（id / actionId）继续可用
4. 保持前台 reload 与通知点击互斥

本轮不做：

- 新的 Android deep link 传参机制
- 原生层 notification payload 重构
- 新建独立“通知收件箱”页面
- 重构现有 `type=cron` 产品语义

## 8. 测试设计

### 8.1 纯函数测试

新增/扩展纯函数测试，覆盖：

- session 类型推导 -> 是否带 `type=cron`
- 前台 reload 抑制逻辑
- `tap` 无 id 时的候选数决策：0 / 1 / 多个

### 8.2 交互路径验证

至少验证以下路径：

1. **精确命中**：notification id -> 正确 session
2. **单候选 tap**：只有一个候选 -> 正确 session
3. **多候选 tap**：多个候选 -> 打开消息列表，不直跳 session
4. **零候选 tap**：没有候选 -> 打开消息列表，不直跳 session
5. **陈旧候选过期**：TTL 过后旧候选不再参与 0 / 1 / 多候选判断
6. **session info 查询失败**：精确 session 直跳时回源失败 -> 打开 `chat/:sessionKey`，不带 `type=cron`
7. **通知点击 + focus**：不会被前台 reload 抢断

## 9. 风险与已知限制

### 9.1 同一 session 的多条通知

按 sessionKey 去重后会视为单候选，可接受，因为最终目标相同。

### 9.2 多 session 并发通知

会降级到消息列表，牺牲“直达便捷性”换取“绝不误跳”。这符合本轮目标。

### 9.3 消息列表页当前仍借用 `type=cron`

这是一种现有产品实现上的耦合，不是本轮引入的新问题。本轮只在该语义下做更安全的通知落点。

## 10. 推荐实施顺序

1. 抽出 `tap` 候选决策纯函数
2. 先写失败测试：0 / 1 / 多候选
3. 改 `App.vue` 的 `tap` 分支逻辑
4. 跑 seedclaw 测试与类型检查
5. 进行 Android 真机回归：单通知 / 多通知 / 后台超过 30 秒 / 点击通知恢复前台

## 11. 最终判断

在当前平台能力无法稳定提供 notification id 的前提下，**方案 C 是最稳的产品行为**：

- 有把握时直达
- 没把握时不猜
- 多候选时进入列表而不是误跳

这比“猜最后一个通知”更符合正确性优先的原则。