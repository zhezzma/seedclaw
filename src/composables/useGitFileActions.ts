/**
 * Git Tab 状态行的右键菜单 action 工厂。
 *
 * 与 useFileActions 同一模式：
 * - 不跨模块 import composable（避免 HMR singleton 分裂）
 * - 所有 mutation 走调用者透入的 callback；factory 仅负责 prompt / confirm / toast
 *
 * 菜单项（按 group 区分）：
 * - Open File：所有 group 显示（deleted 状态禁用），由调用者给 onOpenFile 实现
 * - Open Changes：所有 group 显示（diff 视图）
 * - Stage / Discard：unstaged + untracked
 * - Unstage：staged
 * - Discard 必弹 confirm（对齐 VSCode）
 */
import { useToast } from './useToast'
import { useConfirm } from './useConfirm'
import { writeClipboard } from '../utils/clipboard'
import { buildAbsolutePath } from './useFileActions'
import type { ContextMenuItem } from './useContextMenu'
import type { FileChange } from './workspace-api'
import { i18n } from '../i18n'
import {
    PlusIcon,
    MinusIcon,
    TrashIcon,
    ArrowsRightLeftIcon,
    DocumentCheckIcon,
    DocumentDuplicateIcon,
    ArrowUturnLeftIcon,
} from '@heroicons/vue/24/outline'

export type GitGroup = 'unstaged' | 'staged'

/** 三处 git 文件行（工作区/暂存区/提交历史文件）共用的核心右键菜单参数。
 *  复制路径由调用方拼好绝对路径传入，工厂统一处理 clipboard + toast。 */
export interface GitFileMenuCommonArgs {
    /** 打开 diff 视图（跟点击行的默认行为相同）。 */
    onOpenDiff: () => void | Promise<void>
    /** 打开当前工作区文件（VSCode 风格 "Open File"）；不传则不显示该顶。 */
    onOpenFile?: () => void | Promise<void>
    /** 该文件的绝对路径（workspace root + repo + file），用于复制。 */
    absolutePath: string
    /** 打开文件是否禁用（如该文件在工作区已删除）。 */
    openFileDisabled?: boolean
}

export interface GitFileMenuArgs extends GitFileMenuCommonArgs {
    file: FileChange
    group: GitGroup
    /** 仅 unstaged + untracked 有效；调用者透入 git.stage(agentId, repo, [file.path])。 */
    onStage?: () => Promise<void>
    /** 仅 staged 有效；调用者透入 git.unstage(agentId, repo, [file.path])。 */
    onUnstage?: () => Promise<void>
    /** 仅 unstaged + untracked 有效；调用者透入 git.discard(agentId, repo, [file.path])。
     *  factory 在调用前已弹过 confirm。 */
    onDiscard?: () => Promise<void>
}

function tr(key: string, params?: Record<string, unknown>): string {
    const g = i18n.global as any
    return params ? g.t(key, params) : g.t(key)
}

/** 「打开文件」是否禁用：deleted 状态文件不存在于工作区。 */
function isOpenFileDisabled(file: FileChange): boolean {
    return file.status === 'D'
}

/** 是否是未跟踪文件（状态字符 ?）。
 *  决定 discard 的图标与提示文案：
 *  - tracked（修改中） → 撤销改动 (ArrowUturnLeft + revert 文案)
 *  - untracked → 删除文件 (Trash + delete 文案)
 *  group 可能同类合并后都进 "unstaged"，这里必须看文件状态本身。 */
function isUntrackedFile(file: FileChange): boolean {
    return file.status === '?'
}

/** 三处 git 文件行共用的核心菜单项：打开文件 → 打开 diff → 复制路径。
 *  工作区/暂存区在调本函数后追加 Stage/Unstage/Discard（见 buildGitFileMenuItems）。
 *  提交历史文件行只本函数的三项。 */
export function buildGitFileMenu(args: GitFileMenuCommonArgs): ContextMenuItem[] {
    const { onOpenDiff, onOpenFile, absolutePath, openFileDisabled } = args
    const toast = useToast()
    const items: ContextMenuItem[] = []

    if (onOpenFile) {
        items.push({
            label: tr('workspace.menu.openFile'),
            icon: DocumentCheckIcon,
            disabled: openFileDisabled,
            action: async () => {
                try { await onOpenFile() }
                catch (e: any) { toast.error(`${tr('workspace.menu.openFile')}: ${e?.message || e}`) }
            },
        })
    }

    items.push({
        label: tr('workspace.git.openChanges'),
        icon: ArrowsRightLeftIcon,
        action: async () => {
            try { await onOpenDiff() }
            catch (e: any) { toast.error(`${tr('workspace.git.openChanges')}: ${e?.message || e}`) }
        },
    })

    items.push({
        label: tr('workspace.menu.copyAbsolutePath'),
        icon: DocumentDuplicateIcon,
        action: async () => {
            try {
                await writeClipboard(absolutePath)
                toast.success(tr('workspace.menu.copied'))
            } catch (e: any) {
                toast.error(`${tr('workspace.menu.copyAbsolutePath')}: ${e?.message || e}`)
            }
        },
    })

    return items
}

