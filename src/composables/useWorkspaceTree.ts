/**
 * Files Tab 的树缓存：按 path 分块缓存子项，懒加载。
 *
 * 避免重复请求；refresh() 清空缓存但保留 expanded 状态（不折叠用户已展开的目录）。
 */
import { reactive } from 'vue'
import { fetchTree, type TreeResult } from './workspace-api.ts'

interface CacheEntry {
    /** 占位身份号：loadPath 写入后读回会经过 reactive 代理包装，对象引用比较恒不等；
     *  用自增 seq 判断“缓存条目是否仍是本次请求创建的”（invalidate/并发替换后旧响应丢弃）。 */
    seq: number
    loading: boolean
    error: string | null
    result: TreeResult | null
}

interface TreeState {
    cache: Record<string, CacheEntry>
    expanded: Record<string, boolean>
    /** 当前 cache 归属的 agentId；跨 agent 访问时由 ensureAgent 主动清理。 */
    currentAgentId: string | null
}

const state = reactive<TreeState>({
    cache: {},
    expanded: {},
    currentAgentId: null,
})

// agent 级 epoch：每次 reset() 自增；loadPath 通过比对 epoch 丢弃跨 agent 的旧响应。
// （与 useWorkspaceGit 同模式：没有它，切换 agent 后旧组件的在飞响应会把旧 agent
//  的目录列表写进已归属新 agent 的缓存，且持久到手动刷新。）
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
    /** 删除单条 path 的缓存。mutation（创建/删除）之后由调用者调用，
     *  让下一次 loadPath 能重拉。不走全量 refresh 是为了保留其他已展开路径的缓存。 */
    invalidate(path: string) {
        delete state.cache[path]
    },
    /** 级联失效：删除/改名**目录**后，旧路径前缀下的缓存与展开态全部过期。
     *  否则同路径复用（重建同名目录 / 改回原名）时 loadPath 缓存命中 → 幽灵文件。 */
    invalidatePrefix(prefix: string) {
        const hit = (p: string) => p === prefix || p.startsWith(prefix + '/')
        for (const p of Object.keys(state.cache)) if (hit(p)) delete state.cache[p]
        for (const p of Object.keys(state.expanded)) if (hit(p)) delete state.expanded[p]
    },
    async loadPath(agentId: string, path: string): Promise<void> {
        if (state.cache[path]?.result) return
        // 归属守护：store 已归属别的 agent 时（旧组件的迟到续体）不再写入。
        // currentAgentId 为 null 是「从未 ensureAgent」——放行（测试/首次场景）。
        if (state.currentAgentId !== null && state.currentAgentId !== agentId) return
        const myEpoch = agentEpoch
        const mySeq = ++nextEntrySeq
        state.cache[path] = { seq: mySeq, loading: true, error: null, result: null }
        try {
            const r = await fetchTree(agentId, path)
            // 双过期防护：agent 切换（epoch 变）或该 path 的占位已被替换/失效
            // （invalidate、并发 loadPath 先到者被后到者淘汰）→ 丢弃响应不写缓存。
            // 注意经 reactive 代理读回的对象引用 !== 原 entry，身份比对必须走 seq。
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

const _treeState = Object.assign(state, _methods)

export const useWorkspaceTree = () => _treeState
