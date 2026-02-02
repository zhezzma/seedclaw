import { defineStore } from 'pinia'
import { GatewayBrowserClient, type GatewayEventFrame, type GatewayHelloOk } from '../services/gateway'
import { useUiSettingsStore } from './setting'
import type { ChatAttachment, ChatQueueItem } from '../services/ui-types'
import type { PresenceEntry, HealthSnapshot, StatusSummary, SessionsListResult, AgentsListResult } from '../services/types'
import type { EventLogEntry } from '../services/app-events'
import type { ExecApprovalRequest } from '../services/controllers/exec-approval'
import { handleAgentEvent, resetToolStream, type AgentEventPayload, type ToolStreamEntry } from '../services/app-tool-stream'
import { loadAssistantIdentity, type AssistantIdentityState } from '../services/controllers/assistant-identity'
import { loadAgents, type AgentsState } from '../services/controllers/agents'
import { loadNodes, type NodesState } from '../services/controllers/nodes'
import { loadDevices, type DevicesState } from '../services/controllers/devices'
import { handleChatEvent, loadChatHistory, type ChatEventPayload, type ChatState } from '../services/controllers/chat'
import { loadSessions, patchSession, deleteSession, type SessionsState } from '../services/controllers/sessions'
import { loadCron, type CronState } from '../services/controllers/cron'
import {
    addExecApproval,
    parseExecApprovalRequested,
    parseExecApprovalResolved,
    removeExecApproval,
} from '../services/controllers/exec-approval'
import { GATEWAY_CLIENT_IDS } from '../services/includes/client-info'
import { handleSendChat, handleAbortChat, refreshChat, type ChatHost } from '../services/app-chat'

// ==================== Types ====================
export interface GatewayState {
    // Connection state
    client: GatewayBrowserClient | null
    connected: boolean
    connecting: boolean
    lastError: string | null
    hello: GatewayHelloOk | null
    password: string

    // Chat state
    sessionKey: string
    chatLoading: boolean
    chatMessages: unknown[]
    chatThinkingLevel: string | null
    chatSending: boolean
    chatMessage: string
    chatAttachments: ChatAttachment[]
    chatRunId: string | null
    chatStream: string | null
    chatStreamStartedAt: number | null
    chatQueue: ChatQueueItem[]
    chatAvatarUrl: string | null
    basePath: string

    // Sessions state
    sessionsLoading: boolean
    sessionsResult: SessionsListResult | null
    sessionsError: string | null
    sessionsFilterActive: string
    sessionsFilterLimit: string
    sessionsIncludeGlobal: boolean
    sessionsIncludeUnknown: boolean
    refreshSessionsAfterChat: Set<string>

    // Agents state
    agentsLoading: boolean
    agentsError: string | null
    agentsList: AgentsListResult | null

    // Nodes state
    nodesLoading: boolean
    nodes: Array<Record<string, unknown>>

    // Devices state
    devicesLoading: boolean
    devicesError: string | null
    devicesList: { pending: unknown[]; paired: unknown[] } | null

    // Presence state
    presenceEntries: PresenceEntry[]
    presenceError: string | null
    presenceStatus: StatusSummary | null
    debugHealth: HealthSnapshot | null

    // Event log
    eventLogBuffer: EventLogEntry[]
    eventLog: EventLogEntry[]

    // Exec approvals
    execApprovalQueue: ExecApprovalRequest[]
    execApprovalError: string | null

    // Cron state
    cronLoading: boolean
    cronJobs: unknown[]
    cronStatus: unknown
    cronError: string | null
    cronForm: unknown
    cronRunsJobId: string | null
    cronRuns: unknown[]
    cronBusy: boolean

    // Assistant identity
    assistantName: string
    assistantAvatar: string | null
    assistantAgentId: string | null

    // Tool stream state
    toolStreamData: unknown | null
    toolStreamById: Map<string, ToolStreamEntry>
    toolStreamOrder: string[]
    chatToolMessages: Record<string, unknown>[]
    toolStreamSyncTimer: number | null

