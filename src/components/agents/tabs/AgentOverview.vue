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
