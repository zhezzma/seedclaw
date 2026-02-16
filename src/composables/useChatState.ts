import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { SessionRow, useSessionsState } from './useSessionsState'
import { useUiSettingsStore } from '../stores/setting'
import { apiGet, apiPost } from './api-client'
import { startChatSSE, connectSessionSSE, type SSEConnection } from './sse-client'
import { AgentInfo, useAgentsState } from './useAgentsState'

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
    // 当前会话信息（从 sessionsState 获取）
    currentSession: SessionRow | null
    // 当前选中的 Agent（新会话时通过 UI 下拉选择，已有会话时通过 session.agentId 推导）
    currentAgent: AgentInfo | null
    // 选中的 Agent ID（新会话场景下由 UI 下拉菜单驱动）
    agentsSelectedId: string
}

// Per-session SSE connections
const sseConnections = new Map<string, SSEConnection>()

const state = reactive<ChatState>({
    sessionKey: '',
    sessionsMap: new Map<string, ChatSessionData>(),
    currentSession: null,
    currentAgent: null,
    agentsSelectedId: '',
})

// ==================== Helpers ====================

function generateUUID(): string {
    return crypto.randomUUID()
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

/**
 * 根据 agentId 从 agentsList 中查找 Agent
 */
function findAgent(agentId: string): AgentInfo | null {
    const agentsState = useAgentsState()
    return agentsState.agentsList?.find((a: any) => a.id === agentId) || null
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
            await apiPost(`/api/chat/${targetKey}/abort`)
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
        const sessionId = targetKey
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
                                if (data.streamMessage.content && Array.isArray(data.streamMessage.content)) {
                                    sd.chatStream = JSON.parse(JSON.stringify(data.streamMessage.content))
                                }
                            } else if (data.isStreaming && !sd.chatStream) {
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

/**
 * 切换到已有会话
 * 1. 设置 sessionKey
 * 2. 通过 getSessionById 获取 session 信息 → 设置 currentSession
 * 3. 通过 session.agentId 推导 agentsSelectedId 和 currentAgent
 * 4. 加载聊天历史
 */
const setSessionKey = async (key: string, loadHistory = true) => {
    // 在设置 sessionKey 之前先判断是否需要加载历史
    // 因为设置 sessionKey 后，UI 会通过 getter 读取数据，自动创建 sessionsMap entry
    const needsLoad = loadHistory && !state.sessionsMap.has(key)

    state.sessionKey = key

    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey(key)

    // 获取 session 信息并设置 currentSession / currentAgent
    const sessionsState = useSessionsState()
    const session = await sessionsState.getSessionById(key)
    state.currentSession = session || null
    if (session?.agentId) {
        state.agentsSelectedId = session.agentId
        state.currentAgent = findAgent(session.agentId)
    }

    if (needsLoad) {
        await loadChatHistory(key)
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

    // 新会话场景：currentAgent 由 agentsSelectedId 决定
    if (state.currentAgent?.id != state.agentsSelectedId) {
        state.currentAgent = findAgent(state.agentsSelectedId)
    }
}

/**
 * 选择 Agent（新会话下拉菜单触发）
 * 同时更新 agentsSelectedId 和 currentAgent
 */
const selectAgent = (agentId: string) => {
    state.agentsSelectedId = agentId
    state.currentAgent = findAgent(agentId)
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
        selectAgent,
        getSessionData
    }

    return createStateProxy(state, methods)
}
