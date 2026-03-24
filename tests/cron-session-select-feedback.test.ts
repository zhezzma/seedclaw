import test from 'node:test'
import assert from 'node:assert/strict'

import { getSessionInputUiState } from '../src/utils/cron-session-select.ts'

test('getSessionInputUiState keeps loading spinner in the input adornment', () => {
  assert.deepEqual(getSessionInputUiState({ loading: true, hasInputText: false, selectedSessionValid: true }), {
    showLoadingSpinner: true,
    showInlineError: false,
  })
})

test('getSessionInputUiState shows inline error for invalid typed session input', () => {
  assert.deepEqual(getSessionInputUiState({ loading: false, hasInputText: true, selectedSessionValid: false }), {
    showLoadingSpinner: false,
    showInlineError: true,
  })
})

test('getSessionInputUiState suppresses inline error while loading', () => {
  assert.deepEqual(getSessionInputUiState({ loading: true, hasInputText: true, selectedSessionValid: false }), {
    showLoadingSpinner: true,
    showInlineError: false,
  })
})
