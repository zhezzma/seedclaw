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

// ---------- 条目增删改与激活 ----------

test('fresh install has no gateways and no active gateway', async () => {
    const store = await createStore()
    assert.deepEqual(store.gateways, [])
    assert.equal(store.activeGatewayId, '')
    assert.equal(store.activeGateway, null)
})

test('addGateway appends without touching the effective apiBaseUrl/token', async () => {
    const store = await createStore()
    store.save({ apiBaseUrl: 'http://old', token: 'old-token' })

    store.addGateway({ type: 'remote', name: 'server-a', apiBaseUrl: 'http://a', token: 'ta' })

    assert.equal(store.gateways.length, 1)
    assert.equal(store.gateways[0].id.length > 0, true)
    assert.equal(store.gateways[0].type, 'remote')
    assert.equal(store.gateways[0].lastNewSessionAgentId, '')
    // 未激活的条目不得篡改生效值
    assert.equal(store.apiBaseUrl, 'http://old')
    assert.equal(store.token, 'old-token')
})

test('setActiveGateway switches activation and syncs effective values', async () => {
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    const b = store.addGateway({ type: 'remote', name: 'b', apiBaseUrl: 'http://b', token: 'tb' })

    store.setActiveGateway(a.id)
    assert.equal(store.activeGatewayId, a.id)
    assert.equal(store.apiBaseUrl, 'http://a')
    assert.equal(store.token, 'ta')

    store.setActiveGateway(b.id)
    assert.equal(store.apiBaseUrl, 'http://b')
    assert.equal(store.token, 'tb')

    // 持久化：重启后激活条目与生效值都在
    const reloaded = await createStore()
    assert.equal(reloaded.activeGatewayId, b.id)
    assert.equal(reloaded.apiBaseUrl, 'http://b')
    assert.equal(reloaded.token, 'tb')
})

test('updateGateway on the active entry syncs effective values; others do not', async () => {
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    const b = store.addGateway({ type: 'remote', name: 'b', apiBaseUrl: 'http://b', token: 'tb' })
    store.setActiveGateway(a.id)

    store.updateGateway(a.id, { apiBaseUrl: 'http://a2', token: 'ta2' })
    assert.equal(store.apiBaseUrl, 'http://a2')
    assert.equal(store.token, 'ta2')

    store.updateGateway(b.id, { apiBaseUrl: 'http://b2' })
    assert.equal(store.apiBaseUrl, 'http://a2', 'inactive entry edits must not leak into effective values')
    assert.equal(store.gateways.find((g) => g.id === b.id)!.apiBaseUrl, 'http://b2')
})

test('removeGateway falls back to the first remaining entry when removing the active one', async () => {
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    const b = store.addGateway({ type: 'remote', name: 'b', apiBaseUrl: 'http://b', token: 'tb' })
    store.setActiveGateway(b.id)

    store.removeGateway(b.id)
    assert.equal(store.gateways.length, 1)
    assert.equal(store.activeGatewayId, a.id, 'removing the active entry falls back to the first remaining')
    assert.equal(store.apiBaseUrl, 'http://a')
    assert.equal(store.token, 'ta')

    // 删非激活条目：激活与生效值不动
    const c = store.addGateway({ type: 'remote', name: 'c', apiBaseUrl: 'http://c', token: 'tc' })
    store.removeGateway(c.id)
    assert.equal(store.activeGatewayId, a.id)
    assert.equal(store.apiBaseUrl, 'http://a')
})

test('setLastNewSessionAgentId writes the active entry only (no cross-gateway clobber)', async () => {
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    const b = store.addGateway({ type: 'remote', name: 'b', apiBaseUrl: 'http://b', token: 'tb' })

    store.setActiveGateway(a.id)
    store.setLastNewSessionAgentId('agent-a')
    store.setActiveGateway(b.id)
    store.setLastNewSessionAgentId('agent-b')

    assert.equal(store.gateways.find((g) => g.id === a.id)!.lastNewSessionAgentId, 'agent-a')
    assert.equal(store.gateways.find((g) => g.id === b.id)!.lastNewSessionAgentId, 'agent-b')

    // 持久化后逐条目还原
    const reloaded = await createStore()
    assert.equal(reloaded.gateways.find((g) => g.id === a.id)!.lastNewSessionAgentId, 'agent-a')
    assert.equal(reloaded.gateways.find((g) => g.id === b.id)!.lastNewSessionAgentId, 'agent-b')
})

// ---------- local 条目保活 / 自洁 ----------

test('reconcileLocalGateway(true) ensures exactly one managed local entry', async () => {
    const store = await createStore()

    store.reconcileLocalGateway(true)
    const locals = store.gateways.filter((g) => g.type === 'local')
    assert.equal(locals.length, 1)
    assert.equal(locals[0].id, 'local')
    assert.equal(locals[0].name.length > 0, true)

    // 幂等：重复调用不复制
    store.reconcileLocalGateway(true)
    assert.equal(store.gateways.filter((g) => g.type === 'local').length, 1)
})

