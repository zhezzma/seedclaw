import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildTaskSessionBackLocation,
    hasSessionInLists,
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

test('task session detail back target is always the task sessions list route', () => {
    assert.deepEqual(buildTaskSessionBackLocation(), {
        name: 'tasks',
    })
})
