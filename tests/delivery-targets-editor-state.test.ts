import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildEditorEmission,
    parseEmailRecipients,
    stringifyEmailRecipients,
} from '../src/components/delivery/delivery-targets-editor-state.ts'

test('editor emission returns sanitized modelValue and validation payload', () => {
    const result = buildEditorEmission([{ type: 'email', to: [' a@example.com ', 'a@example.com'] }])

    assert.equal(result.validation.valid, true)
    assert.deepEqual(result.modelValue, [{ type: 'email', to: ['a@example.com'] }])
})

test('editor state reports none exclusivity errors', () => {
    const result = buildEditorEmission([{ type: 'none' }, { type: 'notification' }])

    assert.equal(result.validation.valid, false)
})

test('editor state collapses a none-only value to empty client state', () => {
    const result = buildEditorEmission([{ type: 'none' }])

    assert.equal(result.validation.valid, true)
    assert.deepEqual(result.modelValue, [])
})

test('email recipient text is parsed and deduped', () => {
    assert.deepEqual(
        parseEmailRecipients('a@example.com,\n a@example.com \n b@example.com'),
        ['a@example.com', 'b@example.com'],
    )
})

test('email recipient arrays stringify to multi-line editor text', () => {
    assert.equal(stringifyEmailRecipients(['a@example.com', 'b@example.com']), 'a@example.com\nb@example.com')
})
