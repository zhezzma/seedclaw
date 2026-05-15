import { reactive, computed, type ComputedRef } from 'vue'

import { SessionRow, type SessionCategory, useSessionsState } from './useSessionsState'
import { useUiSettingsStore } from '../stores/setting'
import { apiGet, apiPost } from './api-client'
import { startChatSSE, attachSessionSSE, startRetrySSE, startEditSSE, type SSEConnection } from './sse-client'
import { AgentInfo, useAgentsState } from './useAgentsState'
import { applyAttachMessageState, getLastMessageEntryId, shouldAttachSession } from '../utils/chat-attach'
import { type KnownApi } from './useModelsState'
import { useToast } from './useToast'
import { clearAllSurfaces } from './useA2UISurfaces'
import { createRuntimeId } from '../utils/runtime-id.ts'
import router from '../router'

// ==================== Types ====================
export interface ChatMessage {
    id?: string
    role: 'user' | 'assistant' | 'toolResult'
    content: any
    timestamp?: number
    model?: string
    provider?: string
    api?: KnownApi | (string & {})
    errorMessage?: string
    toolCallId?: string
    isError?: boolean
    details?: any
    entryId?: string
    parentEntryId?: string | null
}

export interface ChatAttachment {
    id: string
    name: string
    dataUrl: string
    mimeType: string
    content?: string
}

export interface ChatSessionData {
    chatMessages: ChatMessage[]
    chatToolMessages: ChatMessage[]
    // Branch navigation uses a flat entry list, not a nested tree payload.
    sessionTree: SessionTreeEntry[] | null
    chatStream: any[] | null
    chatStreamStartedAt: number | null
    chatSending: boolean
    chatRunId: string | null
    chatLoading: boolean
}

export interface ChatState {
    sessionKey: string
    sessionsMap: Map<string, ChatSessionData>
    // 当前会话信息（从 sessionsState 获取）
    currentSession: SessionRow | null
    // 当前选中的 Agent（新会话时通过 UI 下拉选择，已有会话时通过 session.agentId 推导）
    // 选中的 Agent ID（新会话场景下由 UI 下拉菜单驱动）
    agentsSelectedId: string
}

// Per-session SSE connections
const sseConnections = new Map<string, SSEConnection>()

const state = reactive<ChatState>({
    sessionKey: '',
    sessionsMap: new Map<string, ChatSessionData>(),
    currentSession: null,
    agentsSelectedId: '',
})

// ==================== Helpers ====================

function generateUUID(): string {
    return createRuntimeId('chat')
}

/** 重置会话的流状态（chatSending / chatRunId / chatStreamStartedAt / chatStream） */
function resetStreamState(sd: ChatSessionData) {
    sd.chatSending = false
    sd.chatRunId = null
    sd.chatStreamStartedAt = null
    sd.chatStream = null
}

/** 绑定 SSE 连接的生命周期清理：done / catch 时统一重置状态并移除连接 */
function bindSSELifecycle(sse: SSEConnection, targetKey: string) {
    sseConnections.set(targetKey, sse)
    const cleanup = () => {
        resetStreamState(getSessionData(targetKey))
        sseConnections.delete(targetKey)
    }
    sse.done.then(cleanup).catch(cleanup)
}

function attachToSessionIfNeeded(targetKey: string) {
    if (!shouldAttachSession(sseConnections.has(targetKey))) {
        return
    }

    const sessionData = getSessionData(targetKey)
    const afterEntryId = getLastMessageEntryId(sessionData.chatMessages)
    const sse = attachSessionSSE(
        targetKey,
        (event) => {
            if (event.event === 'message_state') {
                const currentSessionData = getSessionData(targetKey)
                applyAttachMessageState(currentSessionData, event.data || {})

                if (event.data?.isStreaming) {
                    currentSessionData.chatRunId = currentSessionData.chatRunId || generateUUID()
                    currentSessionData.chatStreamStartedAt = currentSessionData.chatStreamStartedAt || Date.now()
                }
                return
            }

            handleSSEEvent(event.event, event.data, targetKey)
        },
        () => resetStreamState(sessionData),
        { afterEntryId }
    )

    bindSSELifecycle(sse, targetKey)
}

