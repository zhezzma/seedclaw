import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { moveSessionToRouteState, normalizeSessionRouteState } from '../src/composables/session-route-state.ts'

const root = path.resolve(import.meta.dirname, '..')
const sessionsStateSource = readFileSync(path.join(root, 'src/composables/useSessionsState.ts'), 'utf8')
const routerSource = readFileSync(path.join(root, 'src/router/index.ts'), 'utf8')

test('session state defines archived sessions state and archive helpers', () => {
  assert.match(sessionsStateSource, /archivedSessionsResult:\s*SessionsResult \| null/)
  assert.match(sessionsStateSource, /const loadArchivedSessions = async \(page = 1, pageSize = 50\): Promise<SessionsResult> =>/)
  assert.match(sessionsStateSource, /const archiveSession = async \(id: string\) =>/)
  assert.match(sessionsStateSource, /const unarchiveSession = async \(id: string\) =>/)
  assert.match(sessionsStateSource, /archived\?: boolean/)
  assert.match(sessionsStateSource, /apiGet<SessionsResult>\(`\/api\/sessions\/archived\?page=\$\{page\}&pageSize=\$\{pageSize\}`\)/)
})

test('moveSessionToRouteState removes stale default copies when a session becomes archived', () => {
  const session = { id: 'sess-default', sessionCategory: 'default' as const, archived: false }
  const nextState = moveSessionToRouteState(
    {
      sessionsResult: { sessions: [session], total: 1 },
      taskSessionsResult: { sessions: [], total: 0 },
      archivedSessionsResult: { sessions: [{ ...session, archived: true }], total: 1 },
    },
    session,
    { sessionCategory: 'default', archived: true },
  )

  assert.deepEqual(nextState.sessionsResult?.sessions, [])
  assert.deepEqual(nextState.archivedSessionsResult?.sessions, [{ ...session, archived: true }])
})

test('moveSessionToRouteState removes stale archived copies when a session becomes active again', () => {
  const archivedSession = { id: 'sess-archived', sessionCategory: 'default' as const, archived: true }
  const nextState = moveSessionToRouteState(
    {
      sessionsResult: { sessions: [], total: 0 },
      taskSessionsResult: { sessions: [], total: 0 },
      archivedSessionsResult: { sessions: [archivedSession], total: 1 },
    },
    archivedSession,
    { sessionCategory: 'default', archived: false },
  )

  assert.deepEqual(nextState.archivedSessionsResult?.sessions, [])
  assert.deepEqual(nextState.sessionsResult?.sessions, [{ ...archivedSession, archived: false }])
})

test('moveSessionToRouteState keeps task sessions in the task bucket even when archived', () => {
  const taskSession = { id: 'sess-task', sessionCategory: 'task' as const, archived: false }
  const nextState = moveSessionToRouteState(
    {
      sessionsResult: { sessions: [{ id: 'sess-task', sessionCategory: 'default' as const, archived: false }], total: 1 },
      taskSessionsResult: { sessions: [], total: 0 },
      archivedSessionsResult: { sessions: [{ ...taskSession, archived: true }], total: 1 },
    },
    taskSession,
    normalizeSessionRouteState({ sessionCategory: 'task', archived: true }),
  )

  assert.deepEqual(nextState.sessionsResult?.sessions, [])
  assert.deepEqual(nextState.archivedSessionsResult?.sessions, [])
  assert.deepEqual(nextState.taskSessionsResult?.sessions, [{ ...taskSession, archived: true }])
})

test('router defines archived route and archived-aware route guard', () => {
  assert.match(routerSource, /path: 'archived\/:sessionkey\?'/)
  assert.match(routerSource, /name: 'archived'/)
  assert.match(routerSource, /to\.name === 'archived' \? 'archived'/)
  assert.match(routerSource, /resolveNotificationSessionRouteState\(sessionKey\)/)
})
