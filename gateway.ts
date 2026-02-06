import { defineStore } from 'pinia'
import { GatewayBrowserClient, type GatewayEventFrame, type GatewayHelloOk } from '~openclaw/ui/src/ui/gateway'
import { generateUUID } from '~openclaw/ui/src/ui/uuid'
import { extractText } from '~openclaw/ui/src/ui/chat/message-extract'
import { useUiSettingsStore } from './setting'
import type { ChatAttachment, ChatQueueItem, CronFormState } from '~openclaw/ui/src/ui/ui-types'
import type { PresenceEntry, HealthSnapshot, StatusSummary, SessionsListResult, AgentsListResult, ConfigSnapshot, ConfigUiHints, CronJob, SkillInstallOption } from '~openclaw/ui/src/ui/types'
import type { EventLogEntry } from '~openclaw/ui/src/ui/app-events'
import type { ExecApprovalRequest } from '~openclaw/ui/src/ui/controllers/exec-approval'
import type { SkillStatusReport } from '~openclaw/ui/src/ui/types'
import { handleAgentEvent, resetToolStream, type AgentEventPayload, type ToolStreamEntry } from '~openclaw/ui/src/ui/app-tool-stream'
import { loadAssistantIdentity, type AssistantIdentityState } from '~openclaw/ui/src/ui/controllers/assistant-identity'
import { loadAgents, type AgentsState } from '~openclaw/ui/src/ui/controllers/agents'
import { loadNodes, type NodesState } from '~openclaw/ui/src/ui/controllers/nodes'
import { approveNodePairing, rejectNodePairing, rotateNodeToken, revokeNodeToken } from './nodes'
import { loadDevices, approveDevicePairing, rejectDevicePairing, rotateDeviceToken, revokeDeviceToken, type DevicesState, type DevicePairingList } from '~openclaw/ui/src/ui/controllers/devices'
import { loadOrCreateDeviceIdentity } from '~openclaw/ui/src/ui/device-identity'
import { handleChatEvent, loadChatHistory, type ChatEventPayload, type ChatState } from '~openclaw/ui/src/ui/controllers/chat'
import { loadSessions, patchSession, type SessionsState } from '~openclaw/ui/src/ui/controllers/sessions'
import {
    loadCronJobs, loadCronStatus, addCronJob, toggleCronJob, runCronJob, removeCronJob, loadCronRuns, buildCronSchedule, buildCronPayload, type CronState
} from '~openclaw/ui/src/ui/controllers/cron'
import { loadSkills, saveSkillApiKey, updateSkillEdit, updateSkillEnabled, installSkill, type SkillsState } from '~openclaw/ui/src/ui/controllers/skills'
import { loadConfig, saveConfig, updateConfigFormValue, type ConfigState } from '~openclaw/ui/src/ui/controllers/config'
import { loadLogs, type LogsState } from '~openclaw/ui/src/ui/controllers/logs'
import type { LogEntry, LogLevel } from '~openclaw/ui/src/ui/types'
import { addExecApproval, parseExecApprovalRequested, parseExecApprovalResolved, removeExecApproval } from '~openclaw/ui/src/ui/controllers/exec-approval'
import { GATEWAY_CLIENT_IDS } from '~openclaw/src/gateway/protocol/client-info'
import { handleSendChat, handleAbortChat, type ChatHost, flushChatQueueForEvent } from '~openclaw/ui/src/ui/app-chat'
import { isAgentMainSession, createAgentMainSessionKey } from '../utils/session-key-helpers'
import { AgentFilesState, loadAgentFileContent, loadAgentFiles, saveAgentFile } from '~openclaw/ui/src/ui/controllers/agent-files'

// ==================== Types ====================
export interface GatewayState {
    // 连接状态
    client: GatewayBrowserClient | null
    connected: boolean
    connecting: boolean
    lastError: string | null
    hello: GatewayHelloOk | null
    password: string

    // 聊天状态
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