function getSessionData(key: string): ChatSessionData {
    let data = state.sessionsMap.get(key)
    if (!data) {
        data = reactive<ChatSessionData>({
            chatMessages: [],
            chatToolMessages: [],
            sessionTree: null,
            chatStream: null,
            chatStreamStartedAt: null,
            chatSending: false,
            chatRunId: null,
            chatLoading: false,
        })
        state.sessionsMap.set(key, data)
    }
    return data
}


// ==================== Actions ====================

const sendMessage = async (message?: string, attachments?: ChatAttachment[], sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] sendMessage called without sessionKey')
        return
    }

    const text = message || ''
    const images = attachments?.filter(a => a.dataUrl).map(a => a.dataUrl) || []

    if (!text.trim() && images.length === 0) return

    const sessionData = getSessionData(targetKey)
    const sessionId = targetKey

    // Prepare optimistic content (text + images)
    let optimisticContent: any = text
    if (images.length > 0) {
        const blocks: any[] = []
        if (text) {
            blocks.push({ type: 'text', text })
        }
        images.forEach(webUrl => {
            const matches = webUrl.match(/^data:([^;]+);base64,(.+)$/)
            if (matches) {
                blocks.push({
                    type: 'image',
                    mimeType: matches[1],
                    data: matches[2]
                })
            }
        })
        optimisticContent = blocks
    }

    // Add user message to per-session data
    sessionData.chatMessages = [...sessionData.chatMessages, {
        role: 'user',
        content: optimisticContent,
        timestamp: Date.now(),
        id: generateUUID()
    }]

    const runId = generateUUID()
    sessionData.chatSending = true
    sessionData.chatRunId = runId
    sessionData.chatStreamStartedAt = Date.now()
    sessionData.chatStream = [] // Initialize as array

    // Start SSE
    const body: { prompt: string; images?: string[] } = { prompt: text }
    if (images.length > 0) {
        body.images = images
    }

    // Abort any existing SSE for this session
    const existingSSE = sseConnections.get(targetKey)
    if (existingSSE) {
        existingSSE.abort()
    }

    const sse = startChatSSE(
        sessionId,
        body,
        (event) => {
            handleSSEEvent(event.event, event.data, targetKey)
        },
        () => resetStreamState(sessionData)
    )

    bindSSELifecycle(sse, targetKey)
}

// 处理 command_delta 事件的副作用
// 后端通过 command_delta 显式告知命令类型和数据，前端根据命令名执行对应的副作用
const handleCommandDelta = (data: any, targetKey: string) => {
    const sessionData = getSessionData(targetKey)
    const command = data?.command as string
    if (!command) return

    switch (command) {
        case 'model': {
            // /model 命令：更新当前会话的模型
            const model = data.data?.model
            if (model && state.currentSession) {
                state.currentSession.model = model
                state.currentSession.modelProvider = data.data?.provider
            }
            break
        }
        case 'thinking': {
            // /thinking 命令：更新当前会话的思考状态
            const thinking = data.data?.thinkingLevel
            if (thinking && state.currentSession) {
                state.currentSession.thinkingLevel = thinking
            }
            break
        }
        case 'reset':
            // /reset 命令：清空当前会话的所有消息
            sessionData.chatMessages = []
            sessionData.chatToolMessages = []
            sessionData.chatStream = null
            break
        case 'name': {
            // /name 命令：更新会话名称（后端已持久化，此处仅同步前端状态）
            // 需要同时更新两处：
            // 1. state.currentSession —— ChatHeader fallback 路径使用
            // 2. sessionsState 中的 sessions 列表 —— displaySessions / currentSessionName 的主路径使用
            // 两者可能不是同一个对象（reactive proxy 链路不同），必须分别更新
            const newName = data.data?.name
            if (newName) {
                if (state.currentSession) {
                    state.currentSession.name = newName
                }
                const sessionsState = useSessionsState()
                sessionsState.updateSessionLocal(state.sessionKey, { name: newName })
            }
            break
        }
        case 'new': {
            // /new 命令：服务端已创建新会话，前端切换过去
            const newSessionId = data.data?.sessionId
            if (newSessionId) {
                const sessionsState = useSessionsState()
                // 刷新会话列表（让新会话出现在侧边栏）
                sessionsState.loadSessions()
                // 切换到新会话并导航
                setSessionKey(newSessionId)
                router.push({ name: 'chat', params: { sessionkey: newSessionId } })
            }
            break
        }
        default:
            // 其他命令暂无特殊前端副作用
            break
    }
}

