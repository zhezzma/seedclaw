import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { SessionRow, useSessionsState } from './useSessionsState'
import { useUiSettingsStore } from '../stores/setting'
import { apiGet, apiPost } from './api-client'
import { startChatSSE, connectSessionSSE, startRetrySSE, type SSEConnection } from './sse-client'
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
    // New: Session Tree (Branching info)
    sessionTree: any[] | null
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
    return crypto.randomUUID()
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
        const sd = getSessionData(targetKey)
        sd.chatSending = false
        sseConnections.delete(targetKey)
    }).catch(() => {
        getSessionData(targetKey).chatSending = false
        sseConnections.delete(targetKey)
    })
}

// 处理 command_delta 事件的副作用
// 后端通过 command_delta 显式告知命令类型和数据，前端根据命令名执行对应的副作用
const handleCommandDelta = (data: any, targetKey: string) => {
    const sessionData = getSessionData(targetKey)
    const command = data?.command as string
    if (!command) return

    switch (command) {
        case 'reset':
            // /reset 命令：清空当前会话的所有消息
            sessionData.chatMessages = []
            sessionData.chatToolMessages = []
            sessionData.chatStream = null
            break
        case 'name': {
            // /name 命令：更新会话名称（后端已持久化，此处仅同步前端状态）
            // currentSession 和 sessionsResult.sessions 中的对象是同一个 reactive 引用
            // 直接修改属性即可同时更新 ChatHeader 和侧边栏
            const newName = data.data?.name
            if (newName && state.currentSession) {
                state.currentSession.name = newName
            }
            break
        }
        default:
            // 其他命令暂无特殊前端副作用
            break
    }
}

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
            // chatStream 已在函数顶部懒初始化为 []，此处无需额外处理
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
            // 【关键逻辑】仅当 stream 有实际内容时，才将其固化为正式消息并重置 chatStream
            //
            // 背景：服务器在每次对话开始时会先发一对 message_start/message_end 来回显用户消息
            // （此时 stream 为空），随后才会开始推送 assistant 的内容
            //
            // 如果对空 stream 也执行 chatStream = null，会触发如下无意义的状态跳变：
            //   [] （发消息后初始状态）→ null（user 回显结束）→ []（assistant 开始，函数顶部重置）
            // 这个 [] → null → [] 的瞬间会让 Vue 重新计算 processedMessages，
            // 破坏 loading 动画的连续性，产生可见的闪烁
            if (stream.length > 0) {
                // 有内容：将 stream 内容固化为一条正式的 assistant 消息
                sessionData.chatMessages = [...sessionData.chatMessages, {
                    role: 'assistant',
                    content: JSON.parse(JSON.stringify(stream)), // 深拷贝，防止引用被后续操作修改
                    timestamp: Date.now(),
                    id: generateUUID()
                }]
                sessionData.chatStream = null
                // 有新消息加入 → tree 结构可能变化，刷新分支控件
                fetchSessionTree(targetKey)
            }
            // stream 为空（user 消息回显）：直接跳过，保持 chatStream 为 [] 不变
            // loading 动画得以保持连续，不产生闪烁
            break
        case 'command_delta':
            stream.push({ type: 'text', text: data.delta })
            // 命令事件：由后端显式推送，触发前端副作用（如 /reset 清空消息、/name 更新标题等）
            handleCommandDelta(data, targetKey)
            break
        case 'turn_end':
            break
        case 'agent_end':
        case 'done':
            // 会话彻底结束
            sessionData.chatRunId = null
            sessionData.chatStreamStartedAt = null
            sessionData.chatSending = false
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
const setSessionKey = async (key: string, loadHistory = true, type?: string) => {
    // 在设置 sessionKey 之前先判断是否需要加载历史
    // 因为设置 sessionKey 后，UI 会通过 getter 读取数据，自动创建 sessionsMap entry
    const needsLoad = loadHistory && !state.sessionsMap.has(key)

    state.sessionKey = key

    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey(key)

    // 获取 session 信息并设置 currentSession / currentAgent
    const sessionsState = useSessionsState()
    const session = await sessionsState.getSessionById(key, type)
    state.currentSession = session || null
    if (session?.agentId) {
        state.agentsSelectedId = session.agentId
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
        await apiPost(`/api/chat/${sessionId}/steer`, { prompt: message })
    } catch (err: any) {
        console.error('Failed to steer:', err)
    }
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
        const sd = getSessionData(targetKey)
        sd.chatSending = false
        sseConnections.delete(targetKey)
    }).catch(() => {
        getSessionData(targetKey).chatSending = false
        sseConnections.delete(targetKey)
    })
}

export interface SessionTreeEntry {
    id: string
    parentId: string | null
    type: string
    message?: any
}

const fetchSessionTree = async (sessionKey?: string): Promise<SessionTreeEntry[] | null> => {
    const targetKey = sessionKey || state.sessionKey
    if (!targetKey) return null

    try {
        const result = await apiGet<any>(`/api/chat/${targetKey}/entries`)
        const entries = result?.entries || result || null

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

export function useChatState() {
    const methods = {
        // Derived getters from sessionsMap (for backward compat with useChatMessages)
        get chatMessages() { return getSessionData(state.sessionKey).chatMessages },
        get chatToolMessages() { return getSessionData(state.sessionKey).chatToolMessages },
        // Expose sessionTree
        get sessionTree() { return getSessionData(state.sessionKey).sessionTree },
        get chatStream() { return getSessionData(state.sessionKey).chatStream },
        get chatSending() { return getSessionData(state.sessionKey).chatSending },
        get chatRunId() { return getSessionData(state.sessionKey).chatRunId },
        get chatStreamStartedAt() { return getSessionData(state.sessionKey).chatStreamStartedAt },
        get chatLoading() { return getSessionData(state.sessionKey).chatLoading },
        get currentAgent() {
            const agentsState = useAgentsState()
            return agentsState.agentsList?.find(a => a.id === state.agentsSelectedId) || null
        },

        sendMessage,
        steerMessage,
        abortChat,
        loadChatHistory,
        setSessionKey,
        createNewSession,
        selectAgent,
        getSessionData,
        deleteMessage,
        retryMessage,
        fetchSessionTree,
        navigateBranch,
    }

    return createStateProxy(state, methods)
}
