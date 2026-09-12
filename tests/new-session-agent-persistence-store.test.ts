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

test('setLastNewSessionAgent(id, "local") persists into the local-scoped field only', async () => {
    const store = await createStore()

    store.setLastNewSessionAgent('agent-a', 'local')

    assert.equal(store.lastLocalNewSessionAgentId, 'agent-a')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.equal(saved.lastLocalNewSessionAgentId, 'agent-a')
    assert.equal(saved.lastRemoteNewSessionAgentId, '')
})

test('setLastNewSessionAgent(id, "remote") persists into the remote-scoped field only', async () => {
    const store = await createStore()

    store.setLastNewSessionAgent('agent-b', 'remote')

    assert.equal(store.lastRemoteNewSessionAgentId, 'agent-b')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.equal(saved.lastRemoteNewSessionAgentId, 'agent-b')
    assert.equal(saved.lastLocalNewSessionAgentId, '')
})

test('local and remote choices do not overwrite each other across gateway switches', async () => {
    // 窜台回归测试：bundled 客户端在本地/远程两个服务器间切换时，
    // 两侧 agent id 命名空间互不相通，各自记住的选择必须独立保存
    const store = await createStore()

    store.setLastNewSessionAgent('agent-local-1', 'local')
    store.setLastNewSessionAgent('agent-remote-1', 'remote')
    store.setLastNewSessionAgent('agent-local-2', 'local')

    assert.equal(store.lastLocalNewSessionAgentId, 'agent-local-2')
    assert.equal(store.lastRemoteNewSessionAgentId, 'agent-remote-1')

    // 模拟应用重启：新 pinia 实例从 localStorage 重建 state，两侧各自还原
    const reloaded = await createStore()
    assert.equal(reloaded.lastLocalNewSessionAgentId, 'agent-local-2')
    assert.equal(reloaded.lastRemoteNewSessionAgentId, 'agent-remote-1')
})

test('legacy single lastNewSessionAgentId migrates into the remote field when gatewayMode is remote', async () => {
    // 旧版本是全局单值，不区分网关模式；升级时按保存时的 gatewayMode 归属
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        gatewayMode: 'remote',
        lastNewSessionAgentId: 'agent-old',
    }))

    const store = await createStore()

    assert.equal(store.lastRemoteNewSessionAgentId, 'agent-old')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.ok(!('lastNewSessionAgentId' in saved), 'legacy single key must be stripped after reload')

    // gatewayMode 缺省但有 apiBaseUrl：归一化为 remote 后同样归属 remote 字段
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        lastNewSessionAgentId: 'agent-nogateway',
    }))

    const store2 = await createStore()
    assert.equal(store2.lastRemoteNewSessionAgentId, 'agent-nogateway')
})

test('legacy single lastNewSessionAgentId migrates into the local field for local/unknown gatewayMode', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        gatewayMode: 'local',
        lastNewSessionAgentId: 'agent-old',
    }))

    const store = await createStore()
    assert.equal(store.lastLocalNewSessionAgentId, 'agent-old')

    // gatewayMode 与 apiBaseUrl 都缺省（更老的配置）归一化为 local 后同样归属 local 字段
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        lastNewSessionAgentId: 'agent-older',
    }))

    const store2 = await createStore()
    assert.equal(store2.lastLocalNewSessionAgentId, 'agent-older')

    // 非法类型（如 null）不迁移，但也必须剥离：否则死键随 ...parsed 流入 state 被反复回写
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        lastNewSessionAgentId: null,
    }))

    await createStore()
    const savedBad = JSON.parse(storage.getItem('openclaw_config')!)
    assert.ok(!('lastNewSessionAgentId' in savedBad), 'non-string legacy value must still be stripped')
})

test('lastNewSessionAgent fields default to empty for legacy configs', async () => {
    // 旧版本保存的 config 没有这些字段：loadConfig 用 defaults 补齐，不能是 undefined
    storage.setItem('openclaw_config', JSON.stringify({ apiBaseUrl: 'http://x', token: 't' }))

    const store = await createStore()

    assert.equal(store.lastLocalNewSessionAgentId, '')
    assert.equal(store.lastRemoteNewSessionAgentId, '')
})
