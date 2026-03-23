import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildTaskSessionNotificationRoutePlan,
    hasSessionInLists,
    navigateBackFromTaskSession,
} from '../src/utils/task-sessions-routing.ts'

test('hasSessionInLists treats task sessions as existing sessions too', () => {
    assert.equal(
        hasSessionInLists('task-session-1', [], [
            {
                id: 'task-session-1',
                sessionCategory: 'task',
            },
        ]),
        true,
    )
})

test('task session detail back uses router history instead of pushing the list again', () => {
    const calls: string[] = []
    const router = {
        back: () => {
            calls.push('back')
        },
    }

    navigateBackFromTaskSession(router)

    assert.deepEqual(calls, ['back'])
})

test('task notification navigation backfills the task list before opening detail from non-task routes', () => {
    assert.deepEqual(
        buildTaskSessionNotificationRoutePlan('task-session-1', 'chat'),
        [
            { name: 'tasks' },
            { name: 'tasks', params: { sessionkey: 'task-session-1' } },
        ],
    )
})

test('task notification navigation opens detail directly when already on the task list', () => {
    assert.deepEqual(
        buildTaskSessionNotificationRoutePlan('task-session-1', 'tasks', undefined),
        [
            { name: 'tasks', params: { sessionkey: 'task-session-1' } },
        ],
    )
})

test('task notification navigation backfills the list when currently on another task detail', () => {
    assert.deepEqual(
        buildTaskSessionNotificationRoutePlan('task-session-2', 'tasks', 'task-session-1'),
        [
            { name: 'tasks' },
            { name: 'tasks', params: { sessionkey: 'task-session-2' } },
        ],
    )
})
