import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/chat/ChatInput.vue')
const source = readFileSync(componentPath, 'utf8')

test('command suggestion panel uses a mobile-safe width instead of a fixed desktop width', () => {
    assert.match(
        source,
        /max-w-\[calc\(100vw-1\.5rem\)\]/,
        'ChatInput should cap command suggestion width to the mobile viewport',
    )

    assert.doesNotMatch(
        source,
        /bottom-full mb-2 w-96 /,
        'ChatInput should not keep a hardcoded w-96 width on the suggestion panel root',
    )
})
