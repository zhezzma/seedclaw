import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const homeViewPath = path.resolve(testDir, '../src/views/HomeView.vue')
const source = readFileSync(homeViewPath, 'utf8')

test('new-session route falls back to the first agent when no valid ?agent query is given', () => {
    // 无 query / query 无效时回落第一个 agent（不沿用上一个会话的 agent）
    assert.match(
        source,
        /const defaultAgentId = agentsState\.agentsList\[0\]\?\.id \?\? ''/,
        'new-session route should fall back to the first agent',
    )

    assert.doesNotMatch(
        source,
        /chatState\.agentsSelectedId \|\| agentsState\.agentsList\[0\]\.id/,
        'new-session route must not reuse the last active session agent',
    )
})

test('new-session route honors ?agent=<id> from the sidebar group + button', () => {
    // 读取 route.query.agent，且仅当该 agent 在列表中时采用
    assert.match(
        source,
        /const requestedAgent = typeof route\.query\.agent === 'string' \? route\.query\.agent : ''/,
        'new-session route should read the ?agent query param',
    )

    assert.match(
        source,
        /agentsState\.agentsList\.some\(a => a\.id === requestedAgent\)/,
        'requested agent must be validated against the agent list before use',
    )

    // watcher 需监听 query.agent：已在 /new 页时点击其他 agent 的 + 也能正确切换
    assert.match(
        source,
        /watch\(\(\) => \[route\.params\.sessionkey, route\.path, route\.query\.agent\]/,
        'route watcher should include route.query.agent as a source',
    )
})
