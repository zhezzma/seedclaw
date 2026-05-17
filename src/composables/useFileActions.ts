/**
 * Workspace 文件 / 目录的右键菜单 action 工厂。
 *
 * 第一阶段：零后端工作量的「复制 + 发送到 chat」系列。
 * 共 6 项：复制（绝对 / 相对 / 文件名 / @引用）、发送（@引用 / 文件内容）。
 * 目录上自动禁用「@引用 / 发送内容」三项，对单文件才有意义。
 */
import { useChatInput } from './useChatInput'
import { useToast } from './useToast'
import { writeClipboard } from '../utils/clipboard'
import { fetchFile, fetchAgentFile, type TreeEntry } from './workspace-api'
import type { ContextMenuItem } from './useContextMenu'
import { i18n } from '../i18n'
import {
    DocumentDuplicateIcon,
    AtSymbolIcon,
    PaperAirplaneIcon,
    DocumentTextIcon,
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

export function buildFileMenuItems(args: BuildArgs): ContextMenuItem[] {
    const { entry, scope, agentId, root } = args
    const isFile = entry.type === 'file'
    const toast = useToast()
    // @引用 syntax 区分 scope：agent 配置文件用 @agent: 前缀，避免和 workspace 路径冲突
    const mention = scope === 'agent' ? `@agent:${entry.path}` : `@${entry.path}`

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
    ]
}
