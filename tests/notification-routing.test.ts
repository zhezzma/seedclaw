import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildTaskSessionsLocation,
    buildSessionLocation,
    getNotificationFallbackToastKey,
    resolveCachedSessionCategory,
    resolveNotificationNavigation,
    shouldReloadAfterForeground,
    shouldSuppressForegroundReload,
    type PendingNotificationMap,
} from '../src/utils/notification-routing.ts'

test('buildSessionLocation routes default sessions to chat', () => {
    assert.deepEqual(buildSessionLocation('session-1'), {
        name: 'chat',
        params: { sessionkey: 'session-1' },
    })

    assert.deepEqual(buildSessionLocation('session-1', undefined), {
        name: 'chat',
        params: { sessionkey: 'session-1' },
    })

    assert.deepEqual(buildSessionLocation('session-1', 'default'), {
        name: 'chat',
        params: { sessionkey: 'session-1' },
    })
})

test('buildSessionLocation routes task sessions to tasks route', () => {
    assert.deepEqual(buildSessionLocation('session-2', 'task'), {
        name: 'tasks',
        params: { sessionkey: 'session-2' },
    })
})

test('buildTaskSessionsLocation always routes to the task sessions list', () => {
    assert.deepEqual(buildTaskSessionsLocation(), {
        name: 'tasks',
    })
})

test('resolveCachedSessionCategory prefers cached task membership and otherwise falls back to default list', () => {
    const defaultSessions = [
        { id: 'default-1', sessionCategory: 'default' as const },
        { id: 'shared-id', sessionCategory: 'default' as const },
    ]
    const taskSessions = [
        { id: 'task-1', sessionCategory: 'task' as const },
        { id: 'shared-id', sessionCategory: 'task' as const },
    ]

    assert.equal(resolveCachedSessionCategory('task-1', defaultSessions, taskSessions), 'task')
    assert.equal(resolveCachedSessionCategory('default-1', defaultSessions, taskSessions), 'default')
    assert.equal(resolveCachedSessionCategory('shared-id', defaultSessions, taskSessions), 'task')
    assert.equal(resolveCachedSessionCategory('missing', defaultSessions, taskSessions), undefined)
})

test('exact notification id opens the mapped session and removes only that entry', () => {
    const notifications: PendingNotificationMap = {
        '101': { sessionKey: 'session-a', createdAt: 1000 },
        '102': { sessionKey: 'session-b', createdAt: 1100 },
    }

    const result = resolveNotificationNavigation({
        notificationMap: notifications,
        notificationId: '101',
        nowMs: 1500,
        ttlMs: 5_000,
    })

    assert.deepEqual(result, {
        kind: 'session',
        reason: 'exact-notification-id',
        sessionKey: 'session-a',
        remainingNotifications: {
            '102': { sessionKey: 'session-b', createdAt: 1100 },
        },
    })
    assert.equal(getNotificationFallbackToastKey(result), undefined)
})

test('bare tap with one unique live candidate opens that session and clears pending notifications', () => {
    const notifications: PendingNotificationMap = {
        '201': { sessionKey: 'session-a', createdAt: 1000 },
        '202': { sessionKey: 'session-a', createdAt: 1200 },
    }

    const result = resolveNotificationNavigation({
        notificationMap: notifications,
        nowMs: 1500,
        ttlMs: 5_000,
    })

    assert.deepEqual(result, {
        kind: 'session',
        reason: 'single-candidate',
        sessionKey: 'session-a',
        remainingNotifications: {},
    })
    assert.equal(getNotificationFallbackToastKey(result), undefined)
})

test('bare tap with zero live candidates opens the task sessions list and clears stale entries', () => {
    const notifications: PendingNotificationMap = {
        '301': { sessionKey: 'session-a', createdAt: 1000 },
    }

    const result = resolveNotificationNavigation({
        notificationMap: notifications,
        nowMs: 7_000,
        ttlMs: 5_000,
    })

    assert.deepEqual(result, {
        kind: 'task-sessions',
        reason: 'no-candidates',
        remainingNotifications: {},
    })
    assert.equal(getNotificationFallbackToastKey(result), 'notificationsNoCandidates')
})

test('bare tap with multiple live candidates opens the task sessions list instead of guessing', () => {
    const notifications: PendingNotificationMap = {
        '401': { sessionKey: 'session-a', createdAt: 1000 },
        '402': { sessionKey: 'session-b', createdAt: 1200 },
    }

    const result = resolveNotificationNavigation({
        notificationMap: notifications,
        nowMs: 1500,
        ttlMs: 5_000,
    })

    assert.deepEqual(result, {
        kind: 'task-sessions',
        reason: 'multiple-candidates',
        remainingNotifications: {},
    })
    assert.equal(getNotificationFallbackToastKey(result), 'notificationsMultipleCandidates')
})

test('foreground reload is suppressed when a recent notification action already claimed the focus event', () => {
    assert.equal(shouldSuppressForegroundReload(10_500, 10_000), true)
    assert.equal(shouldSuppressForegroundReload(10_000, 10_500), false)
    assert.equal(shouldSuppressForegroundReload(null, 10_500), false)

    assert.equal(shouldReloadAfterForeground(31_000, 30_000, true), false)
    assert.equal(shouldReloadAfterForeground(31_000, 30_000, false), true)
    assert.equal(shouldReloadAfterForeground(29_000, 30_000, false), false)
})
