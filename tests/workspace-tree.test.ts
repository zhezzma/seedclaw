import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

const originalFetch = globalThis.fetch
const originalLocalStorage = globalThis.localStorage

function setupStorage() {
    const storage = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => storage.get(k) ?? null,
            setItem: (k: string, v: string) => { storage.set(k, v) },
            removeItem: (k: string) => { storage.delete(k) },
            clear: () => storage.clear(),
            key: () => null,
            length: 0,
        },
    })
}

function mockFetch(payloadFor: (url: string) => unknown) {
    globalThis.fetch = (async (url: string) => {
        return new Response(JSON.stringify({ ok: true, payload: payloadFor(url) }), {
            status: 200, headers: { 'content-type': 'application/json' },
        })
    }) as any
}

test.beforeEach(() => {
    setupStorage()
    setActivePinia(createPinia())
})

test.afterEach(() => {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage })
})

test('loadPath: 初次加载根目录', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'

    mockFetch(() => ({ root: '/ws', path: '', entries: [
        { name: 'docs', path: 'docs', type: 'dir', size: 0, mtimeMs: 0 },
        { name: 'README.md', path: 'README.md', type: 'file', size: 12, mtimeMs: 0 },
    ]}))
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    await tree.loadPath('coder', '')
    const cached = tree.entriesAt('')
    assert.equal(cached?.entries.length, 2)
})

test('loadPath: 复用缓存不重复发请求', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'

    let calls = 0
    mockFetch(() => {
        calls++
        return { root: '/ws', path: 'docs', entries: [] }
    })
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    await tree.loadPath('coder', 'docs')
    await tree.loadPath('coder', 'docs')
    assert.equal(calls, 1)
})

test('refresh: 清空缓存', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'

    let calls = 0
    mockFetch(() => { calls++; return { root: '/ws', path: '', entries: [] } })
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    await tree.loadPath('coder', '')
    tree.refresh()
    await tree.loadPath('coder', '')
    assert.equal(calls, 2)
})

test('expanded: toggleExpand 翻转状态', async () => {
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    assert.equal(tree.isExpanded('docs'), false)
    tree.toggleExpand('docs')
    assert.equal(tree.isExpanded('docs'), true)
    tree.toggleExpand('docs')
    assert.equal(tree.isExpanded('docs'), false)
})

test('refresh: 保留 expanded，仅清 cache（调用方负责重拉）', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'

    mockFetch(() => ({ root: '/ws', path: 'docs', entries: [] }))
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    await tree.loadPath('coder', 'docs')
    tree.toggleExpand('docs')
    assert.equal(tree.isExpanded('docs'), true)

    tree.refresh()
    // cache 被清
    assert.equal(tree.entriesAt('docs'), null)
    // expanded 保留
    assert.equal(tree.isExpanded('docs'), true)
    assert.deepEqual(tree.expandedPaths(), ['docs'])
})

// ─────────────────────────────────────────────────────────────────────────────
// loadPath 过期防护回归（audit：跨 agent 响应污染树缓存）
// 契约：epoch（agent 切换）+ 占位身份（invalidate/并发）+ 归属（迟到续体）三重防护
// ─────────────────────────────────────────────────────────────────────────────

test('loadPath: agent 切换（reset→epoch++）后旧响应不写入新归属缓存', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'
    let resolveOld: ((v: Response) => void) | null = null
    globalThis.fetch = (async () => {
        return new Promise(resolve => { resolveOld = resolve })
    }) as any
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    tree.ensureAgent('coder')
    const inFlight = tree.loadPath('coder', '')
    // 模拟 agent 切换：reset 清缓存并推进 epoch
    tree.reset()
    resolveOld!(new Response(JSON.stringify({
        ok: true,
        payload: { root: '/ws', path: '', entries: [{ name: 'stale.txt', path: 'stale.txt', type: 'file', size: 0, mtimeMs: 0 }] },
    }), { status: 200 }))
    await inFlight
    assert.equal(tree.entriesAt(''), null, '旧 agent 的迟到响应不得写入已归属新 agent 的缓存')
})

