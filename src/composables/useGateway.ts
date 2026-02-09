import { reactive, computed, markRaw } from 'vue'
import { GatewayBrowserClient, type GatewayEventFrame, type GatewayHelloOk } from '~openclaw/ui/src/ui/gateway'
import { GatewayTauriClient } from './gateway-tauri'
import { generateUUID } from '~openclaw/ui/src/ui/uuid'
import { useUiSettingsStore } from '../stores/setting'
import { GATEWAY_CLIENT_IDS } from '~openclaw/src/gateway/protocol/client-info'
import { createAgentMainSessionKey } from '../utils/session-key-helpers'


// ==================== Types ====================
export interface GatewayState {
    // 连接状态
    client: GatewayBrowserClient | GatewayTauriClient | null
    connected: boolean
    connecting: boolean
    lastError: string | null
    hello: GatewayHelloOk | null
    password: string




    // Pub/Sub
    subscribers: Set<(evt: GatewayEventFrame) => void>
}

// ==================== Singleton State ====================
const state = reactive<GatewayState>({
    // 连接
    client: null,
    connected: false,
    connecting: false,
    lastError: null,
    hello: null,
    password: '',
    // Pub/Sub
    subscribers: new Set(),
})

// ==================== Actions & Logic ====================

// --- Helpers ---
function normalizeSessionKey(value: string | undefined, defaults: { defaultAgentId?: string; mainKey?: string; mainSessionKey?: string }): string {
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
}

function applySnapshot(hello: GatewayHelloOk) {
    const settings = useUiSettingsStore()
    const snapshot = hello.snapshot as {
        sessionDefaults?: { defaultAgentId?: string; mainKey?: string; mainSessionKey?: string; scope?: string }
    } | undefined

    if (snapshot?.sessionDefaults) {
        const defaults = snapshot.sessionDefaults
        if (defaults.mainSessionKey) {
            const resolvedLastActiveSessionKey = normalizeSessionKey(settings.lastActiveSessionKey, defaults)
            const newLastActiveSessionKey = resolvedLastActiveSessionKey

            if (newLastActiveSessionKey !== settings.lastActiveSessionKey) {
                settings.setLastActiveSessionKey(newLastActiveSessionKey)
            }
        }
    }
}

function handleGatewayEventUnsafe(evt: GatewayEventFrame) {
    state.subscribers.forEach(fn => {
        try {
            fn(evt)
        } catch (err) {
            console.error('[gateway] Subscriber error:', err)
        }
    })
}

function subscribe(fn: (evt: GatewayEventFrame) => void) {
    state.subscribers.add(fn)
    return () => state.subscribers.delete(fn)
}

function handleGatewayEvent(evt: GatewayEventFrame) {
    try {
        handleGatewayEventUnsafe(evt)
    } catch (err) {
        console.error('[gateway] handleGatewayEvent error:', evt.event, err)
    }
}

