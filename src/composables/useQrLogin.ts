/**
 * 扩展面板 qr-login 状态机。
 * 调用扩展约定端点 POST /api/extensions/:extensionId/login/start|wait，
 * 本地渲染二维码并轮询登录结果；面板显隐由宿主组件控制（activate/deactivate）。
 * 模块级单例状态：同屏至多一个登录面板。
 */
import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import QRCode from 'qrcode'
import { useUiSettingsStore } from '../stores/setting.ts'
import { useToast } from './useToast.ts'

export type QrLoginStatus = 'idle' | 'pending' | 'connected' | 'expired' | 'failed'

export interface QrLoginStartPayload {
    sessionKey: string
    qrcode: string
    qrcodeUrl: string
}

export type QrLoginWaitPayload =
    | {
        status: 'pending'
        connected: false
        authExpired: false
        sessionKey: string
        startedAt: number
        qrcodeUrl: string
    }
    | {
        status: 'connected'
        connected: true
        authExpired: false
        sessionKey: string
        accountId: string
    }
    | {
        status: 'expired'
        connected: false
        authExpired: true
        sessionKey: string
        error: string
    }
    | {
        status: 'failed'
        connected: false
        authExpired: false
        sessionKey: string
        error: string
    }

const isPanelActive = ref(false)
const isStarting = ref(false)
const sessionKey = ref('')
const qrCodeUrl = ref('')
const qrCodeImageDataUrl = ref('')
const status = ref<QrLoginStatus>('idle')
const errorMessage = ref('')
const accountId = ref('')

async function renderQrCodeDataUrl(text: string): Promise<string> {
    const value = text.trim()
    if (!value) return ''
    return QRCode.toDataURL(value, {
        margin: 1,
        width: 320,
    })
}
let pollTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let activePollSessionKey = ''
let openGeneration = 0

function buildApiUrl(extensionId: string, action: 'start' | 'wait'): string {
    const settings = useUiSettingsStore()
    const baseUrl = settings.apiBaseUrl?.trim()
    return `${baseUrl.replace(/\/+$/, '')}/api/extensions/${encodeURIComponent(extensionId)}/login/${action}`
}

function getHeaders(contentType?: string): Record<string, string> {
    const settings = useUiSettingsStore()
    const headers: Record<string, string> = {}
    if (settings.token?.trim()) {
        headers.Authorization = `Bearer ${settings.token.trim()}`
    }
    if (contentType) {
        headers['Content-Type'] = contentType
    }
    return headers
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders('application/json'),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await response.json() as any
    if (!response.ok || json?.ok === false) {
        throw new Error(json?.error || `HTTP ${response.status}`)
    }
    return json.payload as T
}

function clearTimeoutSafe(timer: ReturnType<typeof globalThis.setTimeout>) {
    globalThis.clearTimeout(timer)
}

function resetVisibleState() {
    sessionKey.value = ''
    qrCodeUrl.value = ''
    qrCodeImageDataUrl.value = ''
    status.value = 'idle'
    errorMessage.value = ''
    accountId.value = ''
}

function stopPolling() {
    if (pollTimer !== null) {
        clearTimeoutSafe(pollTimer)
        pollTimer = null
    }
    activePollSessionKey = ''
}

function applyWaitState(payload: QrLoginWaitPayload) {
    status.value = payload.status
    if (payload.status === 'pending') {
        qrCodeUrl.value = payload.qrcodeUrl || qrCodeUrl.value
        errorMessage.value = ''
        accountId.value = ''
        return
    }
    if (payload.status === 'connected') {
        accountId.value = payload.accountId
        errorMessage.value = ''
        stopPolling()
        return
    }
    errorMessage.value = payload.error
    accountId.value = ''
    stopPolling()
}

async function pollLoginOnce(extensionId: string, currentSessionKey = sessionKey.value) {
    if (!currentSessionKey) return
    const payload = await postJson<QrLoginWaitPayload>(buildApiUrl(extensionId, 'wait'), {
        sessionKey: currentSessionKey,
        timeoutMs: 1000,
    })
    if (currentSessionKey !== sessionKey.value) return
    applyWaitState(payload)
}

