import test from 'node:test'
import assert from 'node:assert/strict'

import { summarizeExecutionTarget } from '../src/utils/cron-execution-target.ts'
import { mergeExecutionTargetCandidates } from '../src/utils/cron-session-search.ts'

test('summarizes existingSession execution target without locale coupling', () => {
  assert.deepEqual(
    summarizeExecutionTarget({ type: 'existingSession', sessionId: 'sess-123', sessionName: 'Nightly Thread' }),
    { mode: 'existingSession', primaryText: 'Nightly Thread', fallbackId: 'sess-123' },
  )
})

test('mergeExecutionTargetCandidates dedupes and prefers task category', () => {
  const merged = mergeExecutionTargetCandidates([
    { id: 'sess-1', name: 'Alpha', sessionCategory: 'default', modified: '2026-03-24T10:00:00.000Z' },
  ], [
    { id: 'sess-1', name: 'Alpha task', sessionCategory: 'task', modified: '2026-03-24T11:00:00.000Z' },
  ], 'alpha')

  assert.equal(merged.length, 1)
  assert.equal(merged[0].sessionCategory, 'task')
  assert.equal(merged[0].name, 'Alpha task')
})

test('mergeExecutionTargetCandidates enforces top-10 ranking', () => {
  const merged = mergeExecutionTargetCandidates(Array.from({ length: 12 }, (_, index) => ({
    id: `alpha-${index}`,
    modified: `2026-03-24T10:${String(index).padStart(2, '0')}:00.000Z`,
  })), [], 'alpha')

  assert.equal(merged.length, 10)
})
