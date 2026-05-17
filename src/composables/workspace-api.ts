/**
 * Workspace 面板专用的强类型 API wrapper。
 *
 * 后端契约见：docs/superpowers/specs/2026-05-17-workspace-panel-design.md
 *
 * 设计考量：
 * - 不复用 ./api-client 是为了让 node:test 跳过测试时不依赖上游的 toast/store 链，
 *   也避免 workspace 面板的错误会被默认 toast 提醒污染。错误让上层 composable 自己
 *   决定如何呈现（内联在 panel 区域中）。
 */
import { useUiSettingsStore } from '../stores/setting.ts'

class WorkspaceApiError extends Error {
    code: number
    constructor(message: string, code: number) {
        super(message)
        this.name = 'WorkspaceApiError'
        this.code = code
    }
}

function baseUrl(): string {
    const settings = useUiSettingsStore()
    const url = settings.apiBaseUrl?.trim() || ''
    return url.replace(/\/+$/, '')
}

function authHeaders(): Record<string, string> {
    const settings = useUiSettingsStore()
    const headers: Record<string, string> = {}
    if (settings.token?.trim()) {
        headers['Authorization'] = `Bearer ${settings.token.trim()}`
    }
    return headers
}

async function wsGet<T>(path: string): Promise<T> {
    const url = `${baseUrl()}${path}`
    const response = await fetch(url, { method: 'GET', headers: authHeaders() })
    return await readResponse<T>(response)
}