const allowCustomType = ["generated_image"]
// 处理 SSE 事件，更新会话状态
// 【重要】服务器协议说明：
// - 每次对话开始时，服务器会先通过 message_start/message_end 回显用户发送的消息（role: user）
// - 然后才开始推送 assistant 的响应（message_start + text_delta/thinking_delta + message_end）
// - Gemini 等模型可能在一个 turn 内发生多次 message_start/message_end（分别对应 thinking、工具调用、回复等）
const handleSSEEvent = (eventType: string, data: any, targetKey: string) => {
    const sessionData = getSessionData(targetKey)
    // chatStream 为 null 时（如 message_end 后等待下一条消息），懒初始化为空数组
    // 这样后续的 delta 事件可以直接 push，无需额外判断
    if (!sessionData.chatStream) {
        sessionData.chatStream = []
    }
    const stream = sessionData.chatStream as any[]

    switch (eventType) {
        case 'message_start':
            // 消息开始：服务器可能推送 user 消息回显或 assistant 消息开始
            // 特殊处理带有完整 content 的初始消息（如 custom 角色消息等）
            if (data?.message?.role == "custom" && allowCustomType.includes(data?.message?.customType)) {
                if (Array.isArray(data.message.content)) {
                    stream.push(...data.message.content)
                } else if (typeof data.message.content === 'string') {
                    stream.push({ type: 'text', text: data.message.content })
                }
            }
            break
        case 'text_delta':
        case 'thinking_delta': {
            // 合并文本增量（text_delta）或思考过程增量（thinking_delta）
            // 策略：若 stream 的最后一个 block 类型相同，则追加内容；否则插入新 block
            // 这样可以将连续的同类型 delta 合并为一个 block，减少渲染次数
            const type = eventType === 'text_delta' ? 'text' : 'thinking'
            const contentKey = type // 'text' or 'thinking'

            if (data?.delta) {
                const lastBlock = stream.length > 0 ? stream[stream.length - 1] : null
                if (lastBlock?.type === type) {
                    // 同类型：追加到末尾 block
                    lastBlock[contentKey] = (lastBlock[contentKey] || '') + data.delta
                } else {
                    // 不同类型（如从 thinking 切换到 text）：插入新 block
                    stream.push({ type, [contentKey]: data.delta })
                }
            }
            break
        }
        case 'tool_execution_start':
            // 添加新的工具调用 Block
            stream.push({
                type: 'toolCall',
                id: data.toolCallId,
                name: data.toolName,
                toolState: 'calling',
                arguments: data.args
            })
            break
        case 'tool_execution_update':
            // 工具参数更新，支持 partialResult
            if (data) {
                let toolCallItem = null
                if (data.toolCallId) {
                    toolCallItem = stream.find(item => item.type === 'toolCall' && item.id === data.toolCallId)
                }

                // Fallback to last item (optional but safe)
                if (!toolCallItem && stream.length > 0) {
                    const last = stream[stream.length - 1]
                    if (last.type === 'toolCall' && last.name === data.toolName) {
                        toolCallItem = last
                    }
                }

                if (toolCallItem) {
                    // Update arguments if present
                    if (data.args) {
                        // If args is string, append (for streaming args). If object, merge/replace.
                        if (typeof data.args === 'string') {
                            toolCallItem.arguments = (toolCallItem.arguments || '') + data.args
                        } else {
                            toolCallItem.arguments = { ...toolCallItem.arguments, ...data.args }
                        }
                    }

                    // Update partial result (e.g. streaming output)
                    if (data.partialResult) {
                        toolCallItem.toolResult = data.partialResult.content
                        // 存储 details（subagent/delegate 工具的进度数据）
                        if (data.partialResult.details) {
                            toolCallItem.toolDetails = data.partialResult.details
                        }
                    }
                }
            }
            break
        case 'tool_execution_end':
            // 1. Find the tool call item
            let toolCallItem = null

            if (data.toolCallId) {
                // Precise lookup by ID
                toolCallItem = stream.find(item => item.type === 'toolCall' && item.id === data.toolCallId)
            }

            // Fallback: search by name and state (as before)
            if (!toolCallItem && stream.length > 0) {
                for (let i = stream.length - 1; i >= 0; i--) {
                    const item = stream[i]
                    if (item.type === 'toolCall' && item.name === data.toolName && (!item.toolState || item.toolState === 'calling')) {
                        toolCallItem = item
                        break
                    }
                }
            }

            if (toolCallItem) {
                // Update final result and status
                toolCallItem.toolResult = data.result.content
                toolCallItem.toolError = data.isError ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)) : undefined
                toolCallItem.toolState = data.isError ? 'error' : 'success'
                // 保存 details（subagent/delegate 最终结果详情）
                if (data.result.details) {
                    toolCallItem.toolDetails = data.result.details
                }
            }

            // 2. Add independent ToolResult message for history integrity
            sessionData.chatToolMessages = [...sessionData.chatToolMessages, {
                role: 'toolResult',
                content: data.result.content,
                timestamp: Date.now(),
                toolCallId: toolCallItem ? toolCallItem.id : data.toolCallId,
                isError: data.isError
            }]

            break
        case 'message_end': {
            // 【关键逻辑】仅当 stream 有实际内容时，才将其固化为正式消息并重置 chatStream
            //
            // 背景：服务器在每次对话开始时会先发一对 message_start/message_end 来回显用户消息
            // （此时 stream 为空），随后才会开始推送 assistant 的内容
            //
            // 如果对空 stream 也执行 chatStream = null，会触发如下无意义的状态跳变：
            //   [] （发消息后初始状态）→ null（user 回显结束）→ []（assistant 开始，函数顶部重置）
            // 这个 [] → null → [] 的瞬间会让 Vue 重新计算 processedMessages，
            // 破坏 loading 动画的连续性，产生可见的闪烁
            const endMsg = data?.message
            const hasError = endMsg?.role === 'assistant' && endMsg?.errorMessage

            if (stream.length > 0 || hasError) {
                // 有内容或有错误信息：固化为一条正式的 assistant 消息
                const msg: ChatMessage = {
                    role: 'assistant',
                    content: stream.length > 0 ? JSON.parse(JSON.stringify(stream)) : [], // 深拷贝，防止引用被后续操作修改
                    timestamp: endMsg?.timestamp || Date.now(),
                    id: generateUUID(),
                    model: endMsg?.model,
                    provider: endMsg?.provider,
                    api: endMsg?.api,
                }
                if (hasError) {
                    msg.errorMessage = endMsg.errorMessage
                }
                sessionData.chatMessages = [...sessionData.chatMessages, msg]
                sessionData.chatStream = null
            }
            // stream 为空且无错误（user 消息回显）：直接跳过，保持 chatStream 为 [] 不变
            // loading 动画得以保持连续，不产生闪烁
            break
        }
        case 'command_delta':
            stream.push({ type: 'text', text: data.delta })
            // 命令事件：由后端显式推送，触发前端副作用（如 /reset 清空消息、/name 更新标题等）
            handleCommandDelta(data, targetKey)
            break
        case 'turn_end':
        case 'agent_end':
            // agent_end 在重试场景中每轮都会触发（auto_retry），不应在此终止会话
            // 最终清理统一由 done 事件负责
            break
        case 'auto_retry_start':
            // 服务器开始自动重试，确保 chatSending 保持为 true
            // （stream 在上一轮 message_end 已重置为 null，此处重新初始化）
            sessionData.chatStream = []
            break
        case 'error': {
            // 服务端错误：回滚乐观插入的用户消息并清理状态
            resetStreamState(sessionData)
            // 移除最后一条未被服务端确认的 user 消息（没有 entryId 说明从未被持久化）
            const msgs = sessionData.chatMessages
            if (msgs.length > 0) {
                const lastMsg = msgs[msgs.length - 1]
                if (lastMsg.role === 'user' && !lastMsg.entryId) {
                    sessionData.chatMessages = msgs.slice(0, -1)
                }
            }
            // 显示错误提示
            const errorMsg = data?.error || 'Unknown error'
            useToast().error(errorMsg, 5000)
            break
        }
        case 'done':
            // 会话彻底结束（包括所有重试完成后）
            resetStreamState(sessionData)
            // 静默刷新消息，补上 entryId/parentEntryId（不设置 chatLoading，避免页面闪烁）
            apiGet<{ messages: ChatMessage[] }>(`/api/chat/${targetKey}/messages`).then(result => {
                if (result?.messages) {
                    getSessionData(targetKey).chatMessages = result.messages
                    // Messages reloaded -> Tree structure definitely valid now
                    fetchSessionTree(targetKey)
                }
            }).catch(() => { /* 静默失败不影响使用 */ })
            break
    }
}

