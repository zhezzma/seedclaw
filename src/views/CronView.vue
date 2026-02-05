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
import { useGatewayStore } from '../stores/gateway'
import { useUiSettingsStore } from '../stores/setting'
import {
    loadCron,
    addCronJob,
    updateCronJob,
    toggleCronJob,
    runCronJob,
    removeCronJob,
    loadCronRuns
} from '../services/controllers/cron'
import type { CronFormState } from '../services/ui-types'
import type { CronJob, CronRunLogEntry } from '../services/types'
import { useToastStore } from '../stores/toast'

const router = useRouter()
const gatewayStore = useGatewayStore()
const settingsStore = useUiSettingsStore()
const toastStore = useToastStore()
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
    deliver: false,
    channel: '',
    to: '',
    timeoutSeconds: '',
    postToMainPrefix: ''
}

const form = ref<CronFormState>({ ...defaultForm })
const editingId = ref<string | null>(null)
const runningJobId = ref<string | null>(null)
const modalError = ref<string | null>(null)

// Logs State
const logsJob = ref<CronJob | null>(null)
const logsLoading = ref(false)
const cronRunLogs = computed(() => gatewayStore.cronRuns as CronRunLogEntry[])
const cronRunsTotal = computed(() => (gatewayStore as any).cronRunsTotal || 0)

const page = ref(1)
const pageSize = ref(20)
const totalPages = computed(() => Math.ceil(cronRunsTotal.value / pageSize.value))

// --- Computed & Helpers ---
const isLoading = computed(() => gatewayStore.cronLoading)
const isBusy = computed(() => gatewayStore.cronBusy)

const jobs = computed(() => gatewayStore.cronJobs as CronJob[])
const agents = computed(() => gatewayStore.agents) // Access agents getter
const modalTitle = computed(() => editingId.value ? '编辑任务' : '新建任务')

// Simple date formatter
const formatDate = (ts: number | undefined) => {
    if (!ts) return '从不'
    return new Date(ts).toLocaleString('zh-CN')
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
        f.deliver = !!payload.deliver
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
        await loadCronRuns(gatewayStore as any, job.id)
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
    f.postToMainPrefix = job.isolation?.postToMainPrefix || ''

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
        const d = new Date(job.schedule.atMs)
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
    (gatewayStore as any).cronForm = { ...form.value }
    modalError.value = null

    try {
        if (editingId.value) {
            await updateCronJob(gatewayStore as any, editingId.value)
        } else {
            await addCronJob(gatewayStore as any)
        }
        closeModal()
    }
    catch (err: any) {
        modalError.value = err?.message || String(err)
    }
}

const handleToggle = async (job: CronJob, e: Event) => {
    e.stopPropagation() // Prevent opening edit modal
    await toggleCronJob(gatewayStore as any, job, !job.enabled)
}

