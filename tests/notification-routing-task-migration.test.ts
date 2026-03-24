import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSessionLocation, resolveCachedSessionCategory, resolveSessionRouteRedirect } from '../src/utils/notification-routing.ts'

test('notification/history links use latest cached task category when building session destination', () => {
  const category = resolveCachedSessionCategory('sess-1', [{ id: 'sess-1', sessionCategory: 'default' }], [{ id: 'sess-1', sessionCategory: 'task' }])
  assert.equal(category, 'task')
  assert.deepEqual(buildSessionLocation('sess-1', category), {
    name: 'tasks',
    params: { sessionkey: 'sess-1' },
  })
})

test('local restore/history redirect follows latest task category', () => {
  assert.deepEqual(resolveSessionRouteRedirect('chat', 'task', 'sess-1'), {
    shouldRedirect: true,
    location: {
      name: 'tasks',
      params: { sessionkey: 'sess-1' },
    },
  })
})
