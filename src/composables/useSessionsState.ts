import { reactive, computed, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet, apiPost, apiDelete, apiPatch, getApiUrl, getAuthToken } from './api-client'

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
    reasoningLevel?: string
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



export function useSessionsState() {

    const rebuildIndex = () => {
        sessionsIndex.clear()
        state.sessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
        state.cronSessionsResult?.sessions?.forEach(s => sessionsIndex.set(s.id, s))
    }

    // sessions 变更时自动重建索引
    watch(() => [state.sessionsResult, state.cronSessionsResult], rebuildIndex, { immediate: true, deep: false })

    const loadSessions = async (opts?: any) => {
        const result = await apiGet<SessionsResult>('/api/sessions')
        state.sessionsResult = result || { sessions: [] }
    }

    const patchSession = async (key: string, patch: { label?: string | null }) => {
        try {
            // Call rename API
            await apiPost(`/api/sessions/${encodeURIComponent(key)}/name`, { name: patch.label })

            // Update local state
            if (state.sessionsResult?.sessions) {
                const sessions = state.sessionsResult.sessions.map((s: SessionRow) => {
                    if (s.id === key) {
                        return { ...s, name: patch.label || undefined }
                    }
                    return s
                })
                state.sessionsResult = { ...state.sessionsResult, sessions }
            }
        } catch (error) {
            console.error('Failed to rename session', error)
            throw error
        }
    }

    const triggerSessionRename = async (targetKey: string, agentId: string, userText: string) => {
        if (!userText) return

        try {
            const token = getAuthToken()
            const response = await fetch(getApiUrl(`/api/chat/${agentId}/direct`), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    thinkingLevel: "off",
                    prompt: `将以下文本总结为一个简短、简洁的聊天会话标题（5-10个字）。不要使用引号或标点符号。文本： "${userText.substring(0, 500)}"`
                })
            })

            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            if (!response.body) throw new Error('No response body')

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let title = ''

            // Simple SSE parser
            let buffer = ''
            let currentEvent = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    const trimmedLine = line.trim()
                    if (trimmedLine.startsWith('event:')) {
                        currentEvent = trimmedLine.slice(6).trim()
                    } else if (trimmedLine.startsWith('data:')) {
                        // Only add to title if it's a text_delta event
                        if (currentEvent === 'text_delta') {
                            try {
                                const dataStr = trimmedLine.slice(5).trim()
                                const data = JSON.parse(dataStr)
                                if (data.delta) {
                                    title += data.delta
                                }
                            } catch (e) {
                                // Ignore parse errors for intermediate chunks
                            }
                        }
                        // Explicitly ignore thinking_delta and other events
                    } else if (trimmedLine === '') {
                        currentEvent = '' // Reset event type for the next block
                    }
                }
            }

            // Final rename if we got a title
            if (title && title.trim()) {
                await patchSession(targetKey, { label: title.trim() })
            }

        } catch (e) {
            console.warn('Failed to auto-rename session', e)
        }
    }

    const deleteSession = async (key: string) => {
        // apiDelete throws on error, so successful execution means deleted
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
        }
        return { deleted: true, deletedCount: deletedKeys.length }
    }

    const hasSession = (key: string) => {
        return state.sessionsResult?.sessions?.some((s: SessionRow) => s.id === key) ?? false
    }

    const commitNewSession = async (agentId: string, inputText?: string): Promise<string> => {
        const session = await apiPost<SessionRow>(`/api/sessions/${agentId}`)
        if (state.sessionsResult) {
            state.sessionsResult = {
                ...state.sessionsResult,
                sessions: [session, ...(state.sessionsResult.sessions || [])],
                total: (state.sessionsResult.total || 0) + 1
            }
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

    const getSessionById = async (id: string): Promise<SessionRow | undefined> => {
        // O(1) 从索引中查找
        const cached = sessionsIndex.get(id)
        if (cached) return cached

        // 本地未找到，从服务器获取
        try {
            const session = await fetchSessionInfo(id)
            if (!session) return undefined

            // 加入主列表缓存并更新索引
            if (state.sessionsResult) {
                state.sessionsResult = {
                    ...state.sessionsResult,
                    sessions: [session, ...(state.sessionsResult.sessions || [])],
                }
            } else {
                state.sessionsResult = { sessions: [session] }
            }
            sessionsIndex.set(id, session)
            return session
        } catch (error) {
            console.warn('Failed to fetch session by id', id, error)
            return undefined
        }
    }

    const methods = {
        loadSessions,
        loadCronSessions,
        patchSession,
        deleteSession,
        deleteSessions,
        hasSession,
        commitNewSession,
        getSessionById,
    }

    return createStateProxy(state, methods)
}
