import { reactive, watch } from 'vue'

import { apiGet, apiPost, apiDelete, apiPatch } from './api-client'
import { useInputHistoryStore } from '../stores/inputHistory'

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
    cronSessionsResult: SessionsResult | null
}

const state = reactive<SessionsState>({
    sessionsResult: null,
    cronSessionsResult: null,
})

// Session ID → SessionRow 的索引，用于 O(1) 快速查找
const sessionsIndex = new Map<string, SessionRow>()

// ==================== Actions ====================

const rebuildIndex = () => {
    sessionsIndex.clear()
    state.sessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
    state.cronSessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
}

// sessions 变更时自动重建索引（模块级全局 watcher）
watch(() => [state.sessionsResult, state.cronSessionsResult], rebuildIndex, { immediate: true, deep: false })

const loadSessions = async (opts?: any) => {
    const result = await apiGet<SessionsResult>('/api/sessions')
    state.sessionsResult = result || { sessions: [] }
}

const patchSession = async (key: string, patch: { label?: string | null }) => {
    try {
        await apiPost(`/api/sessions/${encodeURIComponent(key)}/name`, { name: patch.label })
        // 原地修改，保持引用一致性（避免与 currentSession 分裂）
        const found = state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
            || state.cronSessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
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
 * 原地修改，保持引用一致性。
 */
const updateSessionLocal = (key: string, patch: Partial<SessionRow>) => {
    const found = state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
        || state.cronSessionsResult?.sessions?.find((s: SessionRow) => s.id === key)
    if (found) {
        Object.assign(found, patch)
    }
}

const triggerSessionRename = async (targetKey: string, agentId: string, userText: string) => {
    if (!userText) return
    try {
        const result = await apiPost<{ sessionId: string; name: string }>(
            `/api/sessions/${encodeURIComponent(targetKey)}/generate-title`,
            { text: userText.substring(0, 500) }
        )
        const name = result?.name
        if (name) {
            // 原地修改，保持引用一致性
            const found = state.sessionsResult?.sessions?.find((s: SessionRow) => s.id === targetKey)
                || state.cronSessionsResult?.sessions?.find((s: SessionRow) => s.id === targetKey)
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
    if (state.cronSessionsResult?.sessions) {
        state.cronSessionsResult = {
            ...state.cronSessionsResult,
            sessions: state.cronSessionsResult.sessions.filter((s: SessionRow) => s.id !== key),
            total: Math.max(0, (state.cronSessionsResult.total || 0) - 1)
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
        if (state.cronSessionsResult?.sessions) {
            state.cronSessionsResult = {
                ...state.cronSessionsResult,
                sessions: state.cronSessionsResult.sessions.filter((s: SessionRow) => !deletedKeys.includes(s.id)),
                total: Math.max(0, (state.cronSessionsResult.total || 0) - deletedKeys.length)
            }
        }
        useInputHistoryStore().removeManySessionHistories(deletedKeys)
    }
    return { deleted: true, deletedCount: deletedKeys.length }
}

const hasSession = (key: string) => {
    return state.sessionsResult?.sessions?.some((s: SessionRow) => s.id === key) ?? false
}

const commitNewSession = async (agentId: string, inputText?: string): Promise<string> => {
    const body = inputText ? { firstMessage: inputText } : undefined
    const session = await apiPost<SessionRow>(`/api/sessions/${agentId}`, body)
    if (state.sessionsResult) {
        // 去重：防止并发导致同一 session 被添加两次
        const existing = state.sessionsResult.sessions || []
        if (!existing.some(s => s.id === session.id)) {
            state.sessionsResult = {
                ...state.sessionsResult,
                sessions: [session, ...existing],
                total: (state.sessionsResult?.total || 0) + 1
            }
        }
        // 同步更新索引，避免后续 getSessionById 在 watcher 执行前查不到
        sessionsIndex.set(session.id, session)
    }
    // Trigger auto-rename in background if we have input text
    if (inputText && session.id) {
        triggerSessionRename(session.id, agentId, inputText).catch(err => {
            console.error('Auto-rename failed', err)
        })
    }
    return session.id
}

const loadCronSessions = async (page = 1, pageSize = 50): Promise<SessionsResult> => {
    try {
        const result = await apiGet<SessionsResult>(`/api/sessions/crons?page=${page}&pageSize=${pageSize}`)
        state.cronSessionsResult = result || { sessions: [] }
        return result || { sessions: [] }
    } catch (error) {
        console.error('Failed to load cron sessions', error)
        return { sessions: [] }
    }
}

const fetchSessionInfo = (id: string) =>
    apiGet<SessionRow>(`/api/sessions/${encodeURIComponent(id)}/info`)

const getSessionById = async (id: string, type?: string): Promise<SessionRow | undefined> => {
    // O(1) 从索引中查找
    const cached = sessionsIndex.get(id)
    if (cached) return cached
    // 本地未找到，从服务器获取
    try {
        const session = await fetchSessionInfo(id)
        if (!session) return undefined
        if (type === 'cron') {
            if (state.cronSessionsResult) {
                const existing = state.cronSessionsResult.sessions || []
                if (!existing.some(s => s.id === id)) {
                    state.cronSessionsResult = { ...state.cronSessionsResult, sessions: [session, ...existing] }
                }
            } else {
                state.cronSessionsResult = { sessions: [session] }
            }
        } else {
            if (state.sessionsResult) {
                const existing = state.sessionsResult.sessions || []
                if (!existing.some(s => s.id === id)) {
                    state.sessionsResult = { ...state.sessionsResult, sessions: [session, ...existing] }
                }
            } else {
                state.sessionsResult = { sessions: [session] }
            }
        }
        sessionsIndex.set(id, session)
        return session
    } catch (error) {
        console.warn('Failed to fetch session by id', id, error)
        return undefined
    }
}

// ==================== Export ====================

const _sessionsState = Object.assign(state, {
    loadSessions,
    loadCronSessions,
    patchSession,
    updateSessionLocal,
    deleteSession,
    deleteSessions,
    hasSession,
    commitNewSession,
    getSessionById,
})

export function useSessionsState() {
    return _sessionsState
}
