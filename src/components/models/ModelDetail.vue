<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon, EyeIcon, EyeSlashIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { useGateway } from '../../composables/useGateway'
import ProviderFormModal from './ProviderFormModal.vue'
import { useConfigState } from '../../composables/useConfigState'
import { useConfirm } from '../../composables/useConfirm'


interface ModelConfig {
    id: string
    name: string
    reasoning?: boolean
    input?: string[]
    contextWindow?: number
    maxTokens?: number
    cost?: {
        input: number
        output: number
        cacheRead?: number
        cacheWrite?: number
    }
    compat?: {
        supportsDeveloperRole?: boolean
    }
}

const props = defineProps<{
    providerId: string
}>()

const store = useGateway()
const { t } = useI18n()
const configState = useConfigState()
const { confirm } = useConfirm()

// Get provider from configForm
const provider = computed(() => {
    const providersObj = (configState.configForm?.models as any)?.providers as Record<string, any> | undefined
    if (!providersObj || !providersObj[props.providerId]) return null
    return {
        id: props.providerId,
        ...providersObj[props.providerId]
    }
})

const models = computed<ModelConfig[]>(() => {
    return provider.value?.models || []
})

// Sync agents.defaults.models with all available models from providers
import { useModels } from '../../composables/useModels'

const { syncAgentsDefaultModels } = useModels()

// Sync models from OpenAI-compatible API
const syncing = ref(false)
const syncError = ref('')

