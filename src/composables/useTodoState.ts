// src/composables/useTodoState.ts
// TodoBar 的数据源：从当前会话消息流 computed 出 todo 快照。
// 流式 toolResult 到达 → 自动更新；刷新/重连 → 从历史自动恢复，无需任何额外请求。
import { computed, ref, watch } from 'vue'
import { computeSnapshotSig, extractTodoSnapshotFromSources, type TodoTask } from '../utils/todo-snapshot'
import { useChatState } from './useChatState'

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

    // 全部完成后用户可手动关闭；快照再次变化（新任务/新一轮）自动复位。
    const dismissed = ref(false)
    // 内容签名（会话键 + 全量任务内容）：任一字段变化都复位 dismissed；
    // 拼入会话键，避免 fork 出的同构会话（快照逐字节相同）里面板被错误保持隐藏。
    const snapshotSig = computed(() => computeSnapshotSig(chatState.sessionKey, snapshot.value))
    watch(snapshotSig, () => {
        dismissed.value = false
    })

    const allDone = computed(() => counts.value.total > 0 && counts.value.done === counts.value.total)
    const visibleBar = computed(() => counts.value.total > 0 && !(allDone.value && dismissed.value))

    function dismiss(): void {
        dismissed.value = true
    }

    return { snapshot, tasks, counts, inProgress, dismissed, dismiss, visibleBar, allDone }
}
