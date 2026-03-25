import test from 'node:test'
import assert from 'node:assert/strict'

import {
    applyAttachMessageState,
    getLastMessageEntryId,
    shouldAttachSession,
} from '../src/utils/chat-attach.ts'

function createSessionData() {
    return {
        chatMessages: [],
        chatToolMessages: [],
        sessionTree: null,
        chatStream: null,
        chatStreamStartedAt: null,
        chatSending: false,
        chatRunId: null,
        chatLoading: false,
    }
}

test('shouldAttachSession only when there is no active SSE', () => {
    assert.equal(shouldAttachSession(false), true)
    assert.equal(shouldAttachSession(true), false)
})

test('getLastMessageEntryId reads the last persisted message entry id', () => {
    assert.equal(getLastMessageEntryId([]), undefined)
    assert.equal(getLastMessageEntryId([
        { role: 'user', content: 'a', entryId: 'm1' },
        { role: 'assistant', content: 'b', entryId: 'm2' },
    ] as any), 'm2')
})

test('applyAttachMessageState replaces full history when messages are present', () => {
    const sessionData = createSessionData()
    sessionData.chatMessages = [{ role: 'user', content: 'old', entryId: 'old-1' }] as any

    applyAttachMessageState(sessionData as any, {
        messages: [{ role: 'assistant', content: 'new', entryId: 'new-1' }] as any,
        streamMessage: null,
        isStreaming: false,
    })

    assert.deepEqual(sessionData.chatMessages, [{ role: 'assistant', content: 'new', entryId: 'new-1' }])
    assert.equal(sessionData.chatSending, false)
    assert.equal(sessionData.chatStream, null)
})

test('applyAttachMessageState appends deduped delta messages', () => {
    const sessionData = createSessionData()
    sessionData.chatMessages = [
        { role: 'user', content: 'u1', entryId: 'm1' },
        { role: 'assistant', content: 'a1', entryId: 'm2' },
    ] as any

    applyAttachMessageState(sessionData as any, {
        deltaMessages: [
            { role: 'assistant', content: 'dup', entryId: 'm2' },
            { role: 'user', content: 'u2', entryId: 'm3' },
        ] as any,
        streamMessage: null,
        isStreaming: false,
    })

    assert.deepEqual(sessionData.chatMessages, [
        { role: 'user', content: 'u1', entryId: 'm1' },
        { role: 'assistant', content: 'a1', entryId: 'm2' },
        { role: 'user', content: 'u2', entryId: 'm3' },
    ])
})

test('applyAttachMessageState restores stream content when attach lands on an active stream', () => {
    const sessionData = createSessionData()

    applyAttachMessageState(sessionData as any, {
        streamMessage: {
            content: [{ type: 'text', text: 'partial' }],
        },
        isStreaming: true,
    })

    assert.equal(sessionData.chatSending, true)
    assert.deepEqual(sessionData.chatStream, [{ type: 'text', text: 'partial' }])
})

test('applyAttachMessageState clears stale stream content for idle attach responses', () => {
    const sessionData = createSessionData()
    sessionData.chatStream = [{ type: 'text', text: 'stale' }]
    sessionData.chatSending = true

    applyAttachMessageState(sessionData as any, {
        streamMessage: null,
        isStreaming: false,
    })

    assert.equal(sessionData.chatSending, false)
    assert.equal(sessionData.chatStream, null)
})
