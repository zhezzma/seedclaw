import { defineStore } from 'pinia'

export const INPUT_HISTORY_STORAGE_KEY = 'seedclaw_input_history'
export const INPUT_HISTORY_MAX = 100

export interface InputHistoryState {
    histories: Record<string, string[]>
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

const loadHistoryState = (): InputHistoryState => {
    try {
        const storage = getStorage()
        const raw = storage?.getItem(INPUT_HISTORY_STORAGE_KEY)
        if (!raw) return { histories: {} }
        return { histories: normalizeHistoryRecord(JSON.parse(raw)) }
    } catch (error) {
        console.error('Failed to load input history:', error)
        return { histories: {} }
    }
}

export const useInputHistoryStore = defineStore('input-history', {
    state: (): InputHistoryState => loadHistoryState(),

    getters: {
        getHistory: (state) => (sessionKey: string): string[] => {
            if (!sessionKey) return []
            return state.histories[sessionKey] ?? []
        },
    },

    actions: {
        persist() {
            try {
                const storage = getStorage()
                if (!storage) return

                if (Object.keys(this.histories).length === 0) {
                    storage.removeItem(INPUT_HISTORY_STORAGE_KEY)
                    return
                }

                storage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify(this.histories))
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

        removeSessionHistory(sessionKey: string) {
            const key = sessionKey.trim()
            if (!key || !(key in this.histories)) return

            delete this.histories[key]
            this.persist()
        },

        clearAll() {
            this.histories = {}
            this.persist()
        },
    },
})
