// src/composables/useTodoState.ts
// TodoBar 的数据源：从当前会话消息流 computed 出 todo 快照。
// 流式 toolResult 到达 → 自动更新；刷新/重连 → 从历史自动恢复，无需任何额外请求。
import { computed, ref, watch } from 'vue'
import {
    applySnapshotToMemory,
    extractTodoSnapshotFromSources,
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
    const panelMem = ref<TodoPanelMemory>(loadPanelMemory(chatState.sessionKey))
    watch(
        () => chatState.sessionKey,
        () => {
            panelMem.value = loadPanelMemory(chatState.sessionKey)
        },
    )
    watch(snapshot, (snap) => {
        const next = applySnapshotToMemory(panelMem.value, snap)
        if (next !== panelMem.value) {
            panelMem.value = next
            savePanelMemory(chatState.sessionKey, next)
        }
    })

    const allDone = computed(() => counts.value.total > 0 && counts.value.done === counts.value.total)
    const visibleBar = computed(() => counts.value.total > 0 && !panelMem.value.dismissed)

    function dismiss(): void {
        panelMem.value = { ...panelMem.value, dismissed: true }
        savePanelMemory(chatState.sessionKey, panelMem.value)
    }

    return { snapshot, tasks, counts, inProgress, dismiss, visibleBar, allDone }
}