function startPolling(extensionId: string, currentSessionKey: string, generation: number) {
    stopPolling()
    activePollSessionKey = currentSessionKey

    const schedule = () => {
        pollTimer = globalThis.setTimeout(async () => {
            try {
                if (!isPanelActive.value || generation !== openGeneration || currentSessionKey !== sessionKey.value) {
                    stopPolling()
                    return
                }
                await pollLoginOnce(extensionId, currentSessionKey)
                if (status.value === 'pending' && isPanelActive.value && generation === openGeneration && currentSessionKey === sessionKey.value) {
                    schedule()
                    return
                }
                stopPolling()
            } catch (error) {
                stopPolling()
                // 世代过期即丢弃：面板已关闭（状态已重置），迟到的轮询错误不应改写单例状态
                if (generation !== openGeneration) {
                    return
                }
                status.value = 'failed'
                errorMessage.value = error instanceof Error ? error.message : String(error)
            }
        }, 1500)
    }

    schedule()
}

export function resetQrLoginForTest() {
    stopPolling()
    isPanelActive.value = false
    isStarting.value = false
    openGeneration = 0
    resetVisibleState()
}

export function useQrLogin(extensionId: string) {
    const toast = useToast()

    const statusTextKey = computed(() => {
        if (isStarting.value) return 'extensions.qrLogin.starting'
        switch (status.value) {
            case 'pending':
                return 'extensions.qrLogin.waiting'
            case 'connected':
                return 'extensions.qrLogin.success'
            case 'expired':
                return 'extensions.qrLogin.expired'
            case 'failed':
                return 'extensions.qrLogin.failed'
            default:
                return 'extensions.qrLogin.idle'
        }
    })

    const qrCodeSrc = computed(() => qrCodeImageDataUrl.value)

    async function startLogin(force = false) {
        const generation = openGeneration
        if (isStarting.value) return
        if (!force && status.value === 'pending' && sessionKey.value) {
            if (activePollSessionKey !== sessionKey.value) {
                startPolling(extensionId, sessionKey.value, generation)
            }
            return
        }
        isStarting.value = true
        errorMessage.value = ''
        accountId.value = ''
        qrCodeUrl.value = ''
        qrCodeImageDataUrl.value = ''
        try {
            const payload = await postJson<QrLoginStartPayload>(buildApiUrl(extensionId, 'start'))
            // 世代过期即丢弃：面板已关闭（deactivate 已重置状态），迟到的写入只会污染单例状态
            if (generation !== openGeneration) {
                return
            }
            sessionKey.value = payload.sessionKey
            qrCodeUrl.value = payload.qrcodeUrl
            status.value = 'pending'
            void renderQrCodeDataUrl(payload.qrcodeUrl).then((dataUrl) => {
                if (generation !== openGeneration) {
                    return
                }
                if (sessionKey.value !== payload.sessionKey) {
                    return
                }
                qrCodeImageDataUrl.value = dataUrl
            }).catch((renderError) => {
                console.error('Failed to render qr login code locally', renderError)
            })
            await pollLoginOnce(extensionId, payload.sessionKey)
            if (generation !== openGeneration) {
                return
            }
            if (status.value === 'pending') {
                startPolling(extensionId, payload.sessionKey, generation)
            }
        } catch (error) {
            if (generation !== openGeneration) {
                return
            }
            status.value = 'failed'
            errorMessage.value = error instanceof Error ? error.message : String(error)
            toast.error(errorMessage.value, 4000)
        } finally {
            if (generation === openGeneration) {
                isStarting.value = false
            }
        }
    }

    // 面板激活（宿主挂载时调用）：idle 全新开始；pending 恢复轮询；expired/failed 重置后重开
    function activate() {
        isPanelActive.value = true
        openGeneration += 1
        if (status.value === 'idle') {
            void startLogin(true)
            return
        }
        if (status.value === 'pending' && sessionKey.value && activePollSessionKey !== sessionKey.value) {
            startPolling(extensionId, sessionKey.value, openGeneration)
            return
        }
        if (status.value === 'expired' || status.value === 'failed') {
            resetVisibleState()
            void startLogin(true)
        }
    }

    // 面板关闭（宿主卸载时调用）：停轮询并清空可见状态
    function deactivate() {
        isPanelActive.value = false
        openGeneration += 1
        isStarting.value = false
        stopPolling()
        resetVisibleState()
    }

    if (getCurrentScope()) {
        onScopeDispose(() => {
            stopPolling()
        })
    }

    return {
        isPanelActive,
        isStarting,
        sessionKey,
        qrCodeUrl,
        qrCodeImageDataUrl,
        status,
        errorMessage,
        accountId,
        statusTextKey,
        qrCodeSrc,
        activate,
        deactivate,
        startLogin,
        pollLoginOnce,
    }
}