test('reconcileLocalGateway(true) keeps a managed local entry activated after reload', async () => {
    const store = await createStore()
    store.reconcileLocalGateway(true)
    store.setActiveGateway('local')

    const reloaded = await createStore()
    reloaded.reconcileLocalGateway(true)
    assert.equal(reloaded.activeGatewayId, 'local', 'managed local entry must survive reload')
    assert.equal(reloaded.activeGateway!.type, 'local')
})

test('reconcileLocalGateway(false) drops the local entry and falls back when active', async () => {
    const store = await createStore()
    store.reconcileLocalGateway(true)
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    store.setActiveGateway('local')

    store.reconcileLocalGateway(false)
    assert.equal(store.gateways.some((g) => g.type === 'local'), false)
    assert.equal(store.activeGatewayId, a.id)
    assert.equal(store.apiBaseUrl, 'http://a')
})

// ---------- 旧配置迁移 ----------

test('legacy remote config migrates into one activated remote entry', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://legacy-host:18789',
        token: 'legacy-token',
        gatewayMode: 'remote',
        remoteApiBaseUrl: 'http://legacy-host:18789',
        remoteToken: 'legacy-token',
        lastRemoteNewSessionAgentId: 'agent-remote',
        lastLocalNewSessionAgentId: 'agent-local',
    }))

    const store = await createStore()

    assert.equal(store.gateways.length, 2)
    const remote = store.gateways.find((g) => g.type === 'remote')!
    assert.equal(remote.apiBaseUrl, 'http://legacy-host:18789')
    assert.equal(remote.token, 'legacy-token')
    assert.equal(remote.lastNewSessionAgentId, 'agent-remote')
    assert.equal(store.activeGatewayId, remote.id)
    assert.equal(store.apiBaseUrl, 'http://legacy-host:18789')
    assert.equal(store.token, 'legacy-token')

    const local = store.gateways.find((g) => g.type === 'local')!
    assert.equal(local.id, 'local')
    assert.equal(local.lastNewSessionAgentId, 'agent-local')

    // 旧键全部剥离，不随 state 反复 round-trip
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    for (const deadKey of ['gatewayMode', 'remoteApiBaseUrl', 'remoteToken', 'lastLocalNewSessionAgentId', 'lastRemoteNewSessionAgentId']) {
        assert.ok(!(deadKey in saved), `legacy key ${deadKey} must be stripped`)
    }
})

test('legacy local config migrates into an activated local entry with no phantom remote', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://127.0.0.1:18789',
        token: 'managed-token',
        gatewayMode: 'local',
        lastLocalNewSessionAgentId: 'agent-local',
    }))

    const store = await createStore()

    // local-only 老用户：只有 local 条目（remote 空壳是幽灵行，见专项测试）
    assert.equal(store.gateways.length, 1)
    assert.equal(store.activeGatewayId, 'local')
    assert.equal(store.activeGateway!.type, 'local')
    assert.equal(store.apiBaseUrl, 'http://127.0.0.1:18789')
    assert.equal(store.token, 'managed-token')
    assert.equal(store.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, 'agent-local')
})

test('legacy single lastNewSessionAgentId migrates into the entry of the saved gatewayMode', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        gatewayMode: 'remote',
        lastNewSessionAgentId: 'agent-old',
    }))
    const store = await createStore()
    assert.equal(store.gateways.find((g) => g.type === 'remote')!.lastNewSessionAgentId, 'agent-old')
    assert.equal(store.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, '')
    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.ok(!('lastNewSessionAgentId' in saved), 'legacy single key must be stripped')

    // gatewayMode 缺省但有 apiBaseUrl：归一化为 remote 后归属 remote 条目
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://x',
        token: 't',
        lastNewSessionAgentId: 'agent-nogateway',
    }))
    const store2 = await createStore()
    assert.equal(store2.gateways.find((g) => g.type === 'remote')!.lastNewSessionAgentId, 'agent-nogateway')
})

test('legacy single lastNewSessionAgentId migrates into the local entry for local/unknown mode', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        gatewayMode: 'local',
        lastNewSessionAgentId: 'agent-old',
    }))
    const store = await createStore()
    assert.equal(store.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, 'agent-old')

    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        lastNewSessionAgentId: 'agent-older',
    }))
    const store2 = await createStore()
    assert.equal(store2.gateways.find((g) => g.id === 'local')!.lastNewSessionAgentId, 'agent-older')

    // 非字符串旧值：不迁移但必须剥离
    storage.clear()
    storage.setItem('openclaw_config', JSON.stringify({
        token: 't',
        lastNewSessionAgentId: null,
    }))
    await createStore()
    const savedBad = JSON.parse(storage.getItem('openclaw_config')!)
    assert.ok(!('lastNewSessionAgentId' in savedBad))
})

