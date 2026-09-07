import { defineStore } from 'pinia'

export const INPUT_HISTORY_STORAGE_KEY = 'seedclaw_input_history'
export const INPUT_DRAFTS_STORAGE_KEY = 'seedclaw_input_drafts'
export const INPUT_HISTORY_MAX = 100
export const INPUT_DRAFT_MAX_LENGTH = 20000
/** /new 新会话页没有 sessionKey，其输入草稿统一落到这个哨兵 key */
export const NEW_SESSION_DRAFT_KEY = '__new_session__'

export interface InputHistoryState {
    histories: Record<string, string[]>
    drafts: Record<string, string>
}

const getStorage = (): Storage | null => {
    if (typeof localStorage === 'undefined') return null
    return localStorage
}

const normalizeHistoryRecord = (value: unknown): Record<string, string[]> => {
    if (!value || typeof value !== 'object') return {}

    const normalized: Record<string, string[]> = {}
    for (const [sessionKey, entries] of Object.entries(value)) {
        if (!sessionKey || !Array.isArray(entries)) continue

        const cleaned = entries
            .filter((entry): entry is string => typeof entry === 'string')
            .map(entry => entry.trim())
            .filter(Boolean)
            .slice(-INPUT_HISTORY_MAX)

        if (cleaned.length > 0) {
            normalized[sessionKey] = cleaned
        }
    }

    return normalized
}

const normalizeDraftRecord = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== 'object') return {}

    const normalized: Record<string, string> = {}
    for (const [sessionKey, draft] of Object.entries(value)) {
        if (!sessionKey || typeof draft !== 'string') continue

        const truncated = draft.slice(0, INPUT_DRAFT_MAX_LENGTH)
        if (truncated) {
            normalized[sessionKey] = truncated
        }
    }

    return normalized
}

const loadHistoryState = (): InputHistoryState['histories'] => {
    try {
        const storage = getStorage()
        const raw = storage?.getItem(INPUT_HISTORY_STORAGE_KEY)
        if (!raw) return {}
        return normalizeHistoryRecord(JSON.parse(raw))
    } catch (error) {
        console.error('Failed to load input history:', error)
        return {}
    }
}

const loadDrafts = (): Record<string, string> => {
    try {
        const storage = getStorage()
        const raw = storage?.getItem(INPUT_DRAFTS_STORAGE_KEY)
        if (!raw) return {}
        return normalizeDraftRecord(JSON.parse(raw))
    } catch (error) {
        console.error('Failed to load input drafts:', error)
        return {}
    }
}

export const useInputHistoryStore = defineStore('input-history', {
    state: (): InputHistoryState => ({ histories: loadHistoryState(), drafts: loadDrafts() }),

    getters: {
        getHistory: (state) => (sessionKey: string): string[] => {
            if (!sessionKey) return []
            return state.histories[sessionKey] ?? []
        },

        getDraft: (state) => (sessionKey: string): string => {
            return state.drafts[sessionKey] ?? ''
        },
    },

    actions: {
        persist() {
            try {
                const storage = getStorage()
                if (!storage) return

                if (Object.keys(this.histories).length === 0) {
                    storage.removeItem(INPUT_HISTORY_STORAGE_KEY)
                } else {
                    storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify(this.histories))
                }

                if (Object.keys(this.drafts).length === 0) {
                    storage.removeItem(INPUT_DRAFTS_STORAGE_KEY)
                } else {
                    storage.setItem(INPUT_DRAFTS_STORAGE_KEY, JSON.stringify(this.drafts))
                }
            } catch (error) {
                console.error('Failed to persist input history:', error)
            }
        },

        pushHistory(sessionKey: string, text: string) {
            const key = sessionKey.trim()
            const trimmed = text.trim()
            if (!key || !trimmed) return

            const history = [...(this.histories[key] ?? [])]
            // 去重：连续相同输入不重复写入
            if (history.length > 0 && history[history.length - 1] === trimmed) return

            history.push(trimmed)
            if (history.length > INPUT_HISTORY_MAX) {
                history.splice(0, history.length - INPUT_HISTORY_MAX)
            }

            this.histories[key] = history
            this.persist()
        },

        /** 记录 session 当前输入框内容（草稿）；空文本表示清除 */
        setDraft(sessionKey: string, text: string) {
            const key = sessionKey.trim()
            if (!key) return

            const value = text.slice(0, INPUT_DRAFT_MAX_LENGTH)
            if (!value) {
                if (key in this.drafts) {
                    delete this.drafts[key]
                    this.persist()
                }
                return
            }

            if (this.drafts[key] === value) return
            this.drafts[key] = value
            this.persist()
        },

        removeSessionHistory(sessionKey: string) {
            const key = sessionKey.trim()
            if (!key || (!(key in this.histories) && !(key in this.drafts))) return

            delete this.histories[key]
            // 会话已删除，其输入草稿一并清理
            delete this.drafts[key]
            this.persist()
        },

        clearAll() {
            this.histories = {}
            this.drafts = {}
            this.persist()
        },
    },
})
