// src/utils/todo-snapshot.ts
// 从会话消息流提取 todo 全量快照（服务端工具结果的 details 持久化格式）。
// 纯函数、零 vue 依赖 —— node --test 回归基线直接可跑。
// 历史（GET /messages）与流式（SSE）同一入口，天然覆盖刷新/重连/实时更新三场景。
// 注意：工具名字面量 'todo' 与服务端唯一真相源同值——
// seedagent/src/extensions/todo/todo.ts 的 export const TOOL_NAME；改名须两仓同步，否则面板静默消失。

export type TodoTaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

export interface TodoTask {
    id: number
    subject: string
    description?: string
    activeForm?: string
    status: TodoTaskStatus
}

export interface TodoSnapshot {
    tasks: TodoTask[]
    nextId: number
}

/** 提取器只关心的最小消息形状（兼容 /messages 原始消息与流式增量）。 */
export interface MinimalMessage {
    role?: string
    toolName?: string
    details?: unknown
}

function isTodoDetails(v: unknown): v is { tasks: TodoTask[]; nextId: number } {
    if (!v || typeof v !== 'object') return false
    const d = v as Record<string, unknown>
    // Number.isFinite：NaN 能通过 typeof number，却会让后续所有匹配失效（与服务端守卫同强度）
    if (!Array.isArray(d.tasks) || typeof d.nextId !== 'number' || !Number.isFinite(d.nextId)) return false
    // 逐项形状守卫：防旧版本/手编数据把面板渲染炸掉（id 必须整数，小数/负数渲染成 #1.5/#-1）
    if (
        !d.tasks.every(
            (t) =>
                t && typeof t === 'object' &&
                Number.isInteger((t as TodoTask).id) &&
                typeof (t as TodoTask).subject === 'string' &&
                typeof (t as TodoTask).status === 'string',
        )
    )
        return false
    // id/nextId 一致性 + 唯一性（与服务端守卫同源）：正整数 id、nextId ≥ 1、所有 id < nextId；
    // 重复 id 会使 Vue :key 冲突、徽章语义混乱
    if ((d.nextId as number) < 1) return false
    const ids = new Set(d.tasks.map((t) => (t as TodoTask).id))
    if (ids.size !== d.tasks.length) return false
    const nextId = d.nextId as number
    return d.tasks.every((t) => (t as TodoTask).id >= 1 && (t as TodoTask).id < nextId)
}

/** 正序扫描，取最后一条形状匹配的 todo 工具结果快照；没有则 null。 */
export function extractTodoSnapshot(messages: MinimalMessage[]): TodoSnapshot | null {
    let snap: TodoSnapshot | null = null
    for (const m of messages) {
        if (!m || m.role !== 'toolResult' || m.toolName !== 'todo') continue
        if (!isTodoDetails(m.details)) continue
        snap = { tasks: m.details.tasks.map((t) => ({ ...t })), nextId: m.details.nextId }
    }
    return snap
}

/**
 * dismissed 复位用的内容签名：会话键 + 全量任务内容（含 subject/activeForm/description）。
 * - 任一字段变化都产生新签名：纯改名后已 dismiss 的面板也能复现（规格「快照再次变化自动复位」）。
 * - 拼入会话键：fork 出的同构会话快照逐字节相同，若只看内容会在新会话里错误保持隐藏。
 * 纯函数放此文件以便纳入 node --test 回归基线（composable 本体无法直测）。
 */
export function computeSnapshotSig(sessionKey: string, snapshot: TodoSnapshot | null): string {
    if (!snapshot) return ''
    return `${sessionKey}|${snapshot.nextId}|${JSON.stringify(snapshot.tasks)}`
}

/**
 * 双源拼接入口：流式条目必须排在历史之后（last-write-wins 按数组位置取末条）。
 * 抽成独立函数并纳入测试基线：若有人交换拼接顺序或在中间插入去重/切片，
 * 流式实时更新会静默退化为「回合结束才更新」——这是必须被测试钉住的顺序假设。
 */
export function extractTodoSnapshotFromSources(
    history: MinimalMessage[],
    streaming: MinimalMessage[],
): TodoSnapshot | null {
    return extractTodoSnapshot([...history, ...streaming])
}