export function buildGitFileMenuItems(args: GitFileMenuArgs): ContextMenuItem[] {
    const { file, group, onOpenDiff, onOpenFile, absolutePath, onStage, onUnstage, onDiscard } = args
    const toast = useToast()
    const { confirm } = useConfirm()
    const isUntracked = isUntrackedFile(file)

    // 前三项（打开文件 / 打开 diff / 复制路径）复用通用工厂。
    const items: ContextMenuItem[] = buildGitFileMenu({
        onOpenDiff,
        onOpenFile,
        absolutePath,
        openFileDisabled: onOpenFile ? isOpenFileDisabled(file) : undefined,
    })

    if (group !== 'staged' && onStage) {
        items.push({
            label: tr('workspace.git.stage'),
            icon: PlusIcon,
            separator: true,
            action: async () => {
                try { await onStage() }
                catch (e: any) { toast.error(`${tr('workspace.git.stage')}: ${e?.message || e}`) }
            },
        })
    }

    if (group === 'staged' && onUnstage) {
        items.push({
            label: tr('workspace.git.unstage'),
            icon: MinusIcon,
            separator: true,
            action: async () => {
                try { await onUnstage() }
                catch (e: any) { toast.error(`${tr('workspace.git.unstage')}: ${e?.message || e}`) }
            },
        })
    }

    if (group !== 'staged' && onDiscard) {
        items.push({
            label: tr('workspace.git.discard'),
            // 语义区分：untracked 是删文件 (TrashIcon)，tracked 是撤销改动 (ArrowUturnLeft)。
            // 跟 VSCode 的 discard 图标一致：垃圾桶 = 删除，U-turn 箭头 = revert。
            icon: isUntracked ? TrashIcon : ArrowUturnLeftIcon,
            separator: true,
            danger: true,
            action: async () => {
                const msg = isUntracked
                    ? tr('workspace.git.discardUntrackedConfirm')
                    : tr('workspace.git.discardConfirm')
                const ok = await confirm(`${msg}\n\n${file.path}`, tr('workspace.git.discard'))
                if (!ok) return
                try { await onDiscard() }
                catch (e: any) { toast.error(`${tr('workspace.git.discard')}: ${e?.message || e}`) }
            },
        })
    }

    return items
}

/**
 * 行内按钮配置（VSCode 风格 hover 出按钮）。
 * 与右键菜单走同一组 callback；自动按 group 决定可见集合。
 *
 * - 默认 mobile 始终可见；PC 通过外层 row 的 group-hover 才显示。
 * - discard 按钮在这里**不主动**弹 confirm，由父组件的 onDiscard 内部已弹。
 *   因此调用者传入的 onDiscard 必须自带 confirm（或转给 buildGitFileMenuItems 同样的 callback）。
 */
export interface InlineAction {
    /** aria-label / tooltip 文案 */
    label: string
    /** heroicon 组件 */
    icon: any
    /** 红色样式（用于 discard） */
    danger?: boolean
    /** 是否禁用 */
    disabled?: boolean
    /** 点击执行 */
    action: () => void | Promise<void>
}

export function buildGitInlineActions(args: GitFileMenuArgs): InlineAction[] {
    const { file, group, onOpenFile, onStage, onUnstage, onDiscard } = args
    const toast = useToast()
    const { confirm } = useConfirm()
    const isUntracked = isUntrackedFile(file)

    const actions: InlineAction[] = []

    if (onOpenFile) {
        actions.push({
            label: tr('workspace.menu.openFile'),
            icon: DocumentCheckIcon,
            disabled: isOpenFileDisabled(file),
            action: async () => {
                try { await onOpenFile() }
                catch (e: any) { toast.error(`${tr('workspace.menu.openFile')}: ${e?.message || e}`) }
            },
        })
    }

    // Discard 永远摆在 Stage / Unstage 之前（VSCode 行内按钮顺序：Open File · Discard · Stage）。
    // 行内按钮的 confirm 与右键菜单一致：必弹。
    if (group !== 'staged' && onDiscard) {
        actions.push({
            label: tr('workspace.git.discard'),
            // 同 buildGitFileMenuItems：untracked 是删文件，tracked 是撤销改动。
            icon: isUntracked ? TrashIcon : ArrowUturnLeftIcon,
            danger: true,
            action: async () => {
                const msg = isUntracked
                    ? tr('workspace.git.discardUntrackedConfirm')
                    : tr('workspace.git.discardConfirm')
                const ok = await confirm(`${msg}\n\n${file.path}`, tr('workspace.git.discard'))
                if (!ok) return
                try { await onDiscard() }
                catch (e: any) { toast.error(`${tr('workspace.git.discard')}: ${e?.message || e}`) }
            },
        })
    }

    if (group === 'staged' && onUnstage) {
        actions.push({
            label: tr('workspace.git.unstage'),
            icon: MinusIcon,
            action: async () => {
                try { await onUnstage() }
                catch (e: any) { toast.error(`${tr('workspace.git.unstage')}: ${e?.message || e}`) }
            },
        })
    }

    if (group !== 'staged' && onStage) {
        actions.push({
            label: tr('workspace.git.stage'),
            icon: PlusIcon,
            action: async () => {
                try { await onStage() }
                catch (e: any) { toast.error(`${tr('workspace.git.stage')}: ${e?.message || e}`) }
            },
        })
    }

    return actions
}

/** 「丢弃所有」共享流程：弹 confirm → 调 onConfirmed → 错误 toast。
 *  kind：决定提示文案
 *   - 'untracked'：全是未跟踪，走「删除 N 个未跟踪文件」
 *   - 'mixed' / 默认：走「丢弃 N 个文件的修改」 */
export async function runDiscardAllFlow(args: {
    count: number
    kind?: 'mixed' | 'untracked'
    onConfirmed: () => Promise<void>
}): Promise<void> {
    const { count, kind, onConfirmed } = args
    const toast = useToast()
    const { confirm } = useConfirm()
    const key = kind === 'untracked'
        ? 'workspace.git.discardAllUntrackedConfirm'
        : 'workspace.git.discardAllConfirm'
    const ok = await confirm(
        tr(key, { n: count }),
        tr('workspace.git.discardAll'),
    )
    if (!ok) return
    try { await onConfirmed() }
    catch (e: any) { toast.error(`${tr('workspace.git.discardAll')}: ${e?.message || e}`) }
}
