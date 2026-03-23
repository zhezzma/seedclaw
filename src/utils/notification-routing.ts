export type SessionCategory = 'default' | 'task'
export type NotificationNavigationReason = 'exact-notification-id' | 'single-candidate' | 'no-candidates' | 'multiple-candidates'
export type NotificationFallbackToastKey = 'notificationsNoCandidates' | 'notificationsMultipleCandidates'

export interface SessionLike {
    id: string
    sessionCategory?: SessionCategory
}

export interface SessionLocation {
    name: 'chat' | 'tasks'
    params: { sessionkey: string }
}

export interface TaskSessionsLocation {
    name: 'tasks'
}

export interface PendingNotificationEntry {
    sessionKey: string
    createdAt: number
}

export type PendingNotificationMap = Record<string, PendingNotificationEntry>

export type NotificationNavigationDecision =
    | {
        kind: 'session'
        reason: Extract<NotificationNavigationReason, 'exact-notification-id' | 'single-candidate'>
        sessionKey: string
        remainingNotifications: PendingNotificationMap
    }
    | {
        kind: 'task-sessions'
        reason: Extract<NotificationNavigationReason, 'no-candidates' | 'multiple-candidates'>
        remainingNotifications: PendingNotificationMap
    }

export interface ResolveNotificationNavigationOptions {
    notificationMap: PendingNotificationMap
    nowMs: number
    ttlMs: number
    notificationId?: string
}

/**
 * 根据当前缓存的两个 session 列表判断 session 属于哪个列表。
 * task 列表优先级更高，避免历史脏数据或重复缓存时把任务会话误判成普通会话。
 */
export const resolveCachedSessionCategory = (
    sessionId: string,
    defaultSessions: SessionLike[] = [],
    taskSessions: SessionLike[] = [],
): SessionCategory | undefined => {
    if (!sessionId) return undefined
    if (taskSessions.some(session => session.id === sessionId)) return 'task'
    if (defaultSessions.some(session => session.id === sessionId)) return 'default'
    return undefined
}

export const buildSessionLocation = (
    sessionKey: string,
    sessionCategory?: SessionCategory,
): SessionLocation => {
    return {
        name: sessionCategory === 'task' ? 'tasks' : 'chat',
        params: { sessionkey: sessionKey },
    }
}

export const buildTaskSessionsLocation = (): TaskSessionsLocation => ({
    name: 'tasks',
})

export const pruneExpiredNotifications = (
    notificationMap: PendingNotificationMap,
    nowMs: number,
    ttlMs: number,
): PendingNotificationMap => {
    return Object.fromEntries(
        Object.entries(notificationMap).filter(([, entry]) => (nowMs - entry.createdAt) <= ttlMs),
    )
}

export const getPendingNotificationCandidates = (notificationMap: PendingNotificationMap): string[] => {
    return [...new Set(Object.values(notificationMap).map(entry => entry.sessionKey).filter(Boolean))]
}

export const removeNotificationById = (
    notificationMap: PendingNotificationMap,
    notificationId: string,
): PendingNotificationMap => {
    const next = { ...notificationMap }
    delete next[notificationId]
    return next
}

export const clearPendingNotifications = (): PendingNotificationMap => ({})

export const getNotificationFallbackToastKey = (
    resolution: NotificationNavigationDecision,
): NotificationFallbackToastKey | undefined => {
    if (resolution.kind !== 'task-sessions') return undefined
    if (resolution.reason === 'no-candidates') return 'notificationsNoCandidates'
    if (resolution.reason === 'multiple-candidates') return 'notificationsMultipleCandidates'
    return undefined
}

export const resolveNotificationNavigation = ({
    notificationMap,
    nowMs,
    ttlMs,
    notificationId,
}: ResolveNotificationNavigationOptions): NotificationNavigationDecision => {
    const liveNotifications = pruneExpiredNotifications(notificationMap, nowMs, ttlMs)

    if (notificationId) {
        const matched = liveNotifications[notificationId]
        if (matched?.sessionKey) {
            return {
                kind: 'session',
                reason: 'exact-notification-id',
                sessionKey: matched.sessionKey,
                remainingNotifications: removeNotificationById(liveNotifications, notificationId),
            }
        }
    }

    const candidates = getPendingNotificationCandidates(liveNotifications)
    if (candidates.length === 1) {
        return {
            kind: 'session',
            reason: 'single-candidate',
            sessionKey: candidates[0],
            remainingNotifications: clearPendingNotifications(),
        }
    }

    return {
        kind: 'task-sessions',
        reason: candidates.length === 0 ? 'no-candidates' : 'multiple-candidates',
        remainingNotifications: clearPendingNotifications(),
    }
}

export const shouldSuppressForegroundReload = (
    suppressUntilMs: number | null | undefined,
    nowMs: number,
): boolean => {
    return typeof suppressUntilMs === 'number' && suppressUntilMs > nowMs
}

export const shouldReloadAfterForeground = (
    elapsedMs: number,
    reloadThresholdMs: number,
    isSuppressed: boolean,
): boolean => {
    return elapsedMs >= reloadThresholdMs && !isSuppressed
}