const abortChat = async (sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    const sse = sseConnections.get(targetKey)
    if (sse) {
        sse.abort()
        sseConnections.delete(targetKey)
    }
    if (targetKey) {
        const sd = getSessionData(targetKey)
        try {
            const result = await apiPost<{ messages?: ChatMessage[], isStreaming?: boolean }>(`/api/chat/${targetKey}/abort`)
            if (result) {
                if (result.messages) {
                    sd.chatMessages = result.messages
                }
                if (typeof result.isStreaming === 'boolean') {
                    sd.chatSending = result.isStreaming
                } else {
                    sd.chatSending = false
                }
            } else {
                sd.chatSending = false
            }
        } catch {
            // Ignore abort errors
            sd.chatSending = false
        }
        resetStreamState(sd)

        // Refresh tree structure just in case the aborted message was saved
        fetchSessionTree(targetKey)
    }
}

const loadChatHistory = async (sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) return
    const sd = getSessionData(targetKey)
    sd.chatLoading = true
    try {
        const sessionId = targetKey
        const result = await apiGet<{ messages: ChatMessage[], isStreaming?: boolean, partialText?: string }>(`/api/chat/${sessionId}/messages`)
        sd.chatMessages = result?.messages || []
        // 清空本地临时存储的 toolResult 消息，因为历史记录中应该已经包含（或者由 chatMessages 自行管理）
        sd.chatToolMessages = []

        // 不再依赖 /messages.isStreaming 决定是否 attach。
        // 只要本地没有该 session 的活跃 SSE，就 attach 一次，让服务端决定
        // 是立即 done（空闲）还是继续附着到当前已有流。
        attachToSessionIfNeeded(sessionId)
    } catch (err: any) {
        console.error('Failed to load chat history:', err)
    } finally {
        // Only set loading to false, don't touch chatSending if we are streaming
        sd.chatLoading = false
        // Finally, load the tree structure for this session
        // This ensures the UI has branching info once history is loaded
        if (targetKey) {
            fetchSessionTree(targetKey)
        }
    }
}