async function wsPut<T>(path: string, body: unknown): Promise<T> {
    const url = `${baseUrl()}${path}`
    const response = await fetch(url, {
        method: 'PUT',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
    return await readResponse<T>(response)
}

async function wsPost<T>(path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl()}${path}`
    const init: RequestInit = { method: 'POST', headers: { ...authHeaders() } }
    if (body !== undefined) {
        init.headers = { ...init.headers, 'content-type': 'application/json' }
        init.body = JSON.stringify(body)
    }
    const response = await fetch(url, init)
    return await readResponse<T>(response)
}

async function wsDelete<T>(path: string): Promise<T> {
    const url = `${baseUrl()}${path}`
    const response = await fetch(url, { method: 'DELETE', headers: authHeaders() })
    return await readResponse<T>(response)
}

async function readResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let msg = `HTTP ${response.status}`
        try {
            const body = await response.json()
            if (body?.error) msg = body.error
        } catch { /* ignore */ }
        throw new WorkspaceApiError(msg, response.status)
    }
    const body = await response.json()
    if (body.ok === false) {
        throw new WorkspaceApiError(body.error || 'Unknown error', body.code || 500)
    }
    return body.payload as T
}

export type EntryType = 'dir' | 'file' | 'symlink'

export interface TreeEntry {
    name: string
    path: string
    type: EntryType
    size: number
    mtimeMs: number
    isGitRepo?: boolean
}

export interface TreeResult {
    root: string
    path: string
    entries: TreeEntry[]
    truncated?: true
}

export interface RepoSummary {
    name: string
    path: string
    branch: string | null
    head: string | null
    dirty: number
    ahead: number
    behind: number
    error?: string
}

export type FileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | 'T' | '?'

export interface FileChange {
    path: string
    status: FileStatus
    oldPath?: string
}

export interface RepoStatus {
    branch: string | null
    upstream: string | null
    head: string | null
    ahead: number
    behind: number
    staged: FileChange[]
    unstaged: FileChange[]
    untracked: FileChange[]
}

export interface CommitMeta {
    sha: string
    shortSha: string
    author: string
    authorDate: string
    subject: string
}

export type DiffMode = 'unstaged' | 'staged' | 'commit' | 'untracked'

export interface DiffResult {
    mode: DiffMode
    file: string
    binary: boolean
    truncated: boolean
    diff: string
}

export interface CommitFile {
    path: string
    status: 'M' | 'A' | 'D' | 'R' | 'C' | 'T'
    oldPath?: string
}

export interface FileContent {
    path: string
    binary: boolean
    truncated: boolean
    content: string
}

export interface FileVersions {
    mode: DiffMode
    file: string
    binary: boolean
    truncated: boolean
    /** before/after 为 null 表示该侧不存在（新增/删除）。binary=true 时两侧均为 null。 */
    before: string | null
    after: string | null
}

const base = (agentId: string) => `/api/agents/${encodeURIComponent(agentId)}/workspace`

export function fetchTree(agentId: string, path: string): Promise<TreeResult> {
    const qs = path ? `?path=${encodeURIComponent(path)}` : ''
    return wsGet<TreeResult>(`${base(agentId)}/tree${qs}`)
}

export function fetchRepos(agentId: string): Promise<{ repos: RepoSummary[] }> {
    return wsGet(`${base(agentId)}/repos`)
}

export function fetchStatus(agentId: string, repo: string): Promise<RepoStatus> {
    return wsGet(`${base(agentId)}/repo/status?repo=${encodeURIComponent(repo)}`)
}

export function fetchLog(
    agentId: string,
    repo: string,
    opts?: { limit?: number; skip?: number },
): Promise<{ commits: CommitMeta[] }> {
    const params = new URLSearchParams({ repo })
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts?.skip !== undefined) params.set('skip', String(opts.skip))
    return wsGet(`${base(agentId)}/repo/log?${params.toString()}`)
}

export interface DiffArgs {
    repo: string
    mode: DiffMode
    file: string
    ref?: string
}

export function fetchDiff(agentId: string, args: DiffArgs): Promise<DiffResult> {
    const params = new URLSearchParams({
        repo: args.repo,
        mode: args.mode,
        file: args.file,
    })
    if (args.ref) params.set('ref', args.ref)
    return wsGet(`${base(agentId)}/repo/diff?${params.toString()}`)
}

export function fetchCommitFiles(
    agentId: string,
    repo: string,
    ref: string,
): Promise<{ ref: string; files: CommitFile[] }> {
    return wsGet(`${base(agentId)}/repo/commit/files?repo=${encodeURIComponent(repo)}&ref=${encodeURIComponent(ref)}`)
}

/** 读取单个文件内容（agent-scoped，resolveSafe 保护）。 */
export function fetchFile(agentId: string, path: string): Promise<FileContent> {
    return wsGet<FileContent>(`${base(agentId)}/file?path=${encodeURIComponent(path)}`)
}

/** 覆写已存在的文件（agent-scoped，拒绝创建、拒绝写目录/越界）。 */
export function saveFile(
    agentId: string,
    path: string,
    content: string,
): Promise<{ path: string; bytes: number }> {
    return wsPut(`${base(agentId)}/file?path=${encodeURIComponent(path)}`, { content })
}

/** 创建新文件（workspace scope）。content 默认 ""，路径已存在 → 409。 */
export function createFile(
    agentId: string,
    path: string,
    content?: string,
): Promise<{ path: string; bytes: number }> {
    return wsPost(`${base(agentId)}/file?path=${encodeURIComponent(path)}`, { content: content ?? '' })
}

/** 创建目录（workspace scope）。mkdir -p 语义，已存在 idempotent。 */
export function createDir(
    agentId: string,
    path: string,
): Promise<{ path: string; alreadyExists: boolean }> {
    return wsPost(`${base(agentId)}/dir?path=${encodeURIComponent(path)}`)
}

/** 删除普通文件（workspace scope）。 */
export function deleteFile(agentId: string, path: string): Promise<{ path: string }> {
    return wsDelete(`${base(agentId)}/file?path=${encodeURIComponent(path)}`)
}

/** 递归删除目录（workspace scope）。 */
export function deleteDir(agentId: string, path: string): Promise<{ path: string }> {
    return wsDelete(`${base(agentId)}/dir?path=${encodeURIComponent(path)}`)
}

/** 读 agent 配置目录子项 (workspace/sessions 在顶层被后端过滤)。 */
export function fetchAgentTree(agentId: string, path: string): Promise<TreeResult> {
    const qs = path ? `?path=${encodeURIComponent(path)}` : ''
    return wsGet<TreeResult>(`${base(agentId)}/agent-tree${qs}`)
}

/** 读 agent 配置目录下的文件。 */
export function fetchAgentFile(agentId: string, path: string): Promise<FileContent> {
    return wsGet<FileContent>(`${base(agentId)}/agent-file?path=${encodeURIComponent(path)}`)
}

/** 覆写 agent 配置目录下已存在的文件。 */
export function saveAgentFile(
    agentId: string,
    path: string,
    content: string,
): Promise<{ path: string; bytes: number }> {
    return wsPut(`${base(agentId)}/agent-file?path=${encodeURIComponent(path)}`, { content })
}

/** 创建新文件（agent scope）。顶层拒 workspace/ 与 sessions/。 */
export function createAgentFile(
    agentId: string,
    path: string,
    content?: string,
): Promise<{ path: string; bytes: number }> {
    return wsPost(`${base(agentId)}/agent-file?path=${encodeURIComponent(path)}`, { content: content ?? '' })
}

/** 创建目录（agent scope）。 */
export function createAgentDir(
    agentId: string,
    path: string,
): Promise<{ path: string; alreadyExists: boolean }> {
    return wsPost(`${base(agentId)}/agent-dir?path=${encodeURIComponent(path)}`)
}

/** 删除普通文件（agent scope）。 */
export function deleteAgentFile(agentId: string, path: string): Promise<{ path: string }> {
    return wsDelete(`${base(agentId)}/agent-file?path=${encodeURIComponent(path)}`)
}

/** 递归删除目录（agent scope）。 */
export function deleteAgentDir(agentId: string, path: string): Promise<{ path: string }> {
    return wsDelete(`${base(agentId)}/agent-dir?path=${encodeURIComponent(path)}`)
}

/** 拉 diff 两侧完整文本，供 monaco diff editor 使用。 */
export function fetchFileVersions(agentId: string, args: DiffArgs): Promise<FileVersions> {
    const params = new URLSearchParams({
        repo: args.repo,
        mode: args.mode,
        file: args.file,
    })
    if (args.ref) params.set('ref', args.ref)
    return wsGet<FileVersions>(`${base(agentId)}/repo/file-versions?${params.toString()}`)
}
