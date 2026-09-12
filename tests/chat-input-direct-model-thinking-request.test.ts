import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const chatInputPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')
const chatStatePath = path.resolve(testDir, '../src/composables/useChatState.ts')

const chatInputSource = readFileSync(chatInputPath, 'utf8')
const chatStateSource = readFileSync(chatStatePath, 'utf8')

/** 取 `const <name> = ` 或 `function <name>(` 起到下一个顶层 `const `/`function ` 声明之间的源码片段 */
function fnSource(source: string, name: string): string {
    const constStart = source.indexOf(`const ${name} = `)
    const fnStart = source.indexOf(`function ${name}(`)
    const start = constStart !== -1 && (fnStart === -1 || constStart < fnStart) ? constStart : fnStart
    assert.notEqual(start, -1, `source should define ${name}`)
    const nextConst = source.indexOf('\nconst ', start + 1)
    const nextFn = source.indexOf('\nfunction ', start + 1)
    const candidates = [nextConst, nextFn].filter(i => i !== -1)
    const next = candidates.length ? Math.min(...candidates) : -1
    return source.slice(start, next === -1 ? source.length : next)
}

test('useChatState exposes direct-request session setters hitting the dedicated endpoints', () => {
    const setModel = fnSource(chatStateSource, 'setSessionModel')
    const setThinking = fnSource(chatStateSource, 'setSessionThinkingLevel')

    assert.match(
        setModel,
        /\/api\/chat\/\$\{targetKey\}\/model/,
        'setSessionModel should POST to the dedicated /model endpoint instead of the chat command route',
    )
    assert.match(
        setModel,
        /provider: split\.provider,\s*model: split\.model/,
        'setSessionModel should send the split provider/model in the request body',
    )

    assert.match(
        setThinking,
        /\/api\/chat\/\$\{targetKey\}\/thinking-level/,
        'setSessionThinkingLevel should POST to the dedicated /thinking-level endpoint',
    )
    assert.match(
        setThinking,
        /thinkingLevel: level/,
        'setSessionThinkingLevel should send the requested level in the request body',
    )

    assert.match(
        chatStateSource,
        /setSessionModel,\s*setSessionThinkingLevel,/, 
        'both setters should be exported from the chat state singleton',
    )
})

test('direct setters guard against stale-response races', () => {
    // 旧实现是 seq 令牌（只能挡住单字段双请求）；现为 per-session flight 记录，
    // 由 flight 用例覆盖。这里仅确认旧令牌变量已被移除，不留死代码。
    assert.doesNotMatch(chatStateSource, /setModelSeq|setThinkingLevelSeq/, 'seq tokens should be fully replaced')
})

test('manual slash-command cache sync in handleCommandDelta is preserved', () => {
    // 手动输入 /model /thinking 仍走旧聊天命令链路，其 SSE 副作用分支不能被误删
    // （断言作用域限定在 handleCommandDelta 函数体内，避免匹配到无关 switch）
    const handler = fnSource(chatStateSource, 'handleCommandDelta')
    assert.match(handler, /case 'model':/, 'handleCommandDelta should keep the model case')
    assert.match(handler, /case 'thinking':/, 'handleCommandDelta should keep the thinking case')
})

