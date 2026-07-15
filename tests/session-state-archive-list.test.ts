import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { moveSessionToRouteState, normalizeSessionRouteState, prependSessionToResult } from '../src/composables/session-route-state.ts'

const root = path.resolve(import.meta.dirname, '..')
const sessionsStateSource = readFileSync(path.join(root, 'src/composables/useSessionsState.ts'), 'utf8')
const routerSource = readFileSync(path.join(root, 'src/router/index.ts'), 'utf8')

test('session state defines archived sessions state and archive helpers', () => {
  assert.match(sessionsStateSource, /archivedSessionsResult:\s*SessionsResult \| null/)
  assert.match(sessionsStateSource, /const loadArchivedSessions = async \(page = 1, pageSize = 50\): Promise<SessionsResult> =>/)
  assert.match(sessionsStateSource, /const archiveSession = async \(id: string\) =>/)
  assert.match(sessionsStateSource, /const unarchiveSession = async \(id: string\) =>/)
  assert.match(sessionsStateSource, /archived\?: boolean/)
  assert.match(sessionsStateSource, /\/api\/sessions\/archived\?page=\$\{page\}&pageSize=\$\{pageSize\}/)
})


test('session state defines pin helpers calling the backend pin/unpin endpoints', () => {
  assert.match(sessionsStateSource, /const pinSession = async \(id: string\) => {[\s\S]*?apiPost\(`\/api\/sessions\/\$\{encodeURIComponent\(id\)\}\/pin`\)/)
  assert.match(sessionsStateSource, /const unpinSession = async \(id: string\) => {[\s\S]*?apiPost\(`\/api\/sessions\/\$\{encodeURIComponent\(id\)\}\/unpin`\)/)
  assert.match(sessionsStateSource, /SessionRow[\s\S]*?pinned\?: boolean/)
})

test('archiveSession clears local pinned state to match backend archive-removes-pin semantics', () => {
  // 服务端归档会同步移除置顶，本地构造 archivedSession 时必须显式置 pinned: false
  assert.match(sessionsStateSource, /pinned: false,\s*\.\.\.normalizeSessionRouteState/)
})

test('unarchiveSession calls the backend unarchive endpoint', () => {
  assert.match(sessionsStateSource, /const unarchiveSession = async \(id: string\) => {[\s\S]*?apiPost\(`\/api\/sessions\/\$\{encodeURIComponent\(id\)\}\/unarchive`\)/)
  assert.doesNotMatch(sessionsStateSource, /const unarchiveSession = async \(id: string\) => {[\s\S]*?apiDelete\(`\/api\/sessions\/\$\{encodeURIComponent\(id\)\}\/archive`\)/)
})

test('moveSessionToRouteState removes stale default copies when a session becomes archived', () => {
  const session = { id: 'sess-default', sessionCategory: 'default' as const, archived: false }
  const nextState = moveSessionToRouteState(
    {
      sessionsResult: { sessions: [session], total: 1 },
      taskSessionsResult: { sessions: [], total: 0 },
      archivedSessionsResult: { sessions: [{ ...session, archived: true }], total: 4 },
    },
    session,
    { sessionCategory: 'default', archived: true },
  )

  assert.deepEqual(nextState.sessionsResult?.sessions, [])
  assert.equal(nextState.sessionsResult?.total, 0)
  assert.deepEqual(nextState.archivedSessionsResult?.sessions, [{ ...session, archived: true }])
  assert.equal(nextState.archivedSessionsResult?.total, 4)
})

test('moveSessionToRouteState removes stale archived copies when a session becomes active again', () => {
  const archivedSession = { id: 'sess-archived', sessionCategory: 'default' as const, archived: true }
  const nextState = moveSessionToRouteState(
    {
      sessionsResult: { sessions: [], total: 2 },
      taskSessionsResult: { sessions: [], total: 0 },
      archivedSessionsResult: { sessions: [archivedSession], total: 1 },
    },
    archivedSession,
    { sessionCategory: 'default', archived: false },
  )

  assert.deepEqual(nextState.archivedSessionsResult?.sessions, [])
  assert.equal(nextState.archivedSessionsResult?.total, 0)
  assert.deepEqual(nextState.sessionsResult?.sessions, [{ ...archivedSession, archived: false }])
  assert.equal(nextState.sessionsResult?.total, 3)
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
  assert.equal(nextState.taskSessionsResult?.total, 1)
})

test('prependSessionToResult preserves total for existing sessions and increments for new sessions', () => {
  const existing = { id: 'sess-1', sessionCategory: 'default' as const, archived: false }
  const nextExisting = prependSessionToResult(
    { sessions: [existing, { id: 'sess-2', sessionCategory: 'default' as const, archived: false }], total: 10 },
    { ...existing, archived: true },
  )
  const nextNew = prependSessionToResult(
    { sessions: [existing], total: 10 },
    { id: 'sess-3', sessionCategory: 'default' as const, archived: false },
  )
  const nextFallback = prependSessionToResult(
    { sessions: [existing] },
    { id: 'sess-4', sessionCategory: 'default' as const, archived: false },
  )

  assert.equal(nextExisting.total, 10)
  assert.deepEqual(nextExisting.sessions, [{ ...existing, archived: true }, { id: 'sess-2', sessionCategory: 'default', archived: false }])
  assert.equal(nextNew.total, 11)
  assert.deepEqual(nextNew.sessions, [{ id: 'sess-3', sessionCategory: 'default', archived: false }, existing])
  assert.equal(nextFallback.total, 2)
})

test('router defines archived route and archived-aware route guard', () => {
  assert.match(routerSource, /path: 'archived\/:sessionkey\?'/)
  assert.match(routerSource, /name: 'archived'/)
  assert.match(routerSource, /to\.name === 'archived' \? 'archived'/)
  assert.match(routerSource, /resolveNotificationSessionRouteState\(sessionKey\)/)
})
