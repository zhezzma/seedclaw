import test from 'node:test'
import assert from 'node:assert/strict'

import {
    decideArrowKeyPriority,
    shouldOpenCommandSuggestions,
} from '../src/utils/chat-input-key-routing.ts'

test('history browsing takes precedence over command suggestions on ArrowUp/ArrowDown', () => {
    assert.equal(
        decideArrowKeyPriority({
            key: 'ArrowUp',
            commandSuggestionsVisible: true,
            historyIndex: 2,
        }),
        'history',
    )

    assert.equal(
        decideArrowKeyPriority({
            key: 'ArrowDown',
            commandSuggestionsVisible: true,
            historyIndex: 0,
        }),
        'history',
    )
})

test('command suggestions keep arrow priority when user is not browsing history', () => {
    assert.equal(
        decideArrowKeyPriority({
            key: 'ArrowUp',
            commandSuggestionsVisible: true,
            historyIndex: -1,
        }),
        'suggestions',
    )

    assert.equal(
        decideArrowKeyPriority({
            key: 'ArrowDown',
            commandSuggestionsVisible: true,
            historyIndex: -1,
        }),
        'suggestions',
    )
})


