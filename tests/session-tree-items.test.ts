import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionTreeItems, type RailMessageLike } from '../src/utils/sessionTreeItems.ts'
import type { DisplayBlock } from '../src/composables/useChatMessages.ts'

const text = (t: string): DisplayBlock => ({ type: 'text', text: t })
const tool = (name: string): DisplayBlock => ({ type: 'tool', toolName: name })
const msg = (id: string, role: 'user' | 'assistant', blocks: DisplayBlock[], timestamp?: number): RailMessageLike => ({
    id,
    role,
    entryId: id,
    blocks,
    timestamp,
})

test('空列表 → 空结果', () => {
    assert.deepEqual(buildSessionTreeItems([]), [])
    assert.deepEqual(buildSessionTreeItems(null), [])
})

test('伪消息（无 entryId 的 streaming 占位 / 压缩行）不产生短横', () => {
    const messages: RailMessageLike[] = [
        msg('u1', 'user', [text('你好')]),
        { id: 'pseudo', role: 'assistant', blocks: [text('流式占位')] },
    ]

    const items = buildSessionTreeItems(messages)

    assert.equal(items.length, 1)
    assert.equal(items[0].jumpEntryId, 'u1')
})

test('user / AI 气泡一一成项，preview 取 text 块，timestamp 透传', () => {
    const messages: RailMessageLike[] = [
        msg('u1', 'user', [text('开始吧')], 1700000000000),
        msg('a1', 'assistant', [text('已实现，核心模块。'), tool('read_file')], 1700000006000),
    ]

    assert.deepEqual(buildSessionTreeItems(messages), [
        { type: 'user', jumpEntryId: 'u1', preview: '开始吧', timestamp: 1700000000000 },
        { type: 'ai', jumpEntryId: 'a1', preview: '已实现，核心模块。\n[read_file]', timestamp: 1700000006000 },
    ])
})

test('纯工具气泡 preview 用 [工具名] 列表', () => {
    const messages: RailMessageLike[] = [
        msg('u1', 'user', [text('问题')]),
        msg('a1', 'assistant', [tool('read_file'), tool('edit_file')]),
    ]

    assert.deepEqual(buildSessionTreeItems(messages)[1], {
        type: 'ai',
        jumpEntryId: 'a1',
        preview: '[read_file]\n[edit_file]',
        timestamp: undefined,
    })
})

test('AI 气泡无文本时回退触发本轮的 user 输入', () => {
    const messages: RailMessageLike[] = [
        msg('u1', 'user', [text('问题')]),
        msg('a1', 'assistant', [{ type: 'thinking', text: '思考' }]),
    ]

    assert.deepEqual(buildSessionTreeItems(messages)[1], {
        type: 'ai',
        jumpEntryId: 'a1',
        preview: '问题',
        timestamp: undefined,
    })
})

test('错误块进入 preview', () => {
    const messages: RailMessageLike[] = [
        msg('u1', 'user', [text('问题')]),
        msg('a1', 'assistant', [{ type: 'error', error: '连接超时' }]),
    ]

    assert.deepEqual(buildSessionTreeItems(messages)[1].preview, '连接超时')
})

test('合并气泡：jumpEntryId 为气泡 entryId（首条 entry），blocks 已合并', () => {
    const messages: RailMessageLike[] = [
        msg('u1', 'user', [text('问题')]),
        { id: 'a-merged', role: 'assistant', entryId: 'a1', blocks: [tool('read_file'), text('回复')] },
    ]

    const items = buildSessionTreeItems(messages)

    assert.equal(items.length, 2)
    assert.equal(items[1].jumpEntryId, 'a1')
    assert.equal(items[1].preview, '[read_file]\n回复')
})
