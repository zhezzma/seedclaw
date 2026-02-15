<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
    PlusIcon,
    PencilSquareIcon,
    XMarkIcon,
    BoltIcon, // Added
    ListBulletIcon, // Added
    ClockIcon, // Added
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { useUiSettingsStore } from '../stores/setting'
import { useToast } from '../composables/useToast'
import { useCronState, type TaskJob, type CronRunLogEntry } from '../composables/useCronState'
import { useAgentsState } from '../composables/useAgentsState'
import { useConfirm } from '../composables/useConfirm'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const settingsStore = useUiSettingsStore()
const toastStore = useToast()
const { confirm } = useConfirm()
const { t } = useI18n()
const cronState = useCronState()
const agentsState = useAgentsState()

// --- Form State ---
interface SimpleCronForm {
    cron: string
    agentId: string
    prompt: string
    enabled: boolean
}

const defaultForm: SimpleCronForm = {
    cron: '*/30 * * * *',
    agentId: 'main',
    prompt: '',
    enabled: true,
}

const form = ref<SimpleCronForm>({ ...defaultForm })
const editingId = ref<string | null>(null)
const runningJobId = ref<string | null>(null)
const modalError = ref<string | null>(null)

// Logs State
const logsJob = ref<TaskJob | null>(null)
const logsLoading = ref(false)
const cronRunLogs = computed(() => cronState.cronRuns as CronRunLogEntry[])

const isLoading = computed(() => cronState.cronLoading)
const isBusy = computed(() => cronState.cronBusy)
const jobs = computed(() => cronState.cronJobs as TaskJob[])
const agents = computed(() => agentsState.agentsList || [])

const modalTitle = computed(() => editingId.value ? t('cron.editJob') : t('cron.newJobModal'))

// --- Helpers ---
const formatDate = (ts: number | string | undefined) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleString('zh-CN')
}

// --- Actions ---
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

const handleOpenEdit = (job: TaskJob) => {
    editingId.value = job.id
    modalError.value = null
    form.value = {
        cron: job.cron,
        agentId: job.agentId || 'main',
        prompt: job.prompt || '',
        enabled: job.enabled
    }
    openModal()
}

const handleSave = async () => {
    cronState.cronForm = { ...form.value } // Align with composable's expected form state (mapped)
    modalError.value = null
    try {
        if (editingId.value) {
            await cronState.updateCronJob(editingId.value)
        } else {
            await cronState.addCronJob()
        }
        closeModal()
    } catch (err: any) {
        modalError.value = err?.message || String(err)
    }
}

const handleToggle = async (job: TaskJob, e: Event) => {
    e.stopPropagation()
    await cronState.toggleCronJob(job, !job.enabled)
}

const handleRemove = async (job: TaskJob, e: Event) => {
    e.stopPropagation()
    if (!await confirm(t('cron.confirmDelete'))) return
    await cronState.removeCronJob(job)
}

const handleRun = async (job: TaskJob, e: Event) => {
    e.stopPropagation()
    if (!await confirm(t('cron.confirmRun'))) return
    runningJobId.value = job.id
    try {
        await cronState.runCronJob(job)
        if (logsJob.value?.id === job.id) {
            // Reload logs if viewing this job
            await cronState.loadCronRuns(job.id)
        }
    } catch (err: any) {
        toastStore.error(err?.message || String(err))
    } finally {
        runningJobId.value = null
    }
}

const handleViewLogs = async (job: TaskJob) => {
    logsJob.value = job
    logsLoading.value = true
    const modal = document.getElementById('logs_modal') as HTMLDialogElement
    if (modal) modal.showModal()
    try {
        await cronState.loadCronRuns(job.id)
    } finally {
        logsLoading.value = false
    }
}

