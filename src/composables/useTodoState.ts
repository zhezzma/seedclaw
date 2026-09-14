// src/composables/useTodoState.ts
// TodoBar 的数据源：从当前会话消息流 computed 出 todo 快照。
// 流式 toolResult 到达 → 自动更新；刷新/重连 → 从历史自动恢复，无需任何额外请求。
import { computed, ref, watch } from 'vue'
import {
    computeSnapshotSig,
    extractTodoSnapshotFromSources,
    isTodoBarVisible,
    type TodoTask,
} from '../utils/todo-snapshot'
import { useChatState } from './useChatState'

const DISMISSED_PREFIX = 'todo-dismissed:'

function loadDismissedSig(sessionKey: string): string | null {
    try {
        return localStorage.getItem(DISMISSED_PREFIX + sessionKey)
    } catch {
        return null // 隐私模式等 localStorage 不可用场景：关闭记忆退化为会话内内存态
    }
}

function saveDismissedSig(sessionKey: string, sig: string): void {
    try {
        localStorage.setItem(DISMISSED_PREFIX + sessionKey, sig)
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

    // 「全部完成」面板的关闭记忆：按会话持久化（localStorage），刷新/切会话往返均保持隐藏。
    // 复现条件 = 快照结构指纹变化（新任务/状态变化）；同结构快照（含纯改名）永不再弹。
    const snapshotSig = computed(() => computeSnapshotSig(snapshot.value))
    const dismissedSig = ref<string | null>(loadDismissedSig(chatState.sessionKey))
    watch(
        () => chatState.sessionKey,
        () => {
            dismissedSig.value = loadDismissedSig(chatState.sessionKey)
        },
    )

    const allDone = computed(() => counts.value.total > 0 && counts.value.done === counts.value.total)
    const visibleBar = computed(() =>
        isTodoBarVisible(counts.value.total, allDone.value, snapshotSig.value, dismissedSig.value),
    )

    // clear（快照清空且 nextId 归位）重置关闭记忆：否则 clear 后重建同规模清单时，
    // 任务 id 复用使完成瞬间指纹与旧记忆相同，新周期的完成横幅会静默隐身
    watch([snapshotSig, () => snapshot.value?.nextId], () => {
        const snap = snapshot.value
        if (snap && snap.tasks.length === 0 && snap.nextId === 1 && dismissedSig.value !== null) {
            dismissedSig.value = null
            try {
                localStorage.removeItem(DISMISSED_PREFIX + chatState.sessionKey)
            } catch {
                /* 同写入路径，静默 */
            }
        }
    })

    function dismiss(): void {
        const sig = snapshotSig.value
        saveDismissedSig(chatState.sessionKey, sig)
        dismissedSig.value = sig
    }

    return { snapshot, tasks, counts, inProgress, dismiss, visibleBar, allDone }
}
