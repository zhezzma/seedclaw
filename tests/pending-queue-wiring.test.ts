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

/** 从源码中截取 `const <name> = ...` 到下一个顶层 `const/function/}` 的函数体文本 */
function extractFn(source: string, name: string): string {
    const start = source.indexOf(`const ${name} = `)
    assert.ok(start >= 0, `function ${name} not found`)
    const end = source.indexOf('\nconst ', start + 1)
    return source.slice(start, end === -1 ? undefined : end)
}

test('useChatState: message_start user 回显命中队头时出队转正', () => {
    const handler = extractFn(chatStateSource, 'handleSSEEvent')
    assert.match(handler, /case 'message_start': \{/)
    assert.match(handler, /extractUserText\(echoMsg\.content\)/)
    assert.match(handler, /consumeQueueHead\(sessionData\.pendingQueue, echoText\)/)
    assert.match(handler, /sessionData\.pendingQueue = consumed\.rest/)
    assert.match(handler, /persistPendingQueue\(targetKey, consumed\.rest\)/)
    // 转正：回显内容 append 为正式 user 气泡
    assert.match(handler, /content: echoMsg\.content/)
})

test('useChatState: steerMessage/followMessage 不再乐观插入 chatMessages（成功才入队）', () => {
    for (const name of ['steerMessage', 'followMessage']) {
        const fn = extractFn(chatStateSource, name)
        // 旧实现的根因：POST 前就写 chatMessages → 失败留假气泡
        assert.ok(!fn.includes('chatMessages'), `${name} must not touch chatMessages`)
        assert.match(fn, /: Promise<boolean>/, `${name} must return boolean`)
        assert.match(fn, /enqueuePendingItem\(targetKey, message, '(steer|follow)'\)/)
        assert.match(fn, /return false/, `${name} must signal failure`)
    }
})

test('useChatState: reconcile 挂载在 done 刷新 / loadChatHistory / attach message_state 三处', () => {
    assert.equal(
        (chatStateSource.match(/reconcilePendingQueue\((targetKey|sessionId)\)/g) || []).length,
        3,
    )
    // attach：紧跟 applyAttachMessageState 之后
    const attachIdx = chatStateSource.indexOf('applyAttachMessageState(currentSessionData')
    assert.ok(attachIdx > 0)
    const afterAttach = chatStateSource.slice(attachIdx, attachIdx + 400)
    assert.match(afterAttach, /reconcilePendingQueue\(targetKey\)/)
})

test('useChatState: abort 成功后清空本地队列（对齐服务端 clearQueuesAndAbort）', () => {
    const fn = extractFn(chatStateSource, 'abortChat')
    assert.match(fn, /sd\.pendingQueue = \[\]/)
    assert.match(fn, /persistPendingQueue\(targetKey, \[\]\)/)
})

test('useChatState: getSessionData 惰性初始化从 localStorage hydrate + pendingQueue computed 暴露', () => {
    assert.match(chatStateSource, /pendingQueue: pendingQueueStore\.get\(key\)/)
    assert.match(chatStateSource, /const pendingQueue = computed\(\(\) => getSessionData\(state\.sessionKey\)\.pendingQueue\)/)
    assert.match(chatStateSource, /pendingQueue, removePendingItem,/)
    // 删会话移除显示的 action
    assert.match(chatStateSource, /const removePendingItem = /)
})

test('useChatMessages: processedMessages 末尾追加 pending 气泡并标记 mode', () => {
    assert.match(chatMessagesSource, /const pendingQueue = state\.pendingQueue \|\| \[\]/)
    assert.match(chatMessagesSource, /pending: entry\.mode/)
    // DisplayMessage / ChatStateShape 字段
    assert.match(chatMessagesSource, /pending\?: PendingSendMode/)
    assert.match(chatMessagesSource, /pendingQueue\?: PendingItem\[\]/)
})

test('HomeView: busy 路径 steer/follow 失败恢复输入框文本（两处）', () => {
    // trySendDeliveryCommand 与 Case 2 非命令文本
    assert.equal(
        (homeViewSource.match(/chatInputRef\.value\.inputText = inputText/g) || []).length >= 3,
        true,
        'busy 失败恢复 + 命令参数错误恢复等至少 3 处',
    )
    const deliver = extractFn(homeViewSource, 'trySendDeliveryCommand')
    assert.match(deliver, /if \(!sent\) \{/)
})

test('HomeView: 会话页输入框上方挂载 PendingQueueBar 并接 remove 事件', () => {
    assert.match(homeViewSource, /import PendingQueueBar from '\.\.\/components\/chat\/PendingQueueBar\.vue'/)
    assert.match(homeViewSource, /<PendingQueueBar v-if="!isNewSessionPage && !isCreatingSession" :items="chatState\.pendingQueue"/)
    assert.match(homeViewSource, /@remove="chatState\.removePendingItem"/)
})

test('useSessionsState: deleteSession 清理本地排队队列', () => {
    const fn = extractFn(sessionsStateSource, 'deleteSession')
    assert.match(fn, /pendingQueueStore\.remove\(key\)/)
})

test('PendingQueueBar / MessageBubble: 排队可视化元素存在', () => {
    const barSource = read('src/components/chat/PendingQueueBar.vue')
    // 队列非空才渲染 + ✕ 移除提示
    assert.match(barSource, /v-if="items\.length > 0"/)
    assert.match(barSource, /emit\('remove', item\.id\)/)
    assert.match(barSource, /chat\.pendingQueue\.removeHint/)

    const bubbleSource = read('src/components/chat/MessageBubble.vue')
    // 半透明 + 徽标
    assert.match(bubbleSource, /message\.pending \? 'opacity-70' : ''/)
    assert.match(bubbleSource, /chat\.pendingQueue\.followBadge/)
    assert.match(bubbleSource, /chat\.pendingQueue\.steerBadge/)
})
