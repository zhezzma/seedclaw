// src/composables/useTodoState.ts
// TodoBar 的数据源：从当前会话消息流 computed 出 todo 快照。
// 流式 toolResult 到达 → 自动更新；刷新/重连 → 从历史自动恢复，无需任何额外请求。
import { computed, ref, watch } from 'vue'
import {
    applySnapshotToMemory,
    extractTodoSnapshotFromSources,
    unionSeen,
    type TodoPanelMemory,
    type TodoTask,
} from '../utils/todo-snapshot'
import { useChatState } from './useChatState'

const PANEL_PREFIX = 'todo-panel:'
let legacyCleaned = false

function loadPanelMemory(sessionKey: string): TodoPanelMemory {
    try {
        if (!legacyCleaned) {
            // 一次性清理旧版指纹匹配方案的键（已被 seen/dismissed 状态机取代）
            legacyCleaned = true
            const stale: string[] = []
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i)
                if (k?.startsWith('todo-dismissed:')) stale.push(k)
            }
            stale.forEach((k) => localStorage.removeItem(k))
        }
        const raw = localStorage.getItem(PANEL_PREFIX + sessionKey)
        if (raw) {
            const parsed = JSON.parse(raw) as TodoPanelMemory
            if (Array.isArray(parsed?.seen)) return { seen: parsed.seen, dismissed: !!parsed.dismissed }
        }
    } catch {
        /* 隐私模式等不可用场景：记忆退化为会话内内存态 */
    }
    return { seen: [], dismissed: false }
}

function savePanelMemory(sessionKey: string, mem: TodoPanelMemory): void {
    try {
        localStorage.setItem(PANEL_PREFIX + sessionKey, JSON.stringify(mem))
    } catch {
        /* 同上，写入失败静默（关闭记忆退化为仅本次驻留有效） */
    }
}

export function useTodoState() {
    const chatState = useChatState()

    // 扫描拼接序列：chatToolMessages 是回合内按时间序追加的新条目，
    // 排在已固化的 chatMessages 之后，last-write-wins 语义才正确，
    // 使面板能在流式 toolResult 到达时实时更新（而非只在回合结束 done 全量刷新）。
    const snapshot = computed(() =>
        extractTodoSnapshotFromSources(chatState.chatMessages, chatState.chatToolMessages)
    )

    // 活任务三态白名单：手编/旧版数据的枚举外 status 若只按「非 deleted」过滤，
    // 会计入 total 却不落入任何分组（计数与明细不一致、面板永远无法进入可关闭态）
    const tasks = computed<TodoTask[]>(() =>
        (snapshot.value?.tasks ?? []).filter(
            (t) => t.status === 'pending' || t.status === 'in_progress' || t.status === 'completed',
        )
    )

    const counts = computed(() => ({
        done: tasks.value.filter((t) => t.status === 'completed').length,
        total: tasks.value.length,
        inProgress: tasks.value.filter((t) => t.status === 'in_progress').length,
        pending: tasks.value.filter((t) => t.status === 'pending').length,
    }))

    const inProgress = computed(() => tasks.value.find((t) => t.status === 'in_progress'))

    // 面板可见性状态机（TodoPanelMemory）：消失只由 ✕ 或无任务引起；
    // 重现只由「新活任务创建」触发——完成/删除/改名/快照回退都不再影响可见性。
    //
    // 跨会话一致性：快照与所属会话键【同源求值】（元组 watch 在同一 job 内读两个 source），
    // 回调内的 key 与 snap 保证属于同一会话——保存/写入永远命中正确会话的键，
    // 不再依赖「sessionKey watcher 先于 snapshot watcher 执行」的创建顺序假设
    // （否则切换 flush 中旧会话的记忆会撞上新会话的快照，把记忆覆盖污染）。
    // memOwner 归属兜底：sessionKey watch 因快照 null→null 不变而未触发元组 watch 的
    // 窗口里由它负责重载；两者任意顺序到达，写入前都能保证归属一致。
    const panelMem = ref<TodoPanelMemory>(loadPanelMemory(chatState.sessionKey))
    const memOwner = ref(chatState.sessionKey)
    watch(() => chatState.sessionKey, (key) => {
        memOwner.value = key
        panelMem.value = loadPanelMemory(key)
    })
    watch([snapshot, () => chatState.sessionKey], ([snap, key]) => {
        if (memOwner.value !== key) {
            // 归属不符：本 flush 内 sessionKey watch 尚未运行，同步重载后再应用
            memOwner.value = key
            panelMem.value = loadPanelMemory(key)
        }
        const next = applySnapshotToMemory(panelMem.value, snap)
        if (next !== panelMem.value) {
            panelMem.value = next
            savePanelMemory(key, next)
        }
    })

    const allDone = computed(() => counts.value.total > 0 && counts.value.done === counts.value.total)
    const visibleBar = computed(() => counts.value.total > 0 && !panelMem.value.dismissed)

    function dismiss(): void {
        // 把当前活任务 id 固化进 seen：非 immediate 的 snapshot watch 在「快照稳定期挂载」
        // （如路由往返后 HomeView 重挂、sessionsMap 仍存活）下从未触发，seen 可能为空；
        // 若只翻转 dismissed，切走再切回的首次快照触发会把已关任务误判为新任务而复活面板
        const seen = unionSeen(panelMem.value.seen, tasks.value.map((t) => t.id))
        panelMem.value = { ...panelMem.value, seen, dismissed: true }
        savePanelMemory(chatState.sessionKey, panelMem.value)
    }

    return { snapshot, tasks, counts, inProgress, dismiss, visibleBar, allDone }
}
