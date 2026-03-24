import test from 'node:test'
import assert from 'node:assert/strict'

import { validateCronForm } from '../src/utils/form-validation.ts'

test('validateCronForm requires agent only for newSession mode', () => {
  assert.deepEqual(validateCronForm({
    name: 'job',
    description: '',
    executionTarget: { type: 'newSession', agentId: '' },
    enabled: true,
    scheduleKind: 'cron',
    scheduleAt: '',
    everyAmount: '',
    everyUnit: 'minutes',
    cronExpr: '* * * * *',
    cronTz: '',
    payloadText: 'run',
    timeoutSeconds: '',
    deliveryTargets: [],
  } as any, true), ['Agent is required'])
})

test('validateCronForm requires session id for existingSession mode', () => {
  assert.deepEqual(validateCronForm({
    name: 'job',
    description: '',
    executionTarget: { type: 'existingSession', sessionId: '' },
    enabled: true,
    scheduleKind: 'cron',
    scheduleAt: '',
    everyAmount: '',
    everyUnit: 'minutes',
    cronExpr: '* * * * *',
    cronTz: '',
    payloadText: 'run',
    timeoutSeconds: '',
    deliveryTargets: [],
  } as any, true), ['Session ID is required'])
})
