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

test('setLastNewSessionAgentId persists into the active gateway entry only', async () => {
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    store.setActiveGateway(a.id)

    store.setLastNewSessionAgentId('agent-a')

    assert.equal(store.gateways.find((g) => g.id === a.id)!.lastNewSessionAgentId, 'agent-a')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    const savedA = saved.gateways.find((g: any) => g.id === a.id)
    assert.equal(savedA.lastNewSessionAgentId, 'agent-a')
})

test('per-gateway agent choices do not overwrite each other across gateway switches', async () => {
    // 窜台回归测试：客户端在多台服务器间切换时，各服务器 agent id 命名空间
    // 互不相通，各自记住的选择必须独立保存
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    const b = store.addGateway({ type: 'remote', name: 'b', apiBaseUrl: 'http://b', token: 'tb' })

    store.setActiveGateway(a.id)
    store.setLastNewSessionAgentId('agent-a-1')
    store.setActiveGateway(b.id)
    store.setLastNewSessionAgentId('agent-b-1')
    store.setActiveGateway(a.id)
    store.setLastNewSessionAgentId('agent-a-2')

    assert.equal(store.gateways.find((g) => g.id === a.id)!.lastNewSessionAgentId, 'agent-a-2')
    assert.equal(store.gateways.find((g) => g.id === b.id)!.lastNewSessionAgentId, 'agent-b-1')

    // 模拟应用重启：新 pinia 实例从 localStorage 重建 state，两侧各自还原
    const reloaded = await createStore()
    assert.equal(reloaded.gateways.find((g) => g.id === a.id)!.lastNewSessionAgentId, 'agent-a-2')
    assert.equal(reloaded.gateways.find((g) => g.id === b.id)!.lastNewSessionAgentId, 'agent-b-1')
})

test('legacy single lastNewSessionAgentId migrates into the entry of the saved gatewayMode', async () => {
    // 旧版本是全局单值，不区分网关；升级时按保存时的 gatewayMode 归属条目
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        gatewayMode: 'remote',
        lastNewSessionAgentId: 'agent-old',
    }))

    const store = await createStore()

    const remote = store.gateways.find((g) => g.type === 'remote')!
    assert.equal(remote.lastNewSessionAgentId, 'agent-old')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.ok(!('lastNewSessionAgentId' in saved), 'legacy single key must be stripped after reload')

    // gatewayMode 缺省但有 apiBaseUrl：归一化为 remote 后同样归属 remote 条目
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        lastNewSessionAgentId: 'agent-nogateway',
    }))

    const store2 = await createStore()
    assert.equal(store2.gateways.find((g) => g.type === 'remote')!.lastNewSessionAgentId, 'agent-nogateway')
})

test('legacy single lastNewSessionAgentId migrates into the local entry for local/unknown gatewayMode', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        gatewayMode: 'local',
        lastNewSessionAgentId: 'agent-old',
    }))

    const store = await createStore()
    assert.equal(store.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, 'agent-old')

    // gatewayMode 与 apiBaseUrl 都缺省（更老的配置）归一化为 local 后同样归属 local 条目
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        lastNewSessionAgentId: 'agent-older',
    }))

    const store2 = await createStore()
    assert.equal(store2.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, 'agent-older')

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

test('saved per-mode agent ids win over a stale legacy key; non-string values are normalized', async () => {
    // 降级→再升级场景：已拆分的条目优先于陈旧旧值（clobber guard），旧值只填空缺侧
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        gatewayMode: 'remote',
        lastNewSessionAgentId: 'stale-legacy',
        lastRemoteNewSessionAgentId: 'agent-current',
    }))

    const store = await createStore()
    assert.equal(store.gateways.find((g) => g.type === 'remote')!.lastNewSessionAgentId, 'agent-current')
    // 旧值属 remote 命名空间：对应条目已有新值时直接丢弃，
    // 不填入 local 条目（否则又是窜台）
    assert.equal(store.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, '')

    // 新字段自身的非字符串值（手改/损坏配置）归一化为空串，不永久 round-trip
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        gatewayMode: 'remote',
        lastLocalNewSessionAgentId: 42,
    }))

    const store2 = await createStore()
    assert.equal(store2.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, '')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.equal(saved.gateways.find((g: any) => g.id === 'local').lastNewSessionAgentId, '', 'non-string value must be normalized')
})

test('gateway entries default to empty agent memory for legacy configs', async () => {
    // 旧版本保存的 config 没有这些字段：loadConfig 用默认值补齐，不能是 undefined
    storage.setItem('openclaw_config', JSON.stringify({ apiBaseUrl: 'http://x', token: 't' }))

    const store = await createStore()

    for (const g of store.gateways) {
        assert.equal(typeof g.lastNewSessionAgentId, 'string')
        assert.equal(g.lastNewSessionAgentId, '')
    }
})
