import type { DisplayBlock } from '../composables/useChatMessages'

export interface RenderableMessageLike {
    role: 'user' | 'assistant' | 'toolResult'
    entryId?: string
}

/**
 * 历史 session 里可能存在 content 为空的 assistant message。
 * 如果直接丢弃，这条 assistant 就无法作为分支导航按钮的挂载点，
 * 导致切到该分支后无法继续横向切换。
 */
export const ensureRenderableBlocks = (
    msg: RenderableMessageLike,
    blocks: DisplayBlock[],
): DisplayBlock[] => {
    if (blocks.length > 0) {
        return blocks
    }

    if (msg.role === 'assistant' && msg.entryId) {
        return [{ type: 'text', text: '' }]
    }

    return blocks
}