test('new-model config round-trips untouched (no phantom migration)', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://b',
        token: 'tb',
        activeGatewayId: 'g1',
        gateways: [{ id: 'g1', type: 'remote', name: 'b', apiBaseUrl: 'http://b', token: 'tb', lastNewSessionAgentId: 'agent-b' }],
    }))

    const store = await createStore()
    assert.equal(store.gateways.length, 1)
    assert.equal(store.activeGatewayId, 'g1')
    assert.equal(store.apiBaseUrl, 'http://b')

    const saved = JSON.parse(storage.getItem('openclaw_config')!)
    assert.equal(saved.gateways.length, 1, 'reload must not duplicate or rewrite entries')
})

test('legacy local-only config does not spawn a phantom remote entry', async () => {
    // 旧版 loadConfig 会把托管值无脑 backfill 进 remote*（local 用户也有这两个键，
    // 常等于顶层 apiBaseUrl）：照搬会造出指向本机的幽灵 remote 条目，token 随端口漂移失效
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://127.0.0.1:18789',
        token: 'managed-token',
        gatewayMode: 'local',
        remoteApiBaseUrl: 'http://127.0.0.1:18789',
        remoteToken: 'managed-token',
        lastLocalNewSessionAgentId: 'agent-local',
    }))

    const store = await createStore()

    assert.equal(store.gateways.length, 1)
    assert.equal(store.gateways[0].type, 'local')
    assert.equal(store.gateways[0].lastNewSessionAgentId, 'agent-local')
    assert.equal(store.activeGatewayId, 'local')
    // 顶层生效值保持旧托管值（local-server 就绪后覆写）
    assert.equal(store.apiBaseUrl, 'http://127.0.0.1:18789')
})

test('legacy local config with a genuinely distinct remote server keeps both entries', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        apiBaseUrl: 'http://127.0.0.1:18789',
        token: 'managed-token',
        gatewayMode: 'local',
        remoteApiBaseUrl: 'http://vps.example.com:18799',
        remoteToken: 'remote-token',
    }))

    const store = await createStore()

    assert.equal(store.gateways.length, 2)
    assert.equal(store.activeGatewayId, 'local')
    const remote = store.gateways.find((g) => g.type === 'remote')!
    assert.equal(remote.apiBaseUrl, 'http://vps.example.com:18799')
    assert.equal(remote.token, 'remote-token')
})

test('corrupted config keeps at most one local entry', async () => {
    storage.setItem('openclaw_config', JSON.stringify({
        activeGatewayId: 'l2',
        gateways: [
            { id: 'l1', type: 'local', name: 'local one', apiBaseUrl: '', token: '', lastNewSessionAgentId: '' },
            { id: 'l2', type: 'local', name: 'local two', apiBaseUrl: '', token: '', lastNewSessionAgentId: '' },
            { id: 'r1', type: 'remote', name: 'r', apiBaseUrl: 'http://r', token: 't', lastNewSessionAgentId: '' },
        ],
    }))

    const store = await createStore()

    assert.equal(store.gateways.filter((g) => g.type === 'local').length, 1, 'local entry must be unique')
    // 激活条目被剔除时回落第一个剩余条目
    assert.equal(store.activeGatewayId, 'l1')
})

test('reconcileLocalGateway(true) activates the local entry on a fresh bundled install', async () => {
    // 全新安装：gateways 空、activeGatewayId 空。不激活则 effectiveGatewayMode()
    // 落到 remote，SetupView 本地卡片不可达（原默认 gatewayMode='local' 的回归）
    const store = await createStore()

    store.reconcileLocalGateway(true)

    assert.equal(store.activeGatewayId, 'local')
    assert.equal(store.activeGateway!.type, 'local')
})

test('removing the active entry falling back to local clears stale remote effective values', async () => {
    // 回落 local 时顶层必须丢掉被删 remote 的 url/token：否则 UI 显示 local
    // 激活而 API 仍打向已删除服务器
    const store = await createStore()
    const local = store.addGateway({ id: 'local', type: 'local', name: '本地服务', apiBaseUrl: '', token: '' })
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })
    store.setActiveGateway(a.id)
    assert.equal(store.apiBaseUrl, 'http://a')

    store.removeGateway(a.id)

    assert.equal(store.activeGatewayId, local.id)
    assert.equal(store.apiBaseUrl, '')
    assert.equal(store.token, '')
})

test('updateGateway applies the same name fallback as addGateway', async () => {
    // 清空名称字段保存：remote 条目回落 host 标签，不留空白标题
    const store = await createStore()
    const a = store.addGateway({ type: 'remote', name: 'a', apiBaseUrl: 'http://a', token: 'ta' })

    store.updateGateway(a.id, { name: '   ' })

    assert.equal(store.gateways.find((g) => g.id === a.id)!.name, 'a')
})
