import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import type { CronState } from '../openclaw/ui/src/ui/controllers/cron'
import type { CronFormState } from '../openclaw/ui/src/ui/ui-types'
import {
    loadCronJobs, loadCronStatus, addCronJob as _addCronJob, toggleCronJob as _toggleCronJob,
    runCronJob as _runCronJob, removeCronJob as _removeCronJob, loadCronRuns,
    buildCronSchedule, buildCronPayload
} from '~openclaw/ui/src/ui/controllers/cron'
import type { CronJob } from '~openclaw/ui/src/ui/types'

const defaultForm: CronFormState = {
    name: '',
    description: '',
    agentId: 'default',
    enabled: true,
    scheduleKind: 'every',
    scheduleAt: '',
    everyAmount: '30',
    everyUnit: 'minutes',
    cronExpr: '',
    cronTz: '',
    sessionTarget: 'main',
    wakeMode: 'next-heartbeat',
    payloadKind: 'systemEvent',
    payloadText: '',
    timeoutSeconds: '',
    deliveryMode: 'none',
    deliveryChannel: '',
    deliveryTo: ''
}

const state = reactive<CronState>({
    client: null,
    connected: false,
    cronLoading: false,
    cronBusy: false,
    cronError: null,
    cronStatus: null,
    cronRunsJobId: null,
    cronJobs: [],
    cronRuns: [],
    cronForm: { ...defaultForm }
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], () => {
        state.client = gatewayStore.client as any
        state.connected = gatewayStore.connected
    }, { immediate: true })

    // Subscribe to gateway events for cron updates
    gatewayStore.subscribe((evt) => {
        if (evt.event === 'cron') {
            void loadCronJobs(state as any)
            void loadCronStatus(state as any)
        }
    })
}

export function useCronState() {
    ensureInit()

    const loadCron = async () => {
        await loadCronJobs(state as any)
        await loadCronStatus(state as any)
    }

    const addCronJob = async () => {
        await _addCronJob(state as any)
        await loadCron()
    }

    const toggleCronJob = async (job: CronJob, enabled: boolean) => {
        await _toggleCronJob(state as any, job, enabled)
        await loadCron()
    }

    const runCronJob = async (job: CronJob) => {
        await _runCronJob(state as any, job)
        await loadCron()
    }

    const removeCronJob = async (job: CronJob) => {
        await _removeCronJob(state as any, job)
        await loadCron()
    }

    const loadRuns = async (jobId: string) => {
        await loadCronRuns(state as any, jobId)
    }

    return reactive({
        ...toRefs(state),
        loadCron,
        addCronJob,
        toggleCronJob,
        runCronJob,
        removeCronJob,
        loadCronRuns: loadRuns,
        buildCronSchedule,
        buildCronPayload
    })

}
