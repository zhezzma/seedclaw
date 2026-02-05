import { defineStore } from 'pinia'
import { GatewayBrowserClient, type GatewayEventFrame, type GatewayHelloOk } from '../services/gateway'
import { generateUUID } from '../services/uuid'
import { extractText } from '../services/chat/message-extract'
import { useUiSettingsStore } from './setting'
import type { ChatAttachment, ChatQueueItem } from '../services/ui-types'
import type { PresenceEntry, HealthSnapshot, StatusSummary, SessionsListResult, AgentsListResult, ConfigSnapshot, ConfigUiHints } from '../services/types'
import type { EventLogEntry } from '../services/app-events'
import type { ExecApprovalRequest } from '../services/controllers/exec-approval'
import type { SkillStatusReport } from '../services/types'
import { handleAgentEvent, resetToolStream, type AgentEventPayload, type ToolStreamEntry } from '../services/app-tool-stream'
import { loadAssistantIdentity, type AssistantIdentityState } from '../services/controllers/assistant-identity'
import { loadAgents, type AgentsState } from '../services/controllers/agents'
import { loadNodes, type NodesState, type NodePairingList } from '../services/controllers/nodes'
import { loadDevices, type DevicesState, type DevicePairingList } from '../services/controllers/devices'
import { handleChatEvent, loadChatHistory, type ChatEventPayload, type ChatState } from '../services/controllers/chat'
import { loadSessions, patchSession, deleteSession, type SessionsState } from '../services/controllers/sessions'
import { loadCronJobs, loadCronStatus, type CronState } from '../services/controllers/cron'
import { loadSkills, type SkillsState } from '../services/controllers/skills'
import { loadConfig, type ConfigState } from '../services/controllers/config'
import { loadLogs, type LogsState } from '../services/controllers/logs'
import type { LogEntry, LogLevel } from '../services/types'
import {
    addExecApproval,
    parseExecApprovalRequested,
    parseExecApprovalResolved,
    removeExecApproval,
} from '../services/controllers/exec-approval'
import { GATEWAY_CLIENT_IDS } from '../services/includes/client-info'
import { handleSendChat, handleAbortChat, type ChatHost } from '../services/app-chat'
import { parseAgentSessionKey, isAgentMainSession, createAgentMainSessionKey } from '../services/includes/session-key-utils'

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
    nodesError: string | null
    nodesList: NodePairingList | null

    // Devices state
    devicesLoading: boolean
    devicesError: string | null
    devicesList: DevicePairingList | null

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
    cronRunsTotal: number
    cronBusy: boolean

    // Skills state
    skillsLoading: boolean
    skillsReport: SkillStatusReport | null
    skillsError: string | null
    skillsBusyKey: string | null
    skillEdits: Record<string, string>
    skillMessages: Record<string, { kind: "success" | "error"; message: string }>

    // Logs state
    logsLoading: boolean
    logsError: string | null
    logsCursor: number | null
    logsFile: string | null
    logsEntries: LogEntry[]
    logsTruncated: boolean
    logsLastFetchAt: number | null
    logsLimit: number
    logsMaxBytes: number
    logsLevelFilter: LogLevel | 'all'
    logsSearchQuery: string

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

    // Config state
    configLoading: boolean
    configRaw: string
    configRawOriginal: string
    configValid: boolean | null
    configIssues: unknown[]
    configSaving: boolean
    configApplying: boolean
    updateRunning: boolean
    configSnapshot: ConfigSnapshot | null
    configSchema: unknown
    configSchemaVersion: string | null
    configSchemaLoading: boolean
    configUiHints: ConfigUiHints
    configForm: Record<string, unknown> | null
    configFormOriginal: Record<string, unknown> | null
    configFormDirty: boolean
    configFormMode: "form" | "raw"
    configSearchQuery: string
    configActiveSection: string | null
    configActiveSubsection: string | null

    // Misc
    onboarding: boolean
    isNewSessionPending: boolean
    renameSessionKey: string | null
}

