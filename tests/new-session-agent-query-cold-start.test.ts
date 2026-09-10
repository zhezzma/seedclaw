import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const appInitSource = readFileSync(path.join(root, 'src/composables/useAppInit.ts'), 'utf8')

test('app init honors ?agent=<id> on cold load of the new-session route', () => {
    // 冷刷新/书签直接落在 /new?agent=x 时，路由 watcher 先于 loadAgents() 执行
    // （列表为空无法命中），若 init() 兜底不认 query，会静默用第一个 agent 建会话。
    // init 的首个 agent 兜底分支必须先查询 route.query.agent 并校验存在性，再回落 agentsList[0]
    assert.match(
        appInitSource,
        /if \(!chatState\.agentsSelectedId && agentsState\.agentsList\.length > 0\) \{[\s\S]*?isNewSession\(route\)[\s\S]*?route\.query\.agent[\s\S]*?agentsState\.agentsList\.some\(a => a\.id === requestedAgent\)[\s\S]*?agentsState\.agentsList\[0\]\.id/,
        'agent fallback in init() must consult ?agent=<id> on the new-session route before falling back to the first agent',
    )
})
