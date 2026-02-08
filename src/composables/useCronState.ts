import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import { useToast } from './useToast'
import router from '../router'
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

    const { info } = useToast()

    const pendingCronSessions = new Set<string>()

    // Subscribe to gateway events for cron updates
    gatewayStore.subscribe((evt: any) => {
        if (evt.event === 'cron') {
            void loadCronJobs(state as any)
            void loadCronStatus(state as any)
        }

        if (evt.event === 'agent' && evt.payload) {
            const { stream, data, sessionKey } = evt.payload
            // Check for cron-triggered session start
            if (stream === 'lifecycle' &&
                data?.phase === 'start' &&
                sessionKey?.includes(':cron:')) {

                pendingCronSessions.add(sessionKey)
                return
            }

            if (sessionKey && pendingCronSessions.has(sessionKey)) {
                pendingCronSessions.delete(sessionKey)

                const jobId = sessionKey.split(':cron:')[1]
                const job = state.cronJobs.find((j: any) => j.id === jobId)
                const title = job ? `${job.name}` : '你收到了一条定时消息'

                info(title, {
                    duration: 10000,
                    onClick: () => {
                        router.push({
                            name: 'chat',
                            params: { sessionkey: sessionKey }
                        })
                    }
                })
            }
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

    const updateCronJob = async (id: string) => {
        if (!state.client || !state.connected || state.cronBusy) {
            return;
        }
        state.cronBusy = true;
        state.cronError = null;
        try {
            const schedule = buildCronSchedule(state.cronForm);
            const payload = buildCronPayload(state.cronForm);
            const agentId = state.cronForm.agentId.trim();
            const delivery =
                state.cronForm.sessionTarget === "isolated" &&
                    state.cronForm.payloadKind === "agentTurn" &&
                    state.cronForm.deliveryMode
                    ? {
                        mode: state.cronForm.deliveryMode === "announce" ? "announce" : "none",
                        channel: state.cronForm.deliveryChannel.trim() || "last",
                        to: state.cronForm.deliveryTo.trim() || undefined,
                    } as CronJob['delivery']
                    : undefined;

            const patch: Partial<CronJob> = {
                name: state.cronForm.name.trim(),
                description: state.cronForm.description.trim() || undefined,
                agentId: agentId || undefined,
                enabled: state.cronForm.enabled,
                schedule,
                sessionTarget: state.cronForm.sessionTarget,
                wakeMode: state.cronForm.wakeMode,
                payload,
                delivery
            };

            if (!patch.name) {
                throw new Error("Name required.");
            }

            await state.client.request("cron.update", { id, patch });
            await loadCron();
        } catch (err: any) {
            state.cronError = String(err);
            throw err;
        } finally {
            state.cronBusy = false;
        }
    }

    return reactive({
        ...toRefs(state),
        loadCron,
        addCronJob,
        updateCronJob,
        toggleCronJob,
        runCronJob,
        removeCronJob,
        loadCronRuns: loadRuns,
        buildCronSchedule,
        buildCronPayload
    })
}
