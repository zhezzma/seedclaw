// tests/todo-snapshot.test.ts
// node:test 风格（纯函数，无 mock/无 vue 响应性），纳入 `node --test` 回归基线。
import test from 'node:test'
import assert from 'node:assert/strict'

import { extractTodoSnapshot, extractTodoSnapshotFromSources, computeSnapshotSig, isTodoBarVisible, type MinimalMessage } from '../src/utils/todo-snapshot.ts'

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

test('sig 口径与计数一致：枚举外 status 不计入指纹（防不可见事件引发复活/隐身）', () => {
    const withBlocked = { tasks: [{ id: 1, subject: 'A', status: 'completed' as const }, { id: 2, subject: 'B', status: 'blocked' as never }], nextId: 3 }
    const withoutBlocked = { tasks: [{ id: 1, subject: 'A', status: 'completed' as const }], nextId: 3 }
    // blocked 任务被三态白名单排除，指纹与纯 completed 清单一致
    assert.equal(computeSnapshotSig(withBlocked), computeSnapshotSig(withoutBlocked))
    assert.equal(computeSnapshotSig(withBlocked), '1:completed')
})

test('isTodoBarVisible：全状态枚举（关闭记忆对任何状态生效）', () => {
    // 无任务：恒隐藏
    assert.equal(isTodoBarVisible(0, '', null), false)
    // 进行中未关：显示
    assert.equal(isTodoBarVisible(2, '1:in_progress,2:pending', null), true)
    // 进行中已关（同指纹，如中断/abort 后不想看）：隐藏 —— ✕ 任何状态可用
    assert.equal(isTodoBarVisible(2, '1:in_progress,2:pending', '1:in_progress,2:pending'), false)
    // 已关后状态变化（任务完成）：重现一次
    assert.equal(isTodoBarVisible(2, '1:completed,2:pending', '1:in_progress,2:pending'), true)
    // 全部完成未关：显示
    assert.equal(isTodoBarVisible(1, '1:completed', null), true)
    // 全部完成已关：隐藏
    assert.equal(isTodoBarVisible(1, '1:completed', '1:completed'), false)
    // 已关后新任务：重现
    assert.equal(isTodoBarVisible(2, '1:completed,2:pending', '1:completed'), true)
    // 已关后清空（total=0）：恒隐藏
    assert.equal(isTodoBarVisible(0, '', '1:completed'), false)
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

test('computeSnapshotSig：活任务结构指纹（关闭记忆的复现判据）', () => {
    const s1 = { tasks: [{ id: 1, subject: 'A', status: 'pending' as const }], nextId: 2 }
    assert.equal(computeSnapshotSig(s1), computeSnapshotSig(s1))
    // 纯改名/补描述不产生新签名：已关闭的完成清单不被无关编辑复活
    const renamed = { tasks: [{ id: 1, subject: 'A2', description: 'd', activeForm: 'f', status: 'pending' as const }], nextId: 2 }
    assert.equal(computeSnapshotSig(s1), computeSnapshotSig(renamed))
    // 墓碑增减不影响指纹（清理旧墓碑不复活面板）；nextId 单独变化也不影响（建了又删不复活）
    const withTomb = { tasks: [{ id: 1, subject: 'A', status: 'deleted' as const }, { id: 2, subject: 'B', status: 'pending' as const }], nextId: 3 }
    assert.equal(computeSnapshotSig(withTomb), computeSnapshotSig({ tasks: [{ id: 2, subject: 'B', status: 'pending' as const }], nextId: 3 }))
    const bumpedNextId = { tasks: [{ id: 1, subject: 'A', status: 'pending' as const }], nextId: 9 }
    assert.equal(computeSnapshotSig(s1), computeSnapshotSig(bumpedNextId))
    // 状态/集合变化 → 新指纹：新任务开始后面板重现
    const progressed = { tasks: [{ id: 1, subject: 'A', status: 'completed' as const }], nextId: 2 }
    assert.notEqual(computeSnapshotSig(s1), computeSnapshotSig(progressed))
    const appended = { tasks: [{ id: 1, subject: 'A', status: 'completed' as const }, { id: 2, subject: 'B', status: 'pending' as const }], nextId: 3 }
    assert.notEqual(computeSnapshotSig(progressed), computeSnapshotSig(appended))
    assert.equal(computeSnapshotSig(null), '')
})

test('返回深拷贝，调用方改动不污染源消息', () => {
    const details = { tasks: [{ id: 1, subject: 'A', status: 'pending' }], nextId: 2 }
    const snap = extractTodoSnapshot([msg({ details })])!
    snap.tasks[0].subject = 'MUTATED'
    assert.equal(details.tasks[0].subject, 'A')
})
