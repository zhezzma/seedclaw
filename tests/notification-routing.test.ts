import test from 'node:test'
import assert from 'node:assert/strict'

import {
    buildMessagesListLocation,
    buildNotificationChatLocation,
    getNotificationFallbackToastKey,
    resolveCachedSessionListType,
    resolveNotificationNavigation,
    shouldReloadAfterForeground,
    shouldSuppressForegroundReload,
    type PendingNotificationMap,
} from '../src/utils/notification-routing.ts'

test('buildNotificationChatLocation omits type query for non-cron sessions', () => {
    assert.deepEqual(buildNotificationChatLocation('session-1'), {
        name: 'chat',
        params: { sessionkey: 'session-1' },
    })

    assert.deepEqual(buildNotificationChatLocation('session-1', undefined), {
        name: 'chat',
        params: { sessionkey: 'session-1' },
    })

    assert.deepEqual(buildNotificationChatLocation('session-1', 'default'), {
        name: 'chat',
        params: { sessionkey: 'session-1' },
    })
})

test('buildNotificationChatLocation adds type=cron only for cron sessions', () => {
    assert.deepEqual(buildNotificationChatLocation('session-2', 'cron'), {
        name: 'chat',
        params: { sessionkey: 'session-2' },
        query: { type: 'cron' },
    })
})

test('buildMessagesListLocation always routes to the messages list mode', () => {
    assert.deepEqual(buildMessagesListLocation(), {
        name: 'chat',
        query: { type: 'cron' },
    })
})

test('resolveCachedSessionListType prefers cached cron membership and otherwise falls back to default list', () => {
    const defaultSessions = [
        { id: 'default-1', sessionType: 'default' as const },
        { id: 'shared-id', sessionType: 'default' as const },
    ]
    const cronSessions = [
        { id: 'cron-1', sessionType: 'cron' as const },
        { id: 'shared-id', sessionType: 'cron' as const },
    ]

    assert.equal(resolveCachedSessionListType('cron-1', defaultSessions, cronSessions), 'cron')
    assert.equal(resolveCachedSessionListType('default-1', defaultSessions, cronSessions), 'default')
    assert.equal(resolveCachedSessionListType('shared-id', defaultSessions, cronSessions), 'cron')
    assert.equal(resolveCachedSessionListType('missing', defaultSessions, cronSessions), undefined)
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

test('bare tap with zero live candidates opens the messages list and clears stale entries', () => {
    const notifications: PendingNotificationMap = {
        '301': { sessionKey: 'session-a', createdAt: 1000 },
    }

    const result = resolveNotificationNavigation({
        notificationMap: notifications,
        nowMs: 7_000,
        ttlMs: 5_000,
    })

    assert.deepEqual(result, {
        kind: 'messages-list',
        reason: 'no-candidates',
        remainingNotifications: {},
    })
    assert.equal(getNotificationFallbackToastKey(result), 'notificationsNoCandidates')
})

test('bare tap with multiple live candidates opens the messages list instead of guessing', () => {
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
        kind: 'messages-list',
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