    // 会话列表状态 (Sessions)
    sessionsLoading: boolean
    sessionsResult: SessionsListResult | null
    sessionsError: string | null
    sessionsFilterActive: string
    sessionsFilterLimit: string
    sessionsIncludeGlobal: boolean
    sessionsIncludeUnknown: boolean
    refreshSessionsAfterChat: Set<string>

    // 智能体状态 (Agents)
    agentsLoading: boolean
    agentsError: string | null
    agentsList: AgentsListResult | null

    // 节点状态 (Nodes)
    nodesLoading: boolean
    nodesError: string | null
    nodes: Array<Record<string, unknown>>;

    // 设备状态 (Devices)
    devicesLoading: boolean
    devicesError: string | null
    devicesList: DevicePairingList | null

    // 在线状态 (Presence)
    presenceEntries: PresenceEntry[]
    presenceError: string | null
    presenceStatus: StatusSummary | null
    debugHealth: HealthSnapshot | null

    // 事件日志
    eventLogBuffer: EventLogEntry[]
    eventLog: EventLogEntry[]

    // 执行审批 (Exec Approvals)
    execApprovalQueue: ExecApprovalRequest[]
    execApprovalError: string | null

    // 定时任务 (Cron)
    cronLoading: boolean
    cronJobs: unknown[]
    cronStatus: unknown
    cronError: string | null
    cronForm: unknown
    cronRunsJobId: string | null
    cronRuns: unknown[]
    cronRunsTotal: number
    cronBusy: boolean

    // 技能状态 (Skills)
    skillsLoading: boolean
    skillsReport: SkillStatusReport | null
    skillsError: string | null
    skillsBusyKey: string | null
    skillEdits: Record<string, string>
    skillMessages: Record<string, { kind: "success" | "error"; message: string }>

    // 系统日志 (Logs)
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

    // 助手身份信息
    assistantName: string
    assistantAvatar: string | null
    assistantAgentId: string | null

    // 工具流状态 (Tool Stream)
    toolStreamData: unknown | null
    toolStreamById: Map<string, ToolStreamEntry>
    toolStreamOrder: string[]
    chatToolMessages: Record<string, unknown>[]
    toolStreamSyncTimer: number | null

    // 配置状态 (Config)
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

    // 杂项
    onboarding: boolean
    isNewSessionPending: boolean
    renameSessionKey: string | null
}

const autoNamingRuns = new Map<string, { targetSessionKey: string; titleBuffer: string }>()

