import test from 'node:test'
import assert from 'node:assert/strict'

import {
    shouldReloadAfterForeground,
    shouldSuppressForegroundReload,
} from '../src/utils/notification-routing.ts'

test('foreground reload is suppressed when a recent notification navigation already claimed the focus event', () => {
    assert.equal(shouldSuppressForegroundReload(10_500, 10_000), true)
    assert.equal(shouldSuppressForegroundReload(10_000, 10_500), false)
    assert.equal(shouldSuppressForegroundReload(null, 10_500), false)

    assert.equal(shouldReloadAfterForeground(31_000, 30_000, true), false)
    assert.equal(shouldReloadAfterForeground(31_000, 30_000, false), true)
    assert.equal(shouldReloadAfterForeground(29_000, 30_000, false), false)
    // 锁定边界语义：后台时长恰达阈值即 reload（>=）
    assert.equal(shouldReloadAfterForeground(30_000, 30_000, false), true)
})

test('fast foreground return below threshold never reloads even if unsuppressed', () => {
    // 短暂后台（远小于阈值）且无抑制：不 reload
    assert.equal(shouldReloadAfterForeground(1_000, 60_000, false), false)
    assert.equal(shouldReloadAfterForeground(2_000, 60_000, false), false)
})
