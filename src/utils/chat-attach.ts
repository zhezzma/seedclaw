import type { ChatMessage, ChatSessionData } from '../composables/useChatState'
import { applyQueueSnapshot, type ServerQueueEntry } from './pending-queue.ts'

export interface AttachMessageState {
    messages?: ChatMessage[]
    deltaMessages?: ChatMessage[]
    streamMessage?: {
        content?: unknown
    } | null
    isStreaming?: boolean
    /** 服务端权威排队队列快照：刷新/切会话后与消息同帧恢复（本地不持久化队列） */
    pendingQueue?: ServerQueueEntry[]
    /** 快照版本号：乱序防护门禁（客户端只应用比本地新的快照） */
    queueRev?: number
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

    // 2.5 排队队列：服务端权威快照（queueRev 门禁防乱序；全量/delta 快照均携带，无则保持本地不变）
    if (Array.isArray(state.pendingQueue)) {
        applyQueueSnapshot(sessionData, state.queueRev, state.pendingQueue)
    }

    // 3. 恢复或清空半截 assistant 流。
    if (state.streamMessage?.content && Array.isArray(state.streamMessage.content)) {
        // 剥掉 toolCall block：客户端收不到 toolcall 参数增量（服务端只转发
        // text/thinking delta），快照里的 toolCall 是 partial-json 的流式中间态
        //（参数可能缺到只剩 task:""）。原样恢复会在 message_end 时被固化进历史，
        // 渲染成永远转圈的 calling 卡；随后 tool_execution_start 再 push 一份
        // 完整参数的同 id block，同一调用出现两张卡。toolCall 卡统一由
        // tool_execution_start 用完整参数重建（与 live 流程一致）。
        const replayed = state.streamMessage.content.filter(
            (block: any) => block?.type !== 'toolCall',
        )
        sessionData.chatStream = JSON.parse(JSON.stringify(replayed))
        return
    }

    if (state.isStreaming) {
        sessionData.chatStream = sessionData.chatStream || []
        return
    }

    sessionData.chatStream = null
}
