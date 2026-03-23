import test from 'node:test'
import assert from 'node:assert/strict'

import { validateCronForm, validateHeartbeatForm } from '../src/utils/form-validation.ts'

test('cron form blocks save when delivery validation fails', () => {
    const errors = validateCronForm({
        name: 'daily',
        description: '',
        agentId: 'main',
        enabled: true,
        scheduleKind: 'cron',
        scheduleAt: '',
        everyAmount: '1',
        everyUnit: 'hours',
        cronExpr: '* * * * *',
        cronTz: '',
        payloadText: 'run',
        timeoutSeconds: '',
        deliveryTargets: [{ type: 'notification' }],
    }, false)

    assert.ok(errors.length > 0)
})

test('cron form allows save when delivery validation and schedule fields are valid', () => {
    const errors = validateCronForm({
        name: 'daily',
        description: '',
        agentId: 'main',
        enabled: true,
        scheduleKind: 'cron',
        scheduleAt: '',
        everyAmount: '1',
        everyUnit: 'hours',
        cronExpr: '* * * * *',
        cronTz: '',
        payloadText: 'run',
        timeoutSeconds: '',
        deliveryTargets: [{ type: 'notification' }],
    }, true)

    assert.equal(errors.length, 0)
})

test('heartbeat form blocks save when delivery validation fails', () => {
    const errors = validateHeartbeatForm({ every: '30m' }, false)

    assert.ok(errors.length > 0)
})

test('heartbeat form requires a cadence', () => {
    const errors = validateHeartbeatForm({ every: '   ' }, true)

    assert.ok(errors.length > 0)
})
