import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const chatInputSource = readFileSync(path.join(root, 'src/composables/useChatInput.ts'), 'utf8')

test('new-session draft sentinel keys differ per gateway entry', async () => {
    // 各网关条目是不同服务器的输入框，切换账号时 switchGateway 还会把
    // 路由改写到 /new 再 reload——共用单值哨兵会让一台服务器上打的草稿在另一台上恢复出来
    const { newSessionDraftKeyFor } = await import('../src/stores/inputHistory.ts')

    assert.notEqual(newSessionDraftKeyFor('local'), newSessionDraftKeyFor('gw-a'))
    assert.notEqual(newSessionDraftKeyFor('gw-a'), newSessionDraftKeyFor('gw-b'))
    // 同一条目多次取值必须稳定
    assert.equal(newSessionDraftKeyFor('gw-a'), newSessionDraftKeyFor('gw-a'))
    // 本地托管条目 id 固定为 'local'，与旧版 local 哨兵兼容
    assert.equal(newSessionDraftKeyFor('local'), '__new_session_local__')
})

class MemoryStorage implements Storage {
    private data: Map<string, string>

    constructor(entries: [string, string][] = []) {
        this.data = new Map(entries)
    }

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

test('legacy sentinels are stripped from stored drafts on load', async () => {
    // 旧版草稿哨兵（不分网关的 __new_session__ 与模式版 __new_session_remote__）已废弃：
    // 升级后不迁移（草稿是临时态），正常会话草稿保留
    const { loadDraftsForTest } = await import('../src/stores/inputHistory.ts')
    const storage = new MemoryStorage([
        ['seedclaw_input_drafts', JSON.stringify({
            '__new_session__': 'draft typed before the mode split',
            '__new_session_remote__': 'draft typed before the gateway entries',
            'session-a': 'keep me',
        })],
    ])

    const drafts = loadDraftsForTest(storage)

    assert.equal(drafts['__new_session__'], undefined, 'legacy mode-agnostic sentinel must be dropped')
    assert.equal(drafts['__new_session_remote__'], undefined, 'legacy remote-mode sentinel must be dropped')
    assert.equal(drafts['session-a'], 'keep me')
})

test('useChatInput routes the /new sentinel through the active gateway id on both write and restore', () => {
    // useChatInput 依赖 Vue/router 无法在 node:test 里 import，按仓库惯例做源码结构断言：
    // 草稿的写入（watch inputText）与恢复（restoreSessionDraft）两处都必须用条目感知的哨兵 key
    assert.match(
        chatInputSource,
        /setDraft\(_sessionKeyResolver\?\.\(\) \|\| newSessionDraftKeyFor\(useUiSettingsStore\(\)\.activeGatewayId\)/,
        'draft write must use the gateway-scoped new-session sentinel key',
    )
    assert.match(
        chatInputSource,
        /const key = _sessionKeyResolver\?\.\(\) \|\| newSessionDraftKeyFor\(useUiSettingsStore\(\)\.activeGatewayId\)/,
        'draft restore must use the gateway-scoped new-session sentinel key',
    )
})
