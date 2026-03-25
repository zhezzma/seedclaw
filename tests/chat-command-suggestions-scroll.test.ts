import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')
const source = readFileSync(componentPath, 'utf8')

test('command suggestion panel scrolls active item into view when keyboard selection changes', () => {
    assert.match(
        source,
        /scrollIntoView\s*\(\s*\{\s*block:\s*['"]nearest['"],\s*inline:\s*['"]nearest['"]\s*\}\s*\)/,
        'ChatInput should scroll the active command suggestion into view',
    )

    assert.match(
        source,
        /watch\s*\(\s*commandSuggestionIndex/s,
        'ChatInput should watch commandSuggestionIndex changes',
    )
})
