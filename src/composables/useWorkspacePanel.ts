/**
 * Workspace 面板的全局状态：开关、宽度、tab 选中、每个 agent 最近一次选中的仓库。
 *
 * 持久化通过 useUiSettingsStore，重启/刷新后状态保留。
 *
 * 实现说明（factory 模式）：
 * - 每次 useWorkspacePanel() 都创建新一组 computed，绑定到当前 active pinia。
 * - 这与 useToast / useChatInput 的"模块级 Object.assign"不同——后者不依赖 pinia
 *   的 reactive proxy，可以单例；本 composable 必须每次创建以避免跨 setActivePinia
 *   生命周期的依赖陷阱（旧 computed 仍跟踪旧 store 实例）。
 */
import { computed } from 'vue'
import { useUiSettingsStore } from '../stores/setting.ts'

const MIN_WIDTH = 240
const MAX_WIDTH = 600
const DEFAULT_WIDTH = 360

function persistPanel(patch: Partial<{
    open: boolean
    width: number
    tab: 'files' | 'git'
}>) {
    const store = useUiSettingsStore()
    const next = { ...store.workspacePanel, ...patch }
    store.workspacePanel = next
    store.persist()
}

export function useWorkspacePanel() {
    const store = useUiSettingsStore()
    return {
        isOpen: computed(() => store.workspacePanel.open),
        width: computed(() => {
            const w = store.workspacePanel.width
            return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w))
        }),
        activeTab: computed(() => store.workspacePanel.tab),

        open() { persistPanel({ open: true }) },
        close() { persistPanel({ open: false }) },
        toggle() { persistPanel({ open: !store.workspacePanel.open }) },

        setWidth(w: number) {
            const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w)))
            persistPanel({ width: clamped })
        },
        resetWidth() { persistPanel({ width: DEFAULT_WIDTH }) },

        setTab(tab: 'files' | 'git') { persistPanel({ tab }) },

        setRepoForAgent(agentId: string, repo: string) {
            const repoByAgent = { ...store.workspacePanel.repoByAgent, [agentId]: repo }
            store.workspacePanel = { ...store.workspacePanel, repoByAgent }
            store.persist()
        },
        getRepoForAgent(agentId: string): string | null {
            return store.workspacePanel.repoByAgent[agentId] ?? null
        },
    }
}
