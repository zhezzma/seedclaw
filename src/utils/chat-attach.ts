import type { ChatMessage, ChatSessionData } from '../composables/useChatState'

export interface AttachMessageState {
    messages?: ChatMessage[]
    deltaMessages?: ChatMessage[]
    streamMessage?: {
        content?: unknown
    } | null
    isStreaming?: boolean
}

export function getLastMessageEntryId(messages: ChatMessage[]): string | undefined {
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined
    return lastMessage?.entryId || undefined
}

export function shouldAttachSession(hasActiveSSE: boolean): boolean {
    return !hasActiveSSE
}

export function applyAttachMessageState(sessionData: ChatSessionData, state: AttachMessageState): void {
    // 1. 对齐当前分支的持久化消息历史。
    if (Array.isArray(state.messages)) {
        sessionData.chatMessages = state.messages
    } else if (Array.isArray(state.deltaMessages) && state.deltaMessages.length > 0) {
        const existingEntryIds = new Set(sessionData.chatMessages.map(message => message.entryId).filter(Boolean))
        const deduped = state.deltaMessages.filter(message => !message.entryId || !existingEntryIds.has(message.entryId))
        if (deduped.length > 0) {
            sessionData.chatMessages = [...sessionData.chatMessages, ...deduped]
        }
    }

    // 2. 对齐服务端对“当前是否仍在流”的判断。
    if (typeof state.isStreaming === 'boolean') {
        sessionData.chatSending = state.isStreaming
    }

    // 3. 恢复或清空半截 assistant 流。
    if (state.streamMessage?.content && Array.isArray(state.streamMessage.content)) {
        sessionData.chatStream = JSON.parse(JSON.stringify(state.streamMessage.content))
        return
    }

    if (state.isStreaming) {
        sessionData.chatStream = sessionData.chatStream || []
        return
    }

    sessionData.chatStream = null
}
