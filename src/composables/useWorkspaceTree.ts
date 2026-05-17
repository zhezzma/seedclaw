/**
 * Files Tab 的树缓存：按 path 分块缓存子项，懒加载。
 *
 * 避免重复请求；refresh() 清空缓存但保留 expanded 状态（不折叠用户已展开的目录）。
 */
import { reactive } from 'vue'
import { fetchTree, type TreeResult } from './workspace-api.ts'

interface CacheEntry {
    loading: boolean
    error: string | null
    result: TreeResult | null
}

interface TreeState {
    cache: Record<string, CacheEntry>
    expanded: Record<string, boolean>
}

const state = reactive<TreeState>({
    cache: {},
    expanded: {},
})

const _methods = {
    reset() {
        state.cache = {}
        state.expanded = {}
    },
    refresh() {
        // 只清 cache，保留 expanded：调用方负责重拉所有原本展开的路径
        // （参见 WorkspacePanel.refresh），避免“幽灵展开态”。
        // 保留 expanded 是为了不让用户辛苦展开的深层目录被刷新折叠。
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
    async loadPath(agentId: string, path: string): Promise<void> {
        if (state.cache[path]?.result) return
        state.cache[path] = { loading: true, error: null, result: null }
        try {
            const r = await fetchTree(agentId, path)
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

const _treeState = Object.assign(state, _methods)

export const useWorkspaceTree = () => _treeState
