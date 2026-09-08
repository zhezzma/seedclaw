import test from 'node:test'
import assert from 'node:assert/strict'

import { ensureRenderableBlocks, markErroredToolBlocks } from '../src/utils/chatMessageRender.ts'

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

test('markErroredToolBlocks marks calling-state tool blocks as error', () => {
    const blocks = [
        { type: 'tool', toolCallId: 'call_1', toolName: 'subagent', toolArgs: {}, toolState: 'calling' },
        { type: 'text', text: 'hi' },
    ] as any[]

    markErroredToolBlocks(blocks, 'Request aborted')

    assert.equal(blocks[0].toolState, 'error')
    assert.equal(blocks[0].toolError, 'Request aborted')
    assert.equal(blocks[1].type, 'text')
})

test('markErroredToolBlocks defaults missing toolState to error', () => {
    const blocks = [
        { type: 'tool', toolCallId: 'call_1', toolName: 'bash', toolArgs: {} },
    ] as any[]

    markErroredToolBlocks(blocks, 'This operation was aborted')

    assert.equal(blocks[0].toolState, 'error')
    assert.equal(blocks[0].toolError, 'This operation was aborted')
})

test('markErroredToolBlocks leaves finished tool blocks untouched', () => {
    const blocks = [
        { type: 'tool', toolCallId: 'call_1', toolName: 'bash', toolArgs: {}, toolState: 'success', toolResult: [{ type: 'text', text: 'ok' }] },
        { type: 'tool', toolCallId: 'call_2', toolName: 'bash', toolArgs: {}, toolState: 'error', toolError: 'exit 1' },
    ] as any[]

    markErroredToolBlocks(blocks, 'Request aborted')

    assert.equal(blocks[0].toolState, 'success')
    assert.equal(blocks[0].toolError, undefined)
    assert.equal(blocks[1].toolState, 'error')
    assert.equal(blocks[1].toolError, 'exit 1')
})
