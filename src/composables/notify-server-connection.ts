import { ref } from 'vue'
import { useUiSettingsStore } from '../stores/setting'
import { connectBrowserWs, disconnectBrowserWs, getWsUrl, sendBrowserWs } from './notify-client'

// ==================== Types ====================

export interface WsMessage {
    type: string
    data: any
}

type MessageHandler = (msg: WsMessage) => void

// ==================== State ====================

const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
const listeners: MessageHandler[] = []
let isConnected = ref(false)

const pendingRequests = new Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void, timeout: any }>()


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
    // Check if it's a response to a pending request
    // Assuming response format: { id: number, result?: any, error?: any }
    if ((msg as any).id && pendingRequests.has((msg as any).id)) {
        const requestId = (msg as any).id
        const { resolve, reject, timeout } = pendingRequests.get(requestId)!

        clearTimeout(timeout)
        pendingRequests.delete(requestId)

        if ((msg as any).error) {
            reject((msg as any).error)
        } else {
            resolve((msg as any).result)
        }
        return
    }

    listeners.forEach(handler => handler(msg))
}

// ==================== Internal: Browser Implementation ====================

function initBrowserConnection() {
    connectBrowserWs((msg) => {
        dispatchMessage(msg)
        isConnected.value = true
    }, () => {
        isConnected.value = false
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
            isConnected.value = event.payload === 'connected'
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
    const id = Date.now() + Math.random()
    const payload = {
        jsonrpc: '2.0',
        id,
        method,
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
