import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findExactSessionCandidate,
  findSessionCandidateById,
  formatSessionCandidateDisplay,
} from '../src/utils/cron-session-select.ts'

test('formatSessionCandidateDisplay prefers name and falls back to session id', () => {
  assert.equal(formatSessionCandidateDisplay({ id: 'sess-1', name: 'Nightly Thread' }), 'Nightly Thread / sess-1')
  assert.equal(formatSessionCandidateDisplay({ id: 'sess-2' }), 'sess-2')
  assert.equal(formatSessionCandidateDisplay(undefined), '')
})

test('findExactSessionCandidate matches only exact trimmed session ids', () => {
  const candidates = [
    { id: 'sess-1', name: 'Alpha' },
    { id: 'sess-2', name: 'Beta' },
  ]

  assert.equal(findExactSessionCandidate(candidates, ' sess-2 ')?.id, 'sess-2')
  assert.equal(findExactSessionCandidate(candidates, 'Alpha'), undefined)
  assert.equal(findExactSessionCandidate(candidates, 'Alpha / sess-1'), undefined)
  assert.equal(findExactSessionCandidate(candidates, 'sess'), undefined)
})

test('findSessionCandidateById resolves cached candidate by session id', () => {
  const candidates = [
    { id: 'sess-1', name: 'Alpha' },
    { id: 'sess-2', name: 'Beta' },
  ]

  assert.equal(findSessionCandidateById(candidates, 'sess-1')?.name, 'Alpha')
  assert.equal(findSessionCandidateById(candidates, 'missing'), undefined)
})
