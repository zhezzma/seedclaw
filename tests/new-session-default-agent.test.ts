import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const homeViewPath = path.resolve(testDir, '../src/views/HomeView.vue')
const source = readFileSync(homeViewPath, 'utf8')

test('new-session route reuses the remembered welcome agent before falling back to the first agent', () => {
    // 无 query 时先复用 settingsStore.lastNewSessionAgentId（用户上次在欢迎页
    // 下拉里的明确选择），校验存在性（已删除则跳过），最后才回落第一个 agent
    assert.match(
        source,
        /const rememberedAgent = settingsStore\.lastNewSessionAgentId/,
        'new-session route should read the remembered welcome agent from the settings store',
    )

    assert.match(
        source,
        /agentsState\.agentsList\.some\(a => a\.id === rememberedAgent\)/,
        'remembered agent must be validated against the agent list before use',
    )

    // 解析顺序：?agent= query（侧栏 + 入口）> 记住的下拉选择 > 第一个 agent
    assert.match(
        source,
        /knownRequested \? requestedAgent : \(knownRemembered \? rememberedAgent : defaultAgentId\)/,
        'resolution order must be ?agent= query, then remembered agent, then the first agent',
    )

    // 不沿用“上一个会话的 agent”：只有欢迎页的明确选择才被记住
    assert.doesNotMatch(
        source,
        /chatState\.agentsSelectedId \|\| agentsState\.agentsList\[0\]\.id/,
        'new-session route must not reuse the last active session agent',
    )
})

test('welcome dropdown selection persists to the settings store', () => {
    // selectWelcomeAgent（用户明确选择）必须写回 settingsStore.lastNewSessionAgentId，
    // 否则 /new 与冷启动兜底拿不到记住的值
    const selectFn = source.match(/const selectWelcomeAgent = async \(agentId: string\) => \{[\s\S]*?\n\}/)?.[0] ?? ''
    assert.ok(selectFn, 'selectWelcomeAgent should exist in HomeView')
    assert.match(
        selectFn,
        /settingsStore\.setLastNewSessionAgent\(agentId\)/,
        'welcome dropdown selection should be persisted via settingsStore.setLastNewSessionAgent',
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