const syncModels = async () => {
    if (!provider.value?.baseUrl || !provider.value?.apiKey) {
        syncError.value = t('model.missingConfig')
        return
    }

    syncing.value = true
    syncError.value = ''

    try {
        // Build headers
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${provider.value.apiKey}`,
            'Content-Type': 'application/json'
        }
        // Add custom headers if any
        if (provider.value.headers && typeof provider.value.headers === 'object') {
            Object.assign(headers, provider.value.headers)
        }

        // Fetch models from OpenAI-compatible endpoint
        const baseUrl = provider.value.baseUrl.replace(/\/$/, '')
        const response = await fetch(`${baseUrl}/models`, { headers })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        const fetchedModels = data.data || data.models || []

        if (!Array.isArray(fetchedModels) || fetchedModels.length === 0) {
            syncError.value = t('model.fetchError')
            return
        }

        // Merge with existing models
        const currentModels = [...models.value]
        const modelMap = new Map(currentModels.map(m => [m.id, m]))

        for (const fetched of fetchedModels) {
            const modelId = fetched.id || fetched.name
            if (!modelId) continue

            if (modelMap.has(modelId)) {
                // Update existing - keep user's custom settings
                const existing = modelMap.get(modelId)!
                existing.name = existing.name || modelId
            } else {
                // Add new model with defaults
                modelMap.set(modelId, {
                    id: modelId,
                    name: modelId,
                    reasoning: false,
                    input: ['text'],
                    contextWindow: 128000,
                    maxTokens: 32000,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    compat: { supportsDeveloperRole: false }
                })
            }
        }

        const mergedModels = Array.from(modelMap.values())

        configState.updateConfigFormValue(
            ['models', 'providers', props.providerId, 'models'],
            mergedModels
        )
        syncAgentsDefaultModels()
        await configState.saveConfig()

    } catch (err: any) {
        syncError.value = err.message || t('model.syncFailed')
        console.error('Sync models error:', err)
    } finally {
        syncing.value = false
    }
}

// Edit Model Modal State
const showModelModal = ref(false)
const isEditing = ref(false)
const editingModelIndex = ref<number>(-1)
const modelForm = ref<ModelConfig>({
    id: '',
    name: '',
    reasoning: false,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 32000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsDeveloperRole: false }
})

const openAddModel = () => {
    isEditing.value = false
    editingModelIndex.value = -1
    modelForm.value = {
        id: '',
        name: '',
        reasoning: false,
        input: ['text'],
        contextWindow: 128000,
        maxTokens: 32000,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: { supportsDeveloperRole: false }
    }
    showModelModal.value = true
}

const openEditModel = (model: ModelConfig, index: number) => {
    isEditing.value = true
    editingModelIndex.value = index
    modelForm.value = {
        id: model.id,
        name: model.name || model.id,
        reasoning: model.reasoning || false,
        input: model.input || ['text'],
        contextWindow: model.contextWindow || 128000,
        maxTokens: model.maxTokens || 32000,
        cost: model.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: model.compat || { supportsDeveloperRole: false }
    }
    showModelModal.value = true
}

const saveModel = async () => {
    if (!modelForm.value.id.trim() || !props.providerId) return

    const currentModels = [...models.value]

    if (isEditing.value && editingModelIndex.value >= 0) {
        // Update existing model
        currentModels[editingModelIndex.value] = { ...modelForm.value }
    } else {
        // Add new model
        currentModels.push({ ...modelForm.value })
    }

    configState.updateConfigFormValue(
        ['models', 'providers', props.providerId, 'models'],
        currentModels
    )
    syncAgentsDefaultModels()
    await configState.saveConfig()

    showModelModal.value = false
}

const deleteModel = async (index: number, modelId: string) => {
    if (await confirm(t('model.deleteConfirm', { id: modelId }))) {
        const currentModels = [...models.value]
        currentModels.splice(index, 1)

        configState.updateConfigFormValue(
            ['models', 'providers', props.providerId, 'models'],
            currentModels
        )
        syncAgentsDefaultModels()
        await configState.saveConfig()
    }
}

const toggleInputCapability = (capability: string) => {
    const current = new Set(modelForm.value.input || [])
    if (current.has(capability)) {
        current.delete(capability)
    } else {
        current.add(capability)
    }
    modelForm.value.input = Array.from(current)
}

// Edit Provider Modal
const showProviderModal = ref(false)

const openEditProvider = () => {
    showProviderModal.value = true
}
</script>

<template>
    <div class="h-full w-full relative">
        <div v-if="provider" class="h-full flex flex-col bg-base-100">
            <!-- Header -->
            <div class="px-6 py-6 border-b border-base-200">
                <div class="flex items-center gap-4">
                    <div
                        class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <span class="text-2xl">🔌</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h1 class="text-xl font-bold truncate">{{ provider.id }}</h1>
                        <p class="text-sm text-base-content/60 truncate">{{ provider.baseUrl }}</p>
                    </div>
                    <button @click="syncModels" class="btn btn-ghost btn-sm" :disabled="syncing">
                        <ArrowPathIcon class="w-4 h-4" :class="syncing ? 'animate-spin' : ''" />
                        {{ $t('common.sync') }}
                    </button>
                    <button @click="openEditProvider" class="btn btn-ghost btn-sm">
                        <PencilIcon class="w-4 h-4" />
                        {{ $t('common.edit') }}
                    </button>
                </div>
                <div v-if="syncError" class="mt-2 text-sm text-error">{{ syncError }}</div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-4 md:p-6">
                <h2 class="text-lg font-semibold mb-4">{{ $t('model.listTitle') }}</h2>

                <!-- Model Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    <!-- Add Model Card -->
                    <div @click="openAddModel"
                        class="aspect-square border-2 border-dashed border-base-300 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                        <PlusIcon class="w-6 h-6 text-base-content/30" />
                        <span class="text-xs text-base-content/50">{{ $t('common.add') }}</span>
                    </div>

                    <!-- Model Cards -->
                    <div v-for="(model, index) in models" :key="model.id" @click="openEditModel(model, index)"
                        class="aspect-square bg-base-200/50 rounded-lg p-3 sm:p-4 flex flex-col cursor-pointer hover:bg-base-200 transition-all group relative">

                        <!-- Delete Button -->
                        <button @click.stop="deleteModel(index, model.id)"
                            class="absolute top-1 right-1 btn btn-ghost btn-xs btn-circle opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity text-error">
                            <XMarkIcon class="w-4 h-4" />
                        </button>

                        <!-- Model Icon -->
                        <div class="text-xl mb-2">🤖</div>

                        <!-- Model Info -->
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-sm truncate">{{ model.name || model.id }}</div>
                            <div class="text-xs text-base-content/50 truncate">{{ model.id }}</div>
                        </div>

                        <!-- Badges -->
                        <div class="flex flex-wrap gap-1 mt-2">
                            <span v-if="model.input?.includes('text')"
                                class="badge badge-ghost badge-outline text-[10px] h-5 px-1.5">{{ $t('model.input.text')
                                }}</span>
                            <span v-if="model.input?.includes('image')"
                                class="badge badge-secondary text-[10px] h-5 px-1.5">{{ $t('model.input.image')
                                }}</span>
                            <span v-if="model.reasoning" class="badge badge-primary text-[10px] h-5 px-1.5">{{
                                $t('model.mode.reasoning') }}</span>
                            <span v-if="model.contextWindow" class="badge badge-ghost text-[10px] h-5 px-1.5">{{
                                (model.contextWindow /
                                    1000).toFixed(0) }}K</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty State -->
        <div v-else class="h-full flex items-center justify-center">
            <div class="text-center">
                <h3 class="font-bold text-lg">{{ $t('provider.notFound') }}</h3>
                <p class="text-base-content/60">{{ $t('provider.notFoundDesc', { id: providerId }) }}</p>
            </div>
        </div>

        <!-- Model Edit Modal -->
        <dialog :class="{ 'modal modal-open': showModelModal, 'modal': !showModelModal }">
            <div class="modal-box max-w-2xl">
                <h3 class="font-bold text-lg mb-4">{{ isEditing ? $t('model.editTitle') : $t('model.addTitle') }}</h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-control">
                        <label class="label"><span class="label-text">{{ $t('model.id') }}</span></label>
                        <input v-model="modelForm.id" type="text" placeholder="gpt-4" class="input input-bordered"
                            :disabled="isEditing" />
                    </div>

                    <div class="form-control">
                        <label class="label"><span class="label-text">{{ $t('model.name') }}</span></label>
                        <input v-model="modelForm.name" type="text" placeholder="GPT-4" class="input input-bordered" />
                    </div>

                    <div class="form-control">
                        <label class="label"><span class="label-text">{{ $t('model.contextWindow') }}</span></label>
                        <input v-model.number="modelForm.contextWindow" type="number" class="input input-bordered" />
                    </div>

                    <div class="form-control">
                        <label class="label"><span class="label-text">{{ $t('model.maxTokens') }}</span></label>
                        <input v-model.number="modelForm.maxTokens" type="number" class="input input-bordered" />
                    </div>

                    <div class="form-control">
                        <label class="label cursor-pointer justify-start gap-3">
                            <input v-model="modelForm.reasoning" type="checkbox" class="checkbox checkbox-primary" />
                            <span class="label-text">{{ $t('model.reasoning') }}</span>
                        </label>
                    </div>

                    <div class="form-control">
                        <label class="label cursor-pointer justify-start gap-3">
                            <input v-model="modelForm.compat!.supportsDeveloperRole" type="checkbox"
                                class="checkbox checkbox-primary" />
                            <span class="label-text">{{ $t('model.developerRole') }}</span>
                        </label>
                    </div>

                    <div class="form-control md:col-span-2">
                        <label class="label"><span class="label-text">{{ $t('model.inputCapabilities') }}</span></label>
                        <div class="flex gap-4">
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="checkbox" class="checkbox" :checked="modelForm.input?.includes('text')"
                                    @change="toggleInputCapability('text')" />
                                <span class="label-text">{{ $t('model.inputText') }}</span>
                            </label>
                            <label class="label cursor-pointer gap-2 justify-start">
                                <input type="checkbox" class="checkbox" :checked="modelForm.input?.includes('image')"
                                    @change="toggleInputCapability('image')" />
                                <span class="label-text">{{ $t('model.inputImage') }}</span>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="modal-action">
                    <button @click="showModelModal = false" class="btn">{{ $t('common.cancel') }}</button>
                    <button @click="saveModel" class="btn btn-primary" :disabled="!modelForm.id.trim()">{{
                        $t('common.save')
                        }}</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="showModelModal = false">close</button>
            </form>
        </dialog>

        <!-- Provider Edit Modal -->
        <ProviderFormModal :show="showProviderModal" mode="edit" :provider-id="providerId" :provider-data="provider"
            @close="showProviderModal = false" />
    </div>
</template>
