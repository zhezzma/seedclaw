import { reactive, watch } from 'vue'

import { apiGet, apiPost, apiDelete } from './api-client'
import { useInputHistoryStore } from '../stores/inputHistory'
import { resolveCachedSessionCategory, type SessionCategory } from '../utils/notification-routing'
import { hasSessionInLists } from '../utils/task-sessions-routing'

export type { SessionCategory } from '../utils/notification-routing'

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
}

const state = reactive<SessionsState>({
    sessionsResult: null,
    taskSessionsResult: null,
})

// Session ID → SessionRow 的索引，用于 O(1) 快速查找
const sessionsIndex = new Map<string, SessionRow>()

// ==================== Actions ====================

const rebuildIndex = () => {
    sessionsIndex.clear()
    state.sessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
    state.taskSessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
}

const upsertSessionByCategory = (session: SessionRow, sessionCategory: SessionCategory = 'default') => {
    const targetKey = sessionCategory === 'task' ? 'taskSessionsResult' : 'sessionsResult'
    const existing = state[targetKey]?.sessions || []
    if (!existing.some(s => s.id === session.id)) {
        state[targetKey] = {
            ...(state[targetKey] || {}),
            sessions: [session, ...existing],
        }
    }
    sessionsIndex.set(session.id, session)
}

const resolveSessionCategoryFromCache = (id: string): SessionCategory | undefined => {
    return resolveCachedSessionCategory(
        id,
        state.sessionsResult?.sessions || [],
        state.taskSessionsResult?.sessions || [],
    )
}

// sessions 变更时自动重建索引（模块级全局 watcher）
watch(() => [state.sessionsResult, state.taskSessionsResult], rebuildIndex, { immediate: true, deep: false })

const loadSessions = async (_opts?: any) => {
    const result = await apiGet<SessionsResult>('/api/sessions')
    state.sessionsResult = result || { sessions: [] }
}

const patchSession = async (key: string, patch: { label?: string | null }) => {
    try {
        await apiPost(`/api/sessions/${encodeURIComponent(key)}/name`, { name: patch.label })
        const found = state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
            || state.taskSessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
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
    const found = state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
        || state.taskSessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
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
            const found = state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === targetKey)
                || state.taskSessionsResult?.sessions?.find((s: SessionRow) => s.id === targetKey)
            if (found) {
                found.name = name
            }
        }
    } catch (e) {
        console.warn('Failed to auto-rename session', e)
    }
}

const deleteSession = async (key: string) => {
    await apiDelete(`/api/sessions/${encodeURIComponent(key)}`)
    if (state.sessionsResult?.sessions) {
        state.sessionsResult = {
            ...state.sessionsResult,
            sessions: state.sessionsResult.sessions.filter((s: SessionRow) => s.id !== key),
            total: Math.max(0, (state.sessionsResult.total || 0) - 1)
        }
    }
    if (state.taskSessionsResult?.sessions) {
        state.taskSessionsResult = {
            ...state.taskSessionsResult,
            sessions: state.taskSessionsResult.sessions.filter((s: SessionRow) => s.id !== key),
            total: Math.max(0, (state.taskSessionsResult.total || 0) - 1)
        }
    }
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
        if (state.sessionsResult?.sessions) {
            state.sessionsResult = {
                ...state.sessionsResult,
                sessions: state.sessionsResult.sessions.filter((s: SessionRow) => !deletedKeys.includes(s.id)),
                total: Math.max(0, (state.sessionsResult.total || 0) - deletedKeys.length)
            }
        }
        if (state.taskSessionsResult?.sessions) {
            state.taskSessionsResult = {
                ...state.taskSessionsResult,
                sessions: state.taskSessionsResult.sessions.filter((s: SessionRow) => !deletedKeys.includes(s.id)),
                total: Math.max(0, (state.taskSessionsResult.total || 0) - deletedKeys.length)
            }
        }
        useInputHistoryStore().removeManySessionHistories(deletedKeys)
    }
    return { deleted: true, deletedCount: deletedKeys.length }
}

const hasSession = (key: string) => {
    return hasSessionInLists(
        key,
        state.sessionsResult?.sessions || [],
        state.taskSessionsResult?.sessions || [],
    )
}

const commitNewSession = async (agentId: string, inputText?: string): Promise<string> => {
    const body = inputText ? { firstMessage: inputText } : undefined
    const session = await apiPost<SessionRow>(`/api/sessions/${agentId}`, body)
    if (state.sessionsResult) {
        const existing = state.sessionsResult.sessions || []
        if (!existing.some(s => s.id === session.id)) {
            state.sessionsResult = {
                ...state.sessionsResult,
                sessions: [session, ...existing],
                total: (state.sessionsResult?.total || 0) + 1
            }
        }
        sessionsIndex.set(session.id, session)
    }
    if (inputText && session.id) {
        triggerSessionRename(session.id, agentId, inputText).catch(err => {
            console.error('Auto-rename failed', err)
        })
    }
    return session.id
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

const fetchSessionInfo = (id: string) =>
    apiGet<SessionRow>(`/api/sessions/${encodeURIComponent(id)}/info`)

const resolveNotificationSessionCategory = async (id: string): Promise<SessionCategory | undefined> => {
    const cachedCategory = resolveSessionCategoryFromCache(id)
    if (cachedCategory) return cachedCategory

    const cached = sessionsIndex.get(id)
    if (cached?.sessionCategory) return cached.sessionCategory

    try {
        const session = await fetchSessionInfo(id)
        if (!session) return undefined
        const resolvedCategory = session.sessionCategory === 'task' ? 'task' : 'default'
        upsertSessionByCategory(session, resolvedCategory)
        return resolvedCategory
    } catch (error) {
        console.warn('Failed to resolve session category by id', id, error)
        return undefined
    }
}

const getSessionById = async (id: string, category?: SessionCategory): Promise<SessionRow | undefined> => {
    const cached = sessionsIndex.get(id)
    if (cached) return cached

    try {
        const session = await fetchSessionInfo(id)
        if (!session) return undefined

        const resolvedCategory = category === 'task'
            ? 'task'
            : (session.sessionCategory === 'task' ? 'task' : 'default')

        upsertSessionByCategory(session, resolvedCategory)
        return session
    } catch (error) {
        console.warn('Failed to fetch session by id', id, error)
        return undefined
    }
}

const _sessionsState = Object.assign(state, {
    loadSessions,
    loadTaskSessions,
    patchSession,
    updateSessionLocal,
    deleteSession,
    deleteSessions,
    hasSession,
    commitNewSession,
    getSessionById,
    resolveNotificationSessionCategory,
})

export function useSessionsState() {
    return _sessionsState
}
