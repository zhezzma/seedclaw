import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { parseTunnelHash, applyTunnelBootstrap, stripHashFromUrl } from '../src/utils/tunnel-hash.ts'
import { useUiSettingsStore } from '../src/stores/setting.ts'

const root = path.resolve(import.meta.dirname, '..')

test.beforeEach(() => {
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        },
    })
    setActivePinia(createPinia())
})

test('parseTunnelHash extracts token from #token=...', () => {
    assert.deepEqual(parseTunnelHash('#token=abc123'), { token: 'abc123' })
    assert.deepEqual(parseTunnelHash('#token=abc%20123'), { token: 'abc 123' })
    assert.deepEqual(parseTunnelHash('#foo=1&token=xyz'), { token: 'xyz' })
    // token 前后空白裁剪
    assert.deepEqual(parseTunnelHash('#token=%20%20pw%20'), { token: 'pw' })
})

test('parseTunnelHash returns null for missing/empty token or non-hash input', () => {
    assert.equal(parseTunnelHash(''), null)
    assert.equal(parseTunnelHash('token=abc'), null) // 缺 # 前缀
    assert.equal(parseTunnelHash('#'), null)
    assert.equal(parseTunnelHash('#other=1'), null)
    assert.equal(parseTunnelHash('#token='), null)
    assert.equal(parseTunnelHash('#token=%20%20'), null)
})

test('applyTunnelBootstrap writes same-origin remote config into settings', () => {
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = ''
    settings.token = ''
    settings.setupDone = false

    applyTunnelBootstrap(settings, 'http://159.138.99.139:18799', { token: 'sekret' })

    assert.equal(settings.apiBaseUrl, 'http://159.138.99.139:18799')
    assert.equal(settings.token, 'sekret')
    assert.equal(settings.gatewayMode, 'remote')
    assert.equal(settings.remoteApiBaseUrl, 'http://159.138.99.139:18799')
    assert.equal(settings.remoteToken, 'sekret')
    assert.equal(settings.setupDone, true)
    // api-client.getBaseUrl() 依赖 apiBaseUrl 非空，此处必须已可直连
    assert.ok(settings.apiBaseUrl.trim() !== '')
    // 落盘（localStorage）
    assert.match(globalThis.localStorage.getItem('openclaw_config') ?? '', /"token":"sekret"/)
})

test('stripHashFromUrl removes hash while keeping path and search', () => {
    assert.equal(stripHashFromUrl('http://a.b:1/#token=x'), 'http://a.b:1/')
    assert.equal(stripHashFromUrl('http://a.b:1/chat/1?x=2#token=y&z=1'), 'http://a.b:1/chat/1?x=2')
    assert.equal(stripHashFromUrl('http://a.b:1/'), 'http://a.b:1/')
})

test('main.ts wires the hash bootstrap before router and mount (source contract)', () => {
    const source = readFileSync(path.join(root, 'src/main.ts'), 'utf8')
    assert.match(source, /parseTunnelHash\(window\.location\.hash\)/)
    assert.match(source, /applyTunnelBootstrap\(useUiSettingsStore\(\), window\.location\.origin/)
    assert.match(source, /history\.replaceState\(null, '', stripHashFromUrl\(window\.location\.href\)\)/)
    // Tauri 客户端（桌面/Android）不执行引导：origin 是伪协议，会写坏 apiBaseUrl
    assert.match(source, /!isTauri\s*\?\s*parseTunnelHash/)
    assert.match(source, /import \{ isTauri \} from '.\/composables\/notify-server-connection'/)
    // 引导必须先于 router 装载与 mount（顺序契约：indexOf 比较）
    const bootstrapPos = source.indexOf('applyTunnelBootstrap(useUiSettingsStore()')
    const routerPos = source.indexOf("app.use(router)")
    const mountPos = source.indexOf("app.mount('#app')")
    assert.ok(bootstrapPos > 0)
    assert.ok(routerPos > bootstrapPos, 'hash 引导必须发生在 app.use(router) 之前')
    assert.ok(mountPos > bootstrapPos, 'hash 引导必须发生在 app.mount 之前')
})
