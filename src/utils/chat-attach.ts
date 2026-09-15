import type { ChatMessage, ChatSessionData } from '../composables/useChatState'
import { applyQueueSnapshot, type ServerQueueEntry } from './pending-queue.ts'

export interface AttachMessageState {
    messages?: ChatMessage[]
    deltaMessages?: ChatMessage[]
    streamMessage?: {
        content?: unknown
    } | null
    isStreaming?: boolean
    /** 上下文压缩进行中（服务端 attach 语义：压缩窗口非 run 但忙，随
     * message_state 下发；旧服务端无此字段，缺省不动本地状态） */
    compacting?: boolean
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
        // 全量快照 = 服务端给出的当前分支权威历史：流式临时条目一并作废
        //（若服务端分支已被另一窗口改写，残留条目会以数组尾部位置赢得 last-write-wins）；delta 增量路径不动
        sessionData.chatToolMessages = []
    } else if (Array.isArray(state.deltaMessages) && state.deltaMessages.length > 0) {
        const existingEntryIds = new Set(sessionData.chatMessages.map(message => message.entryId).filter(Boolean))
        const deduped = state.deltaMessages.filter(message => !message.entryId || !existingEntryIds.has(message.entryId))
        if (deduped.length > 0) {
            sessionData.chatMessages = [...sessionData.chatMessages, ...deduped]
            // delta 已带来服务端当前分支的持久化权威：流式临时条目一并作废（同全量路径规则），
            // 防他窗改写分支后旧快照以数组尾部位置赢得 LWW。
            // 注：流式态下在途条目由 attach 的 inflight 重放补齐（message_state → buffer → inflight 顺序保证
            // 清空发生在重放之前）；非流式态（run 已结束）无补发，残留本就该作废，随下次 done/load 收敛
            sessionData.chatToolMessages = []
        }
    }

    // 2. 对齐服务端对“当前是否仍在流”的判断。压缩也是忙态：切会话/刷新落在
    // 压缩窗口（isStreaming=false 而 compacting=true）时，据 compacting 恢复
    // busy 与压缩指示器——服务端 attach 在压缩期间保持订阅，compaction_end
    // 及续跑事件会继续到达，客户端不再呈现假空闲
    if (typeof state.compacting === 'boolean') {
        sessionData.compacting = state.compacting
    }
    if (typeof state.isStreaming === 'boolean') {
        sessionData.chatSending = state.isStreaming || state.compacting === true
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
