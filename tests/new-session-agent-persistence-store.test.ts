import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

class MemoryStorage implements Storage {
    private data = new Map<string, string>()

    get length() {
        return this.data.size
    }

    clear(): void {
        this.data.clear()
    }

    getItem(key: string): string | null {
        return this.data.has(key) ? this.data.get(key)! : null
    }

    key(index: number): string | null {
        return Array.from(this.data.keys())[index] ?? null
    }

    removeItem(key: string): void {
        this.data.delete(key)
    }

    setItem(key: string, value: string): void {
        this.data.set(key, value)
    }
}

const originalLocalStorage = globalThis.localStorage
const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
})

const createStore = async () => {
    setActivePinia(createPinia())
    const mod = await import('../src/stores/setting.ts')
    return mod.useUiSettingsStore()
}

test.after(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
    })
})

test.beforeEach(() => {
    storage.clear()
})

test('setLastNewSessionAgent persists the welcome agent choice into localStorage', async () => {
    const store = await createStore()

    store.setLastNewSessionAgent('agent-b')

    assert.equal(store.lastNewSessionAgentId, 'agent-b')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.equal(saved.lastNewSessionAgentId, 'agent-b')
})

test('fresh store instance reloads the remembered agent across restarts', async () => {
    const store = await createStore()
    store.setLastNewSessionAgent('agent-b')

    // 模拟应用重启：新 pinia 实例从 localStorage 重建 state
    const reloaded = await createStore()

    assert.equal(reloaded.lastNewSessionAgentId, 'agent-b')
})

test('lastNewSessionAgentId defaults to empty for legacy configs', async () => {
    // 旧版本保存的 config 没有该字段：loadConfig 用 defaults 补齐，不能是 undefined
    storage.setItem('openclaw_config', JSON.stringify({ apiBaseUrl: 'http://x', token: 't' }))

    const store = await createStore()

    assert.equal(store.lastNewSessionAgentId, '')
})

test('loadConfig strips the legacy lastActiveSessionKey key from saved configs', async () => {
    // 行为级验证（而非源码正则）：seed 一份带死键的旧配置，重载后
    // localStorage 里的序列化结果不应再含 lastActiveSessionKey，其余键原样保留
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        lastActiveSessionKey: 'sess-old',
    }))

    await createStore()

    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.ok(!('lastActiveSessionKey' in saved), 'legacy key must be stripped after reload')
    assert.equal(saved.apiBaseUrl, 'http://x')
    assert.equal(saved.token, 't')
})