/**
 * 切换到已有会话
 * 1. 设置 sessionKey
 * 2. 通过 getSessionById 获取 session 信息 → 设置 currentSession
 * 3. 通过 session.agentId 推导 agentsSelectedId 和 currentAgent
 * 4. 加载聊天历史
 */
const setSessionKey = async (key: string, category?: SessionCategory) => {
    // 在设置 sessionKey 之前先判断是否需要加载历史
    // 因为设置 sessionKey 后，UI 会通过 getter 读取数据，自动创建 sessionsMap entry
    const needsLoad = !state.sessionsMap.has(key)

    // 切换会话时清空 A2UI Surface 注册表（防止跨会话数据泄漏）
    clearAllSurfaces()

    state.sessionKey = key

    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey(key)

    // 获取 session 信息并设置 currentSession / currentAgent
    const sessionsState = useSessionsState()
    const session = await sessionsState.getSessionById(key, category)
    state.currentSession = session || null
    if (session?.agentId) {
        state.agentsSelectedId = session.agentId
    }

    if (needsLoad) {
        await loadChatHistory(key)
    } else {
        attachToSessionIfNeeded(key)
    }
}

/**
 * 创建新会话（/new 页面）
 * 1. 清空 sessionKey 和 currentSession
 * 2. currentAgent 由 agentsSelectedId 推导（用户通过下拉菜单选择）
 */
