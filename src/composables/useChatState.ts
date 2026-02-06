import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import type { ChatState, ChatEventPayload } from '~openclaw/ui/src/ui/controllers/chat'
import { loadChatHistory as _loadChatHistory } from '~openclaw/ui/src/ui/controllers/chat'
import { useSessionsState } from './useSessionsState'
import { type ChatHost, handleSendChat, handleAbortChat, flushChatQueueForEvent } from '~openclaw/ui/src/ui/app-chat'
import { loadAssistantIdentity as _loadAssistantIdentity, type AssistantIdentityState } from '~openclaw/ui/src/ui/controllers/assistant-identity'
import { extractText } from '~openclaw/ui/src/ui/chat/message-extract'
import { useUiSettingsStore } from '../stores/setting'
import type { ChatAttachment } from '~openclaw/ui/src/ui/ui-types'
import { generateUUID } from '~openclaw/ui/src/ui/uuid'
import { resetToolStream, type ToolStreamEntry } from '~openclaw/ui/src/ui/app-tool-stream'

// Auto-naming runs map for session rename tracking
const autoNamingRuns = new Map<string, { targetSessionKey: string; titleBuffer: string }>()

const state = reactive<ChatState & ChatHost & {
    assistantName: string;
    assistantAvatar: string | null;
    chatAvatarUrl: string;
    assistantAgentId: string | null;
    chatToolMessages: any[];
    sessionKey: string; // Ensure sessionKey is here
    toolStreamById: Map<string, ToolStreamEntry>;
    toolStreamOrder: string[];

    toolStreamSyncTimer: number | null;
    isNewSessionPending: boolean;
    renameSessionKey: string | null;

    settings: ReturnType<typeof useUiSettingsStore> | null;

}>({
    client: null,
    connected: false,
    lastError: null,

    // Chat State
    chatMessages: [],
    chatToolMessages: [],
    chatStream: null,
    chatLoading: false,
    chatThinkingLevel: null,
    chatStreamStartedAt: null,

    //  Identity
    assistantName: 'Assistant',
    assistantAvatar: null,
    assistantAgentId: null,

    // Tool Stream
    toolStreamById: new Map(),
    toolStreamOrder: [],
    toolStreamSyncTimer: null,

    // Session Management
    isNewSessionPending: false,
    renameSessionKey: null,


    //ChatHost
    chatMessage: "",
    chatAttachments: [],
    chatQueue: [],
    chatRunId: null,
    chatSending: false,
    sessionKey: "",
    basePath: "",
    hello: null,
    chatAvatarUrl: "",
    refreshSessionsAfterChat: new Set<string>(),

    //Other
    settings: null,

})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    state.settings = useUiSettingsStore()
    watch(() => [gatewayStore.client, gatewayStore.connected], ([client, connected]) => {
        state.client = client as any
        state.connected = connected as boolean
        if (connected) {
            // Reset orphaned chat state equivalent to resetToolStream
            resetChat()
        }
    }, { immediate: true })

    // Subscribe to gateway events
    gatewayStore.subscribe((evt) => {
        if (evt.event === 'chat') {
            const payload = evt.payload as ChatEventPayload

            // Intercept auto-naming events
            if (payload?.runId && autoNamingRuns.has(payload.runId)) {
                handleSessionNamingEvent(payload)
                return
            }
            // Update settings
            if (payload?.sessionKey) {
                const settings = useUiSettingsStore()
                settings.setLastActiveSessionKey(payload.sessionKey)
            }
            // Handle event
            const res = handleChatEvent(payload)
            // Side effects
            if (res === 'final' || res === 'error' || res === 'aborted') {
                resetToolStream(state as any)
                flushChatQueueForEvent(state as any)
                const runId = payload?.runId;

                if (runId && state.refreshSessionsAfterChat.has(runId)) {
                    state.refreshSessionsAfterChat.delete(runId);
                    if (res === "final") {
                        const sessions = useSessionsState()
                        void sessions.loadSessions()
                        //CHANGE_OPENCLAW: 还要重新加载历史..如果是/new或者是/reset会将runId添加到refreshSessionsAfterChat,这个时候需要加载历史刷新页面
                        void _loadChatHistory(state as unknown as ChatState)
                    }
                }
            }
            // CHANGE_OPENCLAW:🔧 修复页面闪烁: 移除loadChatHistory调用
            // 原因: 消息已通过delta事件同步到前端，重新加载会导致chatLoading状态闪烁
            // if (state === 'final') {
            //     void loadChatHistory(this as unknown as ChatState)
            // }
        }
    })

    // Also sync sessionKey potentially?
    // Gateway manages sessionKey logic (login/snapshot).
    // Chat state needs to know it. UseGateway exports sessionKey?
    // No, useGateway has local ref state.sessionKey in setup?
    // In refactored useGateway, state.sessionKey was removed?
    // Wait, useGateway had: isNewSessionPending, renameSessionKey.
    // sessionKey was in Settings Store mostly.
    // But useGateway Actions set sessionKey on state.
    // If I move chat actions here, I need to know where sessionKey lives.
    // In `useGateway.ts`: `state.sessionKey = ...` (on ChatState).
    // So `sessionKey` belongs to `ChatState`.
}



