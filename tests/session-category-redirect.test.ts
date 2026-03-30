import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionLocation, resolveSessionRouteRedirect } from '../src/utils/notification-routing.ts'

test('redirects stale chat route to tasks route when latest session category is task', () => {
  assert.deepEqual(
    resolveSessionRouteRedirect('chat', { sessionCategory: 'task' }, 'sess-1'),
    {
      shouldRedirect: true,
      location: {
        name: 'tasks',
        params: { sessionkey: 'sess-1' },
      },
    },
  )
})

test('archived default sessions resolve to archived route', () => {
  assert.deepEqual(buildSessionLocation('sess-archive', { sessionCategory: 'default', archived: true }), {
    name: 'archived',
    params: { sessionkey: 'sess-archive' },
  })
})

test('stale chat route redirects to archived route when latest session state is archived', () => {
  assert.deepEqual(
    resolveSessionRouteRedirect('chat', { sessionCategory: 'default', archived: true }, 'sess-1'),
    {
      shouldRedirect: true,
      location: {
        name: 'archived',
        params: { sessionkey: 'sess-1' },
      },
    },
  )
})

test('stale archived route redirects back to chat when latest session state is unarchived', () => {
  assert.deepEqual(
    resolveSessionRouteRedirect('archived', { sessionCategory: 'default', archived: false }, 'sess-1'),
    {
      shouldRedirect: true,
      location: {
        name: 'chat',
        params: { sessionkey: 'sess-1' },
      },
    },
  )
})

test('does not redirect when route already matches latest category and archive state', () => {
  assert.deepEqual(resolveSessionRouteRedirect('tasks', { sessionCategory: 'task' }, 'sess-1'), { shouldRedirect: false })
  assert.deepEqual(resolveSessionRouteRedirect('chat', { sessionCategory: 'default', archived: false }, 'sess-1'), { shouldRedirect: false })
  assert.deepEqual(resolveSessionRouteRedirect('archived', { sessionCategory: 'default', archived: true }, 'sess-1'), { shouldRedirect: false })
})
