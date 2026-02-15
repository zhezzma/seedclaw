import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useSessionsState } from './useSessionsState'
import { useUiSettingsStore } from '../stores/setting'
import { apiGet, apiPost } from './api-client'
import { startChatSSE, connectSessionSSE, type SSEConnection } from './sse-client'

// ==================== Types ====================
export interface ChatMessage {
    id?: string
    role: 'user' | 'assistant' | 'toolResult'
    content: any
    timestamp?: number
    model?: string
    provider?: string
    api?: string
    errorMessage?: string
    toolCallId?: string
    isError?: boolean
    details?: any
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
    chatStream: any[] | null
    chatStreamStartedAt: number | null
    chatSending: boolean
    chatRunId: string | null
    chatLoading: boolean
}

export interface ChatState {
    sessionKey: string
    sessionsMap: Map<string, ChatSessionData>
}

// Per-session SSE connections
const sseConnections = new Map<string, SSEConnection>()

const state = reactive<ChatState>({
    sessionKey: '',
    sessionsMap: new Map<string, ChatSessionData>(),
})

// ==================== Helpers ====================

function generateUUID(): string {
    return crypto.randomUUID()
}

function extractSessionId(sessionKey: string): string {
    return sessionKey
}

export function extractAgentId(sessionKey: string): string {
    const sessionsState = useSessionsState()
    const session = sessionsState.sessionsResult?.sessions?.find((s: any) => s.key === sessionKey)
    return session?.agentId || 'main'
}

