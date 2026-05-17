/**
 * Git Tab 的状态管理：
 *   - repos: 工作区下所有 git 仓库摘要
 *   - status: 当前选中仓库的 VSCode 风格三组分组
 *   - commits: 提交历史（支持 load more 翻页）
 *   - commitFiles: 每个 commit 展开后的文件列表（按 ref 缓存）
 *
 * 过期请求保护（双重）：
 *   - **agent 维度**：reset() 递增 `agentEpoch`；每个异步 load 起头时捕获当前 epoch，
 *     await 后比对——不匹配则丢弃响应。这覆盖跨 agent 切换场景。
 *   - **repo 维度**：load 起头时记录 `state.statusRepo / commitsRepo`；await 后比对——
 *     用户在同 agent 内切换仓库时，旧响应不会污染新仓库视图。
 *
 * 字段命名约定（重要）：
 *   - state 内部 boolean / error 字段统一用 `_` 前缀（`_reposLoading` / `_reposError` 等）
 *   - 对外 getter 暴露不带前缀的名字（`reposLoading.value` / `reposError.value` 等）
 *   - 这样 Object.assign(state, _methods) 时 _methods 的 getter 对象不会撞名覆盖 state 的 boolean
 *   - 浏览器实测教训：曾经因为同名导致 `state.reposLoading` 被 getter 对象覆盖，
 *     onMounted 的 `!git.reposLoading.value` 永远 false，loadRepos 第一次永远不触发。
 */
import { reactive } from 'vue'
import {
    fetchRepos, fetchStatus, fetchLog, fetchCommitFiles,
    type RepoSummary, type RepoStatus, type CommitMeta, type CommitFile,
} from './workspace-api.ts'

const LOG_PAGE_SIZE = 50

interface GitState {
    _reposLoading: boolean
    _reposError: string | null
    reposData: RepoSummary[]

    _statusLoading: boolean
    _statusError: string | null
    statusData: RepoStatus | null
    statusRepo: string | null

    _commitsLoading: boolean
    _commitsError: string | null
    commitsData: CommitMeta[]
    commitsRepo: string | null
    _commitsHasMore: boolean

    commitFilesData: Record<string, CommitFile[]>
    commitFilesLoading: Record<string, boolean>
}

const state = reactive<GitState>({
    _reposLoading: false,
    _reposError: null,
    reposData: [],
    _statusLoading: false,
    _statusError: null,
    statusData: null,
    statusRepo: null,
    _commitsLoading: false,
    _commitsError: null,
    commitsData: [],
    commitsRepo: null,
    _commitsHasMore: true,
    commitFilesData: {},
    commitFilesLoading: {},
})

// agent 级 epoch：每次 reset() 自增；异步 load 通过比对 epoch 丢弃跨 agent 的旧响应
let agentEpoch = 0

