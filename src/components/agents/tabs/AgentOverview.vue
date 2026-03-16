<script setup lang="ts">
import { computed, ref } from 'vue'
import { useToast } from '../../../composables/useToast'

import { useModelsState } from '../../../composables/useModelsState'
import { AgentInfo, useAgentsState } from '../../../composables/useAgentsState'
import { useI18n } from 'vue-i18n'
import {
    FingerPrintIcon,
    ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'


// Props
const props = defineProps<{
    agent: AgentInfo
}>()

const emit = defineEmits<{
    (e: 'deleted'): void
}>()

const toast = useToast()
const agentsState = useAgentsState()
const modelsState = useModelsState()

const { t } = useI18n()



// Current model binding — uses agent.defaultModel via updateAgent API
const currentModel = computed({
    get: () => {
        if (props.agent?.defaultProvider && props.agent?.defaultModel) {
            return `${props.agent.defaultProvider}/${props.agent.defaultModel}`
        }
        return ''
    },
    set: async (val: string) => {
        try {
            const [provider, ...rest] = val.split('/')
            const model = rest.join('/')
            await agentsState.updateAgent({
                agentId: props.agent.id,
                defaultModel: model,
                defaultProvider: provider
            })
        } catch (err: any) {
            toast.error(err.message || String(err))
        }
    }
})

// Top-level alias so Vue auto-unwraps in template
const availableModels = modelsState.availableModels

const isCurrentModelAvailable = computed(() => {
    const val = currentModel.value
    if (!val) return true
    for (const group of availableModels.value) {
        if (group.models.some((m: any) => `${group.provider}/${m.id}` === val)) return true
    }
    return false
})


const allowPeerAccess = computed({
    get: () => props.agent?.allowPeerAccess ?? false,
    set: async (val: boolean) => {
        try {
            await agentsState.updateAgent({
                agentId: props.agent.id,
                allowPeerAccess: val
            })
        } catch (err: any) {
            toast.error(err.message || String(err))
        }
    }
})

const defaultThinkingLevel = computed({
    get: () => props.agent?.defaultThinkingLevel || 'off',
    set: async (val: string) => {
        try {
            await agentsState.updateAgent({
                agentId: props.agent.id,
                defaultThinkingLevel: val
            })
        } catch (err: any) {
            toast.error(err.message || String(err))
        }
    }
})

const steeringMode = computed({
    get: () => props.agent?.steeringMode || 'all',
    set: async (val: string) => {
        try {
            await agentsState.updateAgent({
                agentId: props.agent.id,
                steeringMode: val
            })
        } catch (err: any) {
            toast.error(err.message || String(err))
        }
    }
})

const followUpMode = computed({
    get: () => props.agent?.followUpMode || 'all',
    set: async (val: string) => {
        try {
            await agentsState.updateAgent({
                agentId: props.agent.id,
                followUpMode: val
            })
        } catch (err: any) {
            toast.error(err.message || String(err))
        }
    }
})

const hideThinkingBlock = computed({
    get: () => props.agent?.hideThinkingBlock ?? false,
    set: async (val: boolean) => {
        try {
            await agentsState.updateAgent({
                agentId: props.agent.id,
                hideThinkingBlock: val
            })
        } catch (err: any) {
            toast.error(err.message || String(err))
        }
    }
})

const compactionModal = ref<HTMLDialogElement | null>(null)
const compactionSettings = ref<{
    enabled: boolean;
    reserveTokens: number;
    keepRecentTokens: number;
}>({
    enabled: false,
    reserveTokens: 16384,
    keepRecentTokens: 20000
})

const openCompactionModal = () => {
    const c = props.agent?.compaction;
    let enabled = false;
    let reserveTokens = 16384;
    let keepRecentTokens = 20000;

    if (typeof c === 'boolean') {
        enabled = c;
    } else if (c && typeof c === 'object') {
        enabled = c.enabled ?? false;
        reserveTokens = c.reserveTokens ?? 16384;
        keepRecentTokens = c.keepRecentTokens ?? 20000;
    }

    compactionSettings.value = { enabled, reserveTokens, keepRecentTokens }
    compactionModal.value?.showModal()
}

const saveCompaction = async () => {
    try {
        await agentsState.updateAgent({
            agentId: props.agent.id,
            compaction: { ...compactionSettings.value }
        })
        toast.success(t('common.savedSuccess'))
        compactionModal.value?.close()
    } catch (err: any) {
        toast.error(err.message || String(err))
    }
}

const branchSummaryModal = ref<HTMLDialogElement | null>(null)
const branchSummarySettings = ref<{
    reserveTokens: number;
    skipPrompt: boolean;
}>({
    reserveTokens: 2000,
    skipPrompt: false
})

const openBranchSummaryModal = () => {
    const b = props.agent?.branchSummary;
    let reserveTokens = 2000;
    let skipPrompt = false;

    if (b && typeof b === 'object') {
        reserveTokens = b.reserveTokens ?? 2000;
        skipPrompt = b.skipPrompt ?? false;
    }

    branchSummarySettings.value = { reserveTokens, skipPrompt }
    branchSummaryModal.value?.showModal()
}

const saveBranchSummary = async () => {
    try {
        await agentsState.updateAgent({
            agentId: props.agent.id,
            branchSummary: { ...branchSummarySettings.value }
        })
        toast.success(t('common.savedSuccess'))
        branchSummaryModal.value?.close()
    } catch (err: any) {
        toast.error(err.message || String(err))
    }
}

const retryModal = ref<HTMLDialogElement | null>(null)
const retrySettings = ref<{
    enabled: boolean;
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
}>({
    enabled: false,
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
})

const openRetryModal = () => {
    const r = props.agent?.retry;
    let enabled = false;
    let maxRetries = 3;
    let baseDelayMs = 1000;
    let maxDelayMs = 10000;

    if (typeof r === 'number') {
        enabled = r > 0;
        maxRetries = r;
    } else if (r && typeof r === 'object') {
        enabled = r.enabled ?? false;
        maxRetries = r.maxRetries ?? 3;
        baseDelayMs = r.baseDelayMs ?? 1000;
        maxDelayMs = r.maxDelayMs ?? 10000;
    }

    retrySettings.value = { enabled, maxRetries, baseDelayMs, maxDelayMs }
    retryModal.value?.showModal()
}

const saveRetry = async () => {
    try {
        await agentsState.updateAgent({
            agentId: props.agent.id,
            retry: { ...retrySettings.value }
        })
        toast.success(t('common.savedSuccess'))
        retryModal.value?.close()
    } catch (err: any) {
        toast.error(err.message || String(err))
    }
}

// Delete Agent Logic
import { useRouter } from 'vue-router'
import { useConfirm } from '../../../composables/useConfirm'
import { useChatState } from '../../../composables/useChatState'

const router = useRouter()
const chatState = useChatState()
const { confirm } = useConfirm()
const isDeleting = ref(false)

const handleDeleteAgent = async () => {
    if (!await confirm(t('agent.deleteConfirm', { name: props.agent.name }))) {
        return
    }

    isDeleting.value = true
    try {
        const agentId = props.agent.id
        await agentsState.deleteAgent({ agentId, deleteFiles: true })

        // 如果删除的是当前选中的 agent，清空选择
        if (chatState.agentsSelectedId === agentId) {
            chatState.selectAgent('')
        }

        toast.success(t('agent.deleteSuccess'))

        // Redirect
        router.replace({ name: 'agents' })

    } catch (err: any) {
        console.error('Failed to delete agent:', err)
        toast.error(t('agent.deleteFailed', { error: String(err.message || err) }))
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <div>
        <div class="space-y-6 pb-20 md:pb-6">
            <div class="space-y-2">
                <h4 class="text-sm font-medium text-base-content/60 px-2 flex items-center gap-2">
                    <FingerPrintIcon class="w-4 h-4" />
                    {{ $t('agent.basicInfo') }}
                </h4>
                <div class="card bg-base-100 shadow-sm overflow-hidden">
                    <ul class="divide-y divide-base-300">
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.workspace') }}</span>
                            <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70 truncate max-w-[200px] md:max-w-md"
                                :title="agent.workspaceDir">
                                {{ agent.workspaceDir || '-' }}
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.agentDir') }}</span>
                            <div class="font-mono text-xs bg-base-200 px-2 py-1 rounded text-base-content/70 truncate max-w-[200px] md:max-w-md"
                                :title="agent.agentDir">
                                {{ agent.agentDir || '-' }}
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.mainModel') }}</span>

                            <div class="flex-1 max-w-[250px] flex flex-col items-end gap-1">
                                <select v-model="currentModel" class="select select-bordered w-full">
                                    <option value="" disabled>{{ $t('agent.selectModel') }}</option>
                                    <option v-if="!isCurrentModelAvailable && currentModel" :value="currentModel">
                                        {{ currentModel }} ({{ $t('agent.unknownModel') }})
                                    </option>
                                    <optgroup v-for="group in availableModels" :key="group.provider"
                                        :label="group.provider">
                                        <option v-for="model in group.models" :key="model.id"
                                            :value="`${group.provider}/${model.id}`" class="w-100 truncate block">
                                            {{ model.name }}
                                        </option>
                                    </optgroup>
                                </select>
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('chat.thinkingLevel') }}</span>
                            <div class="flex-1 max-w-[250px] flex flex-col items-end gap-1">
                                <select v-model="defaultThinkingLevel" class="select select-bordered select-sm w-full font-sans">
                                    <option value="off">{{ $t('chat.thinkingLevels.off') }}</option>
                                    <option value="minimal">{{ $t('chat.thinkingLevels.minimal') }}</option>
                                    <option value="low">{{ $t('chat.thinkingLevels.low') }}</option>
                                    <option value="medium">{{ $t('chat.thinkingLevels.medium') }}</option>
                                    <option value="high">{{ $t('chat.thinkingLevels.high') }}</option>
                                    <option value="xhigh">{{ $t('chat.thinkingLevels.xhigh') }}</option>
                                </select>
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.steeringMode') }}</span>
                            <div class="flex-1 max-w-[250px] flex flex-col items-end gap-1">
                                <select v-model="steeringMode" class="select select-bordered select-sm w-full font-sans">
                                    <option value="all">{{ $t('agent.modeAll') }}</option>
                                    <option value="one-at-a-time">{{ $t('agent.modeOneAtATime') }}</option>
                                </select>
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.followUpMode') }}</span>
                            <div class="flex-1 max-w-[250px] flex flex-col items-end gap-1">
                                <select v-model="followUpMode" class="select select-bordered select-sm w-full font-sans">
                                    <option value="all">{{ $t('agent.modeAll') }}</option>
                                    <option value="one-at-a-time">{{ $t('agent.modeOneAtATime') }}</option>
                                </select>
                            </div>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.compactionSettings') }}</span>
                            <button class="btn btn-sm btn-outline font-sans" @click="openCompactionModal">{{ $t('common.settings') }}</button>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.branchSummarySettings') }}</span>
                            <button class="btn btn-sm btn-outline font-sans" @click="openBranchSummaryModal">{{ $t('common.settings') }}</button>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.retrySettings') }}</span>
                            <button class="btn btn-sm btn-outline font-sans" @click="openRetryModal">{{ $t('common.settings') }}</button>
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <span class="font-medium text-base-content/90">{{ $t('agent.hideThinkingBlock') }}</span>
                            <input type="checkbox" v-model="hideThinkingBlock" class="toggle toggle-primary toggle-sm" />
                        </li>
                        <li class="flex items-center justify-between p-4 bg-base-100">
                            <div>
                                <h5 class="font-medium text-base-content/90">{{ $t('agent.allowPeerAccess') }}</h5>
                                <p class="text-xs text-base-content/60 mt-1 max-w-[200px] md:max-w-md">
                                    {{ $t('agent.allowPeerAccessDesc') }}
                                </p>
                            </div>
                            <input type="checkbox" v-model="allowPeerAccess" class="toggle toggle-primary toggle-sm" />
                        </li>
                    </ul>
                </div>
            </div>

            <dialog ref="compactionModal" class="modal">
                <div class="modal-box">
                    <h3 class="font-bold text-lg mb-2">{{ $t('agent.compactionSettings') }}</h3>
                    <p class="text-sm text-base-content/70 mb-4">{{ $t('agent.compactionSettingsDesc') }}</p>

                    <div class="form-control w-full mb-4">
                        <label class="label cursor-pointer justify-start gap-4">
                            <input type="checkbox" v-model="compactionSettings.enabled" class="toggle toggle-primary" />
                            <span class="label-text">{{ $t('agent.compactionEnabled') }}</span>
                        </label>
                    </div>

                    <div class="form-control w-full mb-4">
                        <label class="label">
                            <span class="label-text">{{ $t('agent.compactionReserveTokens') }}</span>
                        </label>
                        <input type="number" v-model.number="compactionSettings.reserveTokens"
                            class="input input-bordered w-full" :disabled="!compactionSettings.enabled" />
                    </div>

                    <div class="form-control w-full mb-6">
                        <label class="label">
                            <span class="label-text">{{ $t('agent.compactionKeepRecentTokens') }}</span>
                        </label>
                        <input type="number" v-model.number="compactionSettings.keepRecentTokens"
                            class="input input-bordered w-full" :disabled="!compactionSettings.enabled" />
                    </div>

                    <div class="modal-action mt-0">
                        <form method="dialog">
                            <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                        </form>
                        <button class="btn btn-primary px-8" @click="saveCompaction">{{ $t('common.save') }}</button>
                    </div>
                </div>
                <form method="dialog" class="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>

            <dialog ref="branchSummaryModal" class="modal">
                <div class="modal-box">
                    <h3 class="font-bold text-lg mb-2">{{ $t('agent.branchSummarySettings') }}</h3>
                    <p class="text-sm text-base-content/70 mb-4">{{ $t('agent.branchSummarySettingsDesc') }}</p>

                    <div class="form-control w-full mb-4">
                        <label class="label">
                            <span class="label-text">{{ $t('agent.branchSummaryReserveTokens') }}</span>
                        </label>
                        <input type="number" v-model.number="branchSummarySettings.reserveTokens" class="input input-bordered w-full" />
                    </div>

                    <div class="form-control w-full mb-6">
                        <label class="label cursor-pointer justify-start gap-4">
                            <input type="checkbox" v-model="branchSummarySettings.skipPrompt" class="toggle toggle-primary" />
                            <span class="label-text">{{ $t('agent.branchSummarySkipPrompt') }}</span>
                        </label>
                    </div>

                    <div class="modal-action mt-0">
                        <form method="dialog">
                            <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                        </form>
                        <button class="btn btn-primary px-8" @click="saveBranchSummary">{{ $t('common.save') }}</button>
                    </div>
                </div>
                <form method="dialog" class="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>

            <dialog ref="retryModal" class="modal">
                <div class="modal-box">
                    <h3 class="font-bold text-lg mb-2">{{ $t('agent.retrySettings') }}</h3>
                    <p class="text-sm text-base-content/70 mb-4">{{ $t('agent.retrySettingsDesc') }}</p>

                    <div class="form-control w-full mb-4">
                        <label class="label cursor-pointer justify-start gap-4">
                            <input type="checkbox" v-model="retrySettings.enabled" class="toggle toggle-primary" />
                            <span class="label-text">{{ $t('agent.retryEnabled') }}</span>
                        </label>
                    </div>

                    <div class="form-control w-full mb-4">
                        <label class="label">
                            <span class="label-text">{{ $t('agent.retryMaxRetries') }}</span>
                        </label>
                        <input type="number" v-model.number="retrySettings.maxRetries"
                            class="input input-bordered w-full" :disabled="!retrySettings.enabled" />
                    </div>

                    <div class="form-control w-full mb-4">
                        <label class="label">
                            <span class="label-text">{{ $t('agent.retryBaseDelayMs') }}</span>
                        </label>
                        <input type="number" v-model.number="retrySettings.baseDelayMs"
                            class="input input-bordered w-full" :disabled="!retrySettings.enabled" />
                    </div>

                    <div class="form-control w-full mb-6">
                        <label class="label">
                            <span class="label-text">{{ $t('agent.retryMaxDelayMs') }}</span>
                        </label>
                        <input type="number" v-model.number="retrySettings.maxDelayMs"
                            class="input input-bordered w-full" :disabled="!retrySettings.enabled" />
                    </div>

                    <div class="modal-action mt-0">
                        <form method="dialog">
                            <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                        </form>
                        <button class="btn btn-primary px-8" @click="saveRetry">{{ $t('common.save') }}</button>
                    </div>
                </div>
                <form method="dialog" class="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>

            <!-- Danger Zone -->
            <div class="space-y-2 pt-6 border-t border-base-200/50">
                <h4 class="text-sm font-medium text-error/80 px-2 flex items-center gap-2">
                    <ExclamationTriangleIcon class="w-4 h-4" />
                    {{ $t('agent.dangerZone') }}
                </h4>
                <div class="card bg-base-100 border border-error/20 shadow-sm overflow-hidden">
                    <div class="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <h3 class="font-medium text-base-content">{{ $t('agent.deleteAgent') }}</h3>
                            <p class="text-sm text-base-content/60 mt-1">
                                {{ $t('agent.deleteAgentDesc') }}
                            </p>
                        </div>
                        <button class="btn btn-error btn-outline md:btn-wide" @click="handleDeleteAgent"
                            :disabled="isDeleting">
                            <span v-if="isDeleting" class="loading loading-spinner loading-sm"></span>
                            {{ isDeleting ? $t('agent.deleting') : $t('agent.deleteAgent') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>


    </div>
</template>