test('setters use a per-session flight record so the cache settles to server-confirmed state', () => {
    const setModel = fnSource(chatStateSource, 'setSessionModel')
    const setThinking = fnSource(chatStateSource, 'setSessionThinkingLevel')

    // per-session 在途记录：model/thinking 两类设置共用计数与确认态，
    // 保证无论成功/失败如何交错，缓存最终要么是服务端确认的合成值，要么回退到最近确认值
    // （currentSession 已是列表行的派生 computed，写入目标即列表行实例本身）
    assert.match(
        chatStateSource,
        /const sessionSettingFlights = new Map</,
        'in-flight setting requests should be tracked per session',
    )
    assert.match(
        setModel,
        /const entry = beginSettingFlight\(targetKey, targets\)/,
        'setSessionModel should register its flight per session',
    )
    assert.match(
        setThinking,
        /const entry = beginSettingFlight\(targetKey, targets\)/,
        'setSessionThinkingLevel should register its flight per session',
    )
    assert.match(
        setModel,
        /endSettingFlight\(targetKey, entry\)/,
        'setSessionModel should settle its flight (finally, both success and failure)',
    )
    assert.match(
        setThinking,
        /endSettingFlight\(targetKey, entry\)/,
        'setSessionThinkingLevel should settle its flight (finally, both success and failure)',
    )

    // 成功把权威值合并进确认态（失败不合并）
    assert.match(
        setModel,
        /entry\.confirmed\.modelProvider = split\.provider/,
        'a successful model switch should merge its values into the confirmed state',
    )
    assert.match(
        setModel,
        /entry\.confirmed\.thinkingLevel = result\.thinkingLevel/,
        'a successful model switch should backfill the authoritative thinkingLevel from the response',
    )
    assert.match(
        setThinking,
        /entry\.confirmed\.thinkingLevel = result\.thinkingLevel/,
        'a successful thinking-level set should backfill the clamped effective level',
    )

    // helper：0→1 时快照基准（视为服务端已确认状态）；归零时确认态统一写回缓存
    const beginFn = fnSource(chatStateSource, 'beginSettingFlight')
    const endFn = fnSource(chatStateSource, 'endSettingFlight')
    assert.match(
        beginFn,
        /mergedAt\.model === 0/,
        'flight base re-seed must be gated per field so an already-merged authoritative value is never overwritten',
    )
    assert.match(beginFn, /entry\.confirmed\.modelProvider = session\?\.modelProvider/, 'flight start should snapshot the current cache values')
    assert.match(endFn, /entry\.inflight--/, 'flight end should decrement the in-flight count')
    assert.match(endFn, /sessionSettingFlights\.delete\(targetKey\)/, 'an idle session should drop its flight record')
    assert.match(
        endFn,
        /session\.modelProvider = entry\.confirmed\.modelProvider/,
        'settle should write the confirmed composition back to the cache',
    )
    assert.match(
        endFn,
        /session\.thinkingLevel = entry\.confirmed\.thinkingLevel/,
        'settle should write the confirmed composition back to the cache',
    )
})

test('flight records harden against cross-session contamination and external mutations', () => {
    const setModel = fnSource(chatStateSource, 'setSessionModel')
    const setThinking = fnSource(chatStateSource, 'setSessionThinkingLevel')
    const endFn = fnSource(chatStateSource, 'endSettingFlight')

    // 写入目标按 targetKey 解析：currentSession 是 findSessionLocal(sessionKey) 的
    // 派生 computed，列表行即唯一实例——写入列表行即同步标签源与侧边栏，
    // 任何只写"另一个实例"的旧模式已随派生化消失
    assert.match(
        setModel,
        /waitForSettingTargets\(targetKey\)/,
        'setSessionModel should resolve its write target through the shared resolver',
    )
    assert.match(
        setThinking,
        /waitForSettingTargets\(targetKey\)/,
        'setSessionThinkingLevel should resolve its write target through the shared resolver',
    )
    const resolver = fnSource(chatStateSource, 'resolveSettingTargets')
    assert.match(resolver, /findSessionLocal\(targetKey\)/, 'the resolver should resolve the row by the target key')
    assert.match(endFn, /const targets = resolveSettingTargets\(targetKey\)/, 'settle should re-resolve live row instances instead of writing to rows captured at begin')

    // Hole D 修复：settle 只写本批触碰过的字段，不覆盖外部并发修改的未触碰字段
    assert.match(
        endFn,
        /if \(entry\.dirty\.model\)/,
        'settle should write back only fields this batch actually touched',
    )
    assert.match(
        endFn,
        /if \(entry\.dirty\.thinkingLevel\)/,
        'settle should write back only fields this batch actually touched',
    )
    assert.match(setModel, /entry\.dirty\.model = true/, 'model optimistic patch should mark the field dirty')
    assert.match(
        setModel,
        /await waitForSettingTargets\(targetKey\)/,
        'setSessionModel should wait for the row to materialize in the cold-start window before opening the flight',
    )
    assert.match(
        setThinking,
        /await waitForSettingTargets\(targetKey\)/,
        'setSessionThinkingLevel should wait for the row to materialize in the cold-start window before opening the flight',
    )
    assert.match(setThinking, /entry\.dirty\.thinkingLevel = true/, 'thinking optimistic patch should mark the field dirty')

    // Hole C 缓解：成功按发送序合并（callSeq 门闩），响应乱序时旧调用的迟到合并不覆盖新值
    assert.match(
        setModel,
        /callSeq > entry\.mergedAt\.model/,
        'model merge should respect send order',
    )
    assert.match(
        setModel,
        /callSeq > entry\.mergedAt\.thinkingLevel/,
        'thinkingLevel backfill should respect send order',
    )
    assert.match(
        setModel,
        /entry\.dirty\.thinkingLevel = true/,
        'the backfilled authoritative thinkingLevel must be marked dirty so settle writes it to the row',
    )
    assert.match(
        setThinking,
        /callSeq > entry\.mergedAt\.thinkingLevel/,
        'thinking merge should respect send order',
    )
})

