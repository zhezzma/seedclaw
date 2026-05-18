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
    stageFiles as apiStage, unstageFiles as apiUnstage,
    discardFiles as apiDiscard, commitChanges as apiCommit,
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

    /** 每 repo 独立记忆的 commit message，在 viewer / tab 切换间保留，agent 切换时重置。 */
    commitMessages: Record<string, string>
    /** 正在进行中的 mutation（stage / unstage / discard / commit）标记；
     *  UI 按钮 过期间禁用，避免重复点击并发 git 命令。 */
    _mutating: boolean
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
    commitMessages: {},
    _mutating: false,
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

    mutating: { get value() { return state._mutating } },

    /** 获取指定 repo 的 commit message（不存在返回空串）。 */
    getCommitMessage(repo: string): string {
        return state.commitMessages[repo] ?? ''
    },
    /** 写入指定 repo 的 commit message。 */
    setCommitMessage(repo: string, msg: string) {
        state.commitMessages[repo] = msg
    },

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
        state.commitMessages = {}
        state._mutating = false
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

    // ── Mutation：stage / unstage / discard / commit ──
    // 所有 mutation 退出后重拉 status；commit 额外重拉 log。
    // 错误上抛让调用者决定怎么处理（toast / 保留输入等）。
    //
    // Epoch 护栏：跟 loadStatus 同样的模式 — 起手记 myEpoch，api await 后比对；
    // 不匹配（agent 中途切换 → reset() 走过）则不会再走后续重拉，避免把旧 agent
    // 的 status 写进新 agent 的 reactive state（两个 agent 同名 repo 同路径时会发生）。
    async stage(agentId: string, repo: string, files?: string[]): Promise<void> {
        if (state._mutating) return
        const myEpoch = agentEpoch
        state._mutating = true
        try {
            await apiStage(agentId, repo, files)
            if (myEpoch !== agentEpoch) return
            await _gitState.loadStatus(agentId, repo)
        } finally {
            if (myEpoch === agentEpoch) state._mutating = false
        }
    },
    async unstage(agentId: string, repo: string, files?: string[]): Promise<void> {
        if (state._mutating) return
        const myEpoch = agentEpoch
        state._mutating = true
        try {
            await apiUnstage(agentId, repo, files)
            if (myEpoch !== agentEpoch) return
            await _gitState.loadStatus(agentId, repo)
        } finally {
            if (myEpoch === agentEpoch) state._mutating = false
        }
    },
    async discard(agentId: string, repo: string, files?: string[]): Promise<void> {
        if (state._mutating) return
        const myEpoch = agentEpoch
        state._mutating = true
        try {
            await apiDiscard(agentId, repo, files)
            if (myEpoch !== agentEpoch) return
            await _gitState.loadStatus(agentId, repo)
        } finally {
            if (myEpoch === agentEpoch) state._mutating = false
        }
    },
    async commit(agentId: string, repo: string, message: string): Promise<{ head: string | null }> {
        if (state._mutating) throw new Error('mutation in progress')
        const myEpoch = agentEpoch
        state._mutating = true
        try {
            const r = await apiCommit(agentId, repo, message)
            // commit 在服务端已成功，返回 head 让 caller toast。但 agent 变了不要写 reactive state。
            if (myEpoch !== agentEpoch) return { head: r.head }
            // 提交成功：清 message + 重拉 status + 重拉 log（顶部出现新提交）
            delete state.commitMessages[repo]
            await Promise.all([
                _gitState.loadStatus(agentId, repo),
                _gitState.loadLog(agentId, repo),
            ])
            return { head: r.head }
        } finally {
            if (myEpoch === agentEpoch) state._mutating = false
        }
    },
}

// 状态与接口合并；getter 对象不是 ref，Vue 不会对其 unwrap。
// 不会冲突的字段（`statusRepo` / `commitsRepo` / `reposData` / `statusData` / `commitsData` /
// `commitFilesData` / `commitFilesLoading`）保持原名直接通过 _gitState 访问。
const _gitState = Object.assign(state, _methods)

export const useWorkspaceGit = () => _gitState
