// tests/todo-snapshot.test.ts
// node:test 风格（纯函数，无 mock/无 vue 响应性），纳入 `node --test` 回归基线。
import test from 'node:test'
import assert from 'node:assert/strict'

import { extractTodoSnapshot, extractTodoSnapshotFromSources, computeSnapshotSig, type MinimalMessage } from '../src/utils/todo-snapshot.ts'

const msg = (over: Partial<MinimalMessage>): MinimalMessage => ({ role: 'toolResult', toolName: 'todo', ...over })

const snapMsg = (subjects: string[], nextId: number) =>
    msg({ details: { tasks: subjects.map((s, i) => ({ id: i + 1, subject: s, status: 'pending' })), nextId } })

test('空消息 / 无 todo 结果 → null', () => {
    assert.equal(extractTodoSnapshot([]), null)
    assert.equal(extractTodoSnapshot([{ role: 'assistant', content: [] }]), null)
    assert.equal(extractTodoSnapshot([msg({ toolName: 'read', details: { tasks: [], nextId: 1 } })]), null)
})

test('取最后一条 todo 快照（last-write-wins）', () => {
    const messages = [
        snapMsg(['A'], 2),
        { role: 'assistant', content: [] },
        snapMsg(['A', 'B'], 3),
    ]
    const snap = extractTodoSnapshot(messages)!
    assert.equal(snap.tasks.length, 2)
    assert.equal(snap.nextId, 3)
})

test('形状不匹配的 details 被跳过（错误结果 / 旧数据）', () => {
    const messages = [
        msg({ details: { error: 'boom' } }),
        msg({ details: 'garbage' }),
        snapMsg(['ok'], 2),
    ]
    const snap = extractTodoSnapshot(messages)!
    assert.equal(snap.tasks[0].subject, 'ok')
})

test('tasks 元素畸形（null / 缺字段 / 字段类型错）整条跳过', () => {
    const messages = [
        msg({ details: { tasks: [null, { id: 1, subject: 'A', status: 'pending' }], nextId: 2 } }),
        msg({ details: { tasks: [{ id: 'x', subject: 1, status: 'pending' }], nextId: 2 } }),
        msg({ details: { tasks: [{ id: NaN, subject: 'A', status: 'pending' }], nextId: 2 } }),
        msg({ details: { tasks: [{ id: 1.5, subject: 'A', status: 'pending' }], nextId: 2 } }),
        // 重复 id：update 会覆写全部同 id 任务、Vue :key 冲突
        msg({ details: { tasks: [{ id: 1, subject: 'A', status: 'pending' }, { id: 1, subject: 'B', status: 'pending' }], nextId: 2 } }),
        msg({ details: { tasks: [{ id: 2, subject: 'A', status: 'pending' }], nextId: 2 } }),
        msg({ details: { tasks: [{ id: 1, subject: 'A' }], nextId: 2 } }),
        snapMsg(['ok'], 2),
    ]
    const snap = extractTodoSnapshot(messages)!
    assert.equal(snap.tasks[0].subject, 'ok')
})

test('nextId 非有限数（NaN）视为畸形整条跳过', () => {
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [], nextId: NaN } })]), null)
})

test('负数 id / id≥nextId / description null 整条跳过', () => {
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [{ id: -1, subject: 'A', status: 'pending' }], nextId: 1 } })]), null)
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [{ id: 2, subject: 'A', status: 'pending' }], nextId: 2 } })]), null)
    // null 与 undefined 不同：守卫要求缺省或 string，null 拒绝（与服务端对称）
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [{ id: 1, subject: 'A', status: 'pending', description: null }], nextId: 2 } })]), null)
})

test('非整数 nextId / 字段类型错 / 超规模快照整条跳过（与服务端守卫同强度）', () => {
    // 非整数 nextId：服务端 create 会派生非法 id 快照，该快照反被守卫拒绝 → 双端静默失步
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [], nextId: 2.5 } })]), null)
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [{ id: 1, subject: 'A', status: 'pending', description: { evil: 1 } }], nextId: 2 } })]), null)
    assert.equal(extractTodoSnapshot([msg({ details: { tasks: [{ id: 1, subject: 'A', status: 'pending', activeForm: 9 }], nextId: 2 } })]), null)
    assert.equal(
        extractTodoSnapshot([msg({ details: { tasks: Array.from({ length: 1001 }, (_, i) => ({ id: i + 1, subject: 'A', status: 'pending' })), nextId: 1002 } })]),
        null,
    )
})

test('空 tasks 快照（clear 后）合法：返回非 null 空快照而非 null', () => {
    const snap = extractTodoSnapshot([msg({ details: { tasks: [], nextId: 1 } })])
    assert.ok(snap, 'empty tasks snapshot must not be rejected')
    assert.equal(snap!.tasks.length, 0)
    assert.equal(snap!.nextId, 1)
})

test('双源拼接：流式条目必须排在历史之后才赢得 last-write-wins（顺序假设守门）', () => {
    const history = [snapMsg(['old'], 2)]
    const streaming = [snapMsg(['new'], 3)]
    // 流式在后：胜出（面板实时更新的前提）
    assert.equal(extractTodoSnapshotFromSources(history, streaming)!.tasks[0].subject, 'new')
    // 空流式：回退历史（done 清空临时条目后的接力路径）
    assert.equal(extractTodoSnapshotFromSources(history, [])!.tasks[0].subject, 'old')
    // 双源都空：null
    assert.equal(extractTodoSnapshotFromSources([], []), null)
})

test('computeSnapshotSig：会话键或任务任一字段变化都产生新签名', () => {
    const s1 = { tasks: [{ id: 1, subject: 'A', status: 'pending' as const }], nextId: 2 }
    assert.equal(computeSnapshotSig('s1', s1), computeSnapshotSig('s1', s1))
    // 纯改名（status 不变）也要变签名：否则全部完成后 dismiss 的面板不再复现
    const renamed = { tasks: [{ id: 1, subject: 'A2', status: 'pending' as const }], nextId: 2 }
    assert.notEqual(computeSnapshotSig('s1', s1), computeSnapshotSig('s1', renamed))
    // fork 出的同构会话（快照相同、会话不同）必须产生不同签名，否则面板在对方会话里隐身
    assert.notEqual(computeSnapshotSig('s1', s1), computeSnapshotSig('s2', s1))
    assert.equal(computeSnapshotSig('s1', null), '')
})

test('返回深拷贝，调用方改动不污染源消息', () => {
    const details = { tasks: [{ id: 1, subject: 'A', status: 'pending' }], nextId: 2 }
    const snap = extractTodoSnapshot([msg({ details })])!
    snap.tasks[0].subject = 'MUTATED'
    assert.equal(details.tasks[0].subject, 'A')
})
