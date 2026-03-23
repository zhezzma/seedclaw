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
    const mod = await import('../src/stores/inputHistory.ts')
    return mod.useInputHistoryStore()
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

test('persists per-session input history into localStorage', async () => {
    const store = await createStore()

    store.pushHistory('session-a', '  first command  ')
    store.pushHistory('session-a', 'second command')

    assert.deepEqual(store.getHistory('session-a'), ['first command', 'second command'])
    assert.equal(
        storage.getItem('seedclaw_input_history'),
        JSON.stringify({ 'session-a': ['first command', 'second command'] }),
    )
})

test('reloads persisted history from localStorage in a fresh store instance', async () => {
    storage.setItem('seedclaw_input_history', JSON.stringify({
        'session-a': ['cmd-1', 'cmd-2'],
        'session-b': ['other'],
    }))

    const store = await createStore()

    assert.deepEqual(store.getHistory('session-a'), ['cmd-1', 'cmd-2'])
    assert.deepEqual(store.getHistory('session-b'), ['other'])
})

test('removes stored history when a session is deleted locally', async () => {
    const store = await createStore()

    store.pushHistory('session-a', 'cmd-1')
    store.pushHistory('session-b', 'cmd-2')
    store.removeSessionHistory('session-a')

    assert.deepEqual(store.getHistory('session-a'), [])
    assert.deepEqual(store.getHistory('session-b'), ['cmd-2'])
    assert.equal(
        storage.getItem('seedclaw_input_history'),
        JSON.stringify({ 'session-b': ['cmd-2'] }),
    )
})

test('removes stored history when multiple sessions are deleted locally', async () => {
    const store = await createStore()

    store.pushHistory('session-a', 'cmd-1')
    store.pushHistory('session-b', 'cmd-2')
    store.pushHistory('session-c', 'cmd-3')
    store.removeManySessionHistories(['session-a', 'session-c'])

    assert.deepEqual(store.getHistory('session-a'), [])
    assert.deepEqual(store.getHistory('session-b'), ['cmd-2'])
    assert.deepEqual(store.getHistory('session-c'), [])
    assert.equal(
        storage.getItem('seedclaw_input_history'),
        JSON.stringify({ 'session-b': ['cmd-2'] }),
    )
})

test('deduplicates consecutive entries and enforces max length per session', async () => {
    const store = await createStore()

    store.pushHistory('session-a', 'same')
    store.pushHistory('session-a', 'same')
    for (let i = 0; i < 105; i++) {
        store.pushHistory('session-a', `cmd-${i}`)
    }

    const history = store.getHistory('session-a')
    assert.equal(history.length, 100)
    assert.equal(history[0], 'cmd-5')
    assert.equal(history[99], 'cmd-104')
})
