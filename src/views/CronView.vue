<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
    ArrowLeftIcon,
    ClockIcon,
    BoltIcon,
    PlusIcon,
    PencilSquareIcon,
    XMarkIcon,
    ListBulletIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { useGateway } from '../composables/useGateway'
import { useUiSettingsStore } from '../stores/setting'
import { CronState, buildCronSchedule, buildCronPayload } from '../openclaw/ui/src/ui/controllers/cron'
import type { CronFormState } from '~openclaw/ui/src/ui/ui-types'
import type { CronJob, CronRunLogEntry } from '~openclaw/ui/src/ui/types'
import { useToast } from '../composables/useToast'
import { useCronState } from '../composables/useCronState'
import { useAgentsState } from '../composables/useAgentsState'
import { useConfirm } from '../composables/useConfirm'
import { useI18n } from 'vue-i18n'


const router = useRouter()
const gatewayStore = useGateway()
const settingsStore = useUiSettingsStore()
const toastStore = useToast()
const { confirm } = useConfirm()
const { t } = useI18n()

const cronState = useCronState()
const agentsState = useAgentsState()










// --- Form State ---
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

const form = ref<CronFormState>({ ...defaultForm })
const editingId = ref<string | null>(null)
const runningJobId = ref<string | null>(null)
const modalError = ref<string | null>(null)

// --- Smart Switching ---
// Rule: main cron jobs require payload.kind="systemEvent"
watch(() => form.value.sessionTarget, (newTarget) => {
    if (newTarget === 'main' && form.value.payloadKind == 'agentTurn') {
        form.value.payloadKind = 'systemEvent'
    }

    if (newTarget === 'isolated' && form.value.payloadKind == 'systemEvent') {
        form.value.payloadKind = 'agentTurn'
    }
})

watch(() => form.value.payloadKind, (newKind) => {
    if (newKind === 'agentTurn' && form.value.sessionTarget === 'main') {
        form.value.sessionTarget = 'isolated'
    }
    if (newKind === 'systemEvent' && form.value.sessionTarget === 'isolated') {
        form.value.sessionTarget = 'main'
    }
})

// Logs State
const logsJob = ref<CronJob | null>(null)
const logsLoading = ref(false)
const cronRunLogs = computed(() => cronState.cronRuns as CronRunLogEntry[])
const cronRunsTotal = computed(() => (cronState as any).cronRunsTotal || 0)

const page = ref(1)
const pageSize = ref(20)
const totalPages = computed(() => Math.ceil(cronRunsTotal.value / pageSize.value))

// --- Computed & Helpers ---
const isLoading = computed(() => cronState.cronLoading)
const isBusy = computed(() => cronState.cronBusy)

const jobs = computed(() => cronState.cronJobs as CronJob[])
const agents = computed(() => agentsState.agentsList?.agents || []) // Access agents from local state with null check
const modalTitle = computed(() => editingId.value ? t('cron.editJob') : t('cron.newJobModal'))

// Simple date formatter
const formatDate = (ts: number | string | undefined) => {
    if (!ts) return '从不'
    return new Date(ts).toLocaleString('zh-CN')
}

// Shanghai timezone formatter
const formatDateShanghai = (ts: number | undefined) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

const getPayloadText = (payload: CronJob['payload']) => {
    if (payload.kind === 'systemEvent') {
        return payload.text
    } else if (payload.kind === 'agentTurn') {
        return payload.message
    }
    return ''
}

const cronPayloadToForm = (payload: CronJob['payload'], f: CronFormState) => {
    if (payload.kind === 'systemEvent') {
        f.payloadKind = 'systemEvent'
        f.payloadText = payload.text
    } else {
        f.payloadKind = 'agentTurn'
        f.payloadText = payload.message
        // f.channel = payload.channel // field missing in types?
        // f.to = payload.to
    }
}

// --- Actions ---
const goBack = () => router.back()