const sendMessage = async (message?: string, attachments?: ChatAttachment[]) => {
    state.chatAttachments = attachments || []
    await handleSendChat(state as unknown as ChatHost, message, {})
}

const abortChat = async () => {
    await handleAbortChat(state as unknown as ChatHost)
}

const loadAssistantIdentity = async () => {
    await _loadAssistantIdentity(state as any)
    // Set avatar url if needed
    const settings = useUiSettingsStore()
    const basePath = settings.gatewayUrl?.replace("ws://", 'http://').replace("wss://", 'https://') || '';
    if (state.assistantAvatar) {
        state.chatAvatarUrl = `${basePath}${state.assistantAvatar}`;
    }
}

const loadChatHistory = async () => {
    await _loadChatHistory(state as any)
}


//CHANGE_OPENCLAW:主要是为了解决,接收完ai消息后,页面会刷新,从chat.ts中分离出来,
//openclaw的流运行的时候不会传递role==toolResult,以及assistant角色包含type: "toolCall"的内容
//只有结束后通过chat.history加载才能看到..但是加载会导致页面刷新.所以这里是获取到数据然后添加进去
const handleChatEvent = (payload?: ChatEventPayload) => {
    if (!payload) {
        return null;
    }
    if (payload.sessionKey !== state.sessionKey) {
        return null;
    }

    if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
        if (payload.state === "final") {
            return "final";
        }
        return null;
    }

    if (payload.state === "delta") {
        const next = extractText(payload.message);
        if (typeof next === "string") {
            const current = state.chatStream ?? "";
            if (!current || next.length >= current.length) {
                state.chatStream = next;
            }
        }
    } else if (payload.state === "final") {
        console.log('💾 [handleChatEvent] final - Smart Syncing tools')

        // 1. 手动追加最终的文本消息（以避免闪烁）
        if (payload.message) {
            state.chatMessages = [...state.chatMessages, payload.message];
        }

        // 2. 获取最近的历史记录，以查找并插入缺失的工具消息
        if (state.client && state.connected && payload.message) {
            const localMsg = payload.message as any;
            state.client.request('chat.history', {
                sessionKey: state.sessionKey,
                limit: 20
            }).then((res: any) => {
                const history = (res.messages || []) as any[];
                let matchIndex = -1;
                if (localMsg.id) {
                    matchIndex = history.findIndex((m: any) => m.id === localMsg.id);
                }
                if (matchIndex === -1 && localMsg.timestamp) {
                    matchIndex = history.findIndex((m: any) =>
                        m.timestamp === localMsg.timestamp && m.role === localMsg.role
                    );
                }
                if (matchIndex === -1) {
                    const localText = extractText(localMsg) || '';
                    for (let i = history.length - 1; i >= 0; i--) {
                        const m = history[i];
                        if (m.role === localMsg.role) {
                            const mText = extractText(m) || '';
                            if (mText && (mText === localText || (mText.length > localText.length && mText.endsWith(localText)))) {
                                matchIndex = i;
                                break;
                            }
                        }
                    }
                }

                if (matchIndex > 0) {
                    const missingTools: any[] = [];
                    for (let i = matchIndex - 1; i >= 0; i--) {
                        const prev = history[i];
                        if (prev.role === 'user') break;

                        const exists = prev.id && state.chatMessages.some((existing: any) => existing.id === prev.id);
                        if (exists) break;

                        missingTools.unshift(prev);
                    }

                    if (missingTools.length > 0) {
                        console.log(`[SmartSync] Inserting ${missingTools.length} missing tool messages`);
                        const newMsgList = [...state.chatMessages];
                        const insertPos = newMsgList.length - 1;
                        if (insertPos >= 0) {
                            newMsgList.splice(insertPos, 0, ...missingTools);
                            state.chatMessages = newMsgList;
                        }
                    }
                }
            }).catch(e => console.warn("[SmartSync] Failed to sync tools", e));
        }

        state.chatStream = null;
        state.chatRunId = null;
        state.chatStreamStartedAt = null;
    } else if (payload.state === "aborted") {
        state.chatStream = null;
        state.chatRunId = null;
        state.chatStreamStartedAt = null;
    } else if (payload.state === "error") {
        state.chatStream = null;
        state.chatRunId = null;
        state.chatStreamStartedAt = null;
        state.lastError = payload.errorMessage ?? "chat error";
    }
    return payload.state;
}
const resetChat = () => {
    state.chatRunId = null
    state.chatStream = null
    state.chatStreamStartedAt = null
    state.chatThinkingLevel = null
    resetToolStream(state as unknown as Parameters<typeof resetToolStream>[0])
    state.chatMessages = []
}