test('loadPath: invalidate 后旧响应不复活（占位身份校验）', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'
    let call = 0
    let resolveFirst: ((v: Response) => void) | null = null
    globalThis.fetch = (async () => {
        call++
        if (call === 1) return new Promise(resolve => { resolveFirst = resolve })
        return new Response(JSON.stringify({
            ok: true,
            payload: { root: '/ws', path: 'docs', entries: [{ name: 'new.md', path: 'docs/new.md', type: 'file', size: 0, mtimeMs: 0 }] },
        }), { status: 200 })
    }) as any
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    tree.ensureAgent('coder')   // 测试隔离：前序测试可能把归属留在别的 agent
    const slow = tree.loadPath('coder', 'docs')   // 慢请求（占位 1）
    tree.invalidate('docs')                        // 模拟 mutation 失效
    await tree.loadPath('coder', 'docs')           // 快请求（占位 2）→ 写入新数据
    resolveFirst!(new Response(JSON.stringify({
        ok: true,
        payload: { root: '/ws', path: 'docs', entries: [{ name: 'old.txt', path: 'docs/old.txt', type: 'file', size: 0, mtimeMs: 0 }] },
    }), { status: 200 }))
    await slow
    assert.equal(tree.entriesAt('docs')?.entries[0]?.name, 'new.md', '先到的旧响应不得覆盖后到的新数据')
})

test('loadPath: store 已归属其他 agent 时迟到续体不发起请求不写缓存', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'
    let calls = 0
    mockFetch(() => { calls++; return { root: '/ws', path: 'docs', entries: [] } })
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    tree.ensureAgent('coder')
    tree.ensureAgent('agentB')   // 归属已切到 agentB（真实路径）
    await tree.loadPath('coder', 'docs')   // 旧 agent 的迟到续体
    assert.equal(calls, 0, '归属不匹配时不应发起请求')
    assert.equal(tree.entriesAt('docs'), null)
})

test('invalidatePrefix: 级联清前缀子树的缓存与展开态，不碰其他路径', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'
    mockFetch((url) => ({ root: '/ws', path: url.includes('sub') ? 'a/sub' : url.includes('a') ? 'a' : 'b', entries: [] }))
    const { useWorkspaceTree } = await import('../src/composables/useWorkspaceTree.ts')
    const tree = useWorkspaceTree()
    tree.reset()
    tree.ensureAgent('coder')   // 测试隔离：owner-guard 测试会把归属留在 agentB
    await tree.loadPath('coder', 'a')
    await tree.loadPath('coder', 'a/sub')
    await tree.loadPath('coder', 'b')
    tree.toggleExpand('a')
    tree.toggleExpand('a/sub')
    tree.toggleExpand('b')
    tree.invalidatePrefix('a')
    assert.equal(tree.entriesAt('a'), null)
    assert.equal(tree.entriesAt('a/sub'), null)
    assert.notEqual(tree.entriesAt('b'), null)
    assert.equal(tree.isExpanded('a'), false, '已删除路径的展开态应一并清除')
    assert.equal(tree.isExpanded('a/sub'), false)
    assert.equal(tree.isExpanded('b'), true)
})

test('useAgentFiles: agent 切换后旧响应同样被 epoch 防护丢弃', async () => {
    const { useUiSettingsStore } = await import('../src/stores/setting.ts')
    const settings = useUiSettingsStore()
    settings.apiBaseUrl = 'http://localhost'
    settings.token = 't'
    let resolveOld: ((v: Response) => void) | null = null
    globalThis.fetch = (async () => {
        return new Promise(resolve => { resolveOld = resolve })
    }) as any
    const { useAgentFiles } = await import('../src/composables/useAgentFiles.ts')
    const files = useAgentFiles()
    files.reset()
    const inFlight = files.loadPath('coder', '')
    files.reset()
    resolveOld!(new Response(JSON.stringify({
        ok: true,
        payload: { root: '/agent', path: '', entries: [{ name: 'stale.md', path: 'stale.md', type: 'file', size: 0, mtimeMs: 0 }] },
    }), { status: 200 }))
    await inFlight
    assert.equal(files.entriesAt(''), null)
})