const handleRun = async (job: CronJob, e: Event) => {
    e.stopPropagation()
    runningJobId.value = job.id

    try {
        await runCronJob(gatewayStore as any, job)
        // If logs open for this job, refresh them
        if (logsJob.value?.id === job.id) {
            void loadCronRuns(gatewayStore as any, job.id)
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
    if (!confirm('确定要删除此任务吗？')) return
    await removeCronJob(gatewayStore as any, job)
}


watch(() => gatewayStore.connected, (connected) => {
    if (connected) {
        void loadCron(gatewayStore as any)
    }
})

onMounted(() => {
    void loadCron(gatewayStore as any)
})


</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle lg:hidden">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <span class="text-lg font-semibold px-4">定时任务</span>
            </div>
            <div class="flex-none px-2">
                <button @click="handleOpenAdd" class="btn btn-primary btn-sm gap-2">
                    <PlusIcon class="w-4 h-4" />
                    新建任务
                </button>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            <div class="mx-auto space-y-6 w-full" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">

                <!-- Jobs List -->
                <div>
                    <p v-if="gatewayStore.cronLoading && jobs.length === 0" class="text-center py-8 opacity-50">加载中...
                    </p>
                    <div v-if="!gatewayStore.cronLoading && jobs.length === 0" class="text-center py-12 opacity-50">
                        <div class="text-6xl mb-4">💤</div>
                        <p>暂无定时任务</p>
                        <button @click="handleOpenAdd" class="btn btn-link">创建一个</button>
                    </div>

                    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                        <div v-for="job in jobs" :key="job.id"
                            class="card bg-base-100 shadow-sm border border-base-200 cursor-pointer hover:border-primary transition-colors hover:shadow-md group h-full"
                            @click="handleViewLogs(job)">
                            <div class="card-body p-3 sm:p-4">
                                <!-- Row 1: Name, Status, Actions -->
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <!-- Status Dot -->
                                        <button @click="handleToggle(job, $event)"
                                            class="btn btn-xs btn-ghost tooltip tooltip-left"
                                            :class="job.enabled ? 'text-success' : 'text-base-content opacity-50'"
                                            :data-tip="job.enabled ? '点击禁用' : '点击启用'">
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
                                            class="badge badge-xs badge-neutral badge-outline font-mono opacity-80">
                                            {{ job.agentId.slice(0, 8) }}
                                        </span>
                                        <span v-if="job.sessionTarget !== 'main'"
                                            class="badge badge-xs badge-outline opacity-60">独立会话</span>
                                        <span v-if="job.wakeMode === 'now'"
                                            class="badge badge-xs badge-outline opacity-60">立即唤醒</span>
                                    </div>
                                </div>

                                <!-- Row 2: Metadata (Stacked) -->
                                <div class="flex flex-col gap-2 mt-3 text-xs opacity-70">
                                    <!-- Line 1: Schedule + Tags -->
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="flex items-center gap-1.5" title="调度规则">
                                            <ClockIcon class="w-3.5 h-3.5" />
                                            <span class="font-mono" v-if="job.schedule.kind === 'every'">
                                                每 {{ parseInt(String(job.schedule.everyMs / (60000))) < 60 ?
                                                    (job.schedule.everyMs / 60000 + 'm') : (Number(job.schedule.everyMs
                                                        / 3600000).toFixed(1).replace(/\.0$/, '') + 'h') }} </span>
                                                    <span class="font-mono" v-else-if="job.schedule.kind === 'at'">
                                                        {{ formatDate(job.schedule.atMs) }}
                                                    </span>
                                                    <span class="font-mono" v-else>
                                                        {{ job.schedule.expr }}
                                                    </span>
                                        </div>



                                        <!-- Actions (Always visible) -->
                                        <div class="flex items-center gap-1">
                                            <button @click="handleRun(job, $event)"
                                                class="btn btn-xs btn-ghost border-base-300 tooltip tooltip-left"
                                                :disabled="runningJobId === job.id" data-tip="立即运行">
                                                <span v-if="runningJobId === job.id"
                                                    class="loading loading-spinner loading-xs"></span>
                                                <BoltIcon v-else class="w-3.5 h-3.5" />
                                            </button>
                                            <button @click.stop="handleOpenEdit(job)"
                                                class="btn btn-xs btn-ghost tooltip tooltip-left" data-tip="编辑">
                                                <PencilSquareIcon class="w-3.5 h-3.5" />
                                            </button>

                                            <button @click="handleRemove(job, $event)"
                                                class="btn btn-xs btn-ghost text-error/50 hover:text-error tooltip tooltip-left"
                                                data-tip="删除">
                                                <XMarkIcon class="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Line 2: Payload -->
                                    <div class="flex items-center gap-1.5 min-w-0 w-full" title="执行内容">
                                        <span class="opacity-60 shrink-0">{{ job.payload.kind === 'systemEvent' ? '事件' :
                                            '消息' }}:</span>
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
                                <span class="label-text">任务名称</span>
                            </div>
                            <input v-model="form.name" type="text" class="input input-bordered w-full"
                                placeholder="例如：每日简报" />
                        </label>

                        <!-- Agent ID (Select) -->
                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">智能体 ID</span>
                            </div>
                            <select v-model="form.agentId" class="select select-bordered w-full">
                                <option value="default">默认 (default)</option>
                                <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                                    {{ agent.name }} ({{ agent.id }})
                                </option>
                            </select>
                        </label>
                    </div>

                    <!-- Description -->
                    <label class="form-control w-full">
                        <div class="label">
                            <span class="label-text">描述</span>
                        </div>
                        <input v-model="form.description" type="text" class="input input-bordered w-full"
                            placeholder="任务描述..." />
                    </label>


                    <!-- Scheduler -->
                    <div class="divider mt-5">调度配置</div>

                    <label class="form-control w-full">
                        <div class="label">
                            <span class="label-text">调度类型</span>
                        </div>
                        <select v-model="form.scheduleKind" class="select select-bordered w-full">
                            <option value="every">每隔 (间隔)</option>
                            <option value="at">特定时间点</option>
                            <option value="cron">Cron 表达式</option>
                        </select>
                    </label>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start pt-2">
                        <!-- Schedule Details (Conditional) -->
                        <div v-if="form.scheduleKind === 'every'" class="contents">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">间隔数值</span>
                                </div>
                                <input v-model="form.everyAmount" type="number" class="input input-bordered w-full" />
                            </label>
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">单位</span>
                                </div>
                                <select v-model="form.everyUnit" class="select select-bordered w-full">
                                    <option value="minutes">分钟</option>
                                    <option value="hours">小时</option>
                                    <option value="days">天</option>
                                </select>
                            </label>
                        </div>

                        <div v-if="form.scheduleKind === 'at'" class="col-span-1 sm:col-span-2">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">执行时间</span>
                                </div>
                                <input v-model="form.scheduleAt" type="datetime-local"
                                    class="input input-bordered w-full" />
                            </label>
                        </div>

                        <div v-if="form.scheduleKind === 'cron'" class="contents">
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">Cron 表达式</span>
                                </div>
                                <input v-model="form.cronExpr" type="text" class="input input-bordered w-full"
                                    placeholder="* * * * *" />
                            </label>
                            <label class="form-control w-full">
                                <div class="label">
                                    <span class="label-text">时区 (可选)</span>
                                </div>
                                <input v-model="form.cronTz" type="text" class="input input-bordered w-full"
                                    placeholder="UTC" />
                            </label>
                        </div>
                    </div>

                    <!-- Target / Payload -->
                    <div class="divider">执行内容</div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">会话目标</span>
                            </div>
                            <select v-model="form.sessionTarget" class="select select-bordered w-full">
                                <option value="main">主会话</option>
                                <option value="isolated">独立会话</option>
                            </select>
                        </label>

                        <label class="form-control w-full">
                            <div class="label">
                                <span class="label-text">唤醒模式</span>
                            </div>
                            <select v-model="form.wakeMode" class="select select-bordered w-full">
                                <option value="next-heartbeat">等待下次心跳 (Next Heartbeat)</option>
                                <option value="now">立即唤醒 (Now)</option>
                            </select>
                        </label>

                        <label class="form-control w-full sm:col-span-2">
                            <div class="label">
                                <span class="label-text">负载类型</span>
                            </div>
                            <select v-model="form.payloadKind" class="select select-bordered w-full">
                                <option value="systemEvent">系统事件 (System Event)</option>
                                <option value="agentTurn">Agent 对话 (Agent Turn)</option>
                            </select>
                        </label>
                    </div>


                    <fieldset class="fieldset w-full">
                        <legend class="fieldset-legend">{{ form.payloadKind === 'systemEvent' ? '系统事件内容' : '消息内容'
                        }}</legend>
                        <textarea v-model="form.payloadText" class="textarea w-full h-24"
                            placeholder="输入内容..."></textarea>
                        <div class="label"></div>
                    </fieldset>

                    <!-- Enabled (Toggle) -->
                    <div class="form-control">
                        <label class="label cursor-pointer justify-start gap-3">
                            <span class="label-text">启用此任务</span>
                            <input v-model="form.enabled" type="checkbox" class="toggle toggle-primary" />
                        </label>
                    </div>

                </div>

                <!-- Error Display -->
                <div v-if="modalError" class="alert alert-error mt-4">
                    <span class="text-sm">{{ modalError }}</span>
                </div>

                <div class="modal-action">
                    <button class="btn" @click="closeModal">取消</button>
                    <button class="btn btn-primary" @click="handleSave" :disabled="isBusy">
                        <span v-if="isBusy" class="loading loading-spinner"></span>
                        {{ editingId ? '保存更改' : '创建任务' }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>关闭</button>
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
                    执行日志: {{ logsJob?.name }}
                </h3>

                <div v-if="logsLoading" class="flex justify-center py-8">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <div v-else-if="gatewayStore.cronError" class="alert alert-error my-4">
                    <span>{{ gatewayStore.cronError }}</span>
                </div>

                <div v-else-if="cronRunLogs.length === 0" class="text-center py-8 opacity-50">
                    暂无执行记录
                </div>

                <div v-else class="overflow-x-auto max-h-[60vh]">
                    <table class="table table-zebra table-xs sm:table-sm w-full font-mono">
                        <thead>
                            <tr>
                                <th>时间</th>
                                <th>状态</th>
                                <th>耗时</th>
                                <th>信息</th>
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
                            第 {{ page }} / {{ totalPages }} 页 (共 {{ cronRunsTotal }} 条)
                        </span>
                    </div>

                    <div class="flex gap-2">
                        <!-- Pagination controls hidden -->
                        <form method="dialog">
                            <button class="btn btn-sm">关闭</button>
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