// --- Connection ---
async function connect(): Promise<void> {
    const settings = useUiSettingsStore()

    if (!settings.gatewayUrl) {
        throw new Error('网关地址未配置')
    }

    state.connecting = true
    state.lastError = null
    state.hello = null
    state.connected = false
    state.client?.stop()

    return new Promise((resolve, reject) => {
        let connectionTimeout: number | null = null
        let connectError: any = null

        const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__;

        const clientOptions = {
            url: settings.gatewayUrl,
            token: settings.token.trim() ? settings.token : undefined,
            password: state.password.trim() ? state.password : undefined,
            //@ts-ignore
            displayName: settings.deviceName,
            clientName: GATEWAY_CLIENT_IDS.WEBCHAT,
            mode: 'webchat' as const,
            onHello: (hello: any) => {

                if (connectionTimeout) {
                    window.clearTimeout(connectionTimeout)
                    connectionTimeout = null
                }

                state.connecting = false
                state.connected = true
                state.lastError = null
                state.hello = hello
                applySnapshot(hello)
                resolve()
            },
            onClose: ({ code, reason }: any) => {
                state.connected = false
                // 1006 is generic close, often normal or network error
                if (code !== 1012 && code !== 1000) {
                    const msg = `断开连接 (${code}): ${reason || '无原因'}`
                    state.lastError = msg
                }
                if (state.connecting) {
                    state.connecting = false
                    if (connectError) {
                        reject(connectError)
                    } else {
                        reject(new Error(state.lastError || '连接失败'))
                    }
                }
            },
            onEvent: (evt: any) => handleGatewayEvent(evt),
            onGap: ({ expected, received }: any) => {
                state.lastError = `事件序列间隔 (期望 ${expected}, 收到 ${received}); 建议刷新`
            }
        }

        if (isTauri) {
            state.client = markRaw(new GatewayTauriClient(clientOptions))
        } else {
            state.client = markRaw(new GatewayBrowserClient(clientOptions))
        }

        const clientAny = state.client as any
        const originalRequest = clientAny.request?.bind(clientAny)

        // Intercept request to capture the specific error from 'connect' call
        // This is needed for BOTH clients to report handshake errors (like Pairing Required) to the UI
        if (originalRequest) {
            clientAny.request = (method: string, params: any) => {
                const p = originalRequest(method, params)
                if (method === 'connect') {
                    p.catch((err: any) => {
                        connectError = err
                    })
                }
                return p
            }
        }

        // Monkey-patch handleMessage to capture RICH error details (code, details)
        // Needed for BOTH clients to ensure consistent error propagation (e.g. Pairing Required)
        const originalHandleMessage = clientAny.handleMessage?.bind(clientAny)

        if (originalHandleMessage) {
            clientAny.handleMessage = (raw: string) => {
                try {
                    const parsed = JSON.parse(raw)
                    // Intercept only failed responses to capture rich error
                    if (parsed && parsed.type === 'res' && parsed.id && !parsed.ok && parsed.error) {
                        const pending = clientAny.pending.get(parsed.id)
                        if (pending) {
                            clientAny.pending.delete(parsed.id)
                            const err: any = new Error(parsed.error.message || 'request failed')
                            // Store the rich details on the error object
                            err.code = parsed.error.code
                            err.details = parsed.error.details
                            pending.reject(err)
                            return
                        }
                    }
                } catch (e) {
                    // Ignore parsing errors here, let original handler deal with it
                }
                originalHandleMessage(raw)
            }
        }

        connectionTimeout = window.setTimeout(() => {
            if (state.connecting) {
                state.connecting = false
                state.client?.stop()
                reject(new Error('连接超时'))
            }
        }, 10000)

        state.client.start()
    })
}

function disconnect() {
    state.client?.stop()
    state.client = null
    state.connected = false
    state.connecting = false
}

// Session Logic moved to useChatState to avoid circular dependencies



// ==================== Computed Getters ====================

const defaultAgentId = computed(() => {
    const snapshot = state.hello?.snapshot as { sessionDefaults?: { defaultAgentId?: string } } | undefined
    return snapshot?.sessionDefaults?.defaultAgentId?.trim() || 'main'
})

const defaultSessionKey = computed(() => {
    const snapshot = state.hello?.snapshot as { sessionDefaults?: { defaultAgentId?: string, mainSessionKey?: string } } | undefined
    const agentId = snapshot?.sessionDefaults?.defaultAgentId?.trim() || 'main';
    return snapshot?.sessionDefaults?.mainSessionKey?.trim() || createAgentMainSessionKey(agentId)
})

// ==================== Export ====================

export const useGateway = () => {
    return reactive({
        // State Proxy
        // @ts-ignore
        ...state,
        client: computed({ get: () => state.client, set: (v) => state.client = v }),
        connected: computed({ get: () => state.connected, set: (v) => state.connected = v }),
        connecting: computed({ get: () => state.connecting, set: (v) => state.connecting = v }),
        lastError: computed({ get: () => state.lastError, set: (v) => state.lastError = v }),
        hello: computed({ get: () => state.hello, set: (v) => state.hello = v }),
        password: computed({ get: () => state.password, set: (v) => state.password = v }),
        // Getters
        defaultAgentId,
        defaultSessionKey,
        // Actions
        connect,
        disconnect,
        // Pub/Sub
        subscribe
    })
}
