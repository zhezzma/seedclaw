/**
 * 工具事件的二级查找：chatStream 未命中时，回退到历史消息（chatMessages）
 * 中的 toolCall block。
 *
 * 背景：pi 的 agent loop 在 assistant message_end（消息落盘、streamingMessage
 * 清空）之后才执行工具——工具运行期间刷新页面重连，message_state.streamMessage
 * 恒为 null，toolCall block 只存在于已持久化的 assistant 历史消息里，chatStream
 * 为空数组。服务端 attach 会重放进行中工具的最新 tool_execution_update 快照
 * （见 seedagent src/agent/inflight-tool-updates.ts），若只搜 chatStream，
 * 重放与后续 live 事件都会被静默丢弃——子代理进度行/轨迹按钮无法恢复。
 *
 * 就地更新历史 block（返回引用）：chatMessages 为 reactive 深层代理，
 * 字段赋值即触发 processedMessages 重算。
 */

interface ChatMessageLike {
    role?: string
    content?: unknown
}

interface ToolCallBlockLike {
    type: string
    id?: string
    toolCallId?: string
    [k: string]: any
}

/**
 * 按 toolCallId 反向扫描历史消息，定位 toolCall block（最新消息优先）。
 * 仅精确匹配 id（toolCallId 全局唯一，不按 toolName 兜底——历史中可能存在
 * 同名工具的更早调用，按名字会误中）。
 */
export function findToolBlockInMessages(
    messages: ChatMessageLike[],
    toolCallId: string | undefined,
): ToolCallBlockLike | null {
    if (!toolCallId) return null
    for (let i = messages.length - 1; i >= 0; i--) {
        const content = messages[i]?.content
        if (!Array.isArray(content)) continue
        for (let j = content.length - 1; j >= 0; j--) {
            const item = content[j] as ToolCallBlockLike
            if (item?.type === 'toolCall' && (item.id === toolCallId || item.toolCallId === toolCallId)) {
                return item
            }
        }
    }
    return null
}
