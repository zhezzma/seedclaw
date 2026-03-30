import { reactive, watch } from 'vue'

import { ApiError, apiGet, apiPost, apiDelete } from './api-client'
import { useInputHistoryStore } from '../stores/inputHistory'
import {
    resolveCachedSessionCategory,
    resolveCachedSessionRouteState,
    type SessionCategory,
    type SessionRouteState,
} from '../utils/notification-routing'
import { hasSessionInLists } from '../utils/task-sessions-routing'

export type { SessionCategory, SessionRouteState } from '../utils/notification-routing'

// ==================== Types ====================
export interface SessionRow {
    id: string
    agentId?: string
    agentName?: string
    created?: string
    cwd?: string
    firstMessage?: string
    name?: string
    messageCount?: number
    modelProvider?: string
    model?: string
    modified?: string
    path?: string
    thinkingLevel?: string
    sessionCategory?: SessionCategory
    archived?: boolean
}

export interface SessionsResult {
    sessions: SessionRow[]
    total?: number
    page?: number
    pageSize?: number
}

// ==================== State ====================
export interface SessionsState {
    sessionsResult: SessionsResult | null
    taskSessionsResult: SessionsResult | null
    archivedSessionsResult: SessionsResult | null
}

const state = reactive<SessionsState>({
    sessionsResult: null,
    taskSessionsResult: null,
    archivedSessionsResult: null,
})

// Session ID → SessionRow 的索引，用于 O(1) 快速查找
const sessionsIndex = new Map<string, SessionRow>()

// ==================== Actions ====================

const rebuildIndex = () => {
    sessionsIndex.clear()
    state.sessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
    state.taskSessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
    state.archivedSessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
}

const normalizeSessionRouteState = (routeState?: SessionRouteState): Required<SessionRouteState> => ({
    sessionCategory: routeState?.sessionCategory === 'task' ? 'task' : 'default',
    archived: Boolean(routeState?.archived),
})

const getSessionBucketKey = (routeState?: SessionRouteState): keyof SessionsState => {
    const normalized = normalizeSessionRouteState(routeState)
    if (normalized.sessionCategory === 'task') return 'taskSessionsResult'
    if (normalized.archived) return 'archivedSessionsResult'
    return 'sessionsResult'
}

const upsertSessionByRouteState = (session: SessionRow, routeState?: SessionRouteState) => {
    const normalized = normalizeSessionRouteState(routeState ?? session)
    const targetKey = getSessionBucketKey(normalized)
    const nextSession = {
        ...session,
        sessionCategory: normalized.sessionCategory,
        archived: normalized.archived,
    }
    const existing = state[targetKey]?.sessions || []
    const deduped = existing.filter(s => s.id !== session.id)
    state[targetKey] = {
        ...(state[targetKey] || {}),
        sessions: [nextSession, ...deduped],
        total: deduped.length + 1,
    }
    sessionsIndex.set(session.id, nextSession)
}

const removeSessionFromResult = (result: SessionsResult | null, id: string): SessionsResult | null => {
    if (!result?.sessions) return result
    const nextSessions = result.sessions.filter(session => session.id !== id)
    if (nextSessions.length === result.sessions.length) return result
    const nextTotal = typeof result.total === 'number'
        ? Math.max(0, result.total - (result.sessions.length - nextSessions.length))
        : nextSessions.length
    return {
        ...result,
        sessions: nextSessions,
        total: nextTotal,
    }
}

const prependSessionToResult = (result: SessionsResult | null, session: SessionRow): SessionsResult => {
    const existing = result?.sessions || []
    const deduped = existing.filter(item => item.id !== session.id)
    return {
        ...(result || {}),
        sessions: [session, ...deduped],
        total: typeof result?.total === 'number' ? deduped.length + 1 : deduped.length + 1,
    }
}

const findSessionLocal = (id: string) =>
    state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === id)
    || state.taskSessionsResult?.sessions?.find((s: SessionRow) => s.id === id)
    || state.archivedSessionsResult?.sessions?.find((s: SessionRow) => s.id === id)

const resolveSessionCategoryFromCache = (id: string): SessionCategory | undefined => {
    return resolveCachedSessionCategory(
        id,
        state.sessionsResult?.sessions || [],
        state.taskSessionsResult?.sessions || [],
        state.archivedSessionsResult?.sessions || [],
    )
}

const resolveSessionRouteStateFromCache = (id: string): SessionRouteState | undefined => {
    return resolveCachedSessionRouteState(
        id,
        state.sessionsResult?.sessions || [],
        state.taskSessionsResult?.sessions || [],
        state.archivedSessionsResult?.sessions || [],
    )
}

