import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

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

test.beforeEach(() => {
    setupStorage()
    setActivePinia(createPinia())
})

test.afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage })
})

test('useWorkspacePanel: 默认关闭、宽度 360、tab=files', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const panel = useWorkspacePanel()
    assert.equal(panel.isOpen.value, false)
    assert.equal(panel.width.value, 360)
    assert.equal(panel.activeTab.value, 'files')
})

test('useWorkspacePanel: toggle 切换并持久化', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const panel = useWorkspacePanel()
    panel.toggle()
    assert.equal(panel.isOpen.value, true)
    const raw = JSON.parse(globalThis.localStorage.getItem('openclaw_config') || '{}')
    assert.equal(raw.workspacePanel?.open, true)
})

test('useWorkspacePanel: setWidth 限定到 [240, 1000]', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const panel = useWorkspacePanel()
    panel.setWidth(100)
    assert.equal(panel.width.value, 240)
    panel.setWidth(1200)
    assert.equal(panel.width.value, 1000)
    panel.setWidth(420)
    assert.equal(panel.width.value, 420)
})

test('useWorkspacePanel: 每 agent 独立记忆 selectedRepo', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const panel = useWorkspacePanel()
    panel.setRepoForAgent('coder', 'seedagent')
    panel.setRepoForAgent('writer', 'docs')
    assert.equal(panel.getRepoForAgent('coder'), 'seedagent')
    assert.equal(panel.getRepoForAgent('writer'), 'docs')
    assert.equal(panel.getRepoForAgent('unknown'), null)
})

test('useWorkspacePanel: setTab 切换并持久化', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const panel = useWorkspacePanel()
    panel.setTab('git')
    assert.equal(panel.activeTab.value, 'git')
    const raw = JSON.parse(globalThis.localStorage.getItem('openclaw_config') || '{}')
    assert.equal(raw.workspacePanel?.tab, 'git')
})

test('useWorkspacePanel: setRepoForAgent 持久化到 localStorage', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const panel = useWorkspacePanel()
    panel.setRepoForAgent('coder', 'seedagent')
    const raw = JSON.parse(globalThis.localStorage.getItem('openclaw_config') || '{}')
    assert.equal(raw.workspacePanel?.repoByAgent?.coder, 'seedagent')
})

test('useWorkspacePanel: factory 模式下两次调用返回不同实例但同步响应', async () => {
    const { useWorkspacePanel } = await import('../src/composables/useWorkspacePanel.ts')
    const a = useWorkspacePanel()
    const b = useWorkspacePanel()
    // 不同实例
    assert.notEqual(a, b)
    // 但同一 store 响应同步
    assert.equal(a.isOpen.value, false)
    assert.equal(b.isOpen.value, false)
    a.toggle()
    assert.equal(a.isOpen.value, true)
    assert.equal(b.isOpen.value, true)
})
