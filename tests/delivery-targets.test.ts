import test from 'node:test'
import assert from 'node:assert/strict'

import {
    defaultCronDeliveryTargets,
    buildDeliveryValidationPayload,
    sanitizeDeliveryTargets,
    summarizeDeliveryTargets,
} from '../src/utils/delivery-targets.ts'

test('sanitize merges duplicate email recipients', () => {
    const result = sanitizeDeliveryTargets([
        { type: 'email', to: [' a@example.com ', ''] },
        { type: 'email', to: ['b@example.com', 'a@example.com'] },
    ])

    assert.deepEqual(result, [{ type: 'email', to: ['a@example.com', 'b@example.com'] }])
})

test('buildDeliveryValidationPayload matches editor emit contract', () => {
    const result = buildDeliveryValidationPayload([{ type: 'none' }, { type: 'notification' }])

    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
})

test('new cron jobs default to notification delivery', () => {
    assert.deepEqual(defaultCronDeliveryTargets(), [{ type: 'notification' }])
})

test('summarize returns no delivery for empty delivery targets', () => {
    assert.equal(summarizeDeliveryTargets([]), 'No delivery')
})

test('summarize formats mixed notification and email delivery', () => {
    assert.equal(
        summarizeDeliveryTargets([{ type: 'notification' }, { type: 'email', to: ['ops@example.com'] }]),
        'Notification + Email (ops@example.com)',
    )
})
