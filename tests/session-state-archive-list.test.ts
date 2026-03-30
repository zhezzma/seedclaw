import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

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

test('router defines archived route and archived-aware route guard', () => {
  assert.match(routerSource, /path: 'archived\/:sessionkey\?'/)
  assert.match(routerSource, /name: 'archived'/)
  assert.match(routerSource, /to\.name === 'archived' \? 'archived'/)
  assert.match(routerSource, /resolveNotificationSessionRouteState\(sessionKey\)/)
})
