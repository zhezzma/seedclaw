import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const appInitPath = path.resolve(testDir, '../src/composables/useAppInit.ts')
const chatHeaderPath = path.resolve(testDir, '../src/components/chat/ChatHeader.vue')

const appInitSource = readFileSync(appInitPath, 'utf8')
const chatHeaderSource = readFileSync(chatHeaderPath, 'utf8')

test('initial command loading is scoped to the selected agent instead of loading all agent prompts', () => {
    assert.match(
        appInitSource,
        /loadCommands\(agentsState\.agentsList\[0\]\.id\)/,
        'initial app bootstrap should load commands for the first selected agent',
    )
})

test('switching the new-session agent reloads commands for that agent only', () => {
    assert.match(
        chatHeaderSource,
        /loadCommands\(agentId\)/,
        'changing agent in the new-session header should reload command suggestions for that agent',
    )
})
