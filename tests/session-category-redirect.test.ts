import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveSessionRouteRedirect } from '../src/utils/notification-routing.ts'

test('redirects stale chat route to tasks route when latest session category is task', () => {
  assert.deepEqual(
    resolveSessionRouteRedirect('chat', 'task', 'sess-1'),
    {
      shouldRedirect: true,
      location: {
        name: 'tasks',
        params: { sessionkey: 'sess-1' },
      },
    },
  )
})

test('does not redirect when route already matches latest category', () => {
  assert.deepEqual(resolveSessionRouteRedirect('tasks', 'task', 'sess-1'), { shouldRedirect: false })
  assert.deepEqual(resolveSessionRouteRedirect('chat', 'default', 'sess-1'), { shouldRedirect: false })
})