const openModal = () => {
    const modal = document.getElementById('job_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const closeModal = () => {
    const modal = document.getElementById('job_modal') as HTMLDialogElement
    if (modal) modal.close()
}

const handleOpenAdd = () => {
    editingId.value = null
    modalError.value = null
    form.value = { ...defaultForm }
    // Default to first agent if available
    if (agents.value.length > 0) {
        form.value.agentId = agents.value[0].id
    }
    openModal()
}

const handleViewLogs = async (job: CronJob) => {
    logsJob.value = job
    logsLoading.value = true
    // page.value = 1 // Pagination disabled due to API strictness

    // Open modal first
    const modal = document.getElementById('logs_modal') as HTMLDialogElement
    if (modal) modal.showModal()

    try {
        await cronState.loadCronRuns(job.id)
    } finally {
        logsLoading.value = false
    }
}

// Pagination temporarily disabled
/*
const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > totalPages.value || !logsJob.value) return
    
    logsLoading.value = true
    try {
        const offset = (newPage - 1) * pageSize.value
        await loadCronRuns(gatewayStore as any, logsJob.value.id, offset, pageSize.value)
        page.value = newPage
    } finally {
        logsLoading.value = false
    }
}
*/

const handleOpenEdit = (job: CronJob) => {
    editingId.value = job.id
    modalError.value = null

    // Map job to form
    const f: CronFormState = { ...defaultForm }
    f.name = job.name
    f.description = job.description || ''
    f.agentId = job.agentId || 'default'
    f.enabled = job.enabled
    f.sessionTarget = job.sessionTarget
    f.wakeMode = job.wakeMode


    // Schedule mapping
    if (job.schedule.kind === 'every') {
        f.scheduleKind = 'every'
        const minutes = job.schedule.everyMs / 60000
        if (minutes >= 1440 && minutes % 1440 === 0) {
            f.everyAmount = String(minutes / 1440)
            f.everyUnit = 'days'
        } else if (minutes >= 60 && minutes % 60 === 0) {
            f.everyAmount = String(minutes / 60)
            f.everyUnit = 'hours'
        } else {
            f.everyAmount = String(minutes)
            f.everyUnit = 'minutes'
        }
    } else if (job.schedule.kind === 'at') {
        f.scheduleKind = 'at'
        // Format to datetime-local string YYYY-MM-DDTHH:mm
        const d = new Date(job.schedule.at)
        const pad = (n: number) => n.toString().padStart(2, '0')
        f.scheduleAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    } else if (job.schedule.kind === 'cron') {
        f.scheduleKind = 'cron'
        f.cronExpr = job.schedule.expr
        f.cronTz = job.schedule.tz || ''
    }

    // Payload mapping
    cronPayloadToForm(job.payload, f)


    form.value = f
    openModal()
}

const handleSave = async () => {
    // Validation: Rule "main cron jobs require payload.kind=\"systemEvent\""
    if (form.value.sessionTarget === 'main' && form.value.payloadKind == 'agentTurn') {
        modalError.value = t('cron.errorMainSession')
        return
    }
    if (form.value.sessionTarget === 'isolated' && form.value.payloadKind == 'systemEvent') {
        modalError.value = t('cron.errorIsolatedSession')
        return
    }

    cronState.cronForm = { ...form.value }
    modalError.value = null

    try {
        if (editingId.value) {
            await cronState.updateCronJob(editingId.value)
        } else {
            await cronState.addCronJob()
        }
        closeModal()
    }
    catch (err: any) {
        modalError.value = err?.message || String(err)
    }
}

const handleToggle = async (job: CronJob, e: Event) => {
    e.stopPropagation() // Prevent opening edit modal
    await cronState.toggleCronJob(job, !job.enabled)
}

const handleRun = async (job: CronJob, e: Event) => {
    e.stopPropagation()

    // 确认弹窗
    if (!await confirm(t('cron.confirmRun'))) {
        return
    }

    runningJobId.value = job.id

    try {
        await cronState.runCronJob(job)
        // If logs open for this job, refresh them
        if (logsJob.value?.id === job.id) {
            void cronState.loadCronRuns(job.id)
        }
    }
    catch (err: any) {
        toastStore.error(err?.message || String(err))
    } finally {
        runningJobId.value = null
    }
}

const handleRemove = async (job: CronJob, e: Event) => {
    e.stopPropagation()
    if (!await confirm(t('cron.confirmDelete'))) return
    await cronState.removeCronJob(job)
}


watch(() => gatewayStore.connected, (connected) => {
    if (connected) {
        void cronState.loadCron()
    }
})

onMounted(() => {
    void cronState.loadCron()
})


</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <!-- Header -->
        <ViewHeader :title="$t('cron.title')" :is-main-page="true">
            <template #actions>
                <div class="px-2">
                    <button @click="handleOpenAdd" class="btn btn-primary btn-sm gap-2">
                        <PlusIcon class="w-4 h-4" />
                        {{ $t('cron.newJob') }}
                    </button>
                </div>
            </template>
        </ViewHeader>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            <div class="mx-auto space-y-6 w-full" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">

                <!-- Jobs List -->
                <div>
                    <p v-if="cronState.cronLoading && jobs.length === 0" class="text-center py-8 opacity-50">{{
                        $t('common.loading') }}
                    </p>
                    <div v-if="!cronState.cronLoading && jobs.length === 0" class="text-center py-12 opacity-50">
                        <div class="text-6xl mb-4">💤</div>
                        <p>{{ $t('cron.noJobs') }}</p>
                        <button @click="handleOpenAdd" class="btn btn-link">{{ $t('cron.createOne') }}</button>
                    </div>

                    <div v-else class="grid gap-4"
                        :class="settingsStore.isWideMode ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'">

                        <div v-for="job in jobs" :key="job.id"
                            class="card bg-base-100 shadow-sm border border-base-200 cursor-pointer hover:border-primary transition-colors hover:shadow-md group h-full"
                            @click="handleViewLogs(job)">
                            <div class="card-body p-3 sm:p-4">
                                <!-- Row 1: Name, Status, Actions -->
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <!-- Status Dot -->
                                        <button @click="handleToggle(job, $event)"
                                            class="btn btn-xs btn-ghost tooltip tooltip-top"
                                            :class="job.enabled ? 'text-success' : 'text-base-content opacity-50'"
                                            :data-tip="job.enabled ? $t('cron.clickToDisable') : $t('cron.clickToEnable')">
                                            <div class="w-2 h-2 rounded-full"
                                                :class="job.enabled ? 'bg-success' : 'bg-base-content/30'"></div>
                                        </button>

                                        <h4 class="font-bold text-base truncate"
                                            :class="{ 'opacity-50': !job.enabled }">
                                            {{ job.name }}</h4>

                                        <p v-if="job.description"
                                            class="text-xs opacity-50 truncate hidden sm:block max-w-[200px] ml-2">{{
                                                job.description }}</p>
                                    </div>

                                    <div class="flex items-center gap-1 shrink-0">
                                        <span v-if="job.agentId && job.agentId !== 'default'"
                                            class="badge badge-xs badge-outline font-mono opacity-80">
                                            {{ job.agentId.slice(0, 8) }}
                                        </span>
                                        <span v-if="job.sessionTarget !== 'main'"
                                            class="badge badge-xs badge-outline opacity-60">{{
                                                $t('cron.isolatedSession')
                                            }}</span>
                                        <span v-if="job.wakeMode === 'now'"
                                            class="badge badge-xs badge-outline opacity-60">{{
                                                $t('cron.wakeNow') }}</span>
                                    </div>
                                </div>

                                <!-- Row 2: Metadata (Stacked) -->
                                <div class="flex flex-col gap-2 mt-3 text-xs opacity-70">
                                    <!-- Line 1: Schedule + Tags -->
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="flex items-center gap-1.5" :title="$t('cron.scheduleRule')">
                                            <ClockIcon class="w-3.5 h-3.5" />
                                            <span class="font-mono" v-if="job.schedule.kind === 'every'">
                                                {{ $t('cron.every') }} {{ parseInt(String(job.schedule.everyMs /
                                                    (60000))) < 60 ? (job.schedule.everyMs / 60000 + 'm') :
                                                    (Number(job.schedule.everyMs /
                                                        3600000).toFixed(1).replace(/\.0$/, '') + 'h') }} </span>
                                                    <span class="font-mono" v-else-if="job.schedule.kind === 'at'">
                                                        {{ formatDate(job.schedule.at) }}
                                                    </span>
                                                    <span class="font-mono" v-else>
                                                        {{ job.schedule.expr }}
                                                    </span>
                                        </div>



                                        <!-- Actions (Always visible) -->
                                        <div class="flex items-center gap-1">
                                            <button @click="handleRun(job, $event)"
                                                class="btn btn-xs btn-ghost border-base-content/20 tooltip tooltip-top"
                                                :disabled="runningJobId === job.id" :data-tip="$t('common.runNot')">
                                                <span v-if="runningJobId === job.id"
                                                    class="loading loading-spinner loading-xs"></span>
                                                <BoltIcon v-else class="w-3.5 h-3.5" />
                                            </button>
                                            <button @click.stop="handleOpenEdit(job)"
                                                class="btn btn-xs btn-ghost tooltip tooltip-top"
                                                :data-tip="$t('common.edit')">
                                                <PencilSquareIcon class="w-3.5 h-3.5" />
                                            </button>

                                            <button @click="handleRemove(job, $event)"
                                                class="btn btn-xs btn-ghost text-error/50 hover:text-error tooltip tooltip-top"
                                                :data-tip="$t('common.delete')">
                                                <XMarkIcon class="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Line 2: Next Run / Last Run -->
                                    <div class="flex items-center gap-4">
                                        <div class="flex items-center gap-1" :title="$t('cron.nextRun')">
                                            <span class="opacity-60">{{ $t('cron.nextRun') }}</span>
                                            <span>{{ formatDateShanghai(job.state?.nextRunAtMs) }}</span>
                                        </div>
                                        <div class="flex items-center gap-1" :title="$t('cron.lastRun')">
                                            <span class="opacity-60">{{ $t('cron.lastRun') }}</span>
                                            <span>{{ formatDateShanghai(job.state?.lastRunAtMs) }}</span>
                                        </div>
                                    </div>

                                    <!-- Line 3: Payload -->
                                    <div class="flex items-center gap-1.5 min-w-0 w-full" :title="$t('cron.payload')">
                                        <span class="opacity-60 shrink-0">{{ job.payload.kind === 'systemEvent' ?
                                            $t('cron.systemEvent') :
                                            $t('cron.agentTurn') }}:</span>
                                        <span class="truncate block">{{ getPayloadText(job.payload) || '-' }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

            </div>
        </div>

        <!-- Add/Edit Job Modal -->
        <dialog id="job_modal" class="modal">
            <div class="modal-box w-full max-w-lg">
                <form method="dialog">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>

                <h3 class="font-bold text-lg mb-6 text-center">{{ modalTitle }}</h3>
                <div class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <!-- Name -->
                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">{{ $t('cron.form.name') }}</span>
                            </div>
                            <input v-model="form.name" type="text" class="input input-bordered w-full"
                                :placeholder="$t('cron.form.namePlaceholder')" />
                        </label>

                        <!-- Agent ID (Select) -->
                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">{{ $t('cron.form.agentId') }}</span>
                            </div>
                            <select v-model="form.agentId" class="select select-bordered w-full">
                                <option value="default">{{ $t('cron.form.defaultAgent') }}</option>
                                <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                                    {{ agent.name }} ({{ agent.id }})
                                </option>
                            </select>
                        </label>
                    </div>

                    <!-- Description -->
                    <label class="form-control w-full">
                        <div class="label">
                            <span class="label-text">{{ $t('cron.form.description') }}</span>
                        </div>
                        <input v-model="form.description" type="text" class="input input-bordered w-full"
                            :placeholder="$t('cron.form.descPlaceholder')" />
                    </label>


                    <!-- Scheduler -->
                    <div class="divider mt-5">{{ $t('cron.form.scheduleConfig') }}</div>

                    <label class="form-control w-full">
                        <div class="label">
                            <span class="label-text">{{ $t('cron.form.scheduleKind') }}</span>
                        </div>
                        <select v-model="form.scheduleKind" class="select select-bordered w-full">
                            <option value="every">{{ $t('cron.form.every') }}</option>
                            <option value="at">{{ $t('cron.form.at') }}</option>
                            <option value="cron">{{ $t('cron.form.cron') }}</option>
                        </select>
                    </label>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start pt-2">
                        <!-- Schedule Details (Conditional) -->
                        <div v-if="form.scheduleKind === 'every'" class="contents">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.everyAmount') }}</span>
                                </div>
                                <input v-model="form.everyAmount" type="number" class="input input-bordered w-full" />
                            </label>
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.everyUnit') }}</span>
                                </div>
                                <select v-model="form.everyUnit" class="select select-bordered w-full">
                                    <option value="minutes">{{ $t('common.minutes') }}</option>
                                    <option value="hours">{{ $t('common.hours') }}</option>
                                    <option value="days">{{ $t('common.days') }}</option>
                                </select>
                            </label>
                        </div>

                        <div v-if="form.scheduleKind === 'at'" class="col-span-1 sm:col-span-2">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.scheduleAt') }}</span>
                                </div>
                                <input v-model="form.scheduleAt" type="datetime-local"
                                    class="input input-bordered w-full" />
                            </label>
                        </div>

                        <div v-if="form.scheduleKind === 'cron'" class="contents">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.cron') }}</span>
                                </div>
                                <input v-model="form.cronExpr" type="text" class="input input-bordered w-full"
                                    placeholder="* * * * *" />
                            </label>
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.timezone') }}</span>
                                </div>
                                <input v-model="form.cronTz" type="text" class="input input-bordered w-full"
                                    placeholder="UTC" />
                            </label>
                        </div>
                    </div>

                    <!-- Target / Payload -->
                    <div class="divider">{{ $t('cron.payload') }}</div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">{{ $t('cron.form.sessionTarget') }}</span>
                            </div>
                            <select v-model="form.sessionTarget" class="select select-bordered w-full">
                                <option value="main">{{ $t('cron.form.targetMain') }}</option>
                                <option value="isolated">{{ $t('cron.form.targetIsolated') }}</option>
                            </select>
                        </label>

                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">{{ $t('cron.form.wakeMode') }}</span>
                            </div>
                            <select v-model="form.wakeMode" class="select select-bordered w-full">
                                <option value="next-heartbeat">{{ $t('cron.form.wakeNextHeartbeat') }}</option>
                                <option value="now">{{ $t('cron.form.wakeNow') }}</option>
                            </select>
                        </label>

                        <label class="form-control w-full sm:col-span-2">
                            <div class="label">
                                <span class="label-text">{{ $t('cron.form.payloadKind') }}</span>
                            </div>
                            <select v-model="form.payloadKind" class="select select-bordered w-full">
                                <option value="systemEvent">{{ $t('cron.form.payloadSystem') }}</option>
                                <option value="agentTurn">{{ $t('cron.form.payloadAgent') }}</option>
                            </select>
                        </label>
                    </div>

                    <!-- Delivery Settings (Only for Agent Turn) -->
                    <div v-if="form.payloadKind === 'agentTurn'"
                        class="bg-base-200/50 p-4 rounded-lg space-y-4 border border-base-200 mt-2">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.deliveryMode') }}</span>
                                </div>
                                <select v-model="form.deliveryMode" class="select select-bordered w-full">
                                    <option value="announce">{{ $t('cron.form.deliveryAnnounce') }}</option>
                                    <option value="none">{{ $t('cron.form.deliveryNone') }}</option>
                                </select>
                            </label>

                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.timeout') }}</span>
                                </div>
                                <input v-model="form.timeoutSeconds" type="number" class="input input-bordered w-full"
                                    :placeholder="$t('cron.form.timeoutPlaceholder')" />
                            </label>
                        </div>

                        <div v-if="form.deliveryMode === 'announce'" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.channel') }}</span>
                                </div>
                                <!-- Ideally this should be a select of available channels -->
                                <input v-model="form.deliveryChannel" type="text" class="input input-bordered w-full"
                                    :placeholder="$t('cron.form.channelPlaceholder')" />
                            </label>

                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">{{ $t('cron.form.to') }}</span>
                                </div>
                                <input v-model="form.deliveryTo" type="text" class="input input-bordered w-full"
                                    :placeholder="$t('cron.form.toPlaceholder')" />
                            </label>
                        </div>
                    </div>


                    <fieldset class="fieldset w-full">
                        <legend class="fieldset-legend">{{ form.payloadKind === 'systemEvent' ?
                            $t('cron.form.payloadSystemLabel') : $t('cron.form.payloadAgentLabel')
                        }}</legend>
                        <textarea v-model="form.payloadText" class="textarea w-full h-24"
                            :placeholder="$t('common.inputPlaceholder')"></textarea>
                        <div class="label"></div>
                    </fieldset>

                    <!-- Enabled (Toggle) -->
                    <div class="form-control">
                        <label class="label cursor-pointer justify-start gap-3">
                            <span class="label-text">{{ $t('cron.form.enableJob') }}</span>
                            <input v-model="form.enabled" type="checkbox" class="toggle toggle-primary" />
                        </label>
                    </div>

                </div>

                <!-- Error Display -->
                <div v-if="modalError" class="alert alert-error mt-4">
                    <span class="text-sm">{{ modalError }}</span>
                </div>

                <div class="modal-action">
                    <button class="btn" @click="closeModal">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="handleSave" :disabled="isBusy">
                        <span v-if="isBusy" class="loading loading-spinner"></span>
                        {{ editingId ? $t('common.saveChanges') : $t('cron.createJob') }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>{{ $t('common.close') }}</button>
            </form>
        </dialog>

        <!-- Logs Modal -->
        <dialog id="logs_modal" class="modal">
            <div class="modal-box w-full max-w-2xl">
                <form method="dialog">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>

                <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                    <ListBulletIcon class="w-5 h-5" />
                    {{ $t('cron.logs.title') }}: {{ logsJob?.name }}
                </h3>

                <div v-if="logsLoading" class="flex justify-center py-8">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <div v-else-if="cronState.cronError" class="alert alert-error my-4">
                    <span>{{ cronState.cronError }}</span>
                </div>

                <div v-else-if="cronRunLogs.length === 0" class="text-center py-8 opacity-50">
                    {{ $t('cron.logs.noLogs') }}
                </div>

                <div v-else class="overflow-x-auto max-h-[60vh]">
                    <table class="table table-zebra table-xs sm:table-sm w-full font-mono">
                        <thead>
                            <tr>
                                <th>{{ $t('common.time') }}</th>
                                <th>{{ $t('common.status') }}</th>
                                <th>{{ $t('common.duration') }}</th>
                                <th>{{ $t('common.info') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(log, idx) in cronRunLogs" :key="idx">
                                <td class="whitespace-nowrap">{{ formatDate(log.ts) }}</td>
                                <td>
                                    <span class="badge badge-xs" :class="{
                                        'badge-success': log.status === 'ok',
                                        'badge-error': log.status === 'error',
                                        'badge-warning': log.status === 'skipped'
                                    }">{{ log.status }}</span>
                                </td>
                                <td>{{ log.durationMs ? log.durationMs + 'ms' : '-' }}</td>
                                <td class="max-w-[200px] truncate" :title="log.error || log.summary">
                                    {{ log.error || log.summary || '-' }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="modal-action flex justify-between items-center w-full">
                    <div class="flex items-center gap-2 text-sm opacity-70">
                        <span v-if="cronRunsTotal > 0">
                            {{ $t('common.pagination', { page, total: totalPages, count: cronRunsTotal }) }}
                        </span>
                    </div>

                    <div class="flex gap-2">
                        <!-- Pagination controls hidden -->
                        <form method="dialog">
                            <button class="btn btn-sm">{{ $t('common.close') }}</button>
                        </form>
                    </div>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    </div>
</template>