onMounted(() => {
    void cronState.loadCron()
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
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

        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            <div class="mx-auto space-y-6 w-full" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">
                <!-- Jobs List -->
                <div>
                    <p v-if="cronState.cronLoading && jobs.length === 0" class="text-center py-8 opacity-50">{{
                        $t('common.loading') }}</p>
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
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <button @click="handleToggle(job, $event)"
                                            class="btn btn-xs btn-ghost tooltip tooltip-top"
                                            :class="job.enabled ? 'text-success' : 'text-base-content opacity-50'"
                                            :data-tip="job.enabled ? $t('cron.clickToDisable') : $t('cron.clickToEnable')">
                                            <div class="w-2 h-2 rounded-full"
                                                :class="job.enabled ? 'bg-success' : 'bg-base-content/30'"></div>
                                        </button>
                                        <h4 class="font-bold text-base truncate font-mono">{{ job.cron }}</h4>
                                    </div>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <span v-if="job.agentId"
                                            class="badge badge-xs badge-outline font-mono opacity-80">{{
                                            job.agentId.slice(0, 8) }}</span>
                                    </div>
                                </div>

                                <div class="flex flex-col gap-2 mt-3 text-xs opacity-70">
                                    <div class="truncate block" :title="job.prompt">{{ job.prompt || '(No prompt)' }}
                                    </div>
                                    <div class="flex items-center justify-between mt-2">
                                        <span class="opacity-50">Created: {{ formatDate(job.createdAt) }}</span>
                                        <div class="flex items-center gap-1">
                                            <button @click="handleRun(job, $event)"
                                                class="btn btn-xs btn-ghost border-base-content/20"
                                                :disabled="runningJobId === job.id" title="Run Now">
                                                <span v-if="runningJobId === job.id"
                                                    class="loading loading-spinner loading-xs"></span>
                                                <BoltIcon v-else class="w-3.5 h-3.5" />
                                            </button>
                                            <button @click.stop="handleOpenEdit(job)" class="btn btn-xs btn-ghost"
                                                title="Edit">
                                                <PencilSquareIcon class="w-3.5 h-3.5" />
                                            </button>
                                            <button @click="handleRemove(job, $event)"
                                                class="btn btn-xs btn-ghost text-error/50 hover:text-error"
                                                title="Delete">
                                                <XMarkIcon class="w-3.5 h-3.5" />
                                            </button>
                                        </div>
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
                    <label class="form-control w-full">
                        <div class="label"><span class="label-text">Cron Expression</span></div>
                        <input v-model="form.cron" type="text" class="input input-bordered w-full font-mono"
                            placeholder="* * * * *" />
                    </label>
                    <label class="form-control w-full">
                        <div class="label"><span class="label-text">{{ $t('cron.form.agentId') }}</span></div>
                        <select v-model="form.agentId" class="select select-bordered w-full">
                            <option value="main">Main</option>
                            <option v-for="agent in agents" :key="agent.id" :value="agent.id">{{ agent.name }} ({{
                                agent.id }})
                            </option>
                        </select>
                    </label>
                    <label class="form-control w-full">
                        <div class="label"><span class="label-text">Prompt</span></div>
                        <textarea v-model="form.prompt" class="textarea textarea-bordered h-24"
                            placeholder="Enter prompt to run..."></textarea>
                    </label>
                    <div class="form-control">
                        <label class="label cursor-pointer justify-start gap-3">
                            <span class="label-text">{{ $t('cron.form.enableJob') }}</span>
                            <input v-model="form.enabled" type="checkbox" class="toggle toggle-primary" />
                        </label>
                    </div>
                </div>
                <!-- Error Display -->
                <div v-if="modalError" class="alert alert-error mt-4"><span class="text-sm">{{ modalError }}</span>
                </div>
                <div class="modal-action">
                    <button class="btn" @click="closeModal">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="handleSave" :disabled="isBusy">
                        <span v-if="isBusy" class="loading loading-spinner"></span>
                        {{ editingId ? $t('common.saveChanges') : $t('cron.createJob') }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop"><button>{{ $t('common.close') }}</button></form>
        </dialog>

        <!-- Logs Modal -->
        <dialog id="logs_modal" class="modal">
            <div class="modal-box w-full max-w-2xl">
                <form method="dialog"><button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                    <ListBulletIcon class="w-5 h-5" /> {{ $t('cron.logs.title') }}
                </h3>
                <div v-if="logsLoading" class="flex justify-center py-8"><span
                        class="loading loading-spinner loading-lg"></span></div>
                <div v-else-if="cronState.cronError" class="alert alert-error my-4"><span>{{ cronState.cronError
                        }}</span></div>
                <div v-else-if="cronRunLogs.length === 0" class="text-center py-8 opacity-50">{{ $t('cron.logs.noLogs')
                    }}</div>
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
                                    <span class="badge badge-xs"
                                        :class="{ 'badge-success': log.status === 'ok', 'badge-error': log.status === 'error', 'badge-warning': log.status === 'skipped' }">{{
                                        log.status }}</span>
                                </td>
                                <td>{{ log.durationMs ? log.durationMs + 'ms' : '-' }}</td>
                                <td class="max-w-[200px] truncate" :title="log.error || log.summary">{{ log.error ||
                                    log.summary
                                    || '-' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop"><button>Close</button></form>
        </dialog>
    </div>
</template>
