/**
 * Agent 配置目录的树缓存（与 useWorkspaceTree 同构）。
 *
 * 与 useWorkspaceTree 的差异：
 * - 后端走 /workspace/agent-tree（顶层会过滤 workspace/sessions），保证不与主树重复
 * - 用于 Files tab 底部的 "Agent Files" 折叠区
 *
 * agent 切换由 WorkspacePanel 调用 reset()；session 切换不动（与主树一致）。
 */
import { reactive } from 'vue'
import { fetchAgentTree, type TreeResult } from './workspace-api.ts'

interface CacheEntry {
    loading: boolean
    error: string | null
    result: TreeResult | null
}

interface AgentFilesState {
    cache: Record<string, CacheEntry>
    expanded: Record<string, boolean>
    /** 当前 cache 归属的 agentId；跨 agent 访问时由 ensureAgent 主动清理。 */
    currentAgentId: string | null
}

const state = reactive<AgentFilesState>({
    cache: {},
    expanded: {},
    currentAgentId: null,
})

const _methods = {
    reset() {
        state.cache = {}
        state.expanded = {}
    },
    /** 按 agentId 守护 store 数据归属：不匹配则 reset 并记录新 agentId。 */
    ensureAgent(agentId: string) {
        if (state.currentAgentId === agentId) return
        this.reset()
        state.currentAgentId = agentId
    },
    refresh() {
        state.cache = {}
    },
    isExpanded(path: string): boolean {
        return state.expanded[path] === true
    },
    expandedPaths(): string[] {
        return Object.keys(state.expanded).filter(p => state.expanded[p] === true)
    },
    toggleExpand(path: string) {
        state.expanded[path] = !state.expanded[path]
    },
    entriesAt(path: string): TreeResult | null {
        return state.cache[path]?.result ?? null
    },
    isLoading(path: string): boolean {
        return state.cache[path]?.loading === true
    },
    errorAt(path: string): string | null {
        return state.cache[path]?.error ?? null
    },
    /** 删除单条 path 的缓存。mutation（创建/删除）之后由调用者调用。 */
    invalidate(path: string) {
        delete state.cache[path]
    },
    async loadPath(agentId: string, path: string): Promise<void> {
        if (state.cache[path]?.result) return
        state.cache[path] = { loading: true, error: null, result: null }
        try {
            const r = await fetchAgentTree(agentId, path)
            state.cache[path] = { loading: false, error: null, result: r }
        } catch (err: any) {
            state.cache[path] = {
                loading: false,
                error: err?.message || String(err),
                result: null,
            }
        }
    },
}

const _agentFilesState = Object.assign(state, _methods)

export const useAgentFiles = () => _agentFilesState
