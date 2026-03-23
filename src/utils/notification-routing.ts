export type SessionListType = 'default' | 'cron'
export type NotificationRouteType = Extract<SessionListType, 'cron'>
export type NotificationNavigationReason = 'exact-notification-id' | 'single-candidate' | 'no-candidates' | 'multiple-candidates'
export type NotificationFallbackToastKey = 'notificationsNoCandidates' | 'notificationsMultipleCandidates'

export interface SessionLike {
    id: string
    sessionType?: SessionListType
}

export interface NotificationChatLocation {
    name: 'chat'
    params: { sessionkey: string }
    query?: { type: NotificationRouteType }
}

export interface MessagesListLocation {
    name: 'chat'
    query: { type: NotificationRouteType }
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
        kind: 'messages-list'
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
 * cron 列表优先级更高，避免历史脏数据或重复缓存时把 cron session 误判成普通 session。
 */
export const resolveCachedSessionListType = (
    sessionId: string,
    defaultSessions: SessionLike[] = [],
    cronSessions: SessionLike[] = [],
): SessionListType | undefined => {
    if (!sessionId) return undefined
    if (cronSessions.some(session => session.id === sessionId)) return 'cron'
    if (defaultSessions.some(session => session.id === sessionId)) return 'default'
    return undefined
}

export const toNotificationRouteType = (sessionType?: SessionListType): NotificationRouteType | undefined => {
    return sessionType === 'cron' ? 'cron' : undefined
}

export const buildNotificationChatLocation = (
    sessionKey: string,
    sessionType?: SessionListType,
): NotificationChatLocation => {
    const routeType = toNotificationRouteType(sessionType)
    return routeType
        ? {
            name: 'chat',
            params: { sessionkey: sessionKey },
            query: { type: routeType },
        }
        : {
            name: 'chat',
            params: { sessionkey: sessionKey },
        }
}

export const buildMessagesListLocation = (): MessagesListLocation => ({
    name: 'chat',
    query: { type: 'cron' },
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
    if (resolution.kind !== 'messages-list') return undefined
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
        kind: 'messages-list',
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
