import { reactive } from 'vue'
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

export interface SessionsState {
    sessionsResult: SessionsResult | null
}

// ==================== State ====================
const state = reactive<SessionsState>({
    sessionsResult: null,
})



export function useSessionsState() {

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
                    model: "LongCat-Flash-Lite",
                    provider: "longcat",
                    thinkingLevel: "off",
                    prompt: `Summarize the following text into a short, concise title (3-5 words) for a chat session. Do not use quotes or punctuation. Text: "${userText.substring(0, 500)}"`
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

        if (deletedKeys.length > 0 && state.sessionsResult?.sessions) {
            state.sessionsResult = {
                ...state.sessionsResult,
                sessions: state.sessionsResult.sessions.filter((s: SessionRow) => !deletedKeys.includes(s.id)),
                total: Math.max(0, (state.sessionsResult.total || 0) - deletedKeys.length)
            }
        }
        return { deleted: deletedKeys.length > 0, deletedCount: deletedKeys.length }
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

    const methods = {
        loadSessions,
        patchSession,
        deleteSession,
        deleteSessions,
        hasSession,
        commitNewSession
    }

    return createStateProxy(state, methods)
}
