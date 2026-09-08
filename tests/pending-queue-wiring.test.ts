import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const chatStateSource = read('src/composables/useChatState.ts')
const chatMessagesSource = read('src/composables/useChatMessages.ts')
const homeViewSource = read('src/views/HomeView.vue')
const sessionsStateSource = read('src/composables/useSessionsState.ts')
const chatAttachSource = read('src/utils/chat-attach.ts')
const pendingQueueSource = read('src/utils/pending-queue.ts')

/** 从源码中截取 `const <name> = ...` 到下一个顶层 `const/function/}` 的函数体文本 */
function extractFn(source: string, name: string): string {
    const start = source.indexOf(`const ${name} = `)
    assert.ok(start >= 0, `function ${name} not found`)
    const end = source.indexOf('\nconst ', start + 1)
    return source.slice(start, end === -1 ? undefined : end)
}

test('useChatState: message_start user 回显命中队头时立即出队转正（无落盘）', () => {
    const handler = extractFn(chatStateSource, 'handleSSEEvent')
    assert.match(handler, /case 'message_start': \{/)
    assert.match(handler, /extractUserText\(echoMsg\.content\)/)
    assert.match(handler, /consumeQueueHead\(sessionData\.pendingQueue, echoText\)/)
    assert.match(handler, /sessionData\.pendingQueue = consumed\.rest/)
    // 服务端权威：本地不再持久化队列
    assert.ok(!handler.includes('persistPendingQueue'), 'queue persistence must be gone')
    // 转正：回显内容 append 为正式 user 气泡
    assert.match(handler, /content: echoMsg\.content/)
    // WS 删除快照恒先于 SSE 回显：consume miss 时凭快照移除缓存补齐正式气泡
    //（否则长 run 期间 steer 消息在聊天区隐身，直到 done 全量刷新才出现）
    assert.match(handler, /consumeRemovedEcho\(sessionData, echoText\)/)
})

test('useChatState: steerMessage/followMessage 捕获服务端 entryId + queueRev 后才入队', () => {
    for (const [name, mode] of [['steerMessage', 'steer'], ['followMessage', 'follow']] as const) {
        const fn = extractFn(chatStateSource, name)
        // 旧实现的根因：POST 前就写 chatMessages → 失败留假气泡
        assert.ok(!fn.includes('chatMessages'), `${name} must not touch chatMessages`)
        assert.match(fn, /: Promise<boolean>/, `${name} must return boolean`)
        // id/queueRev 来自服务端响应（账本签发）；未入队（id 缺失）不加排队气泡
        assert.match(fn, /apiPost<\{ id\?: string \| null; queueRev\?: number \}>/)
        assert.match(fn, /if \(!result\?\.id\) return true/)
        assert.match(fn, new RegExp(`enqueuePendingItem\\(targetKey, result\\.id, message, '${mode}', result\\.queueRev\\)`))
        assert.match(fn, /return false/, `${name} must signal failure`)
    }
})

test('useChatState: 本地不再持久化/猜谜修剪队列（reconcile 全家消失）', () => {
    assert.ok(!chatStateSource.includes('pendingQueueStore'), 'localStorage store must be gone')
    assert.ok(!chatStateSource.includes('reconcilePendingQueue'), 'local reconcile must be gone')
    assert.ok(!chatStateSource.includes('persistPendingQueue'), 'persist must be gone')
})

test('useChatState: removePendingItem 走 DELETE /queue/:id 并按响应快照对齐', () => {
    const fn = extractFn(chatStateSource, 'removePendingItem')
    assert.match(fn, /apiDelete<\{ deleted: boolean, queueRev\?: number, entries: ServerQueueEntry\[\] \}>/)
    assert.match(fn, /\/queue\/\$\{encodeURIComponent\(id\)\}/)
    assert.match(fn, /applyQueueSnapshot\(getSessionData\(targetKey\), result\?\.queueRev, result\?\.entries\)/)
})

test('useChatState: enqueuePendingItem 按 entryId 去重 + queueRev 门禁（防复活已消费条目）', () => {
    // 服务端 registerQueued 的 WS 快照可能先于 steer/follow HTTP 响应到达（跨连接无顺序保证）：
    // - 快照已含新条目 → 本地 append 必须按 id 去重，否则同一气泡出现两次；
    // - 消息入队后立即被 drain（本地已应用更新的快照）→ 凭「本地 rev > 登记 rev」跳过 append，
    //   否则复活幻影气泡且无后续快照修正。
    // 注：enqueuePendingItem 是 function 声明，extractFn 只识别 const 声明，手动截取
    const start = chatStateSource.indexOf('function enqueuePendingItem')
    assert.ok(start >= 0, 'enqueuePendingItem not found')
    const fn = chatStateSource.slice(start, chatStateSource.indexOf('\nfunction ', start + 1))
    assert.match(fn, /sd\.pendingQueue\.some\(entry => entry\.id === id\)/)
    assert.match(fn, /sd\.queueRev > queueRev/)
})

test('useChatState: WS queue_state 快照经 queueRev 门禁整体替换本地队列', () => {
    assert.match(chatStateSource, /onServerMessage\(\(msg: any\) => \{/)
    assert.match(chatStateSource, /msg\?\.event !== 'queue_state'/)
    assert.match(chatStateSource, /applyQueueSnapshot\(sd, msg\.payload\?\.queueRev, msg\.payload\?\.entries\)/)
})

test('useChatState: attach message_state 走 applyAttachMessageState 应用快照', () => {
    const attachIdx = chatStateSource.indexOf('applyAttachMessageState(currentSessionData')
    assert.ok(attachIdx > 0)
})

test('chat-attach: AttachMessageState 携带 pendingQueue + queueRev，经门禁整体替换本地队列', () => {
    assert.match(chatAttachSource, /pendingQueue\?: ServerQueueEntry\[\]/)
    assert.match(chatAttachSource, /queueRev\?: number/)
    assert.match(chatAttachSource, /applyQueueSnapshot\(sessionData, state\.queueRev, state\.pendingQueue\)/)
})

test('useChatState: abort 成功后清空本地队列（对齐服务端 clearQueuesAndAbort 清账本）', () => {
    const fn = extractFn(chatStateSource, 'abortChat')
    assert.match(fn, /sd\.pendingQueue = \[\]/)
    assert.ok(!fn.includes('persistPendingQueue'))
})

test('useChatState: getSessionData 初始化空队列（无 localStorage hydrate）+ pendingQueue computed 暴露', () => {
    assert.match(chatStateSource, /pendingQueue: \[\],/)
    assert.match(chatStateSource, /const pendingQueue = computed\(\(\) => getSessionData\(state\.sessionKey\)\.pendingQueue\)/)
    assert.match(chatStateSource, /pendingQueue, removePendingItem,/)
})

test('useSessionsState: deleteSession 不再清理队列存储（本地无持久化可清）', () => {
    const fn = extractFn(sessionsStateSource, 'deleteSession')
    assert.ok(!fn.includes('pendingQueueStore'), 'no store to clean')
})

test('utils/pending-queue: 存储层已删除，仅保留纯函数 + 快照映射与门禁', () => {
    assert.ok(!pendingQueueSource.includes('localStorage'), 'no localStorage')
    assert.ok(!pendingQueueSource.includes('createPendingQueueStore'), 'store must be gone')
    assert.ok(!pendingQueueSource.includes('reconcileQueue'), 'local reconcile must be gone')
    assert.match(pendingQueueSource, /export function toPendingItems/)
    assert.match(pendingQueueSource, /export function applyQueueSnapshot/)
    assert.match(pendingQueueSource, /export function consumeQueueHead/)
    assert.match(pendingQueueSource, /export function consumeRemovedEcho/)
    assert.match(pendingQueueSource, /export function extractUserText/)
})

test('useChatMessages: processedMessages 末尾追加 pending 气泡并标记 mode', () => {
    assert.match(chatMessagesSource, /const pendingQueue = state\.pendingQueue \|\| \[\]/)
    assert.match(chatMessagesSource, /pending: entry\.mode/)
    // DisplayMessage / ChatStateShape 字段
    assert.match(chatMessagesSource, /pending\?: PendingSendMode/)
    assert.match(chatMessagesSource, /pendingQueue\?: PendingItem\[\]/)
})

test('HomeView: 会话页输入框上方挂载 PendingQueueBar 并接 remove 事件', () => {
    assert.match(homeViewSource, /import PendingQueueBar from '\.\.\/components\/chat\/PendingQueueBar\.vue'/)
    assert.match(homeViewSource, /<PendingQueueBar v-if="!isNewSessionPage && !isCreatingSession" :items="chatState\.pendingQueue"/)
    assert.match(homeViewSource, /@remove="chatState\.removePendingItem"/)
})

test('PendingQueueBar / MessageBubble: 排队可视化元素存在', () => {
    const barSource = read('src/components/chat/PendingQueueBar.vue')
    // 队列非空才渲染 + ✕ 删除提示
    assert.match(barSource, /v-if="items\.length > 0"/)
    assert.match(barSource, /emit\('remove', item\.id\)/)
    assert.match(barSource, /chat\.pendingQueue\.removeHint/)

    const bubbleSource = read('src/components/chat/MessageBubble.vue')
    // 半透明 + 徽标
    assert.match(bubbleSource, /message\.pending \? 'opacity-70' : ''/)
    assert.match(bubbleSource, /chat\.pendingQueue\.followBadge/)
    assert.match(bubbleSource, /chat\.pendingQueue\.steerBadge/)
})
