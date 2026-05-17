/**
 * Workspace 文件 / 目录的右键菜单 action 工厂。
 *
 * 两类 action：
 * - 零后端：复制（绝对 / 相对 / 文件名 / @引用）、发送（@引用 / 文件内容）
 * - mutation：新建文件 / 新建目录 / 删除（走 useConfirm 确认）
 * 目录上自动禁用「@引用 / 发送内容」三项，对单文件才有意义。
 */
import { useChatInput } from './useChatInput'
import { useToast } from './useToast'
import { useConfirm } from './useConfirm'
import { writeClipboard } from '../utils/clipboard'
import {
    fetchFile, fetchAgentFile,
    createFile, createDir, deleteFile, deleteDir,
    createAgentFile, createAgentDir, deleteAgentFile, deleteAgentDir,
    type TreeEntry,
} from './workspace-api'
import type { ContextMenuItem } from './useContextMenu'
import { i18n } from '../i18n'
import {
    DocumentDuplicateIcon,
    AtSymbolIcon,
    PaperAirplaneIcon,
    DocumentTextIcon,
    DocumentPlusIcon,
    FolderPlusIcon,
    TrashIcon,
} from '@heroicons/vue/24/outline'

export type FileScope = 'workspace' | 'agent'

interface BuildArgs {
    agentId: string
    entry: TreeEntry
    scope: FileScope
    /**
     * 当前 scope 根目录的绝对路径（workspaceDir 或 agentDir）。
     * 由调用者从自己的 useWorkspaceTree / useAgentFiles 拿后传入，
     * 避免 useFileActions 跨模块 import composable 变成独立 singleton 实例。
     */
    root: string | null
    /**
     * mutation 后的刷新 callback，传入受影响的父目录路径（相对 root，根是 ""）。
     * 调用者负责 invalidate + loadPath；同样为了避免 HMR singleton 分裂，
     * useFileActions 不跨模块 import tree composable。
     */
    onMutated?: (parentPath: string) => void | Promise<void>
}

/** 在不引入对 vue-i18n 的强耦合下取译文；i18n.global 由 main 初始化。 */
function tr(key: string): string {
    return (i18n.global as any).t(key)
}

/** 拼出 entry 的绝对路径：root + entry.path。OS-native 分隔符以便于粘贴给本地工具。
 *  root 从调用者透入（TreeNode 可以直接拿到），避免跨模块 import composable。 */