const setSessionKey = async (key: string, loadHistory = true) => {
    // Reset Chat State
    resetChat()

    console.log("[useChatState] setSessionKey", key)
    // Update Settings
    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey(key)

    // Sync local state
    state.sessionKey = key

    // Update Identity
    await loadAssistantIdentity()

    if (loadHistory) {
        console.log("[useChatState] loadChatHistory")
        await loadChatHistory();
    }
}

//创建新session,其实就是清空当前的sessionkey,并设置isNewSessionPending为true
const createNewSession = async () => {
    const gatewayStore = useGateway() // Lazy load to avoid circular dependency issues if any
    state.isNewSessionPending = true;
    state.assistantAgentId = gatewayStore.defaultAgentId
    state.chatMessages = []
    state.chatRunId = null
    state.chatStream = null
    state.sessionKey = ''

    const settings = useUiSettingsStore()
    settings.setLastActiveSessionKey("")
}


//只有在第一次发送消息的时候,才是真正创建session
const commitNewSession = async (inputText: string) => {
    const newKey = `agent:${state.assistantAgentId}:session:${generateUUID()}`
    await setSessionKey(newKey, false)
    void triggerSessionRename(state.sessionKey, inputText)
    state.isNewSessionPending = false;
}

const triggerSessionRename = async (targetKey: string, userText: string) => {
    const gatewayStore = useGateway()
    if (!gatewayStore.client || !gatewayStore.connected || !userText) return
    const runId = generateUUID()
    autoNamingRuns.set(runId, { targetSessionKey: targetKey, titleBuffer: '' })

    try {
        state.renameSessionKey = `agent:${state.assistantAgentId}:session:rename`
        // Request agent to generate a title
        await gatewayStore.client.request('chat.send', {
            sessionKey: state.renameSessionKey,
            message: `Generate a short title (max 6 words) for this conversation.\nUser: ${userText.substring(0, 500)}`,
            deliver: false,
            idempotencyKey: runId
        })
    } catch (err) {
        console.error('Failed to trigger auto-rename', err)
        autoNamingRuns.delete(runId)
    }
}

const handleSessionNamingEvent = (payload: ChatEventPayload) => {
    const ctx = autoNamingRuns.get(payload.runId!)!

    if (payload.state === 'delta') {
        const text = extractText(payload.message)
        if (text) ctx.titleBuffer += text
    } else if (payload.state === 'final') {
        // Clean up title (remove quotes, trim)
        let title = ctx.titleBuffer.trim()
        if (title.startsWith('"') && title.endsWith('"')) {
            title = title.slice(1, -1).trim()
        }

        autoNamingRuns.delete(payload.runId!);

        // Execute async update sequentially
        (async () => {
            try {
                // Delete the naming session
                if (state.renameSessionKey) {
                    const sessionsState = useSessionsState()
                    await sessionsState.deleteSession(state.renameSessionKey)
                }
            } catch (e) {
                console.warn('Failed to cleanup auto-naming session', e)
            }

            if (title) {
                // patchSession internally calls loadSessions
                const sessionsState = useSessionsState()
                await sessionsState.patchSession(ctx.targetSessionKey, { label: title })
            } else {
                const sessionsState = useSessionsState()
                await sessionsState.loadSessions()
            }
        })()
    } else if (payload.state === 'error' || payload.state === 'aborted') {
        autoNamingRuns.delete(payload.runId!)
    }
}

export function useChatState() {
    ensureInit()

    return reactive({
        ...toRefs(state),
        sendMessage,
        abortChat,
        loadAssistantIdentity,
        loadChatHistory,
        handleChatEvent,
        resetChat,
        setSessionKey,
        createNewSession,
        commitNewSession,
        triggerSessionRename,
        handleSessionNamingEvent
    })
}

