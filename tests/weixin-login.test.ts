import test from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useWeixinLogin, resetWeixinLoginForTest } from '../src/composables/useWeixinLogin.ts'
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
    resetWeixinLoginForTest()
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
    resetWeixinLoginForTest()
})

test('starts login, stores QR code, and transitions to connected after polling local wait state', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/api/channels/wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-1',
                qrcode: 'qr-1',
                qrcodeUrl: 'https://qr.example/1',
            })
        }
        if (url.endsWith('/api/channels/wechat/login/wait')) {
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

    const weixinLogin = useWeixinLogin()
    await weixinLogin.startLogin()
    await nextTick()

    assert.equal(weixinLogin.sessionKey.value, 'session-1')
    assert.equal(weixinLogin.qrCodeUrl.value, 'https://qr.example/1')
    assert.equal(weixinLogin.status.value, 'connected')
    assert.equal(weixinLogin.accountId.value, 'acc-1')
    assert.deepEqual(calls, [
        'http://localhost:3000/api/channels/wechat/login/start',
        'http://localhost:3000/api/channels/wechat/login/wait',
    ])
})

test('openModal auto-starts login from idle state and keeps modal open on success until manually closed', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/channels/wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-2',
                qrcode: 'qr-2',
                qrcodeUrl: 'https://qr.example/2',
            })
        }
        if (url.endsWith('/api/channels/wechat/login/wait')) {
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

    const weixinLogin = useWeixinLogin()
    weixinLogin.openModal()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(weixinLogin.isModalOpen.value, true)
    assert.equal(weixinLogin.status.value, 'connected')
    assert.equal(weixinLogin.statusTextKey.value, 'sidebar.weixinLoginSuccess')

    weixinLogin.closeModal()
    assert.equal(weixinLogin.isModalOpen.value, false)
    assert.equal(weixinLogin.status.value, 'idle')
})

test('maps expired polling payloads into expired status and error message', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/channels/wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-3',
                qrcode: 'qr-3',
                qrcodeUrl: 'https://qr.example/3',
            })
        }
        if (url.endsWith('/api/channels/wechat/login/wait')) {
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

    const weixinLogin = useWeixinLogin()
    await weixinLogin.startLogin()

    assert.equal(weixinLogin.status.value, 'expired')
    assert.equal(weixinLogin.errorMessage.value, 'QR code expired')
    assert.equal(weixinLogin.statusTextKey.value, 'sidebar.weixinLoginExpired')
})

test('closeModal resets visible state so reopening can start a fresh login session', async () => {
    let startCount = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/channels/wechat/login/start')) {
            startCount += 1
            return jsonResponse({
                sessionKey: `session-reopen-${startCount}`,
                qrcode: `qr-reopen-${startCount}`,
                qrcodeUrl: `https://qr.example/reopen-${startCount}`,
            })
        }
        if (url.endsWith('/api/channels/wechat/login/wait')) {
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

    const weixinLogin = useWeixinLogin()
    await weixinLogin.startLogin()
    assert.equal(weixinLogin.status.value, 'expired')
    assert.equal(weixinLogin.qrCodeUrl.value, 'https://qr.example/reopen-1')

    weixinLogin.closeModal()
    assert.equal(weixinLogin.status.value, 'idle')
    assert.equal(weixinLogin.qrCodeUrl.value, '')
    assert.equal(weixinLogin.sessionKey.value, '')

    weixinLogin.openModal()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(startCount, 2)
    assert.equal(weixinLogin.sessionKey.value, 'session-reopen-2')
    assert.equal(weixinLogin.qrCodeUrl.value, 'https://qr.example/reopen-2')
})

test('renders a local qr image whose encoded value is qrcodeUrl instead of loading qrcodeUrl directly', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/channels/wechat/login/start')) {
            return jsonResponse({
                sessionKey: 'session-qr-url',
                qrcode: 'qr-raw-token',
                qrcodeUrl: 'https://liteapp.weixin.qq.com/q/demo?qrcode=abc&bot_type=3',
            })
        }
        if (url.endsWith('/api/channels/wechat/login/wait')) {
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

    const weixinLogin = useWeixinLogin()
    await weixinLogin.startLogin()
    for (let i = 0; i < 20 && !weixinLogin.qrCodeSrc.value; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25))
    }

    assert.equal(weixinLogin.status.value, 'pending')
    assert.equal(weixinLogin.qrCodeUrl.value, 'https://liteapp.weixin.qq.com/q/demo?qrcode=abc&bot_type=3')
    assert.match(weixinLogin.qrCodeSrc.value, /^data:image\/png;base64,/)
    assert.notEqual(weixinLogin.qrCodeSrc.value, weixinLogin.qrCodeUrl.value)
})