    // Misc
    onboarding: boolean
}

const CHAT_SESSIONS_ACTIVE_MINUTES = 120

// ==================== Store ====================
export const useGatewayStore = defineStore('gateway', {
    state: (): GatewayState => ({
        // Connection
        client: null,
        connected: false,
        connecting: false,
        lastError: null,
        hello: null,
        password: '',

        // Chat
        sessionKey: '',
        chatLoading: false,
        chatMessages: [],
        chatThinkingLevel: null,
        chatSending: false,
        chatMessage: '',
        chatAttachments: [],
        chatRunId: null,
        chatStream: null,
        chatStreamStartedAt: null,
        chatQueue: [],
        chatAvatarUrl: null,
        basePath: '',

        // Sessions
        sessionsLoading: false,
        sessionsResult: null,
        sessionsError: null,
        sessionsFilterActive: '',
        sessionsFilterLimit: '',
        sessionsIncludeGlobal: false,
        sessionsIncludeUnknown: false,
        refreshSessionsAfterChat: new Set(),

        // Agents
        agentsLoading: false,
        agentsError: null,
        agentsList: null,

        // Nodes
        nodesLoading: false,
        nodes: [],

        // Devices
        devicesLoading: false,
        devicesError: null,
        devicesList: null,

        // Presence
        presenceEntries: [],
        presenceError: null,
        presenceStatus: null,
        debugHealth: null,

        // Event log
        eventLogBuffer: [],
        eventLog: [],

        // Exec approvals
        execApprovalQueue: [],
        execApprovalError: null,

        // Cron
        cronLoading: false,
        cronJobs: [],
        cronStatus: null,
        cronError: null,
        cronForm: null,
        cronRunsJobId: null,
        cronRuns: [],
        cronBusy: false,

        // Assistant identity
        assistantName: 'Assistant',
        assistantAvatar: null,
        assistantAgentId: null,

        // Tool stream
        toolStreamData: null,
        toolStreamById: new Map(),
        toolStreamOrder: [],
        chatToolMessages: [],
        toolStreamSyncTimer: null,

        // Misc
        onboarding: false
    }),

    getters: {
        isConnected: (state) => state.connected,
        isChatBusy: (state) => state.chatSending || Boolean(state.chatRunId),
        currentSessionKey: (state) => state.sessionKey,
        agents: (state) => state.agentsList?.agents || [],
        sessions: (state) => state.sessionsResult?.sessions || [],
        // Expose settings store for app-chat.ts compatibility
        settings: () => useUiSettingsStore()
    },

    actions: {
        // ==================== Connection ====================
        async connect(): Promise<void> {
            const settings = useUiSettingsStore()

            if (!settings.gatewayUrl) {
                throw new Error('网关地址未配置')
            }

            this.connecting = true
            this.lastError = null
            this.hello = null
            this.connected = false
            this.execApprovalQueue = []
            this.execApprovalError = null

            // Stop existing client
            this.client?.stop()

            return new Promise((resolve, reject) => {
                let connectionTimeout: number | null = null

                this.client = new GatewayBrowserClient({
                    url: settings.gatewayUrl,
                    token: settings.token.trim() ? settings.token : undefined,
                    password: this.password.trim() ? this.password : undefined,
                    clientName: GATEWAY_CLIENT_IDS.CONTROL_UI,
                    displayName: 'SeedClaw',
                    mode: 'webchat',
                    onConnectError: (err) => {
                        reject(err)
                    },
                    onHello: (hello) => {
                        if (connectionTimeout) {
                            window.clearTimeout(connectionTimeout)
                            connectionTimeout = null
                        }
                        this.connecting = false
                        this.connected = true
                        this.lastError = null
                        this.hello = hello
                        this.applySnapshot(hello)

                        // Reset orphaned chat run state
                        this.chatRunId = null
                        this.chatStream = null
                        this.chatStreamStartedAt = null
                        resetToolStream(this as unknown as Parameters<typeof resetToolStream>[0])

                        // Load initial data
                        void loadAssistantIdentity(this as unknown as AssistantIdentityState)
                        void loadAgents(this as unknown as AgentsState)
                        void loadNodes(this as unknown as NodesState, { quiet: true })
                        void loadDevices(this as unknown as DevicesState, { quiet: true })

                        resolve()
                    },
                    onClose: ({ code, reason }) => {
                        this.connected = false
                        if (code !== 1012) {
                            this.lastError = `断开连接 (${code}): ${reason || '无原因'}`
                        }
                        if (this.connecting) {
                            this.connecting = false
                            reject(new Error(this.lastError || '连接失败'))
                        }
                    },
                    onEvent: (evt) => this.handleGatewayEvent(evt),
                    onGap: ({ expected, received }) => {
                        this.lastError = `事件序列间隔 (期望 ${expected}, 收到 ${received}); 建议刷新`
                    }
                })

                // Set connection timeout
                connectionTimeout = window.setTimeout(() => {
                    if (this.connecting) {
                        this.connecting = false
                        this.client?.stop()
                        reject(new Error('连接超时'))
                    }
                }, 10000)

                this.client.start()
            })
        },

        disconnect() {
            this.client?.stop()
            this.client = null
            this.connected = false
            this.connecting = false
        },

        // ==================== Event Handling ====================
        handleGatewayEvent(evt: GatewayEventFrame) {
            try {
                this.handleGatewayEventUnsafe(evt)
            } catch (err) {
                console.error('[gateway] handleGatewayEvent error:', evt.event, err)
            }
        },

        handleGatewayEventUnsafe(evt: GatewayEventFrame) {
            this.eventLogBuffer = [
                { ts: Date.now(), event: evt.event, payload: evt.payload },
                ...this.eventLogBuffer
            ].slice(0, 250)

            if (evt.event === 'agent') {
                if (this.onboarding) return
                handleAgentEvent(
                    this as unknown as Parameters<typeof handleAgentEvent>[0],
                    evt.payload as AgentEventPayload | undefined
                )
                return
            }

            if (evt.event === 'chat') {
                const settings = useUiSettingsStore()
                const payload = evt.payload as ChatEventPayload | undefined
                if (payload?.sessionKey) {
                    settings.lastActiveSessionKey = payload.sessionKey
                }
                const state = handleChatEvent(this as unknown as ChatState, payload)
                if (state === 'final' || state === 'error' || state === 'aborted') {
                    resetToolStream(this as unknown as Parameters<typeof resetToolStream>[0])
                    // Chat queue will be flushed automatically by app-chat.ts
                    const runId = payload?.runId
                    if (runId && this.refreshSessionsAfterChat.has(runId)) {
                        this.refreshSessionsAfterChat.delete(runId)
                        if (state === 'final') {
                            void loadSessions(this as unknown as SessionsState, {
                                activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES
                            })
                        }
                    }
                }
                if (state === 'final') {
                    void loadChatHistory(this as unknown as ChatState)
                }
                return
            }

            if (evt.event === 'presence') {
                const payload = evt.payload as { presence?: PresenceEntry[] } | undefined
                if (payload?.presence && Array.isArray(payload.presence)) {
                    this.presenceEntries = payload.presence
                    this.presenceError = null
                    this.presenceStatus = null
                }
                return
            }

            if (evt.event === 'cron') {
                void loadCron(this as unknown as CronState)
            }

            if (evt.event === 'device.pair.requested' || evt.event === 'device.pair.resolved') {
                void loadDevices(this as unknown as DevicesState, { quiet: true })
            }

            if (evt.event === 'exec.approval.requested') {
                const entry = parseExecApprovalRequested(evt.payload)
                if (entry) {
                    this.execApprovalQueue = addExecApproval(this.execApprovalQueue, entry)
                    this.execApprovalError = null
                    const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500)
                    window.setTimeout(() => {
                        this.execApprovalQueue = removeExecApproval(this.execApprovalQueue, entry.id)
                    }, delay)
                }
                return
            }

            if (evt.event === 'exec.approval.resolved') {
                const resolved = parseExecApprovalResolved(evt.payload)
                if (resolved) {
                    this.execApprovalQueue = removeExecApproval(this.execApprovalQueue, resolved.id)
                }
            }
        },

        // Helper function to normalize session keys
        normalizeSessionKey(value: string | undefined, defaults: { defaultAgentId?: string; mainKey?: string; mainSessionKey?: string }): string {
            const raw = (value ?? '').trim()
            const mainSessionKey = defaults.mainSessionKey?.trim()
            if (!mainSessionKey) {
                return raw
            }
            if (!raw) {
                return mainSessionKey
            }
            const mainKey = defaults.mainKey?.trim() || 'main'
            const defaultAgentId = defaults.defaultAgentId?.trim()
            const isAlias =
                raw === 'main' ||
                raw === mainKey ||
                (defaultAgentId &&
                    (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`))
            return isAlias ? mainSessionKey : raw
        },

        applySnapshot(hello: GatewayHelloOk) {
            const settings = useUiSettingsStore()
            const snapshot = hello.snapshot as {
                presence?: PresenceEntry[]
                health?: HealthSnapshot
                sessionDefaults?: { defaultAgentId?: string; mainKey?: string; mainSessionKey?: string; scope?: string }
            } | undefined

            if (snapshot?.presence && Array.isArray(snapshot.presence)) {
                this.presenceEntries = snapshot.presence
            }
            if (snapshot?.health) {
                this.debugHealth = snapshot.health
            }
            if (snapshot?.sessionDefaults) {
                const defaults = snapshot.sessionDefaults
                if (defaults.mainSessionKey) {
                    const resolvedSessionKey = this.normalizeSessionKey(this.sessionKey, defaults)
                    const resolvedSettingsSessionKey = this.normalizeSessionKey(settings.sessionKey, defaults)
                    const resolvedLastActiveSessionKey = this.normalizeSessionKey(settings.lastActiveSessionKey, defaults)
                    const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || this.sessionKey

                    if (nextSessionKey !== this.sessionKey) {
                        this.sessionKey = nextSessionKey
                    }

                    const newSettingsSessionKey = resolvedSettingsSessionKey || nextSessionKey
                    const newLastActiveSessionKey = resolvedLastActiveSessionKey || nextSessionKey

                    if (newSettingsSessionKey !== settings.sessionKey) {
                        settings.sessionKey = newSettingsSessionKey
                    }
                    if (newLastActiveSessionKey !== settings.lastActiveSessionKey) {
                        settings.lastActiveSessionKey = newLastActiveSessionKey
                    }
                }
            }
        },

        // ==================== Chat ====================
        async sendMessage(message?: string) {
            await handleSendChat(this as unknown as ChatHost, message)
        },

        async abortChat() {
            await handleAbortChat(this as unknown as ChatHost)
        },

        async refreshChat() {
            await refreshChat(this as unknown as ChatHost)
        },

        setSessionKey(key: string) {
            this.sessionKey = key
            const settings = useUiSettingsStore()
            settings.sessionKey = key
            settings.lastActiveSessionKey = key
            settings.persist()
            void loadChatHistory(this as unknown as ChatState)
        },

        // ==================== Sessions ====================
        async loadSessions() {
            await loadSessions(this as unknown as SessionsState, {
                activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES
            })
        },

        async patchSession(key: string, patch: { label?: string | null }) {
            await patchSession(this as unknown as SessionsState, key, patch)
        },

        async deleteSession(key: string) {
            await deleteSession(this as unknown as SessionsState, key)
        },

        // ==================== Agents ====================
        async loadAgents() {
            await loadAgents(this as unknown as AgentsState)
        }
    }
})
