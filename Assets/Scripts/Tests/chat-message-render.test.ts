import test from 'node:test'
import assert from 'node:assert/strict'

import { ensureRenderableBlocks } from '../../../src/utils/chatMessageRender.ts'

test('preserves persisted empty assistant messages as placeholder blocks', () => {
    const blocks = ensureRenderableBlocks(
        {
            role: 'assistant',
            entryId: 'assistant-empty',
        },
        [],
    )

    assert.deepEqual(blocks, [{ type: 'text', text: '' }])
})

test('does not invent placeholder blocks for user messages', () => {
    const blocks = ensureRenderableBlocks(
        {
            role: 'user',
            entryId: 'user-1',
        },
        [],
    )

    assert.deepEqual(blocks, [])
})

test('does not invent placeholder blocks for transient assistant messages without entry ids', () => {
    const blocks = ensureRenderableBlocks(
        {
            role: 'assistant',
        },
        [],
    )

    assert.deepEqual(blocks, [])
})