const createNewSession = async () => {
    state.sessionKey = ''
    state.currentSession = null

    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey('')

    // 新会话场景：currentAgent 将通过 getter 自动根据 agentsSelectedId 推导
}

/**
 * 选择 Agent（新会话下拉菜单触发）
 * 同时更新 agentsSelectedId 和 currentAgent
 */
const selectAgent = (agentId: string) => {
    state.agentsSelectedId = agentId
}

const steerMessage = async (message: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] steerMessage called without sessionKey')
        return
    }

    const sessionId = targetKey
    const sessionData = getSessionData(targetKey)

    // Add user message to per-session data
    sessionData.chatMessages = [...sessionData.chatMessages, {
        role: 'user',
        content: message,
        timestamp: Date.now(),
        id: generateUUID()
    }]

    try {
        await apiPost(`/api/chat/${sessionId}/steer`, { text: message })
    } catch (err: any) {
        console.error('Failed to steer:', err)
    }
}

const followMessage = async (message: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] followMessage called without sessionKey')
        return
    }

    await sendMessage(`/follow-up ${message}`, undefined, targetKey)
}


// ==================== Delete / Retry / Branch ====================

const deleteMessage = async (entryId: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] deleteMessage called without sessionKey')
        return
    }

    try {
        const result = await apiPost<{ messages: ChatMessage[], deleted: boolean }>(
            `/api/chat/${targetKey}/delete`,
            { entryId }
        )
        if (result?.messages) {
            const sd = getSessionData(targetKey)
            sd.chatMessages = result.messages
            sd.chatToolMessages = []
            // Message deleted -> Tree changed
            fetchSessionTree(targetKey)
        }
    } catch (err: any) {
        console.error('[useChatState] deleteMessage failed:', err)
    }
}

const retryMessage = async (entryId: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] retryMessage called without sessionKey')
        return
    }

    const sessionData = getSessionData(targetKey)

    // Remove the assistant message being retried from local state
    // (the server navigates back and re-prompts, creating a new branch)
    const entryIndex = sessionData.chatMessages.findIndex(m => m.entryId === entryId)
    if (entryIndex >= 0) {
        // Remove from the assistant entry onwards (it and any subsequent messages on this branch)
        // If the entry being retried is a user message, retain it.
        const isUserMsg = sessionData.chatMessages[entryIndex].role === 'user'
        if (isUserMsg) {
            sessionData.chatMessages = sessionData.chatMessages.slice(0, entryIndex + 1)
        } else {
            sessionData.chatMessages = sessionData.chatMessages.slice(0, entryIndex)
        }
    }

    const runId = generateUUID()
    sessionData.chatSending = true
    sessionData.chatRunId = runId
    sessionData.chatStreamStartedAt = Date.now()
    sessionData.chatStream = []

    // Abort any existing SSE for this session
    const existingSSE = sseConnections.get(targetKey)
    if (existingSSE) {
        existingSSE.abort()
    }

    const sse = startRetrySSE(
        targetKey,
        { entryId },
        (event) => {
            handleSSEEvent(event.event, event.data, targetKey)
        },
        () => resetStreamState(sessionData)
    )

    bindSSELifecycle(sse, targetKey)
}

const editMessage = async (entryId: string, newText: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] editMessage called without sessionKey')
        return
    }

    const sessionData = getSessionData(targetKey)

    // Keep the user message but update its text, remove everything after it
    const entryIndex = sessionData.chatMessages.findIndex(m => m.entryId === entryId)
    if (entryIndex >= 0) {
        // Update the user message content in-place
        sessionData.chatMessages[entryIndex].content = newText
        // Remove all messages after the user message (assistant responses on this branch)
        sessionData.chatMessages = sessionData.chatMessages.slice(0, entryIndex + 1)
    }

    const runId = generateUUID()
    sessionData.chatSending = true
    sessionData.chatRunId = runId
    sessionData.chatStreamStartedAt = Date.now()
    sessionData.chatStream = []

    // Abort any existing SSE for this session
    const existingSSE = sseConnections.get(targetKey)
    if (existingSSE) {
        existingSSE.abort()
    }

    const sse = startEditSSE(
        targetKey,
        { entryId, newText },
        (event) => {
            handleSSEEvent(event.event, event.data, targetKey)
        },
        () => resetStreamState(sessionData)
    )

    bindSSELifecycle(sse, targetKey)
}

