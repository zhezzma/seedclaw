import test from 'node:test'
import assert from 'node:assert/strict'

import { shouldAutoSelectSessionInput } from '../src/utils/cron-session-select.ts'

test('shouldAutoSelectSessionInput returns false on touch/coarse pointer devices', () => {
  assert.equal(shouldAutoSelectSessionInput({ maxTouchPoints: 1, coarsePointer: true }), false)
  assert.equal(shouldAutoSelectSessionInput({ maxTouchPoints: 3, coarsePointer: false }), false)
  assert.equal(shouldAutoSelectSessionInput({ maxTouchPoints: 0, coarsePointer: true }), false)
})

test('shouldAutoSelectSessionInput returns true on desktop pointer devices', () => {
  assert.equal(shouldAutoSelectSessionInput({ maxTouchPoints: 0, coarsePointer: false }), true)
  assert.equal(shouldAutoSelectSessionInput({ maxTouchPoints: undefined, coarsePointer: false }), true)
})
