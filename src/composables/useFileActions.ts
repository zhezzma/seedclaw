/**
 * Workspace 文件 / 目录的右键菜单 action 工厂。
 *
 * 第一阶段：仅做「零后端工作量」的复制 + 发送到 chat 系列。
 * - 复制相对路径
 * - 复制文件名
 * - 复制 @引用语法（`@path`，方便 agent 解析）
 * - 发送 @引用 到 ChatInput
 * - 发送文件内容到 ChatInput（fetch 后追加为 fenced code block）
 *
 * 目录上自动禁用「发送内容 / 复制 @引用 / 发送 @引用」，因为这些都只对单文件有意义。
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
}

/** 在不引入对 vue-i18n 的强耦合下取译文；i18n.global 由 main 初始化。 */
function tr(key: string, params?: Record<string, unknown>): string {
    const g = i18n.global as any
    return params ? g.t(key, params) : g.t(key)
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

/** 把文本追加到 ChatInput。内部会同步退出 history 浏览态，
 *  避免用户随后按 ArrowDown 时被 "恢复 savedDraft" 逻辑吃掉追加内容。 */
function appendToChatInput(text: string) {
    useChatInput().appendText(text)
}

export function buildFileMenuItems(args: BuildArgs): ContextMenuItem[] {
    const { entry, scope, agentId } = args
    const isFile = entry.type === 'file'
    const toast = useToast()
    // @引用 syntax 区分 scope：agent 配置文件用 @agent: 前缀，避免和 workspace 路径冲突
    const mention = scope === 'agent' ? `@agent:${entry.path}` : `@${entry.path}`

    return [
        {
            label: tr('workspace.menu.copyPath'),
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
                appendToChatInput(mention)
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
                    appendToChatInput(fenceContent(entry.path, data.content))
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