test('ChatInput model switch delegates to the direct setter instead of sending a /model command', () => {
    const handler = fnSource(chatInputSource, 'handleModelSelect')

    assert.match(
        handler,
        /chatState\.setSessionModel\(modelId\)/,
        'handleModelSelect should call the direct-request setter',
    )
    assert.doesNotMatch(
        handler,
        /\/model \$\{modelId\}/,
        'handleModelSelect must no longer inject a /model command into the chat input',
    )
    assert.doesNotMatch(
        handler,
        /onSend\(\)/,
        'handleModelSelect must no longer send the switch as a chat message',
    )
    assert.match(
        handler,
        /if \(isPendingMode\.value\) \{\s*pendingModel\.value = modelId\s*return\s*\}/,
        'new-session (/new) model selection must keep recording locally without any request',
    )
    assert.match(
        handler,
        /if \(isBusy\.value\) \{/,
        'handleModelSelect should keep blocking switches while a run is active',
    )
})

test('ChatInput thinking switch delegates to the direct setter instead of sending a /thinking command', () => {
    const handler = fnSource(chatInputSource, 'selectThinkingLevel')

    assert.match(
        handler,
        /chatState\.setSessionThinkingLevel\(level\)/,
        'selectThinkingLevel should call the direct-request setter',
    )
    assert.doesNotMatch(
        handler,
        /\/thinking \$\{level\}/,
        'selectThinkingLevel must no longer inject a /thinking command into the chat input',
    )
    assert.doesNotMatch(
        handler,
        /onSend\(\)/,
        'selectThinkingLevel must no longer send the switch as a chat message',
    )
    assert.match(
        handler,
        /if \(isPendingMode\.value\) \{\s*pendingThinkingLevel\.value = level\s*return\s*\}/,
        'new-session (/new) thinking selection must keep recording locally without any request',
    )
    assert.match(
        handler,
        /if \(isBusy\.value\) \{/,
        'selectThinkingLevel should keep blocking switches while a run is active',
    )
})

test('all session-row writers go through the dual-target patch helper (same-class asymmetry sweep)', () => {
    // 同一 session 的行实例可能分叉（列表刷新/upsert 换新对象）：任何只写一处的
    // 写入方都会复现"切换/改名看起来没生效"。所有字段级写入必须走双写 helper。
    const helper = fnSource(chatStateSource, 'patchSessionRowEverywhere')
    assert.match(helper, /updateSessionLocal\(key, patch\)/, 'the helper should patch the session row (currentSession is derived from it)')
    // currentSession 必须是派生 computed，永远不允许被赋值（赋值即重新引入分叉类 bug）
    assert.doesNotMatch(
        chatStateSource,
        /state\.currentSession\s*=/,
        'currentSession must never be assigned; it is derived from the list row via computed',
    )
    assert.match(
        chatStateSource,
        /const currentSession = computed<SessionRow \| null>/,
        'currentSession should be a computed derived from the list row by sessionKey',
    )
    assert.match(
        chatStateSource,
        /findSessionLocal\(state\.sessionKey\)/,
        'currentSession should resolve live from the session buckets',
    )
    assert.match(
        chatStateSource,
        /patchSessionRowEverywhere,/,
        'the helper should be exported from the chat state singleton',
    )

    // handleCommandDelta（手动 /model /thinking /name 命令回声）此前只写 currentSession
    const delta = fnSource(chatStateSource, 'handleCommandDelta')
    assert.match(delta, /patchSessionRowEverywhere\(targetKey/, 'command echoes should dual-write both row instances')
    assert.doesNotMatch(
        delta,
        /state\.currentSession\.model =|state\.currentSession\.thinkingLevel =|state\.currentSession\.name =/,
        'command echoes must not bypass the dual-write helper',
    )

    // HomeView 首条消息的 overridePatch 此前只写列表行（靠身份巧合工作）
    const homeViewSource = readFileSync(path.resolve(testDir, '../src/views/HomeView.vue'), 'utf8')
    assert.match(
        homeViewSource,
        /patchSessionRowEverywhere\(targetSessionKey, overridePatch\)/,
        'the first-message override patch should dual-write both row instances',
    )
})