function getSessionData(key: string): ChatSessionData {
    let data = state.sessionsMap.get(key)
    if (!data) {
        data = reactive<ChatSessionData>({
            chatMessages: [],
            chatToolMessages: [],
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
    const sessionId = extractSessionId(targetKey)

    // Add user message to per-session data
    sessionData.chatMessages = [...sessionData.chatMessages, {
        role: 'user',
        content: text,
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
        (error) => {
            const sd = getSessionData(targetKey)
            sd.chatSending = false
            sd.chatRunId = null
            sd.chatStreamStartedAt = null
            sd.chatStream = null
        }
    )

    sseConnections.set(targetKey, sse)

    // Wait for SSE to complete
    sse.done.then(() => {
        getSessionData(targetKey).chatSending = false
        sseConnections.delete(targetKey)
    }).catch(() => {
        getSessionData(targetKey).chatSending = false
        sseConnections.delete(targetKey)
    })
}

// 处理 SSE 事件，更新会话状态
const handleSSEEvent = (eventType: string, data: any, targetKey: string) => {
    const sessionData = getSessionData(targetKey)
    if (!sessionData.chatStream) {
        sessionData.chatStream = []
    }
    const stream = sessionData.chatStream as any[]

    switch (eventType) {
        case 'message_start':
            // 消息开始，无需特殊处理，stream 已初始化
            break
        case 'text_delta':
        case 'thinking_delta': {
            // 合并文本或思考过程增量
            // 使用通用逻辑处理 delta
            const type = eventType === 'text_delta' ? 'text' : 'thinking'
            const contentKey = type // 'text' or 'thinking'

            if (data?.delta) {
                const lastBlock = stream.length > 0 ? stream[stream.length - 1] : null
                if (lastBlock?.type === type) {
                    lastBlock[contentKey] = (lastBlock[contentKey] || '') + data.delta
                } else {
                    stream.push({ type, [contentKey]: data.delta })
                }
            }
            break
        }
        case 'tool_start':
            // 添加新的工具调用 Block
            stream.push({
                type: 'toolCall',
                id: generateUUID(), // Server doesn't send ID, so we generate one
                name: data.toolName,
                toolState: 'calling',
                arguments: {}
            })
            break
        case 'tool_update':
            // 工具参数更新 (暂未实现复杂合并逻辑)
            if (data) {
                const lastBlock = stream.length > 0 ? stream[stream.length - 1] : null
                if (lastBlock?.type === 'toolCall') {
                    // Update arguments if present
                }
            }
            break
        case 'tool_end':

            // 1. 更新流中的 Block 以获得即时反馈 (UI 显示从 Loading -> Success)
            let toolCallItem = null

            // 因为服务端没有返回 ID，所以我们需要从流中找到最后一个“正在调用中”且名字匹配的工具
            if (stream.length > 0) {
                // 从后往前搜索，找到最后一个同名且未完成的工具调用
                for (let i = stream.length - 1; i >= 0; i--) {
                    const item = stream[i]
                    if (item.type === 'toolCall' && item.name === data.toolName && (!item.toolState || item.toolState === 'calling')) {
                        toolCallItem = item
                        break
                    }
                }
            }

            if (toolCallItem) {
                // 找到对应的工具调用对象了，直接修改它的属性
                // 这会触发 Vue 的响应式更新，界面上的 Loading 状态会立即消失并显示结果
                toolCallItem.toolResult = data.result.content
                toolCallItem.toolError = data.isError ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)) : undefined
                toolCallItem.toolState = data.isError ? 'error' : 'success'
            }

            // 2. Add independent ToolResult message for history integrity
            // Note: This duplicates what convertToBlocks does, but keeps local state consistent
            sessionData.chatToolMessages = [...sessionData.chatToolMessages, {
                role: 'toolResult',
                content: data.result.content,  // data.result can be object or string
                timestamp: Date.now(),
                toolCallId: toolCallItem ? toolCallItem.id : generateUUID(), // Link to the item we found or new ID
                isError: data.isError
            }]

            break
        case 'message_end':
            // 消息结束，将流内容转为正式消息
            if (stream.length > 0) {
                sessionData.chatMessages = [...sessionData.chatMessages, {
                    role: 'assistant',
                    content: JSON.parse(JSON.stringify(stream)), // 深拷贝流内容
                    timestamp: Date.now(),
                    id: generateUUID()
                }]
            }
            sessionData.chatStream = null
            break
        case 'turn_end':
            break
        case 'agent_end':
        case 'done':
            // 会话彻底结束
            sessionData.chatRunId = null
            sessionData.chatStreamStartedAt = null
            sessionData.chatSending = false
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
        try {
            await apiPost(`/api/chat/${extractSessionId(targetKey)}/abort`)
        } catch {
            // Ignore abort errors
        }
        const sd = getSessionData(targetKey)
        sd.chatStream = null
        sd.chatRunId = null
        sd.chatStreamStartedAt = null
        sd.chatSending = false
    }
}

const loadChatHistory = async (sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) return
    const sd = getSessionData(targetKey)
    sd.chatLoading = true
    try {
        const sessionId = extractSessionId(targetKey)
        const result = await apiGet<{ messages: ChatMessage[], isStreaming?: boolean, partialText?: string }>(`/api/chat/${sessionId}/messages`)
        sd.chatMessages = result?.messages || []
        // 清空本地临时存储的 toolResult 消息，因为历史记录中应该已经包含（或者由 chatMessages 自行管理）
        sd.chatToolMessages = []

        // Handle resuming stream if active
        if (result.isStreaming) {
            sd.chatSending = true
            sd.chatRunId = generateUUID() // Generate a temp run ID for UI
            sd.chatStreamStartedAt = Date.now()

            // Initialize stream with partial text if available
            sd.chatStream = []

            // Connect to existing stream
            const existingSSE = sseConnections.get(targetKey)
            if (existingSSE) {
                existingSSE.abort()
            }

            const sse = connectSessionSSE(
                sessionId,
                (event) => {
                    // Handle initial state sync message separately
                    if (event.event === 'message_state') {
                        const data = event.data
                        if (data) {
                            const sd = getSessionData(targetKey)

                            // 1. Sync full history
                            if (data.messages && Array.isArray(data.messages)) {
                                sd.chatMessages = data.messages
                            }

                            // 2. Sync streaming status
                            if (typeof data.isStreaming === 'boolean') {
                                sd.chatSending = data.isStreaming
                            }

                            // 3. Sync current stream content
                            if (data.streamMessage) {
                                // Important: The server sends the full AgentMessage object as streamMessage.
                                // The client's chatStream expects the *content* array of that message.
                                if (data.streamMessage.content && Array.isArray(data.streamMessage.content)) {
                                    sd.chatStream = JSON.parse(JSON.stringify(data.streamMessage.content))
                                }
                            } else if (data.isStreaming && !sd.chatStream) {
                                // If streaming but no content sent yet, init empty
                                sd.chatStream = []
                            }
                        }
                        return
                    }

                    handleSSEEvent(event.event, event.data, targetKey)
                },
                (error) => {
                    const sd = getSessionData(targetKey)
                    sd.chatSending = false
                    sd.chatRunId = null
                    sd.chatStreamStartedAt = null
                    sd.chatStream = null
                }
            )

            sseConnections.set(targetKey, sse)

            sse.done.then(() => {
                getSessionData(targetKey).chatSending = false
                sseConnections.delete(targetKey)
                // Reload history to ensure we have the final complete message state
                loadChatHistory(targetKey)
            }).catch(() => {
                getSessionData(targetKey).chatSending = false
                sseConnections.delete(targetKey)
            })
        }
    } catch (err: any) {
        console.error('Failed to load chat history:', err)
    } finally {
        // Only set loading to false, don't touch chatSending if we are streaming
        sd.chatLoading = false
    }
}

const setSessionKey = async (key: string, loadHistory = true) => {
    state.sessionKey = key

    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey(key)

    if (loadHistory && !state.sessionsMap.has(key)) {
        await loadChatHistory(key)
    }
}

const createNewSession = async () => {
    state.sessionKey = ''
    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey('')
}

const steerMessage = async (message: string, sessionKey?: string) => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) {
        console.error('[useChatState] steerMessage called without sessionKey')
        return
    }

    const sessionId = extractSessionId(targetKey)
    const sessionData = getSessionData(targetKey)

    // Add user message to per-session data
    sessionData.chatMessages = [...sessionData.chatMessages, {
        role: 'user',
        content: message,
        timestamp: Date.now(),
        id: generateUUID()
    }]

    try {
        await apiPost(`/api/chat/${sessionId}/steer`, { prompt: message })
    } catch (err: any) {
        console.error('Failed to steer:', err)
    }
}



export function useChatState() {
    const methods = {
        // Derived getters from sessionsMap (for backward compat with useChatMessages)
        get chatMessages() { return getSessionData(state.sessionKey).chatMessages },
        get chatToolMessages() { return getSessionData(state.sessionKey).chatToolMessages },
        get chatStream() { return getSessionData(state.sessionKey).chatStream },
        get chatSending() { return getSessionData(state.sessionKey).chatSending },
        get chatRunId() { return getSessionData(state.sessionKey).chatRunId },
        get chatStreamStartedAt() { return getSessionData(state.sessionKey).chatStreamStartedAt },
        get chatLoading() { return getSessionData(state.sessionKey).chatLoading },

        sendMessage,
        steerMessage,
        abortChat,
        loadChatHistory,
        setSessionKey,
        createNewSession,
        getSessionData,
        extractAgentId
    }

    return createStateProxy(state, methods)
}
