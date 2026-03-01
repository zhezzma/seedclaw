import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet } from './api-client'

// ==================== Types ====================
// ==================== Types ====================
export interface LogEntry {
    timestamp: string
    level: string
    message: string
    agentId?: string
    meta?: any
}

export interface LogsState {
    connected: boolean
    logsLoading: boolean
    logsError: string | null
    logsEntries: LogEntry[]
    logsCursor: string | null
    logsFile: string | null
    logsTruncated: boolean
    logsLastFetchAt: number | null
    logsLimit: number
    logsMaxBytes: number
    logsStreaming: boolean
    // Pagination
    total: number
    page: number
    pageSize: number
    totalPages: number
}

// ==================== State ====================
const state = reactive<LogsState>({
    connected: false,
    logsLoading: false,
    logsError: null,
    logsEntries: [],
    logsCursor: null,
    logsFile: null,
    logsTruncated: false,
    logsLastFetchAt: null,
    logsLimit: 20, // Default page size
    logsMaxBytes: 1000000,
    logsStreaming: false,
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    state.connected = true
}

export function useLogsState() {
    ensureInit()

    const loadLogs = async (opts?: { reset?: boolean; quiet?: boolean; date?: string; level?: string; agentId?: string; limit?: number; page?: number }) => {
        if (!opts?.quiet) {
            state.logsLoading = true
        }
        state.logsError = null
        try {
            const params = new URLSearchParams()
            if (opts?.date) params.set('date', opts.date)
            if (opts?.level) params.set('level', opts.level)
            if (opts?.agentId) params.set('agentId', opts.agentId)

            // Handle pagination
            const page = opts?.page || state.page
            const limit = opts?.limit || state.logsLimit
            const pageSize = 15
            params.set('page', String(page))
            params.set('limit', String(limit))
            params.set('pageSize', String(pageSize))


            const queryString = params.toString()
            const path = `/api/logs${queryString ? '?' + queryString : ''}`

            // Expected response: { entries: [], total: number, page: number, pageSize: number }
            // Note: api-client automatically unwraps 'payload' or 'data', so we expect the inner object directly.
            const result = await apiGet<{ entries: LogEntry[]; total: number; page: number; pageSize: number }>(path)

            console.log('Logs API Result:', result)

            if (result && Array.isArray(result.entries)) {
                state.logsEntries = result.entries || []
                state.total = result.total || 0
                state.page = result.page || 1
                state.pageSize = result.pageSize || 20
                state.totalPages = Math.ceil(state.total / state.pageSize)
            } else {
                // Fallback: try to handle if api-client didn't unwrap as expected or structure is different
                const payload = (result as any).payload || (result as any).data || result
                if (payload && Array.isArray(payload.entries)) {
                    state.logsEntries = payload.entries || []
                    state.total = payload.total || 0
                    state.page = payload.page || 1
                    state.pageSize = payload.pageSize || 20
                    state.totalPages = Math.ceil(state.total / state.pageSize)
                } else {
                    console.warn('Unexpected logs API format:', result)
                    state.logsEntries = []
                    state.total = 0
                }
            }

            state.logsLastFetchAt = Date.now()
        } catch (err: any) {
            console.error('Failed to load logs:', err)
            state.logsError = err?.message || String(err)
        } finally {
            state.logsLoading = false
        }
    }

    const resetLogs = () => {
        state.logsCursor = null
        state.logsEntries = []
        state.logsFile = null
        state.logsTruncated = false
        state.logsLastFetchAt = null
        state.page = 1
        state.total = 0
    }

    const nextPage = () => {
        if (state.page < state.totalPages) {
            loadLogs({ page: state.page + 1 })
        }
    }

    const prevPage = () => {
        if (state.page > 1) {
            loadLogs({ page: state.page - 1 })
        }
    }

    const setPage = (page: number) => {
        if (page >= 1 && page <= state.totalPages) {
            loadLogs({ page })
        }
    }

    const methods = {
        loadLogs,
        resetLogs,
        nextPage,
        prevPage,
        setPage
    }

    return createStateProxy(state, methods)
}
