export type SessionCategory = 'default' | 'task'
export type NotificationNavigationReason = 'exact-notification-id' | 'single-candidate' | 'no-candidates' | 'multiple-candidates'
export type NotificationFallbackToastKey = 'notificationsNoCandidates' | 'notificationsMultipleCandidates'

export interface SessionRouteState {
    sessionCategory?: SessionCategory
    archived?: boolean
}

export interface SessionLike extends SessionRouteState {
    id: string
}

export interface SessionLocation {
    name: 'chat' | 'tasks' | 'archived'
    params: { sessionkey: string }
}

export interface SessionRouteRedirectDecision {
    shouldRedirect: boolean
    location?: SessionLocation
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
 * 根据当前缓存的 session 列表判断 session 的最新路由状态。
 * task 列表优先级更高，避免历史脏数据或重复缓存时把任务会话误判成普通会话。
 */
export const resolveCachedSessionRouteState = (
    sessionId: string,
    defaultSessions: SessionLike[] = [],
    taskSessions: SessionLike[] = [],
    archivedSessions: SessionLike[] = [],
): SessionRouteState | undefined => {
    if (!sessionId) return undefined

    const taskSession = taskSessions.find(session => session.id === sessionId)
    if (taskSession) {
        return {
            sessionCategory: 'task',
            archived: Boolean(taskSession.archived),
        }
    }

    const archivedSession = archivedSessions.find(session => session.id === sessionId)
    if (archivedSession) {
        return {
            sessionCategory: archivedSession.sessionCategory === 'task' ? 'task' : 'default',
            archived: true,
        }
    }

    const defaultSession = defaultSessions.find(session => session.id === sessionId)
    if (defaultSession) {
        return {
            sessionCategory: defaultSession.sessionCategory === 'task' ? 'task' : 'default',
            archived: Boolean(defaultSession.archived),
        }
    }

    return undefined
}

export const resolveCachedSessionCategory = (
    sessionId: string,
    defaultSessions: SessionLike[] = [],
    taskSessions: SessionLike[] = [],
    archivedSessions: SessionLike[] = [],
): SessionCategory | undefined => {
    return resolveCachedSessionRouteState(sessionId, defaultSessions, taskSessions, archivedSessions)?.sessionCategory
}

const resolveSessionLocationName = (routeState?: SessionRouteState): SessionLocation['name'] => {
    if (routeState?.sessionCategory === 'task') return 'tasks'
    if (routeState?.archived) return 'archived'
    return 'chat'
}

export const buildSessionLocation = (
    sessionKey: string,
    routeState?: SessionRouteState,
): SessionLocation => {
    return {
        name: resolveSessionLocationName(routeState),
        params: { sessionkey: sessionKey },
    }
}

export const buildTaskSessionsLocation = (): TaskSessionsLocation => ({
    name: 'tasks',
})

export const resolveSessionRouteRedirect = (
    routeName: 'chat' | 'tasks' | 'archived',
    latestRouteState: SessionRouteState | undefined,
    sessionKey: string,
): SessionRouteRedirectDecision => {
    if (!sessionKey || !latestRouteState) {
        return { shouldRedirect: false }
    }

    const expectedRouteName = resolveSessionLocationName(latestRouteState)
    if (routeName === expectedRouteName) {
        return { shouldRedirect: false }
    }

    return {
        shouldRedirect: true,
        location: buildSessionLocation(sessionKey, latestRouteState),
    }
}

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
