/**
 * WebSocket Notify Client
 *
 * Connects to the server's WebSocket endpoint and listens for task events.
 * When a `task_complete` event is received, calls the provided notification callback.
 */
import { useUiSettingsStore } from '../stores/setting'

// ==================== Types ====================

export type NotifyCallback = (title: string, body: string, sessionKey: string) => void

interface WsTaskData {
    taskId: string
    taskName: string
    agentId: string
    sessionId?: string
    sessionName?: string
    prompt?: string
    resultSnippet?: string
    error?: string
}

interface WsMessage {
    type: string
    agentId?: string
    data: WsTaskData & { message?: string }
}

// ==================== State ====================

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isManualClose = false
let notifyFn: NotifyCallback | null = null

const RECONNECT_DELAY = 5000 // 5 seconds

// ==================== Helpers ====================

/**
 * Convert HTTP base URL to WebSocket URL
 * e.g. http://localhost:3000 → ws://localhost:3000/ws
 *      https://example.com   → wss://example.com/ws
 */
export function getWsUrl(): string {
    const settings = useUiSettingsStore()
    const baseUrl = settings.apiBaseUrl?.trim().replace(/\/+$/, '')
    if (!baseUrl) return ''

    const wsUrl = baseUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://')

    return `${wsUrl}/ws`
}

// ==================== Core ====================

function handleMessage(msg: WsMessage) {
    if (!notifyFn) return

    if (msg.type === 'task_complete') {
        const { taskName, sessionId, resultSnippet } = msg.data
        const title = `✅ ${taskName || 'Task'} Completed`
        const body = resultSnippet
            ? (resultSnippet.length > 80 ? resultSnippet.slice(0, 80) + '…' : resultSnippet)
            : 'Task finished successfully.'
        const sessionKey = sessionId || ''

        notifyFn(title, body, sessionKey)
    } else if (msg.type === 'task_error') {
        const { taskName, sessionId, error } = msg.data
        const title = `❌ ${taskName || 'Task'} Error`
        const body = error || 'An error occurred.'
        const sessionKey = sessionId || ''

        notifyFn(title, body, sessionKey)
    }
    // task_trigger, agent_start etc. are informational — no notification needed
}

function scheduleReconnect() {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect(notifyFn!)
    }, RECONNECT_DELAY)
}

export function connect(onNotify: NotifyCallback) {
    // Clean up previous connection
    disconnect()
    isManualClose = false
    notifyFn = onNotify

    const wsUrl = getWsUrl()
    if (!wsUrl) {
        console.warn('[notify-client] No API base URL configured, skipping WS connection.')
        return
    }

    const settings = useUiSettingsStore()
    const token = settings.token?.trim()

    // Browser WebSocket does not support custom headers.
    // Pass token as a query parameter instead.
    const urlWithAuth = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl

    console.log(`[notify-client] Connecting to ${wsUrl}...`)

    try {
        ws = new WebSocket(urlWithAuth)
    } catch (err) {
        console.error('[notify-client] Failed to create WebSocket:', err)
        scheduleReconnect()
        return
    }

    ws.onopen = () => {
        console.log('[notify-client] Connected! Listening for events...')
    }

    ws.onmessage = (event) => {
        try {
            const message: WsMessage = JSON.parse(event.data)
            handleMessage(message)
        } catch (err) {
            console.error('[notify-client] Failed to parse message:', err)
        }
    }

    ws.onclose = (event) => {
        console.log(`[notify-client] Disconnected. Code: ${event.code}, Reason: ${event.reason}`)
        ws = null

        // Auth failure — don't reconnect
        if (event.code === 4401 || event.reason?.includes('Unauthorized')) {
            console.error('[notify-client] Authentication failed. Stopping reconnect.')
            return
        }

        // Auto-reconnect unless manually closed
        if (!isManualClose) {
            scheduleReconnect()
        }
    }

    ws.onerror = (event) => {
        console.error('[notify-client] WebSocket error:', event)
    }
}

export function disconnect() {
    isManualClose = true
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
    if (ws) {
        ws.close()
        ws = null
    }
}

export function isConnected(): boolean {
    return ws?.readyState === WebSocket.OPEN
}
