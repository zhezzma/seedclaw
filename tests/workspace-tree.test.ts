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
