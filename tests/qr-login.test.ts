import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useQrLogin, resetQrLoginForTest } from '../src/composables/useQrLogin.ts'
import { useUiSettingsStore } from '../src/stores/setting.ts'

const originalFetch = globalThis.fetch
const originalLocalStorage = globalThis.localStorage

function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify({ ok: true, payload }), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

test.beforeEach(() => {
    resetQrLoginForTest()
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => {
                storage.set(key, value)
            },
            removeItem: (key: string) => {
                storage.delete(key)
            },
        },
    })
    setActivePinia(createPinia())
    useUiSettingsStore().save({ apiBaseUrl: 'http://localhost:3000', token: '' })
})

test.afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage,
    })
    resetQrLoginForTest()
})

test('starts login against the extension endpoint, stores QR code, and transitions to connected after polling', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-1',
                qrcode: 'qr-1',
                qrcodeUrl: 'https://qr.example/1',
            })
        }
        if (url.endsWith('/api/extensions/channel-wechat/login/wait')) {
            return jsonResponse({
                status: 'connected',
                connected: true,
                authExpired: false,
                sessionKey: 'session-1',
                accountId: 'acc-1',
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    await qrLogin.startLogin()
    await nextTick()

    assert.equal(qrLogin.sessionKey.value, 'session-1')
    assert.equal(qrLogin.qrCodeUrl.value, 'https://qr.example/1')
    assert.equal(qrLogin.status.value, 'connected')
    assert.equal(qrLogin.accountId.value, 'acc-1')
    assert.deepEqual(calls, [
        'http://localhost:3000/api/extensions/channel-wechat/login/start',
        'http://localhost:3000/api/extensions/channel-wechat/login/wait',
    ])
})

test('activate auto-starts login from idle state and keeps panel state until deactivate', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-2',
                qrcode: 'qr-2',
                qrcodeUrl: 'https://qr.example/2',
            })
        }
        if (url.endsWith('/api/extensions/channel-wechat/login/wait')) {
            return jsonResponse({
                status: 'connected',
                connected: true,
                authExpired: false,
                sessionKey: 'session-2',
                accountId: 'acc-2',
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    qrLogin.activate()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(qrLogin.isPanelActive.value, true)
    assert.equal(qrLogin.status.value, 'connected')
    assert.equal(qrLogin.statusTextKey.value, 'extensions.qrLogin.success')

    qrLogin.deactivate()
    assert.equal(qrLogin.isPanelActive.value, false)
    assert.equal(qrLogin.status.value, 'idle')
})

test('maps expired polling payloads into expired status and error message', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-3',
                qrcode: 'qr-3',
                qrcodeUrl: 'https://qr.example/3',
            })
        }
        if (url.endsWith('/api/extensions/channel-wechat/login/wait')) {
            return jsonResponse({
                status: 'expired',
                connected: false,
                authExpired: true,
                sessionKey: 'session-3',
                error: 'QR code expired',
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    await qrLogin.startLogin()

    assert.equal(qrLogin.status.value, 'expired')
    assert.equal(qrLogin.errorMessage.value, 'QR code expired')
    assert.equal(qrLogin.statusTextKey.value, 'extensions.qrLogin.expired')
})

test('deactivate resets visible state so reopening can start a fresh login session', async () => {
    let startCount = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            startCount += 1
            return jsonResponse({
                sessionKey: `session-reopen-${startCount}`,
                qrcode: `qr-reopen-${startCount}`,
                qrcodeUrl: `https://qr.example/reopen-${startCount}`,
            })
        }
        if (url.endsWith('/api/extensions/channel-wechat/login/wait')) {
            return jsonResponse({
                status: 'expired',
                connected: false,
                authExpired: true,
                sessionKey: `session-reopen-${startCount}`,
                error: 'QR code expired',
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    await qrLogin.startLogin()
    assert.equal(qrLogin.status.value, 'expired')
    assert.equal(qrLogin.qrCodeUrl.value, 'https://qr.example/reopen-1')

    qrLogin.deactivate()
    assert.equal(qrLogin.status.value, 'idle')
    assert.equal(qrLogin.qrCodeUrl.value, '')
    assert.equal(qrLogin.sessionKey.value, '')

    qrLogin.activate()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(startCount, 2)
    assert.equal(qrLogin.sessionKey.value, 'session-reopen-2')
    assert.equal(qrLogin.qrCodeUrl.value, 'https://qr.example/reopen-2')
})

test('scheduled polling loop retries after pending wait and stops on connected', async () => {
    // 首次 wait 返回 pending → 进入 1500ms 轮询循环 → 第二次 wait 返回 connected → 停止
    let waitCount = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-loop',
                qrcode: 'qr-loop',
                qrcodeUrl: 'https://qr.example/loop',
            })
        }
        if (url.endsWith('/api/extensions/channel-wechat/login/wait')) {
            waitCount += 1
            if (waitCount === 1) {
                return jsonResponse({
                    status: 'pending',
                    connected: false,
                    authExpired: false,
                    sessionKey: 'session-loop',
                    startedAt: 1,
                    qrcodeUrl: 'https://qr.example/loop',
                })
            }
            return jsonResponse({
                status: 'connected',
                connected: true,
                authExpired: false,
                sessionKey: 'session-loop',
                accountId: 'acc-loop',
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    qrLogin.activate()
    // 等待：首次 wait（pending）+ 一次 1500ms 定时轮询（connected）
    for (let i = 0; i < 60 && qrLogin.status.value !== 'connected'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
    }

    assert.equal(qrLogin.status.value, 'connected')
    assert.equal(qrLogin.accountId.value, 'acc-loop')
    assert.equal(waitCount, 2)
})

test('late start responses after deactivate are dropped so state stays idle', async () => {
    // 控制 start 请求的 resolve 时机：面板关闭后才返回
    let resolveStart: ((value: Response) => void) | null = null
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            return new Promise<Response>((resolve) => {
                resolveStart = resolve
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    qrLogin.activate()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.ok(resolveStart, 'start request should be pending')

    qrLogin.deactivate()
    resolveStart!(jsonResponse({
        sessionKey: 'late-session',
        qrcode: 'late-qr',
        qrcodeUrl: 'https://qr.example/late',
    }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // 迟到写入被丢弃：状态保持 idle，不残留旧扩展的 sessionKey
    assert.equal(qrLogin.status.value, 'idle')
    assert.equal(qrLogin.sessionKey.value, '')
    assert.equal(qrLogin.qrCodeUrl.value, '')
})

test('renders a local qr image whose encoded value is qrcodeUrl instead of loading qrcodeUrl directly', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/extensions/channel-wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-qr-url',
                qrcode: 'qr-raw-token',
                qrcodeUrl: 'https://liteapp.weixin.qq.com/q/demo?qrcode=abc&bot_type=3',
            })
        }
        if (url.endsWith('/api/extensions/channel-wechat/login/wait')) {
            return jsonResponse({
                status: 'pending',
                connected: false,
                authExpired: false,
                sessionKey: 'session-qr-url',
                startedAt: 1,
                qrcodeUrl: 'https://liteapp.weixin.qq.com/q/demo?qrcode=abc&bot_type=3',
            })
        }
        throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const qrLogin = useQrLogin('channel-wechat')
    await qrLogin.startLogin()
    for (let i = 0; i < 20 && !qrLogin.qrCodeSrc.value; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25))
    }

    assert.equal(qrLogin.status.value, 'pending')
    assert.ok(qrLogin.qrCodeSrc.value.startsWith('data:image/png;base64,'))
})
