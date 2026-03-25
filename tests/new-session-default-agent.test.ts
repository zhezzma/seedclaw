import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const homeViewPath = path.resolve(testDir, '../src/views/HomeView.vue')
const source = readFileSync(homeViewPath, 'utf8')

test('entering the new-session route always resets the selected agent to the first agent', () => {
    assert.match(
        source,
        /const defaultAgentId = agentsState\.agentsList\[0\]\.id/,
        'new-session route should always use the first agent as the default agent',
    )

    assert.doesNotMatch(
        source,
        /chatState\.agentsSelectedId \|\| agentsState\.agentsList\[0\]\.id/,
        'new-session route must not reuse the last active session agent',
    )
})