// sessions 变更时自动重建索引（模块级全局 watcher）
watch(() => [state.sessionsResult, state.taskSessionsResult, state.archivedSessionsResult], rebuildIndex, { immediate: true, deep: false })

const loadSessions = async (_opts?: any) => {
    const result = await apiGet<SessionsResult>('/api/sessions')
    state.sessionsResult = result || { sessions: [] }
}

const loadTaskSessions = async (page = 1, pageSize = 50): Promise<SessionsResult> => {
    try {
        const result = await apiGet<SessionsResult>(`/api/sessions/tasks?page=${page}&pageSize=${pageSize}`)
        state.taskSessionsResult = result || { sessions: [] }
        return result || { sessions: [] }
    } catch (error) {
        console.error('Failed to load task sessions', error)
        return { sessions: [] }
    }
}

const loadArchivedSessions = async (page = 1, pageSize = 50): Promise<SessionsResult> => {
    try {
        const result = await apiGet<SessionsResult>(`/api/sessions/archived?page=${page}&pageSize=${pageSize}`)
        state.archivedSessionsResult = result || { sessions: [] }
        return result || { sessions: [] }
    } catch (error) {
        console.error('Failed to load archived sessions', error)
        return { sessions: [] }
    }
}

const patchSession = async (key: string, patch: { label?: string | null }) => {
    try {
        await apiPost(`/api/sessions/${encodeURIComponent(key)}/name`, { name: patch.label })
        const found = findSessionLocal(key)
        if (found) {
            found.name = patch.label || undefined
        }
    } catch (error) {
        console.error('Failed to rename session', error)
        throw error
    }
}

/**
 * 仅更新本地 session 数据，不发送 API 请求。
 * 用于后端已持久化的场景（如 /name 命令回调），只需同步前端响应式状态。
 */
const updateSessionLocal = (key: string, patch: Partial<SessionRow>) => {
    const found = findSessionLocal(key)
    if (found) {
        Object.assign(found, patch)
    }
}

const triggerSessionRename = async (targetKey: string, _agentId: string, userText: string) => {
    if (!userText) return
    try {
        const result = await apiPost<{ sessionId: string; name: string }>(
            `/api/sessions/${encodeURIComponent(targetKey)}/generate-title`,
            { text: userText.substring(0, 500) }
        )
        const name = result?.name
        if (name) {
            const found = findSessionLocal(targetKey)
            if (found) {
                found.name = name
            }
        }
    } catch (e) {
        console.warn('Failed to auto-rename session', e)
    }
}

const archiveSession = async (id: string) => {
    await apiPost(`/api/sessions/${encodeURIComponent(id)}/archive`)

    const known = state.sessionsResult?.sessions?.find((session: SessionRow) => session.id === id)
    state.sessionsResult = removeSessionFromResult(state.sessionsResult, id)

    if (known) {
        const archivedSession = { ...known, archived: true, sessionCategory: known.sessionCategory || 'default' }
        state.archivedSessionsResult = prependSessionToResult(state.archivedSessionsResult, archivedSession)
        sessionsIndex.set(id, archivedSession)
    }

    return { archived: true }
}

const unarchiveSession = async (id: string) => {
    await apiDelete(`/api/sessions/${encodeURIComponent(id)}/archive`)

    const known = state.archivedSessionsResult?.sessions?.find((session: SessionRow) => session.id === id)
    state.archivedSessionsResult = removeSessionFromResult(state.archivedSessionsResult, id)

    if (known) {
        const restoredSession = { ...known, archived: false, sessionCategory: known.sessionCategory || 'default' }
        state.sessionsResult = prependSessionToResult(state.sessionsResult, restoredSession)
        sessionsIndex.set(id, restoredSession)
    }

    return { archived: false }
}

const deleteSession = async (key: string) => {
    await apiDelete(`/api/sessions/${encodeURIComponent(key)}`)
    state.sessionsResult = removeSessionFromResult(state.sessionsResult, key)
    state.taskSessionsResult = removeSessionFromResult(state.taskSessionsResult, key)
    state.archivedSessionsResult = removeSessionFromResult(state.archivedSessionsResult, key)
    sessionsIndex.delete(key)
    useInputHistoryStore().removeSessionHistory(key)
    return { deleted: true }
}

