import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
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

const root = path.resolve(import.meta.dirname, '..')
const chatInputSource = readFileSync(path.join(root, 'src/composables/useChatInput.ts'), 'utf8')

test.after(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
    })
})

test.beforeEach(() => {
    storage.clear()
})

test('new-session draft sentinel keys differ per gateway mode', async () => {
    // 本地/远程两侧的 /new 是不同服务器的输入框，切换时 applyGatewayMode 还会把
    // 路由改写到 /new 再 reload——共用单值哨兵会让一侧打的草稿在另一侧恢复出来
    const { newSessionDraftKeyFor } = await import('../src/stores/inputHistory.ts')

    assert.notEqual(newSessionDraftKeyFor('local'), newSessionDraftKeyFor('remote'))
    // 同一模式多次取值必须稳定
    assert.equal(newSessionDraftKeyFor('local'), newSessionDraftKeyFor('local'))
    assert.equal(newSessionDraftKeyFor('remote'), newSessionDraftKeyFor('remote'))
})

test('legacy mode-agnostic sentinel is stripped from stored drafts on load', async () => {
    // 旧版草稿不区分网关模式；升级后旧哨兵废弃（草稿是临时态，不做迁移），正常会话草稿保留
    storage.setItem('seedclaw_input_drafts', JSON.stringify({
        '__new_session__': 'draft typed before the upgrade',
        'session-a': 'keep me',
    }))

    const store = await createStore()

    assert.equal(store.drafts['__new_session__'], undefined, 'legacy sentinel draft must be dropped')
    assert.equal(store.drafts['session-a'], 'keep me')
})

test('useChatInput routes the /new sentinel through the gateway mode on both write and restore', () => {
    // useChatInput 依赖 Vue/router 无法在 node:test 里 import，按仓库惯例做源码结构断言：
    // 草稿的写入（watch inputText）与恢复（restoreSessionDraft）两处都必须用模式感知的哨兵 key
    assert.match(
        chatInputSource,
        /setDraft\(_sessionKeyResolver\?\.\(\) \|\| newSessionDraftKeyFor\(effectiveGatewayMode\(\)\)/,
        'draft write must use the mode-scoped new-session sentinel key',
    )
    assert.match(
        chatInputSource,
        /const key = _sessionKeyResolver\?\.\(\) \|\| newSessionDraftKeyFor\(effectiveGatewayMode\(\)\)/,
        'draft restore must use the mode-scoped new-session sentinel key',
    )
})
