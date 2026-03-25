import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const commandStatePath = path.resolve(testDir, '../src/composables/useCommandState.ts')
const chatInputPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')

const commandStateSource = readFileSync(commandStatePath, 'utf8')
const chatInputSource = readFileSync(chatInputPath, 'utf8')

test('command state caches command lists per agent instead of a single shared list', () => {
    assert.match(
        commandStateSource,
        /commandsByAgentId/,
        'useCommandState should maintain per-agent command caches',
    )

    assert.match(
        commandStateSource,
        /currentAgentId/,
        'useCommandState should track the currently active agent cache key',
    )
})

test('chat input labels prompt commands separately from extensions', () => {
    assert.match(
        chatInputSource,
        /cmd\.source === 'prompt'/,
        'ChatInput should render prompt suggestions with a dedicated prompt source label',
    )
})