function buildAbsolutePath(root: string | null, relPath: string): string {
    if (!root) return relPath
    // 服务端返回的 root 使用 Node 的 path.join：Windows 上是反斜杠，POSIX 上是正斜杠。
    // entry.path 服务端统一返回正斜杠；Windows 下走 backslash 路径拼接以避免混合分隔符。
    if (root.includes('\\')) {
        return root + '\\' + relPath.replace(/\//g, '\\')
    }
    return root + '/' + relPath
}

/** 把文件内容包成 fenced code block。
 *  关键：扫一遭 content 中最长连续反引号，外层用 N+1 个（至少 3），否则 README
 *  / SKILL.md 里本身的 ``` 会提前关闭外层、让 chat 渲染乱。CommonMark 允许任意 ≥3 个。 */
function fenceContent(path: string, content: string): string {
    const longest = (content.match(/`+/g) || []).reduce((m, s) => Math.max(m, s.length), 0)
    const fence = '`'.repeat(Math.max(3, longest + 1))
    return `\n${fence}${guessLang(path)} title="${path}"\n${content}\n${fence}\n`
}

/** 简易扩展名 → 高亮语言；不命中默认空（fence 仍合法）。 */
function guessLang(path: string): string {
    const ext = path.includes('.') ? (path.split('.').pop() || '').toLowerCase() : ''
    const map: Record<string, string> = {
        ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', vue: 'vue',
        py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
        rb: 'ruby', php: 'php', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c',
        css: 'css', html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml',
        md: 'markdown', sh: 'bash', sql: 'sql',
    }
    return map[ext] ?? ''
}

/** dir 入口点击 → 父是它自己；file 的父是它所在的目录。根 用 "" 表示。新建、删除都以该路径为错。 */
function parentOf(entry: TreeEntry): string {
    if (entry.type === 'dir') return entry.path
    const i = entry.path.lastIndexOf('/')
    return i === -1 ? '' : entry.path.slice(0, i)
}

function joinChild(parent: string, child: string): string {
    return parent ? `${parent}/${child}` : child
}

/** 检验 prompt() 收到的名字：不能是绝对路径、不能含 .. / 。返回规范后的 POSIX-style
 *  路径段（可能含中间 /，让用户能一口气输 sub/foo.md）；非法返回 null。
 *  调用者需区分 prompt 取消（原始 null）与非法输入（本函数返回 null）两种状态。 */
function validateChildName(raw: string | null): string | null {
    if (raw === null) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('/') || trimmed.startsWith('\\')) return null
    // Windows 盘符绝对路径：C:\foo / D:/bar 也要拦。后端有 canonicalization 兑底，
    // 这里拍是为了让“不能是绝对路径”语义与 Windows 用户直觉一致。
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return null
    const normalized = trimmed.replace(/\\/g, '/')
    if (normalized.split('/').some(seg => seg === '..' || seg === '.' || seg === '')) return null
    return normalized
}

export function buildFileMenuItems(args: BuildArgs): ContextMenuItem[] {
    const { entry, scope, agentId, root, onMutated } = args
    const isFile = entry.type === 'file'
    const isDir = entry.type === 'dir'
    const toast = useToast()
    const { confirm } = useConfirm()
    // @引用 syntax 区分 scope：agent 配置文件用 @agent: 前缀，避免和 workspace 路径冲突
    const mention = scope === 'agent' ? `@agent:${entry.path}` : `@${entry.path}`

    /** mutation 完成后的刷新动作：调用者负责 invalidate + loadPath。
     *  parent 不会为 undefined —— 新建、删除都以 entry 的父为错。 */
    const mutate = async (parent: string) => {
        if (onMutated) await onMutated(parent)
    }

    const create = scope === 'agent' ? createAgentFile : createFile
    const mkdir = scope === 'agent' ? createAgentDir : createDir
    const rmFile = scope === 'agent' ? deleteAgentFile : deleteFile
    const rmDir = scope === 'agent' ? deleteAgentDir : deleteDir

    return [
        {
            label: tr('workspace.menu.copyAbsolutePath'),
            icon: DocumentDuplicateIcon,
            action: async () => {
                await writeClipboard(buildAbsolutePath(root, entry.path))
                toast.success(tr('workspace.menu.copied'))
            },
        },
        {
            label: tr('workspace.menu.copyRelativePath'),
            icon: DocumentDuplicateIcon,
            action: async () => {
                await writeClipboard(entry.path)
                toast.success(tr('workspace.menu.copied'))
            },
        },
        {
            label: tr('workspace.menu.copyName'),
            icon: DocumentDuplicateIcon,
            action: async () => {
                await writeClipboard(entry.name)
                toast.success(tr('workspace.menu.copied'))
            },
        },
        {
            label: tr('workspace.menu.copyMention'),
            icon: AtSymbolIcon,
            disabled: !isFile,
            action: async () => {
                await writeClipboard(mention)
                toast.success(tr('workspace.menu.copied'))
            },
        },
        {
            label: tr('workspace.menu.sendMention'),
            icon: PaperAirplaneIcon,
            separator: true,
            disabled: !isFile,
            action: () => {
                useChatInput().appendText(mention)
                toast.success(tr('workspace.menu.sentToChat'))
            },
        },
        {
            label: tr('workspace.menu.sendContent'),
            icon: DocumentTextIcon,
            disabled: !isFile,
            action: async () => {
                try {
                    const data = scope === 'agent'
                        ? await fetchAgentFile(agentId, entry.path)
                        : await fetchFile(agentId, entry.path)
                    if (data.binary) {
                        toast.warning(tr('workspace.binaryFile'))
                        return
                    }
                    useChatInput().appendText(fenceContent(entry.path, data.content))
                    if (data.truncated) {
                        toast.warning(tr('workspace.menu.contentTruncated'))
                    } else {
                        toast.success(tr('workspace.menu.sentToChat'))
                    }
                } catch (e: any) {
                    // 封上动作语义：裸 "Network Error" 用户不知道是哪步失败
                    toast.error(`${tr('workspace.menu.sendContent')}: ${e?.message || String(e)}`)
                }
            },
        },
        // ── mutation：新建文件 / 新建目录（仅 dir entry） + 删除（所有 entry） ──
        {
            label: tr('workspace.menu.newFile'),
            icon: DocumentPlusIcon,
            separator: true,
            disabled: !isDir,
            action: async () => {
                const raw = window.prompt(tr('workspace.menu.newFilePrompt'))
                if (raw === null) return // 取消
                const name = validateChildName(raw)
                if (!name) {
                    toast.error(tr('workspace.menu.invalidName'))
                    return
                }
                const parent = parentOf(entry)
                const childPath = joinChild(parent, name)
                try {
                    await create(agentId, childPath)
                    await mutate(parent)
                    toast.success(tr('workspace.menu.created'))
                } catch (e: any) {
                    toast.error(`${tr('workspace.menu.newFile')}: ${e?.message || String(e)}`)
                }
            },
        },
        {
            label: tr('workspace.menu.newDir'),
            icon: FolderPlusIcon,
            disabled: !isDir,
            action: async () => {
                const raw = window.prompt(tr('workspace.menu.newDirPrompt'))
                if (raw === null) return // 取消
                const name = validateChildName(raw)
                if (!name) {
                    toast.error(tr('workspace.menu.invalidName'))
                    return
                }
                const parent = parentOf(entry)
                const childPath = joinChild(parent, name)
                try {
                    await mkdir(agentId, childPath)
                    await mutate(parent)
                    toast.success(tr('workspace.menu.created'))
                } catch (e: any) {
                    toast.error(`${tr('workspace.menu.newDir')}: ${e?.message || String(e)}`)
                }
            },
        },
        {
            label: tr('workspace.menu.delete'),
            icon: TrashIcon,
            separator: true,
            danger: true,
            action: async () => {
                const msg = isDir
                    ? tr('workspace.menu.deleteDirConfirm')
                    : tr('workspace.menu.deleteFileConfirm')
                const ok = await confirm(`${msg}\n\n${entry.path}`, tr('workspace.menu.delete'))
                if (!ok) return
                try {
                    if (isDir) await rmDir(agentId, entry.path)
                    else await rmFile(agentId, entry.path)
                    await mutate(parentOf(entry))
                    toast.success(tr('workspace.menu.deleted'))
                } catch (e: any) {
                    toast.error(`${tr('workspace.menu.delete')}: ${e?.message || String(e)}`)
                }
            },
        },
    ]
}
