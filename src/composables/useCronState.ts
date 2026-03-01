import { reactive, ref, computed, toRefs } from 'vue'

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
}

export interface CronState {
    cronJobs: TaskJob[]
}

// ==================== State ====================

const state = reactive<CronState>({
    cronJobs: [],
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
}

// ==================== Export ====================

// ==================== Derived State（模块级，仅初始化一次）====================
const cronLoading = ref(false)
const cronBusy = ref(false)
const cronError = ref<string | null>(null)

// ==================== Actions ====================

const loadCron = async () => {
    cronLoading.value = true
    cronError.value = null
    try {
        const result = await apiGet<{ crons: TaskJob[] }>('/api/crons')
        state.cronJobs = result?.crons || []
    } catch (err: any) {
        cronError.value = err?.message || String(err)
    } finally {
        cronLoading.value = false
    }
}

const addCronJob = async (form: CronFormState) => {
    cronBusy.value = true
    cronError.value = null
    try {
        const newJob = await apiPost<TaskJob>('/api/crons', { ...form })
        state.cronJobs.push(newJob)
    } catch (err: any) {
        cronError.value = String(err)
        throw err
    } finally {
        cronBusy.value = false
    }
}

const toggleCronJob = async (job: TaskJob, enabled: boolean) => {
    cronBusy.value = true
    cronError.value = null
    try {
        const endpoint = enabled ? 'enable' : 'disable'
        await apiPost(`/api/crons/${job.id}/${endpoint}`)
        const idx = state.cronJobs.findIndex(j => j.id === job.id)
        if (idx !== -1) {
            state.cronJobs[idx].enabled = enabled
        }
    } catch (err: any) {
        cronError.value = String(err)
    } finally {
        cronBusy.value = false
    }
}

const removeCronJob = async (job: TaskJob) => {
    cronBusy.value = true
    cronError.value = null
    try {
        await apiDelete(`/api/crons/${job.id}`)
        state.cronJobs = state.cronJobs.filter(j => j.id !== job.id)
    } catch (err: any) {
        cronError.value = String(err)
    } finally {
        cronBusy.value = false
    }
}

const updateCronJob = async (id: string, form: CronFormState) => {
    if (cronBusy.value) return
    cronBusy.value = true
    cronError.value = null
    try {
        const updatedJob = await apiPatch<TaskJob>(`/api/crons/${id}`, { ...form })
        const idx = state.cronJobs.findIndex(j => j.id === id)
        if (idx !== -1) {
            state.cronJobs[idx] = updatedJob
        }
    } catch (err: any) {
        cronError.value = String(err)
        throw err
    } finally {
        cronBusy.value = false
    }
}

const runCronJob = async (job: TaskJob) => {
    cronBusy.value = true
    try {
        await apiPost(`/api/crons/${job.id}/run`)
    } catch (err: any) {
        cronError.value = String(err)
        throw err
    } finally {
        cronBusy.value = false
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
    cronLoading,
    cronBusy,
    cronError,
    cronJobs: computed(() => state.cronJobs),
    loadCron,
    addCronJob,
    toggleCronJob,
    removeCronJob,
    updateCronJob,
    runCronJob,
    loadCronRuns
})

export function useCronState() {
    ensureInit()
    return _cronState
}