// 使用 getter 对象而非 computed：
// reactive(state) 上 Object.assign computed 会被 Vue 在 set 时 auto-unwrap，
// 导致 panel.repos.value 为 undefined。getter 保证渲染调用者仍能跟踪 reactive 依赖。
//
// **关键**：getter 名字必须与 state 字段名不同，否则 Object.assign 会用 getter 对象
// 覆盖 state 的原始字段（见文件头注释中的"字段命名约定"）。
const _methods = {
    repos: { get value() { return state.reposData } },
    reposLoading: { get value() { return state._reposLoading } },
    reposError: { get value() { return state._reposError } },

    status: { get value() { return state.statusData } },
    statusLoading: { get value() { return state._statusLoading } },
    statusError: { get value() { return state._statusError } },

    commits: { get value() { return state.commitsData } },
    commitsLoading: { get value() { return state._commitsLoading } },
    commitsError: { get value() { return state._commitsError } },
    commitsHasMore: { get value() { return state._commitsHasMore } },

    commitFiles: { get value() { return state.commitFilesData } },

    reset() {
        agentEpoch++
        state.reposData = []
        state._reposError = null
        state._reposLoading = false
        state.statusData = null
        state._statusError = null
        state._statusLoading = false
        state.statusRepo = null
        state.commitsData = []
        state._commitsError = null
        state._commitsLoading = false
        state.commitsRepo = null
        state._commitsHasMore = true
        state.commitFilesData = {}
        state.commitFilesLoading = {}
    },

    /**
     * 标记 status 为"过期"：
     * - statusRepo 置 null 让消费方（WorkspaceTabGit watch / onMounted 检查）触发重拉
     * - statusData 同时置 null 避免 UI 在重拉期间闪现旧数据；重拉会把 statusLoading 置 true，
     *   用户看到的是 loading spinner 而不是错位上一次的 status。
     * 用于 viewer 关闭后强制刷新（spec §6.4）。不直接 loadStatus 是因为调用方可能
     * 不知道当前 agentId/repo。
     */
    markStatusStale() {
        state.statusRepo = null
        state.statusData = null
    },

    async loadRepos(agentId: string) {
        const myEpoch = agentEpoch
        state._reposLoading = true
        state._reposError = null
        try {
            const r = await fetchRepos(agentId)
            if (myEpoch !== agentEpoch) return
            state.reposData = r.repos
        } catch (err: any) {
            if (myEpoch !== agentEpoch) return
            state._reposError = err?.message || String(err)
        } finally {
            if (myEpoch === agentEpoch) state._reposLoading = false
        }
    },

    async loadStatus(agentId: string, repo: string) {
        const myEpoch = agentEpoch
        state._statusLoading = true
        state._statusError = null
        state.statusRepo = repo
        try {
            const r = await fetchStatus(agentId, repo)
            if (myEpoch !== agentEpoch) return
            // 同 agent 内仓库切换的过期保护
            if (state.statusRepo === repo) state.statusData = r
        } catch (err: any) {
            if (myEpoch !== agentEpoch) return
            if (state.statusRepo === repo) state._statusError = err?.message || String(err)
        } finally {
            if (myEpoch === agentEpoch && state.statusRepo === repo) state._statusLoading = false
        }
    },

    async loadLog(agentId: string, repo: string) {
        const myEpoch = agentEpoch
        state._commitsLoading = true
        state._commitsError = null
        state.commitsRepo = repo
        state.commitsData = []
        state._commitsHasMore = true
        try {
            const r = await fetchLog(agentId, repo, { limit: LOG_PAGE_SIZE, skip: 0 })
            if (myEpoch !== agentEpoch) return
            if (state.commitsRepo === repo) {
                state.commitsData = r.commits
                state._commitsHasMore = r.commits.length === LOG_PAGE_SIZE
            }
        } catch (err: any) {
            if (myEpoch !== agentEpoch) return
            if (state.commitsRepo === repo) state._commitsError = err?.message || String(err)
        } finally {
            if (myEpoch === agentEpoch && state.commitsRepo === repo) state._commitsLoading = false
        }
    },

    async loadMoreLog(agentId: string, repo: string) {
        if (!state._commitsHasMore || state._commitsLoading) return
        if (state.commitsRepo !== repo) return
        const myEpoch = agentEpoch
        state._commitsLoading = true
        try {
            const r = await fetchLog(agentId, repo, { limit: LOG_PAGE_SIZE, skip: state.commitsData.length })
            if (myEpoch !== agentEpoch) return
            if (state.commitsRepo === repo) {
                state.commitsData = [...state.commitsData, ...r.commits]
                state._commitsHasMore = r.commits.length === LOG_PAGE_SIZE
            }
        } catch (err: any) {
            if (myEpoch !== agentEpoch) return
            if (state.commitsRepo === repo) state._commitsError = err?.message || String(err)
        } finally {
            if (myEpoch === agentEpoch && state.commitsRepo === repo) state._commitsLoading = false
        }
    },

    async loadCommitFiles(agentId: string, repo: string, ref: string): Promise<CommitFile[]> {
        if (state.commitFilesData[ref]) return state.commitFilesData[ref]
        if (state.commitFilesLoading[ref]) return []
        const myEpoch = agentEpoch
        state.commitFilesLoading[ref] = true
        try {
            const r = await fetchCommitFiles(agentId, repo, ref)
            if (myEpoch !== agentEpoch) return []
            state.commitFilesData[ref] = r.files
            return r.files
        } catch {
            return []
        } finally {
            if (myEpoch === agentEpoch) state.commitFilesLoading[ref] = false
        }
    },

    isCommitFilesLoading(ref: string): boolean {
        return state.commitFilesLoading[ref] === true
    },
}

// 状态与接口合并；getter 对象不是 ref，Vue 不会对其 unwrap。
// 不会冲突的字段（`statusRepo` / `commitsRepo` / `reposData` / `statusData` / `commitsData` /
// `commitFilesData` / `commitFilesLoading`）保持原名直接通过 _gitState 访问。
const _gitState = Object.assign(state, _methods)

export const useWorkspaceGit = () => _gitState