export interface SessionTreeEntry {
    id: string
    parentId: string | null
    type: string
    role?: string
    timestamp?: string
}

const fetchSessionTree = async (sessionKey?: string): Promise<SessionTreeEntry[] | null> => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) return null

    try {
        // 服务端返回轻量 flat entries；客户端分支导航只依赖 id / parentId / type。
        const result = await apiGet<{ leafId?: string | null, entries?: SessionTreeEntry[] } | SessionTreeEntry[]>(`/api/chat/${targetKey}/entries`)
        const entries = Array.isArray(result)
            ? result
            : (Array.isArray(result?.entries) ? result.entries : null)

        // Update store state
        const sd = getSessionData(targetKey)
        sd.sessionTree = entries

        return entries
    } catch (err: any) {
        console.error('[useChatState] fetchSessionTree failed:', err)
        return null
    }
}

const navigateBranch = async (targetEntryId: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) return

    try {
        const result = await apiPost<{ messages: ChatMessage[], navigated: boolean }>(
            `/api/chat/${targetKey}/navigate`,
            { entryId: targetEntryId }
        )
        // 直接用后端返回的消息列表更新 chatMessages
        if (result?.messages) {
            const sd = getSessionData(targetKey)
            sd.chatMessages = result.messages
        }
    } catch (err: any) {
        console.error('[useChatState] navigateBranch failed:', err)
    }
}

// ==================== Derived Computeds（模块级，仅初始化一次）====================
const chatMessages = computed(() => getSessionData(state.sessionKey).chatMessages)
const chatToolMessages = computed(() => getSessionData(state.sessionKey).chatToolMessages)
const sessionTree = computed(() => getSessionData(state.sessionKey).sessionTree)
const chatStream = computed(() => getSessionData(state.sessionKey).chatStream)
const chatSending = computed(() => getSessionData(state.sessionKey).chatSending)
const chatRunId = computed(() => getSessionData(state.sessionKey).chatRunId)
const chatStreamStartedAt = computed(() => getSessionData(state.sessionKey).chatStreamStartedAt)
const chatLoading = computed(() => getSessionData(state.sessionKey).chatLoading)
const currentAgent = computed(() => {
    const agentsState = useAgentsState()
    return agentsState.agentsList?.find(a => a.id === state.agentsSelectedId) || null
})

// 将 ComputedRef<T> 解包为 T，使 TypeScript 类型与 Vue reactive 自动解包行为一致
// Vue 运行时会自动解包 reactive 对象中的 ComputedRef，
// 但 TypeScript 静态分析感知不到这个行为，需要手动告知类型系统。
// 参见：https://vuejs.org/guide/essentials/reactivity-fundamentals.html#reactive-proxy-vs-original
type UnwrapComputed<T extends object> = {
    [K in keyof T]: T[K] extends ComputedRef<infer V> ? V : T[K]
}


// 预组装单例（模块加载时执行一次，避免每次调用 useChatState 重复创建 computed）
const _methods = {
    chatMessages, chatToolMessages, sessionTree, chatStream,
    chatSending, chatRunId, chatStreamStartedAt, chatLoading, currentAgent,
    sendMessage, steerMessage, followMessage, abortChat, loadChatHistory,
    setSessionKey, createNewSession, selectAgent, getSessionData,
    deleteMessage, retryMessage, editMessage, fetchSessionTree, navigateBranch,
}
const _chatState = Object.assign(state, _methods) as unknown as typeof state & UnwrapComputed<typeof _methods>

export function useChatState() {
    return _chatState
}

