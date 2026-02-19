import { ref } from 'vue'
import { useUiSettingsStore } from '../stores/setting'
import { connectBrowserWs, disconnectBrowserWs, getWsUrl, sendBrowserWs } from './notify-client'

// ==================== Types ====================

export interface WsMessage {
    type: string
    event?: string
    payload: any
}

type MessageHandler = (msg: WsMessage) => void

// ==================== State ====================

export const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
const listeners: MessageHandler[] = []
export const isConnected = ref(false)
export const clientId = ref<string | null>(null)

const pendingRequests = new Map<number | string, { resolve: (value: any) => void, reject: (reason?: any) => void, timeout: any }>()


// ==================== Public API ====================

export function onServerMessage(handler: MessageHandler) {
    listeners.push(handler)
}

export function offServerMessage(handler: MessageHandler) {
    const index = listeners.indexOf(handler)
    if (index > -1) {
        listeners.splice(index, 1)
    }
}

export function connectServer() {
    if (isTauri) {
        initTauriConnection()
    } else {
        initBrowserConnection()
    }
}

export function disconnectServer() {
    if (isTauri) {
        disconnectTauriConnection()
    } else {
        disconnectBrowserWs()
    }
    isConnected.value = false
}

// ==================== Internal: Message Dispatch ====================

function dispatchMessage(msg: WsMessage) {
    if (msg.type === 'event' && msg.event === 'hello_ok') {
        clientId.value = msg.payload?.clientId || null
        isConnected.value = true
        // Fall through to notify other listeners (e.g. for logging)
    }

    // Check if it's a response to a pending request
    const msgWithId = msg as any
    if (msgWithId.id && pendingRequests.has(msgWithId.id)) {
        const requestId = msgWithId.id
        const { resolve, reject, timeout } = pendingRequests.get(requestId)!

        clearTimeout(timeout)
        pendingRequests.delete(requestId)

        if (msgWithId.error) {
            reject(msgWithId.error)
        } else {
            // Support various result field names: payload, data, or result
            const result = msgWithId.payload
            resolve(result !== undefined ? result : msg)
        }
        return
    }

    listeners.forEach(handler => handler(msg))
}

// ==================== Internal: Browser Implementation ====================

function initBrowserConnection() {
    connectBrowserWs((msg) => {
        dispatchMessage(msg)
    }, (connected) => {
        if (!connected) {
            isConnected.value = false
            clientId.value = null
        }
    })
}

// ==================== Internal: Tauri Implementation ====================

async function initTauriConnection() {
    try {
        const { invoke } = await import('@tauri-apps/api/core')
        const { listen } = await import('@tauri-apps/api/event')

        const settings = useUiSettingsStore()
        const wsUrl = getWsUrl()

        if (!wsUrl) {
            console.warn('[server-connection] No API base URL configured, skipping Tauri WS connection.')
            return
        }

        const token = settings.token?.trim() || undefined
        const origin = settings.apiBaseUrl?.trim().replace(/\/+$/, '') || 'http://localhost'

        // Listen for messages from Rust
        await listen<string>('notify://message', (event) => {
            try {
                const msg: WsMessage = JSON.parse(event.payload)
                dispatchMessage(msg)
            } catch (err) {
                console.error('[server-connection] Failed to parse Tauri message:', err)
            }
        })

        // Listen for connection state changes
        await listen<string>('notify://connection-state', (event) => {
            if (event.payload !== 'connected') {
                isConnected.value = false
                clientId.value = null
            }
        })

        // Start connection
        await invoke('notify_connect', { url: wsUrl, token, origin })
        console.log('[server-connection] Tauri notify_connect invoked successfully')

    } catch (err) {
        console.error('[server-connection] Failed to initialize Tauri connection:', err)
    }
}

async function disconnectTauriConnection() {
    try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('notify_disconnect')
    } catch (err) {
        console.error('[server-connection] Failed to disconnect Tauri connection:', err)
    }
}

// ==================== Public API: Request ====================

export async function sendRequest(method: string, params: any = {}): Promise<any> {
    const id = crypto.randomUUID()
    const payload = {
        type: "req",
        method,
        id,
        params
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id)
                reject(new Error('Request timed out'))
            }
        }, 10000) // 10s timeout

        pendingRequests.set(id, { resolve, reject, timeout })

        try {
            if (isTauri) {
                import('@tauri-apps/api/core').then(({ invoke }) => {
                    invoke('notify_send', { message: JSON.stringify(payload) })
                        .catch(err => {
                            clearTimeout(timeout)
                            pendingRequests.delete(id)
                            reject(err)
                        })
                })
            } else {
                sendBrowserWs(payload)
            }
        } catch (err) {
            clearTimeout(timeout)
            pendingRequests.delete(id)
            reject(err)
        }
    })
}
