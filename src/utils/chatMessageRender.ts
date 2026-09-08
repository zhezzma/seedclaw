import type { DisplayBlock } from '../composables/useChatMessages'

export interface RenderableMessageLike {
    role: 'user' | 'assistant' | 'toolResult'
    entryId?: string
}

/**
 * 消息级错误（stopReason=error/aborted，落盘为 errorMessage）的消息里可能带有
 * 流式半截的 toolCall block：agent-loop 对 error/aborted 不执行工具、永远不会有
 * toolResult，不标记的话这些 block 会渲染成永远转圈的 calling 卡。
 * pi TUI 的同款处理：把 pending 工具直接 updateResult 为 error。
 * 已到终态（success/error）的 block 不动。
 */
export const markErroredToolBlocks = (blocks: DisplayBlock[], errorMessage: string): void => {
    for (const block of blocks) {
        if (block.type === 'tool' && (!block.toolState || block.toolState === 'calling')) {
            block.toolState = 'error'
            block.toolError = errorMessage
        }
    }
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
