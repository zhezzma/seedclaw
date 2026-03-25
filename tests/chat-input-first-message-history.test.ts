import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const homeViewPath = path.resolve(testDir, '../src/views/HomeView.vue')
const source = readFileSync(homeViewPath, 'utf8')

test('new-session first message history is recorded against targetSessionKey', () => {
    assert.match(
        source,
        /pushInputHistory\(inputText,\s*targetSessionKey\)/,
        'HomeView should record input history using the resolved target session key',
    )
})
