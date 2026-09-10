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
    /** 占位身份号（与 useWorkspaceTree 同语义，穿越 reactive 代理的身份比对）。 */
    seq: number
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

// agent 级 epoch：与 useWorkspaceTree 同模式，丢弃跨 agent 的旧响应。
let agentEpoch = 0
let nextEntrySeq = 0

const _methods = {
    reset() {
        agentEpoch++
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
    /** 级联失效：删除/改名目录后，旧路径前缀下的缓存与展开态全部过期（与主树同语义）。 */
    invalidatePrefix(prefix: string) {
        const hit = (p: string) => p === prefix || p.startsWith(prefix + '/')
        for (const p of Object.keys(state.cache)) if (hit(p)) delete state.cache[p]
        for (const p of Object.keys(state.expanded)) if (hit(p)) delete state.expanded[p]
    },
    async loadPath(agentId: string, path: string): Promise<void> {
        if (state.cache[path]?.result) return
        // 归属守护 + epoch + 占位身份三重过期防护（与 useWorkspaceTree 同模式）。
        if (state.currentAgentId !== null && state.currentAgentId !== agentId) return
        const myEpoch = agentEpoch
        const mySeq = ++nextEntrySeq
        state.cache[path] = { seq: mySeq, loading: true, error: null, result: null }
        try {
            const r = await fetchAgentTree(agentId, path)
            if (myEpoch !== agentEpoch || state.cache[path]?.seq !== mySeq) return
            state.cache[path] = { seq: mySeq, loading: false, error: null, result: r }
        } catch (err: any) {
            if (myEpoch !== agentEpoch || state.cache[path]?.seq !== mySeq) return
            state.cache[path] = {
                seq: mySeq,
                loading: false,
                error: err?.message || String(err),
                result: null,
            }
        }
    },
}

const _agentFilesState = Object.assign(state, _methods)

export const useAgentFiles = () => _agentFilesState
