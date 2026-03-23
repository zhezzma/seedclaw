import { reactive } from 'vue'

import type { DeliveryTarget } from '../utils/delivery-targets'
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client'

// ==================== Types ====================
export interface TaskJob {
    id: string
    name: string
    description: string
    agentId: string
    enabled: boolean
    scheduleKind: 'at' | 'every' | 'cron'
    scheduleAt: string
    everyAmount: string
    everyUnit: 'minutes' | 'hours' | 'days'
    cron: string
    cronExpr: string
    cronTz: string
    payloadText: string
    timeoutSeconds: string
    lastRun?: string
    createdAt: string
}

export interface CronRunLogEntry {
    logTimestamp: string
    status: string
    start: string
    durationMs: number
    agentId: string
    kind: string
    cron: string
    prompt: string
    sessionId: string
    result: string
    error?: string
}

export interface CronFormState {
    name: string
    description: string
    agentId: string
    enabled: boolean
    scheduleKind: 'at' | 'every' | 'cron'
    scheduleAt: string
    everyAmount: string
    everyUnit: 'minutes' | 'hours' | 'days'
    cronExpr: string
    cronTz: string
    payloadText: string
    timeoutSeconds: string
    deliveryTargets?: DeliveryTarget[]
}

export interface CronState {
    cronJobs: TaskJob[]
    // Loading / busy / error 直接放进 state，避免与 reactive 合并时 Ref 被自动解包
    cronLoading: boolean
    cronBusy: boolean
    cronError: string | null
}

// ==================== State ====================

const state = reactive<CronState>({
    cronJobs: [],
    cronLoading: false,
    cronBusy: false,
    cronError: null,
})

// ==================== Actions ====================

const loadCron = async () => {
    state.cronLoading = true
    state.cronError = null
    try {
        const result = await apiGet<{ crons: TaskJob[] }>('/api/crons')
        state.cronJobs = result?.crons || []
    } catch (err: any) {
        state.cronError = err?.message || String(err)
    } finally {
        state.cronLoading = false
    }
}

const addCronJob = async (form: CronFormState) => {
    state.cronBusy = true
    state.cronError = null
    try {
        const newJob = await apiPost<TaskJob>('/api/crons', { ...form })
        state.cronJobs.push(newJob)
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
        await apiPost(`/api/crons/${job.id}/${endpoint}`)
        const idx = state.cronJobs.findIndex(j => j.id === job.id)
        if (idx !== -1) {
            state.cronJobs[idx].enabled = enabled
        }
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
        await apiDelete(`/api/crons/${job.id}`)
        state.cronJobs = state.cronJobs.filter(j => j.id !== job.id)
    } catch (err: any) {
        state.cronError = String(err)
    } finally {
        state.cronBusy = false
    }
}

const updateCronJob = async (id: string, form: CronFormState) => {
    if (state.cronBusy) return
    state.cronBusy = true
    state.cronError = null
    try {
        const updatedJob = await apiPatch<TaskJob>(`/api/crons/${id}`, { ...form })
        const idx = state.cronJobs.findIndex(j => j.id === id)
        if (idx !== -1) {
            state.cronJobs[idx] = updatedJob
        }
    } catch (err: any) {
        state.cronError = String(err)
        throw err
    } finally {
        state.cronBusy = false
    }
}

const runCronJob = async (job: TaskJob) => {
    state.cronBusy = true
    try {
        await apiPost(`/api/crons/${job.id}/run`)
    } catch (err: any) {
        state.cronError = String(err)
        throw err
    } finally {
        state.cronBusy = false
    }
}

const loadCronRuns = async (jobId: string): Promise<CronRunLogEntry[]> => {
    try {
        const result = await apiGet<{ logs: CronRunLogEntry[] }>(`/api/crons/${jobId}/logs`)
        return result?.logs || []
    } catch (err: any) {
        console.error('Failed to load cron logs', err)
        return []
    }
}

// ==================== Export ====================

const _cronState = Object.assign(state, {
    loadCron,
    addCronJob,
    toggleCronJob,
    removeCronJob,
    updateCronJob,
    runCronJob,
    loadCronRuns,
})

export function useCronState() {
    return _cronState
}
