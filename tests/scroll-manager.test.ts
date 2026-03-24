import test from 'node:test'
import assert from 'node:assert/strict'

import {
    getScrollStateAfterNonUserChange,
    selectScrollSaveTarget,
    shouldContinueScrollTopStabilization,
    shouldSuppressAutoBottomSync,
    type ScrollMetrics,
} from '../src/composables/useScrollManager.ts'

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

test('falls back to absolute scrollTop when only a giant intersecting candidate is available', () => {
    const target = selectScrollSaveTarget({
        scrollTop: 6000,
        viewportHeight: 474,
        rowCandidates: [],
        fallbackCandidates: [
            { key: 'huge-spacer', top: -1776, bottom: 6368.96875, height: 8144.96875 },
        ],
    })

    assert.deepEqual(target, {
        scrollTop: 6000,
        type: 'scrollTop',
    })
})

test('uses a nearby fallback anchor when it is reasonably bounded', () => {
    const target = selectScrollSaveTarget({
        scrollTop: 6000,
        viewportHeight: 474,
        rowCandidates: [],
        fallbackCandidates: [
            { key: 'nearby-row-like', top: -120, bottom: 220, height: 300 },
        ],
    })

    assert.deepEqual(target, {
        type: 'anchor',
        entryId: 'nearby-row-like',
        offset: -120,
    })
})

test('falls back to absolute scrollTop when only a giant row candidate is available', () => {
    const target = selectScrollSaveTarget({
        scrollTop: 6000,
        viewportHeight: 474,
        rowCandidates: [
            { key: 'huge-row', top: -1504, bottom: 2346.25, height: 3850.25 },
        ],
        fallbackCandidates: [],
    })

    assert.deepEqual(target, {
        scrollTop: 6000,
        type: 'scrollTop',
    })
})

test('continues scrollTop stabilization when layout jumps far away from target after restore', () => {
    assert.equal(
        shouldContinueScrollTopStabilization({
            expectedScrollTop: 6000,
            actualScrollTop: 55156,
            attempts: 0,
        }),
        true,
    )
})

test('stops scrollTop stabilization when already close enough to target', () => {
    assert.equal(
        shouldContinueScrollTopStabilization({
            expectedScrollTop: 6000,
            actualScrollTop: 6012,
            attempts: 0,
        }),
        false,
    )
})

test('suppresses auto bottom sync while a saved-position restore is in progress', () => {
    assert.equal(
        shouldSuppressAutoBottomSync({
            isRestoringSavedPosition: true,
            hasSavedPosition: true,
        }),
        true,
    )
})

test('does not suppress auto bottom sync when no saved-position restore is active', () => {
    assert.equal(
        shouldSuppressAutoBottomSync({
            isRestoringSavedPosition: false,
            hasSavedPosition: true,
        }),
        false,
    )
})