// ==================== Store ====================
export const useGatewayStore = defineStore('gateway', {
    state: (): GatewayState => ({
        // 连接
        client: null,
        connected: false,
        connecting: false,
        lastError: null,
        hello: null,
        password: '',

        // 聊天
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

        // 会话列表
        sessionsLoading: false,
        sessionsResult: null,
        sessionsError: null,
        sessionsFilterActive: '',
        sessionsFilterLimit: '',
        sessionsIncludeGlobal: false,
        sessionsIncludeUnknown: false,
        refreshSessionsAfterChat: new Set(),

        // 智能体
        agentsLoading: false,
        agentsError: null,
        agentsList: null,

        // 节点
        nodesLoading: false,
        nodesError: null,
        nodes: [],

        // 设备
        devicesLoading: false,
        devicesError: null,
        devicesList: null,

        // 在线状态
        presenceEntries: [],
        presenceError: null,
        presenceStatus: null,
        debugHealth: null,

        // 事件日志
        eventLogBuffer: [],
        eventLog: [],

        // 执行审批
        execApprovalQueue: [],
        execApprovalError: null,

        // 定时任务
        cronLoading: false,
        cronJobs: [],
        cronStatus: null,
        cronError: null,
        cronForm: null,
        cronRunsJobId: null,
        cronRuns: [],
        cronRunsTotal: 0,
        cronBusy: false,

        // 技能
        skillsLoading: false,
        skillsReport: null,
        skillsError: null,
        skillsBusyKey: null,
        skillEdits: {},
        skillMessages: {},

        // 系统日志
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

        // 助手身份
        assistantName: 'Assistant',
        assistantAvatar: null,
        assistantAgentId: null,

        // 工具流
        toolStreamData: null,
        toolStreamById: new Map(),
        toolStreamOrder: [],
        chatToolMessages: [],
        toolStreamSyncTimer: null,

        // 配置
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

        // 杂项
        onboarding: false,
        isNewSessionPending: false,
        renameSessionKey: null,
    }),

    getters: {
        isConnected: (state) => state.connected,
        isChatBusy: (state) => state.chatSending || Boolean(state.chatRunId),
        agents: (state) => {
            const list = state.agentsList?.agents || []
            const defaultId = (state.hello?.snapshot as any)?.sessionDefaults?.defaultAgentId?.trim() || list[0]?.id || 'main'
            return list.map((a: any) => ({
                id: a.id,
                name: a.name || a.identity?.name || a.id,
                avatarUrl: a.identity?.avatarUrl,
                icon: a.identity?.emoji || '🤖',
                description: a.identity?.theme || '还未设定哟',
                isDefault: (a.id || a.name) === defaultId
            }))
        },
        sessions: (state) => state.sessionsResult?.sessions || [],
        // 从会话默认值获取默认 Agent ID
        defaultAgentId: (state) => {
            const snapshot = state.hello?.snapshot as { sessionDefaults?: { defaultAgentId?: string } } | undefined
            return snapshot?.sessionDefaults?.defaultAgentId?.trim() || state.agentsList?.agents?.[0]?.id || 'main'
        },
        defaultSessionKey: (state) => {
            const snapshot = state.hello?.snapshot as { sessionDefaults?: { defaultAgentId?: string, mainSessionKey?: string } } | undefined

            const agentId = snapshot?.sessionDefaults?.defaultAgentId?.trim() || state.agentsList?.agents?.[0]?.id || 'main';

            return snapshot?.sessionDefaults?.mainSessionKey?.trim() || createAgentMainSessionKey(agentId)
        },
        // 暴露设置 store 以兼容 app-chat.ts
        settings: () => useUiSettingsStore()
    },

    actions: {
        // ==================== 连接管理 (Connection) ====================
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

            // 停止现有客户端
            this.client?.stop()

            return new Promise((resolve, reject) => {
                let connectionTimeout: number | null = null

                this.client = new GatewayBrowserClient({
                    url: settings.gatewayUrl,
                    token: settings.token.trim() ? settings.token : undefined,
                    password: this.password.trim() ? this.password : undefined,
                    clientName: GATEWAY_CLIENT_IDS.WEBCHAT,
                    mode: 'webchat',
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


                        // 重置孤立的聊天运行状态
                        this.chatRunId = null
                        this.chatStream = null
                        this.chatStreamStartedAt = null
                        resetToolStream(this as unknown as Parameters<typeof resetToolStream>[0])

                        // 加载初始数据
                        void this.loadConfig();
                        void this.loadAgents();
                        void this.loadSessions();


                        //开始创建新的session,如果想访问首页就是新会话,则取消注释
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

                // 设置连接超时
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

        // ==================== 事件处理 (Event Handling) ====================
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
                // 拦截自动命名事件
                if (payload?.runId && autoNamingRuns.has(payload.runId)) {
                    this.handleSessionNamingEvent(payload)
                    return
                }
                if (payload?.sessionKey) {
                    settings.lastActiveSessionKey = payload.sessionKey
                }
                const state = this.handleChatEvent(payload);
                if (state === 'final' || state === 'error' || state === 'aborted') {
                    resetToolStream(this as unknown as Parameters<typeof resetToolStream>[0])
                    void flushChatQueueForEvent(this as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
                    const runId = payload?.runId;
                    if (runId && this.refreshSessionsAfterChat.has(runId)) {
                        this.refreshSessionsAfterChat.delete(runId);
                        if (state === "final") {
                            void this.loadSessions();
                            //CHANGE_OPENCLAW: 还要重新加载历史..如果是/new或者是/reset会将runId添加到refreshSessionsAfterChat,这个时候需要加载历史刷新页面
                            void loadChatHistory(this as unknown as ChatState)
                        }
                    }
                }
                // CHANGE_OPENCLAW:🔧 修复页面闪烁: 移除loadChatHistory调用
                // 原因: 消息已通过delta事件同步到前端，重新加载会导致chatLoading状态闪烁
                // if (state === 'final') {
                //     void loadChatHistory(this as unknown as ChatState)
                // }
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
                void this.loadDevices({ quiet: true })
            }

            if (evt.event === 'node.pair.requested' || evt.event === 'node.pair.resolved') {
                void this.loadNodes({ quiet: true })
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

        // ==================== 聊天 (Chat) ====================
        async sendMessage(message?: string, attachments?: ChatAttachment[]) {
            this.chatAttachments = attachments || []
            await handleSendChat(this as unknown as ChatHost, message, {})
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

        //CHANGE_OPENCLAW:主要是为了解决,接收完ai消息后,页面会刷新,从chat.ts中分离出来,
        //openclaw的流运行的时候不会传递role==toolResult,以及assistant角色包含type: "toolCall"的内容
        //只有结束后通过chat.history加载才能看到..但是加载会导致页面刷新.所以这里是获取到数据然后添加进去
        handleChatEvent(payload?: ChatEventPayload) {
            const state = this;
            if (!payload) {
                return null;
            }
            if (payload.sessionKey !== state.sessionKey) {
                return null;
            }

            // Final from another run (e.g. sub-agent announce): refresh history to show new message.
            // See https://github.com/openclaw/openclaw/issues/1909
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

                // 1. Manually append the final text message (to avoid flicker)
                if (payload.message) {
                    state.chatMessages = [...state.chatMessages, payload.message];
                }

                // 2. Fetch recent history to find and insert missing tool messages
                if (state.client && state.connected && payload.message) {
                    const localMsg = payload.message as any;
                    state.client.request('chat.history', {
                        sessionKey: state.sessionKey,
                        limit: 20
                    }).then((res: any) => {
                        const history = (res.messages || []) as any[];
                        // Find the final message in history
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
                            // Text content fallback
                            const localText = extractText(localMsg) || '';
                            // Search backwards
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
                            // Look backwards from the matched message for intermediate tool messages
                            for (let i = matchIndex - 1; i >= 0; i--) {
                                const prev = history[i];
                                // Stop at user message or if we hit an existing message?
                                // Ideally check if this message is already in state.chatMessages
                                if (prev.role === 'user') break;

                                // Check duplicates just in case (by ID)
                                const exists = prev.id && state.chatMessages.some((existing: any) => existing.id === prev.id);
                                if (exists) break;

                                missingTools.unshift(prev);
                            }

                            if (missingTools.length > 0) {
                                console.log(`[SmartSync] Inserting ${missingTools.length} missing tool messages`);
                                const newMsgList = [...state.chatMessages];
                                // Insert before the last message (which is localMsg)
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
        },


        // ==================== 会话 (Sessions) ====================
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

        //CHANGE_OPENCLAW:需要返回删除结果,且openclaw中的里面有弹窗,从session控制器中分离出来
        async deleteSession(key: string) {
            const state = this;
            if (!state.client || !state.connected) {
                return { deleted: false };
            }
            if (state.sessionsLoading) {
                return { deleted: false };
            }
            state.sessionsLoading = true;
            state.sessionsError = null;
            try {
                const res: any = await state.client.request("sessions.delete", { key, deleteTranscript: true });
                const deleted = res?.deleted === true;
                // Only remove from local list if actually deleted
                if (deleted && state.sessionsResult?.sessions) {
                    state.sessionsResult = {
                        ...state.sessionsResult,
                        sessions: state.sessionsResult.sessions.filter((s: any) => s.key !== key)
                    };
                }
                return { deleted };
            } catch (err) {
                state.sessionsError = String(err);
                return { deleted: false };
            } finally {
                state.sessionsLoading = false;
            }
        },


        async setSessionKey(key: string, loadHistory = true) {
            this.sessionKey = key

            // 清除临时状态以防上次会话泄漏
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

            if (loadHistory) {
                this.loadChatHistory();
            }
        },


        //创建新session,其实就是清空当前的sessionkey,并设置isNewSessionPending为true
        async createNewSession() {
            this.isNewSessionPending = true; //是否是新的session全靠这个进行判断
            this.assistantAgentId = this.defaultAgentId
            this.chatMessages = []
            this.chatRunId = null
            this.chatStream = null
            this.sessionKey = ''
        },

        //只有在第一次发送消息的时候,才是真正创建session
        async commitNewSession(inputText: string) {
            const newKey = `agent:${this.assistantAgentId}:session:${generateUUID()}`
            await this.setSessionKey(newKey, false)
            void this.triggerSessionRename(this.sessionKey, inputText)
            this.isNewSessionPending = false;
        },

        async triggerSessionRename(targetKey: string, userText: string) {
            if (!this.client || !this.connected || !userText) return
            const runId = generateUUID()
            autoNamingRuns.set(runId, { targetSessionKey: targetKey, titleBuffer: '' })

            try {
                this.renameSessionKey = `agent:${this.assistantAgentId}:session:rename`
                // 此时请求 agent:main:session:name 生成标题
                await this.client.request('chat.send', {
                    sessionKey: this.renameSessionKey,
                    message: `Generate a short title (max 6 words) for this conversation.\nUser: ${userText.substring(0, 500)}`,
                    deliver: false,
                    idempotencyKey: runId
                })
            } catch (err) {
                console.error('Failed to trigger auto-rename', err)
                autoNamingRuns.delete(runId)
            }
        },

        handleSessionNamingEvent(payload: ChatEventPayload) {
            const ctx = autoNamingRuns.get(payload.runId!)!

            if (payload.state === 'delta') {
                const text = extractText(payload.message)
                if (text) ctx.titleBuffer += text
            } else if (payload.state === 'final') {
                // 清理标题（去掉引号，修剪）
                let title = ctx.titleBuffer.trim()
                if (title.startsWith('"') && title.endsWith('"')) {
                    title = title.slice(1, -1).trim()
                }

                autoNamingRuns.delete(payload.runId!);

                // Execute async update sequentially
                (async () => {
                    try {
                        // wrapper: 使用 force 选项跳过确认
                        if (this.renameSessionKey) {
                            await this.deleteSession(this.renameSessionKey)
                        }

                    } catch (e) {
                        console.warn('Failed to cleanup auto-naming session', e)
                    }

                    if (title) {
                        // patchSession 内部调用 loadSessions
                        await this.patchSession(ctx.targetSessionKey, { label: title })
                    } else {
                        await this.loadSessions()
                    }
                })()
            } else if (payload.state === 'error' || payload.state === 'aborted') {
                autoNamingRuns.delete(payload.runId!)
            }
        },

        // ==================== Agents ====================
        async loadAgents() {
            await loadAgents(this as unknown as AgentsState)
        },

        async loadAgentFiles(state: AgentFilesState, agentId: string) {
            await loadAgentFiles(state, agentId)
        },

        async loadAgentFileContent(state: AgentFilesState, agentId: string,
            name: string,
            opts?: { force?: boolean; preserveDraft?: boolean },) {
            await loadAgentFileContent(state, agentId, name, opts)
        },

        async saveAgentFile(state: AgentFilesState, agentId: string, name: string, content: string) {
            await saveAgentFile(state, agentId, name, content)
        },

        // ==================== Skills ====================
        async loadSkills() {
            await loadSkills(this as unknown as SkillsState)
        },

        async saveSkillApiKey(skillKey: string) {
            await saveSkillApiKey(this as unknown as SkillsState, skillKey)
        },

        updateSkillEdit(skillKey: string, value: string) {
            updateSkillEdit(this as unknown as SkillsState, skillKey, value)
        },

        async updateSkillEnabled(skillId: string, enabled: boolean) {
            await updateSkillEnabled(this as unknown as SkillsState, skillId, enabled)
        },

        async installSkill(skillKey: string, name: string, installId: string) {
            await installSkill(this as unknown as SkillsState, skillKey, name, installId)
        },

        // ==================== Cron ====================
        async loadCron() {
            await Promise.all([
                loadCronStatus(this as unknown as CronState),
                loadCronJobs(this as unknown as CronState),
            ]);
        },

        async addCronJob() {
            await addCronJob(this as unknown as CronState)
        },

        async toggleCronJob(job: CronJob, enabled: boolean) {
            await toggleCronJob(this as unknown as CronState, job, enabled)
        },

        async runCronJob(job: CronJob) {
            await runCronJob(this as unknown as CronState, job)
        },

        async removeCronJob(job: CronJob) {
            await removeCronJob(this as unknown as CronState, job)
        },

        async loadCronRuns(jobId: string) {
            await loadCronRuns(this as unknown as CronState, jobId)
        },

        buildCronSchedule(form: CronFormState) {
            return buildCronSchedule(form)
        },

        buildCronPayload(form: CronFormState) {
            return buildCronPayload(form)
        },


        // ==================== Devices ====================

        async loadDevices(opts?: { quiet?: boolean }) {
            await loadDevices(this as unknown as DevicesState, opts)
        },

        async approveDevicePairing(requestId: string) {
            await approveDevicePairing(this as unknown as DevicesState, requestId)
        },

        async rejectDevicePairing(requestId: string) {
            await rejectDevicePairing(this as unknown as DevicesState, requestId)
        },

        async rotateDeviceToken(params: { deviceId: string; role: string; scopes?: string[] }) {
            await rotateDeviceToken(this as unknown as DevicesState, params)
        },

        async revokeDeviceToken(params: { deviceId: string; role: string }) {
            await revokeDeviceToken(this as unknown as DevicesState, params)
        },

        async loadOrCreateDeviceIdentity() {
            return await loadOrCreateDeviceIdentity()
        },

        // ==================== Nodes ====================

        async loadNodes(opts?: { quiet?: boolean }) {
            await loadNodes(this as unknown as NodesState, opts)
        },

        async approveNodePairing(requestId: string) {
            await approveNodePairing(this as unknown as NodesState, requestId)
        },

        async rejectNodePairing(requestId: string) {
            await rejectNodePairing(this as unknown as NodesState, requestId)
        },

        async rotateNodeToken(params: { deviceId: string; role: string; scopes?: string[] }) {
            await rotateNodeToken(this as unknown as NodesState, params)
        },

        async revokeNodeToken(params: { deviceId: string; role: string }) {
            await revokeNodeToken(this as unknown as NodesState, params)
        },


        // ==================== Logs ====================
        async loadLogs(opts?: { reset?: boolean; quiet?: boolean }) {
            await loadLogs(this as unknown as LogsState, opts)
        },

        resetLogs() {
            this.logsCursor = null
            this.logsEntries = []
            this.logsFile = null
            this.logsTruncated = false
            this.logsLastFetchAt = null
        },

        // ==================== Config ====================

        async loadConfig() {
            await loadConfig(this as unknown as ConfigState)
        },

        updateConfigFormValue(path: string[], value: unknown) {
            updateConfigFormValue(this as unknown as ConfigState, path, value)
        },

        async saveConfig() {
            await saveConfig(this as unknown as ConfigState)
        },


    }
})
