import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { computeBlockKeys } from '../src/utils/blockKeys.ts'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const bubblePath = path.resolve(testDir, '../src/components/chat/MessageBubble.vue')

test('tool blocks key by toolCallId, a2ui by surfaceId', () => {
    const keys = computeBlockKeys([
        { type: 'tool', toolCallId: 'call-1' },
        { type: 'a2ui', a2uiSurfaceId: 'surf-1' },
        { type: 'tool', toolCallId: 'call-2' },
    ])
    assert.deepEqual(keys, ['tool-call-1', 'a2ui-surf-1', 'tool-call-2'])
})

test('per-type ordinal: inserting a foreign block does not shift same-type keys', () => {
    // 流式中段分裂场景：a2ui 把 text 块分裂为 [text, a2ui, text]。
    // 关键不变量：thinking 的类型内序号不受异类块插入影响 →
    // 状态子组件（如展开状态）不丢
    const before = computeBlockKeys([
        { type: 'text' },
        { type: 'thinking' },
    ])
    const after = computeBlockKeys([
        { type: 'text' },
        { type: 'a2ui', a2uiSurfaceId: 'surf-1' },
        { type: 'text' },
        { type: 'thinking' },
    ])
    assert.deepEqual(before, ['text-0', 'thinking-0'])
    assert.deepEqual(after, ['text-0', 'a2ui-surf-1', 'text-1', 'thinking-0'])
    // thinking 键在插入前后保持不变（这正是状态保持的依据）
    assert.equal(before[1], after[3])
})

test('appends extend keys without mutating existing ones (streaming growth)', () => {
    // 流式追加场景：thinking → thinking+text。既有键必须原样保留
    const before = computeBlockKeys([{ type: 'thinking' }, { type: 'tool', toolCallId: 'c1' }])
    const after = computeBlockKeys([{ type: 'thinking' }, { type: 'tool', toolCallId: 'c1' }, { type: 'text' }])
    assert.deepEqual(after.slice(0, 2), before)
    assert.equal(after[2], 'text-0')
})

test('duplicate keys get suffixed to keep Vue key uniqueness', () => {
    // 刷新重连：历史快照 + 流式重放各含同 id 僵尸工具块
    const keys = computeBlockKeys([
        { type: 'tool', toolCallId: 'dup' },
        { type: 'tool', toolCallId: 'dup' },
        { type: 'tool', toolCallId: 'dup' },
    ])
    assert.deepEqual(keys, ['tool-dup', 'tool-dup~2', 'tool-dup~3'])
    assert.equal(new Set(keys).size, 3)
})

test('every frame-rebuilt array yields identical keys (object identity irrelevant)', () => {
    // computed 每帧重建数组（新对象引用），键必须仅由数据决定
    const mk = () => [{ type: 'text' }, { type: 'thinking' }, { type: 'tool', toolCallId: 'x' }]
    assert.deepEqual(computeBlockKeys(mk()), computeBlockKeys(mk()))
})

test('image_gallery streaming evolution yields monotonic prefix-stable keys', () => {
    // 复刻 MessageBubble.assistantParsedBlocks 的 gallery 分组：连续 image 合并为一组。
    // 帧序列模拟流式逐帧变异，断言每帧键序列是前帧的严格前缀扩展（既有键永不变）
    const gallery = (n: number) => ({ type: 'image_gallery', images: Array.from({ length: n }, (_, i) => ({ type: 'image' })) })
    const frames: { type: string; images?: unknown[] }[][] = [
        [{ type: 'text' }],
        [{ type: 'text' }, gallery(1)],
        [{ type: 'text' }, gallery(2)],                              // gallery 内图片追加：键不变
        [{ type: 'text' }, gallery(2), { type: 'text' }],          // 非 image 块关闭 gallery：追加新键
        [{ type: 'text' }, gallery(2), { type: 'text' }, gallery(1)], // 再开新组：拿下一个序号
    ]
    const keyFrames = frames.map(f => computeBlockKeys(f as any))
    assert.deepEqual(keyFrames, [
        ['text-0'],
        ['text-0', 'image_gallery-0'],
        ['text-0', 'image_gallery-0'],
        ['text-0', 'image_gallery-0', 'text-1'],
        ['text-0', 'image_gallery-0', 'text-1', 'image_gallery-1'],
    ])
    // 逐帧验证前缀稳定性：后帧键序列以前帧为前缀，且后缀均为新增键
    for (let i = 1; i < keyFrames.length; i++) {
        const prev = keyFrames[i - 1]
        const curr = keyFrames[i]
        assert.deepEqual(curr.slice(0, prev.length), prev, `frame ${i} must extend, not rewrite, prior keys`)
    }
})

test('MessageBubble wires assistant v-for to stable keys', () => {
    // 仓库惯例：源码静态断言，防止未来把 :key 改回索引键
    const bubbleSource = readFileSync(bubblePath, 'utf8')
    assert.match(bubbleSource, /:key="assistantBlockKeys\[bIndex\]"/,
        'assistant v-for must key by assistantBlockKeys, not index')
    assert.ok(!/v-for="\(block, bIndex\) in assistantParsedBlocks" :key="bIndex"/.test(bubbleSource),
        'must not key assistant blocks by bare index')
})
