import test from 'node:test'
import assert from 'node:assert/strict'

import { getScrollStateAfterNonUserChange, type ScrollMetrics } from '../src/composables/useScrollManager.ts'

const decide = (metrics: ScrollMetrics, userScrolledUp: boolean) => {
    return getScrollStateAfterNonUserChange(metrics, userScrolledUp)
}

test('keeps the scroll-to-bottom button hidden when content no longer overflows after reset', () => {
    const decision = decide({
        scrollTop: 0,
        scrollHeight: 320,
        clientHeight: 320,
    }, true)

    assert.deepEqual(decision, {
        nextUserScrolledUp: false,
        shouldScrollToBottom: false,
    })
})

test('keeps bottom anchoring during viewport-only changes when the user did not manually scroll up', () => {
    const decision = decide({
        scrollTop: 1200,
        scrollHeight: 2200,
        clientHeight: 800,
    }, false)

    assert.deepEqual(decision, {
        nextUserScrolledUp: false,
        shouldScrollToBottom: true,
    })
})

test('does not force-scroll during viewport changes after the user manually scrolled up', () => {
    const decision = decide({
        scrollTop: 1200,
        scrollHeight: 2200,
        clientHeight: 800,
    }, true)

    assert.deepEqual(decision, {
        nextUserScrolledUp: true,
        shouldScrollToBottom: false,
    })
})