const autoNamingRuns = new Map<string, { targetSessionKey: string; titleBuffer: string }>()

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
        nodesError: null,
        nodesList: null,

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
        cronRunsTotal: 0,
        cronBusy: false,

        // Skills
        skillsLoading: false,
        skillsReport: null,
        skillsError: null,
        skillsBusyKey: null,
        skillEdits: {},
        skillMessages: {},

        // Logs
        logsLoading: false,
        logsError: null,
        logsCursor: null,
        logsFile: null,
        logsEntries: [],
        logsTruncated: false,
        logsLastFetchAt: null,
        logsLimit: 500,
        logsMaxBytes: 512 * 1024,
        logsLevelFilter: 'all',
        logsSearchQuery: '',

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

        // Config
        configLoading: false,
        configRaw: '',
        configRawOriginal: '',
        configValid: null,
        configIssues: [],
        configSaving: false,
        configApplying: false,
        updateRunning: false,
        configSnapshot: null,
        configSchema: null,
        configSchemaVersion: null,
        configSchemaLoading: false,
        configUiHints: {},
        configForm: null,
        configFormOriginal: null,
        configFormDirty: false,
        configFormMode: 'form',
        configSearchQuery: '',
        configActiveSection: null,
        configActiveSubsection: null,

        // Misc
        onboarding: false,
        isNewSessionPending: false,
        renameSessionKey: null,
    }),

    getters: {
        isConnected: (state) => state.connected,
        isChatBusy: (state) => state.chatSending || Boolean(state.chatRunId),
        agents: (state) => state.agentsList?.agents || [],
        sessions: (state) => state.sessionsResult?.sessions || [],
        // Get default agent ID from session defaults
        defaultAgentId: (state) => {
            const snapshot = state.hello?.snapshot as { sessionDefaults?: { defaultAgentId?: string } } | undefined
            return snapshot?.sessionDefaults?.defaultAgentId?.trim() || state.agentsList?.agents?.[0]?.id || 'main'
        },
        defaultSessionKey: (state) => {
            const snapshot = state.hello?.snapshot as { sessionDefaults?: { defaultAgentId?: string, mainSessionKey?: string } } | undefined

            const agentId = snapshot?.sessionDefaults?.defaultAgentId?.trim() || state.agentsList?.agents?.[0]?.id || 'main';

            return snapshot?.sessionDefaults?.mainSessionKey?.trim() || createAgentMainSessionKey(agentId)
        },
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

            this.basePath = settings.gatewayUrl.replace("ws://", 'http://').replace("wss://", 'https://');
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
                    clientName: GATEWAY_CLIENT_IDS.WEBCHAT,
                    displayName: 'SeedClaw-APP',
                    mode: 'webchat',
                    onConnectError: (err) => {
                        reject(err)
                    },
                    onHello: (hello) => {
                        //@ts-ignore
                        window.host = this.$state
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
                        void loadConfig(this as unknown as Parameters<typeof loadConfig>[0]);
                        void this.loadAgents();
                        void this.loadSessions();
                        //开始创建新的session
                        //this.createNewSession();

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
            // Intercept auto-naming events
            if (evt.event === 'chat') {
                const payload = evt.payload as ChatEventPayload | undefined
                if (payload?.runId && autoNamingRuns.has(payload.runId)) {
                    const ctx = autoNamingRuns.get(payload.runId)!

                    if (payload.state === 'delta') {
                        const text = extractText(payload.message)
                        if (text) ctx.titleBuffer += text
                    } else if (payload.state === 'final') {
                        // Clean up title (remove quotes, trim)
                        let title = ctx.titleBuffer.trim()
                        if (title.startsWith('"') && title.endsWith('"')) {
                            title = title.slice(1, -1).trim()
                        }

                        autoNamingRuns.delete(payload.runId);

                        // Execute async update sequentially
                        (async () => {
                            try {
                                // wrapper: Use force option to skip confirmation
                                if (this.renameSessionKey) {
                                    await deleteSession(this as unknown as SessionsState, this.renameSessionKey)
                                }

                            } catch (e) {
                                console.warn('Failed to cleanup auto-naming session', e)
                            }

                            if (title) {
                                // patchSession internally calls loadSessions
                                await this.patchSession(ctx.targetSessionKey, { label: title })
                            } else {
                                await this.loadSessions()
                            }
                        })()
                    } else if (payload.state === 'error' || payload.state === 'aborted') {
                        autoNamingRuns.delete(payload.runId)
                    }
                    return
                }
            }

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
                    let shouldRefreshSessions = false

                    // Check for specific runId
                    if (runId && this.refreshSessionsAfterChat.has(runId)) {
                        this.refreshSessionsAfterChat.delete(runId)
                        shouldRefreshSessions = true
                    }

                    // Check for new session marker
                    if (this.isNewSessionPending) {
                        this.isNewSessionPending = false

                        // Trigger auto-rename for this session
                        if (state === 'final') {
                            void this.triggerAutoRename(this.sessionKey)
                            // process will be refreshed by auto-rename logic
                        }
                    }

                    if (shouldRefreshSessions && state === 'final') {

                        void this.loadSessions()
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
                void this.loadCron()
            }

            if (evt.event === 'device.pair.requested' || evt.event === 'device.pair.resolved') {
                void loadDevices(this as unknown as DevicesState, { quiet: true })
            }

            if (evt.event === 'node.pair.requested' || evt.event === 'node.pair.resolved') {
                void loadNodes(this as unknown as NodesState, { quiet: true })
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

        //检查了value是否是agent:defaultAgentId:mainKey的别名..比如是main,或者是mainkey,或者是agent:defaultAgentId:mainKey..都返回mainSessionKey
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
        async sendMessage(message?: string, attachments?: ChatAttachment[]) {
            await handleSendChat(this as unknown as ChatHost, message, { attachments })
        },

        async abortChat() {
            await handleAbortChat(this as unknown as ChatHost)
        },



        async loadAssistantIdentity() {
            await loadAssistantIdentity(this as unknown as AssistantIdentityState)
            this.chatAvatarUrl = `${this.basePath}${this.assistantAvatar}`;
        },

        async loadChatHistory() {
            await loadChatHistory(this as unknown as ChatState)
        },

        async setSessionKey(key: string, opts?: { isNewSession?: boolean }) {
            this.sessionKey = key

            // Clear ephemeral state to prevent leaks from previous session
            this.chatRunId = null
            this.chatStream = null
            this.chatStreamStartedAt = null
            this.chatThinkingLevel = null
            resetToolStream(this as unknown as Parameters<typeof resetToolStream>[0])

            const settings = useUiSettingsStore()
            settings.sessionKey = key
            settings.lastActiveSessionKey = key
            settings.persist()
            this.loadAssistantIdentity()
            // Mark to refresh sessions after first chat for new sessions
            this.isNewSessionPending = !!opts?.isNewSession
            if (this.isNewSessionPending) {
                return
            }
            this.loadChatHistory();
        },

        async createNewSession() {
            this.isNewSessionPending = true
            this.assistantAgentId = this.defaultAgentId
            this.chatMessages = []
            this.chatRunId = null
            this.chatStream = null
            this.sessionKey = ''
        },

        async commitNewSession() {
            // Create a new session with full agent format to match server's format
            const newKey = `agent:${this.assistantAgentId}:session:${generateUUID()}`
            await this.setSessionKey(newKey, { isNewSession: true })
            // Ensure pending is false after commit (setSessionKey might do it, but let's be safe or rely on setSessionKey logic)
            // Note: setSessionKey sets isNewSessionPending based on opts.isNewSession. 
            // In setSessionKey: this.isNewSessionPending = !!opts?.isNewSession
            // So if we pass true, it stays true? 
            // Wait, existing setSessionKey logic:
            // this.isNewSessionPending = !!opts?.isNewSession
            // If we commit, we are creating a REAL session. key changed.
            // We want isNewSessionPending to remain true UNTIL the first chat response comes back? 
            // Or should it be false immediately?
            // The original logic was: setSessionKey(..., {isNewSession: true}) -> isNewSessionPending = true.
            // Then in handleGatewayEvent 'chat': if (state === 'final' && this.isNewSessionPending) => triggerAutoRename.
            // So we DO want isNewSessionPending to be true AFTER commit, so auto-rename happens.
            // So calling setSessionKey(..., { isNewSession: true }) is correct for commitNewSession.
        },

        async triggerAutoRename(targetKey: string) {
            if (!this.client || !this.connected) return

            // Get context from current chat messages
            const messages = this.chatMessages as any[]
            if (messages.length === 0) return

            const firstUserMsg = messages.find(m => m.role === 'user')?.content
            const firstAsstMsg = messages.find(m => m.role === 'assistant')?.content

            // Extract text from content blocks
            const getText = (content: any) => {
                if (typeof content === 'string') return content
                if (Array.isArray(content)) {
                    return content.map(b => b.text || '').join(' ')
                }
                return ''
            }

            const userText = getText(firstUserMsg)
            const asstText = getText(firstAsstMsg)

            if (!userText) return

            const runId = generateUUID()
            autoNamingRuns.set(runId, { targetSessionKey: targetKey, titleBuffer: '' })

            try {
                this.renameSessionKey = `agent:${this.assistantAgentId}:session:rename`
                // Request title generation from agent:main:session:name
                await this.client.request('chat.send', {
                    sessionKey: this.renameSessionKey,
                    message: `Generate a short title (max 6 words) for this conversation.\nUser: ${userText.substring(0, 500)}\nAssistant: ${asstText.substring(0, 500)}`,
                    deliver: false,
                    idempotencyKey: runId
                })
            } catch (err) {
                console.error('Failed to trigger auto-rename', err)
                autoNamingRuns.delete(runId)
            }
        },

        // ==================== Sessions ====================
        async loadSessions() {
            const settings = useUiSettingsStore()
            await loadSessions(this as unknown as SessionsState, {
                activeMinutes: settings.sessionsActiveDays * 24 * 60
            })
        },

        async patchSession(key: string, patch: { label?: string | null }) {
            await patchSession(this as unknown as SessionsState, key, patch)
            await this.loadSessions();
        },

        async deleteSession(key: string) {
            return await deleteSession(this as unknown as SessionsState, key)
        },

        async loadAgents() {
            await loadAgents(this as unknown as AgentsState)
        },

        // ==================== Skills ====================
        async loadSkills() {
            await loadSkills(this as unknown as SkillsState)
        },

        // ==================== Logs ====================
        async loadLogs(opts?: { reset?: boolean; quiet?: boolean }) {
            await loadLogs(this as unknown as LogsState, opts)
        },

        async loadCron() {
            await Promise.all([
                loadCronStatus(this as unknown as CronState),
                loadCronJobs(this as unknown as CronState),
            ]);
        },





        resetLogs() {
            this.logsCursor = null
            this.logsEntries = []
            this.logsFile = null
            this.logsTruncated = false
            this.logsLastFetchAt = null
        }
    }
})
