import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('chat scroll container disables browser scroll anchoring', async () => {
    const source = await readFile(new URL('../src/views/HomeView.vue', import.meta.url), 'utf8')

    assert.match(source, /overflow-anchor:\s*none/)
})
