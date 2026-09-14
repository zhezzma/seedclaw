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
    // Number.isSafeInteger：非整数 nextId（如 2.5）会让服务端 create 派生出非法 id 快照，
    // 该快照再被本守卫拒绝 → 双端静默失步（与服务端守卫同强度）
    if (!Array.isArray(d.tasks) || typeof d.nextId !== 'number' || !Number.isSafeInteger(d.nextId)) return false
    // 规模上限：与服务端守卫同值，防手编/失控数据拖垮渲染
    if (d.tasks.length > 1000) return false
    // 逐项形状守卫：防旧版本/手编数据把面板渲染炸掉（id 必须整数，小数/负数渲染成 #1.5/#-1）
    if (
        !d.tasks.every(
            (t) =>
                t && typeof t === 'object' &&
                Number.isInteger((t as TodoTask).id) &&
                typeof (t as TodoTask).subject === 'string' &&
                typeof (t as TodoTask).status === 'string' &&
                ((t as TodoTask).description === undefined || typeof (t as TodoTask).description === 'string') &&
                ((t as TodoTask).activeForm === undefined || typeof (t as TodoTask).activeForm === 'string'),
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
 * 「全部完成」面板关闭记忆的结构指纹：活任务（非墓碑）的 id:status 序列。
 * - 不含 subject/description/activeForm：改名/补描述不该让已关闭的完成清单复活。
 * - 不含 nextId、不含墓碑：建了又删、清理旧墓碑都不复活面板。
 * - 新任务（id/status 集合变化）产生新指纹，面板自动重现。
 * 纯函数放此文件以便纳入 node --test 回归基线（composable 本体无法直测）。
 */
export function computeSnapshotSig(snapshot: TodoSnapshot | null): string {
    if (!snapshot) return ''
    // 三态白名单与 useTodoState.tasks 同口径：枚举外 status（手编数据）不计入指纹，
    // 否则其不可见的状态变化会引发面板的凭空复活/隐身
    return snapshot.tasks
        .filter((t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'completed')
        .map((t) => `${t.id}:${t.status}`)
        .join(',')
}

/**
 * TodoBar 可见性的组合判据（纯函数纳入 node --test 基线）：
 * 有活任务即显示；「全部完成」时若用户已关闭同结构清单则保持隐藏。
 */
export function isTodoBarVisible(
    total: number,
    allDone: boolean,
    sig: string,
    dismissedSig: string | null,
): boolean {
    return total > 0 && !(allDone && dismissedSig === sig)
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
