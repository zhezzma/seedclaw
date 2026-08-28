import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { findToolBlockInMessages } from '../src/utils/tool-event-target.ts'

const testDir = path.dirname(fileURLToPath(import.meta.url))

test('findToolBlockInMessages 命中历史消息中的 toolCall block（按 id 精确匹配）', () => {
    const block = { type: 'toolCall', id: 'call-1', name: 'subagent', arguments: { mode: 'single' } }
    const messages: any[] = [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: [{ type: 'text', text: 'thinking' }, block] },
    ]
    assert.equal(findToolBlockInMessages(messages, 'call-1'), block)
})

test('findToolBlockInMessages 未命中返回 null（无 id / 不存在 / 类型不符）', () => {
    const messages: any[] = [
        { role: 'assistant', content: [{ type: 'toolCall', id: 'call-2', name: 'bash' }] },
        { role: 'assistant', content: '纯字符串消息' },
    ]
    assert.equal(findToolBlockInMessages(messages, undefined), null)
    assert.equal(findToolBlockInMessages(messages, 'call-999'), null)
    assert.equal(findToolBlockInMessages([], 'call-2'), null)
})

test('findToolBlockInMessages 反向扫描：最后一条消息中的 block 优先返回', () => {
    const older = { type: 'toolCall', id: 'dup', name: 'old' }
    const newer = { type: 'toolCall', id: 'dup', name: 'new' }
    const messages: any[] = [
        { role: 'assistant', content: [older] },
        { role: 'assistant', content: [newer] },
    ]
    assert.equal(findToolBlockInMessages(messages, 'dup'), newer)
})

test('findToolBlockInMessages 兼容 toolCallId 字段变体（converter 同规则）', () => {
    const block = { type: 'toolCall', toolCallId: 'call-x', name: 'subagent' }
    assert.equal(findToolBlockInMessages([{ role: 'assistant', content: [block] } as any], 'call-x'), block)
})

test('useChatState 的 update/end 两个 case 均接入历史二级查找（防回归静态断言）', () => {
    const source = readFileSync(path.resolve(testDir, '../src/composables/useChatState.ts'), 'utf8')
    const uses = source.match(/findToolBlockInMessages\(/g)?.length ?? 0
    assert.ok(
        uses >= 2, // update/end 各 1 处调用（import 语句不带括号不计入）
        `useChatState.ts 应有 update/end 两处 findToolBlockInMessages 调用，实际 ${uses}`,
    )
})

test('二级查找仅作兑底：每次调用必须紧跟 if (!toolCallItem) 守卫，不得越过 stream 查找直接命中历史', () => {
    const source = readFileSync(path.resolve(testDir, '../src/composables/useChatState.ts'), 'utf8')
    const guarded = source.match(/if \(!toolCallItem\) \{\s*\r?\n\s*toolCallItem = findToolBlockInMessages\(/g)?.length ?? 0
    assert.equal(
        guarded, 2,
        'findToolBlockInMessages 的两处调用必须都在 if (!toolCallItem) 守卫内（live 流优先，历史仅兑底）',
    )
})

test('tool_execution_end 追加 toolResult 消息时，toolCallId 需回退变体字段（静态断言）', () => {
    const source = readFileSync(path.resolve(testDir, '../src/composables/useChatState.ts'), 'utf8')
    // 历史 block 形如 {type:'toolCall', toolCallId:'x'}（无 id）时，item.id 为 undefined
    // → 追加消息丢失 toolCallId → 1.1 合并静默失效。必须回退 item.toolCallId。
    assert.ok(
        /toolCallId:\s*toolCallItem\s*\?\s*\(toolCallItem\.id \?\? toolCallItem\.toolCallId\)\s*:\s*data\.toolCallId/.test(source)
            || /toolCallId:\s*toolCallItem\s*\?\s*toolCallItem\.id \?\? toolCallItem\.toolCallId\s*:\s*data\.toolCallId/.test(source),
        'end 追加消息的 toolCallId 应为 toolCallItem.id ?? toolCallItem.toolCallId（变体命中时不丢）',
    )
})

test('done 分支重拉消息后同步清空本地 chatToolMessages（静态断言）', () => {
    const source = readFileSync(path.resolve(testDir, '../src/composables/useChatState.ts'), 'utf8')
    // done 后服务端已持久化全部 toolResult entry，本地临时 toolResult 条目若不清空
    // 会与持久化消息双重参与 1.1 合并（幂等但永久残留）；loadChatHistory 已同规则清理。
    const clears = source.match(/chatToolMessages = \[\]/g)?.length ?? 0
    assert.ok(
        clears >= 4, // 初始化 + loadChatHistory + message_end 固化 + done 重拉
        `chatToolMessages = [] 应至少 4 处（含 done 分支），实际 ${clears}`,
    )
})

test('集成：reactive 历史块的就地赋值能触发 computed 重算（响应性契约）', async () => {
    const { reactive, computed, effect } = await import('vue')

    // 模拟 useChatState.getSessionData：reactive 深层代理
    const block = { type: 'toolCall', id: 'call-r', name: 'subagent', arguments: {}, toolState: 'calling' }
    const sessionData = reactive({
        chatMessages: [{ role: 'assistant', content: [{ type: 'text', text: 'hi' }, block] }],
        chatToolMessages: [],
    })

    // 模拟 processedMessages：从代理链读块字段建 DisplayBlock（同 useChatMessages converter 形状）
    const processed = computed(() =>
        sessionData.chatMessages.flatMap((m: any) =>
            (Array.isArray(m.content) ? m.content : []).map((item: any) => ({
                type: item.type,
                toolCallId: item.id || item.toolCallId,
                toolState: item.toolState,
                toolDetails: item.toolDetails,
            })),
        ),
    )

    let snapshots: any[] = []
    effect(() => { snapshots = processed.value })
    assert.equal(snapshots.find((b) => b.toolCallId === 'call-r')?.toolDetails, undefined)

    // 走被测函数拿到块引用并就地赋值（同 handleSSEEvent 回退路径）
    const found = findToolBlockInMessages(sessionData.chatMessages as any, 'call-r')
    assert.ok(found, '应命中历史块')
    found!.toolDetails = { statusText: '思考中', results: [{ agent: 'w1', subagentSessionId: 'sub-r' }] }
    found!.toolState = 'tool_running'

    // effect 应已被触发，且读到新值（响应性链路成立）
    const updated = snapshots.find((b) => b.toolCallId === 'call-r')
    assert.equal(updated?.toolDetails?.results?.[0]?.subagentSessionId, 'sub-r')
    assert.equal(updated?.toolState, 'tool_running')
})
