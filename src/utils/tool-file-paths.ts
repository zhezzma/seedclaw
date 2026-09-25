/**
 * 工具调用路径按钮的纯函数集：args 结构化路径提取 + diff 打开前的路径/仓库/模式判定。
 *
 * 背景：argsPaths 原先对 JSON.stringify(args) 跑正则逆向抠路径，误判漏判难控。
 * 现在直接按参数键名提取（path / url / images[]，与 seedagent 工具 schema 对齐，
 * 工具名无关）；点击按钮优先打开 git diff（agent 对该文件的改动），不可 diff 回退直接打开。
 */

/** http(s)/ws(s)/ftp 等远程链接（scheme:// 形式）。注意 `D:/x` 不匹配（无 `//`）。 */
export function isWebUrl(p: string): boolean {
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(p)
}

/** /assets/... 公开静态端点（generate_image 产物），不是 workspace 文件路径。 */
export function isAssetUrl(p: string): boolean {
    return p.startsWith('/assets/')
}

/** 绝对路径判定：Windows 盘符（C:\ 或 C:/）、UNC（\\）、Unix（/）。 */
export function isAbsolutePath(p: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')
}

/** 统一为 / 分隔（Windows 工具参数与 workspace root 常混用 \ 和 /）。 */
export function toSlash(p: string): string {
    return p.replace(/\\/g, '/')
}

/** root + rel 拼绝对路径；分隔符归一为 /。 */
export function joinPath(root: string, rel: string): string {
    const r = toSlash(root).replace(/\/+$/, '')
    const s = toSlash(rel).replace(/^\/+/, '')
    return r ? `${r}/${s}` : s
}

/**
 * 绝对路径 → workspace 相对路径；不在 workspace 内返回 null。
 * Windows 盘符路径忽略大小写比较（工具输出与 root 的大小写常不一致）；其余平台大小写敏感。
 * 注意：纯字符串前缀匹配，不归一 ".."/"." 段 —— "../x" 会被判在 workspace 内，
 * 后果仅是 repo 匹配失败走回退直接打开（服务端按真实路径解析），无越界风险。
 */
export function toWorkspaceRelative(root: string, abs: string): string | null {
    const r = toSlash(root).replace(/\/+$/, '')
    const a = toSlash(abs)
    if (!r || a === r) return null
    const ci = /^[A-Za-z]:/.test(r)
    const rb = ci ? r.toLowerCase() : r
    const ab = ci ? a.toLowerCase() : a
    return ab.startsWith(rb + '/') ? a.slice(r.length + 1) : null
}

/**
 * 末段含 "." 才视为文件路径：目录参数（ls/grep/find 的 path 通常是目录）与尾部
 * 斜杠/"."/".." 被排除。代价是 Makefile 等无扩展名文件也不出按钮 —— 与旧正则
 * （要求 .ext）行为一致，属已知取舍。
 */
function looksLikeFile(p: string): boolean {
    const segs = toSlash(p).split('/')
    const last = segs[segs.length - 1]
    return !!last && last !== '.' && last !== '..' && last.includes('.')
}

/**
 * 从工具 args 中按参数键名提取路径（不做正则文本扫描）：
 * - path：read/write/edit/grep/find/ls/glob 等文件类工具的目标
 * - url：view_image（/assets/... 或磁盘路径；http(s) 远程链接排除）
 * - images[]：generate_image 的参考图（同 url 规则）
 *
 * args 也接受 string：流式期间 toolCallItem.arguments 是拼接中的原始 JSON 串
 * （useChatState append），与 formatJson 的 string 分支同规则 —— 像对象/数组就解析，
 * 解析失败返回空。
 *
 * 去重保序；值 trim 并归一 "./" 前缀（语义等价，否则 workspace 相对匹配不上只能走回退）。
 */
export function extractArgsPaths(args: Record<string, unknown> | string | null | undefined): string[] {
    if (typeof args === 'string') {
        const s = args.trim()
        if (!s.startsWith('{') && !s.startsWith('[')) return []
        try {
            return extractArgsPaths(JSON.parse(s))
        } catch {
            return []
        }
    }
    if (!args || typeof args !== 'object') return []
    const out: string[] = []
    const push = (v: unknown) => {
        if (typeof v !== 'string') return
        const s = v.trim().replace(/^[.][\\/]/, '')
        if (!s || isWebUrl(s) || !looksLikeFile(s)) return
        if (!out.includes(s)) out.push(s)
    }
    push(args.path)
    push(args.url)
    if (Array.isArray(args.images)) for (const v of args.images) push(v)
    return out
}

/**
 * workspace 相对文件路径 → 所属 repo 的 path（fetchRepos 的 RepoSummary.path：
 * 根仓库为 '.'，子仓为 workspace 相对目录）。取最长前缀匹配（路径段边界）；
 * workspace 不在任何 repo 内返回 null。
 */
export function findRepoFor(wsRelPath: string, repos: ReadonlyArray<{ path: string }>): string | null {
    let best: string | null = null
    let bestLen = -1
    for (const r of repos) {
        const p = toSlash(r.path)
        if (p === '.') {
            if (bestLen < 0) {
                best = r.path
                bestLen = 0
            }
            continue
        }
        if ((wsRelPath === p || wsRelPath.startsWith(p + '/')) && p.length > bestLen) {
            best = r.path
            bestLen = p.length
        }
    }
    return best
}

/** workspace 相对路径 → repo 内相对路径（WorkspaceDiffEditor 的 file 参数）。 */
export function toRepoRelative(repo: string, wsRelPath: string): string {
    return repo === '.' ? wsRelPath : wsRelPath.slice(toSlash(repo).length + 1)
}

/**
 * 按该文件在 git status 三组中的归属选 diff 模式：
 * untracked（新文件 vs 空白）→ unstaged（工作区 vs index/HEAD）→ staged（仅暂存）。
 * 不在任何组（文件干净，无改动可看）返回 null，调用方回退直接打开。
 */
export function pickDiffMode(
    status: { staged: { path: string }[]; unstaged: { path: string }[]; untracked: { path: string }[] },
    repoRelPath: string,
): 'unstaged' | 'staged' | 'untracked' | null {
    const has = (list: { path: string }[]) => list.some(c => c.path === repoRelPath)
    if (has(status.untracked)) return 'untracked'
    if (has(status.unstaged)) return 'unstaged'
    if (has(status.staged)) return 'staged'
    return null
}
