import { computed, getCurrentScope, onScopeDispose, ref } from 'vue'
import QRCode from 'qrcode'
import { useUiSettingsStore } from '../stores/setting.ts'
import { useToast } from './useToast.ts'

export type WeixinLoginStatus = 'idle' | 'pending' | 'connected' | 'expired' | 'failed'

export interface WeixinLoginStartPayload {
    sessionKey: string
    qrcode: string
    qrcodeUrl: string
}

export type WeixinLoginWaitPayload =
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

const isModalOpen = ref(false)
const isStarting = ref(false)
const sessionKey = ref('')
const qrCodeText = ref('')
const qrCodeUrl = ref('')
const qrCodeImageDataUrl = ref('')
const status = ref<WeixinLoginStatus>('idle')
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

function buildApiUrl(path: string): string {
    const settings = useUiSettingsStore()
    const baseUrl = settings.apiBaseUrl?.trim()
    return `${baseUrl.replace(/\/+$/, '')}${path}`
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

async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(buildApiUrl(path), {
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
    qrCodeText.value = ''
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

function applyWaitState(payload: WeixinLoginWaitPayload) {
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

async function pollLoginOnce(currentSessionKey = sessionKey.value) {
    if (!currentSessionKey) return
    const payload = await postJson<WeixinLoginWaitPayload>('/api/weixin-bridge/login/wait', {
        sessionKey: currentSessionKey,
        timeoutMs: 1000,
    })
    if (currentSessionKey !== sessionKey.value) return
    applyWaitState(payload)
}

function startPolling(currentSessionKey: string, generation: number) {
    stopPolling()
    activePollSessionKey = currentSessionKey

    const schedule = () => {
        pollTimer = globalThis.setTimeout(async () => {
            try {
                if (!isModalOpen.value || generation !== openGeneration || currentSessionKey !== sessionKey.value) {
                    stopPolling()
                    return
                }
                await pollLoginOnce(currentSessionKey)
                if (status.value === 'pending' && isModalOpen.value && generation === openGeneration && currentSessionKey === sessionKey.value) {
                    schedule()
                    return
                }
                stopPolling()
            } catch (error) {
                stopPolling()
                status.value = 'failed'
                errorMessage.value = error instanceof Error ? error.message : String(error)
            }
        }, 1500)
    }

    schedule()
}

export function resetWeixinLoginForTest() {
    stopPolling()
    isModalOpen.value = false
    isStarting.value = false
    openGeneration = 0
    resetVisibleState()
}

export function useWeixinLogin() {
    const toast = useToast()

    const statusTextKey = computed(() => {
        if (isStarting.value) return 'sidebar.weixinLoginStarting'
        switch (status.value) {
            case 'pending':
                return 'sidebar.weixinLoginWaiting'
            case 'connected':
                return 'sidebar.weixinLoginSuccess'
            case 'expired':
                return 'sidebar.weixinLoginExpired'
            case 'failed':
                return 'sidebar.weixinLoginFailed'
            default:
                return 'sidebar.weixinLoginIdle'
        }
    })

    const qrCodeSrc = computed(() => qrCodeImageDataUrl.value)

    async function startLogin(force = false) {
        const generation = openGeneration
        if (isStarting.value) return
        if (!force && status.value === 'pending' && sessionKey.value) {
            if (activePollSessionKey !== sessionKey.value) {
                startPolling(sessionKey.value, generation)
            }
            return
        }
        isStarting.value = true
        errorMessage.value = ''
        accountId.value = ''
        qrCodeUrl.value = ''
        qrCodeImageDataUrl.value = ''
        try {
            const payload = await postJson<WeixinLoginStartPayload>('/api/weixin-bridge/login/start')
            if (generation !== openGeneration && isModalOpen.value) {
                return
            }
            sessionKey.value = payload.sessionKey
            qrCodeUrl.value = payload.qrcodeUrl
            status.value = 'pending'
            void renderQrCodeDataUrl(payload.qrcodeUrl).then((dataUrl) => {
                if (generation !== openGeneration && isModalOpen.value) {
                    return
                }
                if (sessionKey.value !== payload.sessionKey) {
                    return
                }
                qrCodeImageDataUrl.value = dataUrl
            }).catch((renderError) => {
                console.error('Failed to render weixin login QR locally', renderError)
            })
            await pollLoginOnce(payload.sessionKey)
            if (generation !== openGeneration && isModalOpen.value) {
                return
            }
            if (status.value === 'pending') {
                startPolling(payload.sessionKey, generation)
            }
        } catch (error) {
            if (generation !== openGeneration && isModalOpen.value) {
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

    function openModal() {
        isModalOpen.value = true
        openGeneration += 1
        if (status.value === 'idle') {
            void startLogin(true)
            return
        }
        if (status.value === 'pending' && sessionKey.value && activePollSessionKey !== sessionKey.value) {
            startPolling(sessionKey.value, openGeneration)
            return
        }
        if (status.value === 'expired' || status.value === 'failed') {
            resetVisibleState()
            void startLogin(true)
        }
    }

    function closeModal() {
        isModalOpen.value = false
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
        isModalOpen,
        isStarting,
        sessionKey,
        qrCodeUrl,
        qrCodeImageDataUrl,
        status,
        errorMessage,
        accountId,
        statusTextKey,
        qrCodeSrc,
        openModal,
        closeModal,
        startLogin,
        pollLoginOnce,
    }
}
