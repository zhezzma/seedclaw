import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useToast } from './useToast'
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client'

// ==================== Types ====================
export interface TaskJob {
    id: string
    cron: string
    agentId?: string
    prompt?: string
    enabled: boolean
    createdAt?: number
}

export interface CronRunLogEntry {
    ts: number
    status: string
    durationMs?: number
    error?: string
    summary?: string
}

export interface CronFormState {
    cron: string
    agentId: string
    prompt: string
    enabled: boolean
}

export interface CronState {
    connected: boolean
    cronLoading: boolean
    cronBusy: boolean
    cronError: string | null
    cronJobs: TaskJob[]
    cronRuns: CronRunLogEntry[]
    cronForm: CronFormState
}

// ==================== State ====================
const defaultForm: CronFormState = {
    cron: '*/30 * * * *',
    agentId: 'main',
    prompt: '',
    enabled: true,
}

const state = reactive<CronState>({
    connected: false,
    cronLoading: false,
    cronBusy: false,
    cronError: null,
    cronJobs: [],
    cronRuns: [],
    cronForm: { ...defaultForm },
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    state.connected = true
}

// ==================== Export ====================

export function useCronState() {
    ensureInit()

    const loadCron = async () => {
        state.cronLoading = true
        state.cronError = null
        try {
            const result = await apiGet<{ tasks: TaskJob[] }>('/api/tasks')
            state.cronJobs = result?.tasks || []
        } catch (err: any) {
            state.cronError = err?.message || String(err)
        } finally {
            state.cronLoading = false
        }
    }

    const addCronJob = async () => {
        state.cronBusy = true
        state.cronError = null
        try {
            await apiPost('/api/tasks', {
                cron: state.cronForm.cron,
                agentId: state.cronForm.agentId,
                prompt: state.cronForm.prompt,
            })
            await loadCron()
        } catch (err: any) {
            state.cronError = String(err)
            throw err
        } finally {
            state.cronBusy = false
        }
    }

    const toggleCronJob = async (job: TaskJob, enabled: boolean) => {
        state.cronBusy = true
        state.cronError = null
        try {
            const endpoint = enabled ? 'enable' : 'disable'
            await apiPost(`/api/tasks/${job.id}/${endpoint}`)
            await loadCron()
        } catch (err: any) {
            state.cronError = String(err)
        } finally {
            state.cronBusy = false
        }
    }

    const removeCronJob = async (job: TaskJob) => {
        state.cronBusy = true
        state.cronError = null
        try {
            await apiDelete(`/api/tasks/${job.id}`)
            await loadCron()
        } catch (err: any) {
            state.cronError = String(err)
        } finally {
            state.cronBusy = false
        }
    }

    const updateCronJob = async (id: string) => {
        if (state.cronBusy) return
        state.cronBusy = true
        state.cronError = null
        try {
            await apiPatch(`/api/tasks/${id}`, {
                cron: state.cronForm.cron,
                agentId: state.cronForm.agentId,
                prompt: state.cronForm.prompt,
                enabled: state.cronForm.enabled,
            })
            await loadCron()
        } catch (err: any) {
            state.cronError = String(err)
            throw err
        } finally {
            state.cronBusy = false
        }
    }

    const runCronJob = async (job: TaskJob) => {
        // Stub: /api/tasks/:id/run not implemented in backend yet or different?
        // Assuming POST /api/tasks/:id/run
        state.cronBusy = true
        try {
            await apiPost(`/api/tasks/${job.id}/run`)
            await loadCron()
        } catch (err: any) {
            state.cronError = String(err)
            throw err
        } finally {
            state.cronBusy = false
        }
    }

    const loadCronRuns = async (jobId: string) => {
        // Stub: no endpoint for logs yet
        state.cronRuns = []
    }

    const methods = {
        loadCron,
        addCronJob,
        updateCronJob,
        toggleCronJob,
        removeCronJob,
        runCronJob,
        loadCronRuns
    }

    return createStateProxy(state, methods)
}