const deleteSessions = async (keys: string[]) => {
    const results = await Promise.all(keys.map(async key => {
        try {
            await apiDelete(`/api/sessions/${encodeURIComponent(key)}`)
            return key
        } catch {
            return null
        }
    }))
    const deletedKeys = results.filter((k): k is string => k !== null)
    if (deletedKeys.length > 0) {
        for (const key of deletedKeys) {
            state.sessionsResult = removeSessionFromResult(state.sessionsResult, key)
            state.taskSessionsResult = removeSessionFromResult(state.taskSessionsResult, key)
            state.archivedSessionsResult = removeSessionFromResult(state.archivedSessionsResult, key)
            sessionsIndex.delete(key)
        }
        useInputHistoryStore().removeManySessionHistories(deletedKeys)
    }
    return { deleted: true, deletedCount: deletedKeys.length }
}

const hasSession = (key: string) => {
    return hasSessionInLists(
        key,
        [
            ...(state.sessionsResult?.sessions || []),
            ...(state.archivedSessionsResult?.sessions || []),
        ],
        state.taskSessionsResult?.sessions || [],
    )
}

const commitNewSession = async (agentId: string, inputText?: string): Promise<string> => {
    const body = inputText ? { firstMessage: inputText } : undefined
    const session = await apiPost<SessionRow>(`/api/sessions/${agentId}`, body)
    if (state.sessionsResult) {
        const nextSession = { ...session, archived: Boolean(session.archived) }
        state.sessionsResult = prependSessionToResult(state.sessionsResult, nextSession)
        sessionsIndex.set(session.id, nextSession)
    }
    if (inputText && session.id) {
        triggerSessionRename(session.id, agentId, inputText).catch(err => {
            console.error('Auto-rename failed', err)
        })
    }
    return session.id
}

const fetchSessionInfo = (id: string) =>
    apiGet<SessionRow>(`/api/sessions/${encodeURIComponent(id)}/info`)

const resolveNotificationSessionRouteState = async (id: string): Promise<SessionRouteState | undefined> => {
    const cachedRouteState = resolveSessionRouteStateFromCache(id)
    if (cachedRouteState) return cachedRouteState

    const cached = sessionsIndex.get(id)
    if (cached) {
        return {
            sessionCategory: cached.sessionCategory,
            archived: cached.archived,
        }
    }

    try {
        const session = await fetchSessionInfo(id)
        if (!session) return undefined
        const resolvedRouteState = {
            sessionCategory: session.sessionCategory === 'task' ? 'task' : 'default',
            archived: Boolean(session.archived),
        } satisfies SessionRouteState
        upsertSessionByRouteState(session, resolvedRouteState)
        return resolvedRouteState
    } catch (error) {
        console.warn('Failed to resolve session route state by id', id, error)
        return undefined
    }
}

const resolveNotificationSessionCategory = async (id: string): Promise<SessionCategory | undefined> => {
    const cachedCategory = resolveSessionCategoryFromCache(id)
    if (cachedCategory) return cachedCategory
    return (await resolveNotificationSessionRouteState(id))?.sessionCategory
}

const getSessionById = async (
    id: string,
    category?: SessionCategory,
    options?: { forceRefresh?: boolean; throwOnError?: boolean },
): Promise<SessionRow | undefined> => {
    // forceRefresh 绕过本地缓存，直接向后端确认 session 是否还存在（用于前台恢复场景）
    const cached = options?.forceRefresh ? undefined : sessionsIndex.get(id)
    if (cached) return cached

    try {
        const session = await fetchSessionInfo(id)
        if (!session) return undefined

        const resolvedRouteState = {
            sessionCategory: category === 'task'
                ? 'task'
                : (session.sessionCategory === 'task' ? 'task' : 'default'),
            archived: Boolean(session.archived),
        } satisfies SessionRouteState

        upsertSessionByRouteState(session, resolvedRouteState)
        return sessionsIndex.get(id) || session
    } catch (error: unknown) {
        if (options?.throwOnError) {
            throw error
        }
        if (error instanceof ApiError && error.code === 404) {
            return undefined
        }
        console.warn('Failed to fetch session by id', id, error)
        return undefined
    }
}

const _sessionsState = Object.assign(state, {
    loadSessions,
    loadTaskSessions,
    loadArchivedSessions,
    patchSession,
    updateSessionLocal,
    archiveSession,
    unarchiveSession,
    deleteSession,
    deleteSessions,
    hasSession,
    commitNewSession,
    getSessionById,
    resolveNotificationSessionCategory,
    resolveNotificationSessionRouteState,
})

export function useSessionsState() {
    return _sessionsState
}
