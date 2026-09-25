/**
 * Session tree rail（桌面端左侧 minimap）的数据工具。
 *
 * rail 与消息气泡严格 1:1：每条 processedMessages 气泡（user / 合并后的 AI 轮）
 * 一根短横，jumpEntryId 即气泡 entryId —— 与 VirtualMessageList 的 item key
 * 同源，滚动跟随高亮（activeEntryId）无需换算。
 * 伪消息（streaming 占位 / 压缩行）没有 entryId，不产生短横。
 */

import type { DisplayBlock } from '../composables/useChatMessages'

/** rail 需要的最小消息形状（DisplayMessage 结构化子集） */
export interface RailMessageLike {
    role: 'user' | 'assistant'
    entryId?: string
    timestamp?: number
    blocks: DisplayBlock[]
}

export interface SessionTreeItem {
    type: 'user' | 'ai'
    /** 跳转目标 = 气泡 entryId（复用 handleJumpToTreeEntry / scrollToEntry） */
    jumpEntryId: string
    /** 预览文本：text 块正文，纯工具气泡用 [工具名] 列表，全空时回退触发本轮的 user 输入 */
    preview: string
    /** 消息时间戳（预览卡展示用） */
    timestamp?: number
}

const blockPreviewText = (block: DisplayBlock): string => {
    if (block.type === 'text' && block.text) return block.text
    if (block.type === 'tool' && block.toolName) return `[${block.toolName}]`
    if (block.type === 'error') return block.error || block.text || ''
    return ''
}

/**
 * 把消息气泡列表折叠成 rail 短横列表（列表顺序，即渲染顺序）。
 */
export const buildSessionTreeItems = (
    messages: RailMessageLike[] | null | undefined,
): SessionTreeItem[] => {
    if (!messages) return []

    const items: SessionTreeItem[] = []
    let lastUserPreview = ''

    for (const msg of messages) {
        if (!msg.entryId) continue

        const preview = msg.blocks
            .map(blockPreviewText)
            .filter(Boolean)
            .join('\n')
            .trim()

        if (msg.role === 'user') {
            lastUserPreview = preview
            items.push({ type: 'user', jumpEntryId: msg.entryId, preview, timestamp: msg.timestamp })
        } else {
            items.push({
                type: 'ai',
                jumpEntryId: msg.entryId,
                preview: preview || lastUserPreview,
                timestamp: msg.timestamp,
            })
        }
    }

    return items
}
