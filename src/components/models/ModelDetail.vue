<script setup lang="ts">
import { computed, ref } from 'vue'
import { useModelsState, AvailableModel } from '../../composables/useModelsState'
import { useI18n } from 'vue-i18n'
import { ArrowPathIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/vue/24/outline' // Explicit import just in case
import ProviderFormModal from './ProviderFormModal.vue'
import ModelFormModal from './ModelFormModal.vue'

const props = defineProps<{
    providerId: string
}>()

const { t } = useI18n()
const { providers, loadModels, deleteProvider: deleteProviderAction, syncModels: syncModelsAction, saveModel, deleteModel: deleteModelAction } = useModelsState()

// Get provider from the providers list
const provider = computed(() => {
    return providers.value.find(p => p.id === props.providerId) || null
})

const modelList = computed(() => {
    return provider.value?.models.map(m => ({
        id: m.id,
        name: m.name,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow || 0,
        maxTokens: m.maxTokens || 0,
        // api: m.api, // Not on model level usually
        original: m
    })) || []
})

const formatNumber = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
    return String(n)
}

// Sync
const syncing = ref(false)
const syncError = ref('')
const syncResult = ref('')

const syncModels = async () => {
    syncing.value = true
    syncError.value = ''
    syncResult.value = ''
    try {
        const res = await syncModelsAction(props.providerId)
        syncResult.value = t('model.syncSuccess', { n: res.created })
    } catch (e: any) {
        syncError.value = e.message
    } finally {
        syncing.value = false
    }
}

// Edit Provider Modal
const showEditProviderModal = ref(false)
const openEditProvider = () => {
    showEditProviderModal.value = true
}

const handleProviderSaved = async (id: string) => {
    // Refresh handled by composable usually
}

// Delete Provider
const deleteProvider = async () => {
    if (!confirm(t('provider.confirmDelete', { id: props.providerId }))) return

    try {
        await deleteProviderAction(props.providerId)
    } catch (e: any) {
        alert(e.message || t('provider.deleteFailed'))
    }
}

// Model Modal
const showModelModal = ref(false)
const modelModalMode = ref<'add' | 'edit'>('add')
const selectedModel = ref<AvailableModel | undefined>(undefined)

const openAddModel = () => {
    modelModalMode.value = 'add'
    selectedModel.value = undefined
    showModelModal.value = true
}

const openEditModel = (model: AvailableModel) => {
    modelModalMode.value = 'edit'
    selectedModel.value = model
    showModelModal.value = true
}

const handleModelSaved = async (model: AvailableModel) => {
    try {
        await saveModel(props.providerId, model)
        showModelModal.value = false
    } catch (e: any) {
        alert(e.message)
    }
}

const handleDeleteModel = async (modelId: string) => {
    if (!confirm(t('model.deleteConfirm', { id: modelId }))) return
    try {
        await deleteModelAction(props.providerId, modelId)
    } catch (e: any) {
        alert(e.message)
    }
}

</script>

<template>
    <div class="h-full w-full relative">
        <div v-if="provider" class="h-full flex flex-col bg-base-100">
            <!-- Header -->
            <div class="px-6 py-6 border-b border-base-200">
                <div class="flex items-center gap-2">
                    <div class="flex-1 min-w-0">
                        <h1 class="text-xl font-bold truncate">{{ provider.id }}</h1>
                        <p class="text-sm text-base-content/60 truncate">{{ provider.baseUrl }}</p>
                    </div>
                    <button @click="syncModels" class="btn btn-ghost btn-sm" :disabled="syncing" v-if="provider.custom">
                        <ArrowPathIcon class="w-4 h-4" :class="syncing ? 'animate-spin' : ''" />
                        {{ $t('common.sync') }}
                    </button>
                    <button @click="openEditProvider" class="btn btn-ghost btn-sm">
                        <PencilIcon class="w-4 h-4" />
                        {{ $t('common.edit') }}
                    </button>
                    <button @click="deleteProvider" class="btn btn-ghost btn-sm" v-if="provider.custom">
                        <TrashIcon class="w-4 h-4" />
                        {{ $t('common.delete') }}
                    </button>
                </div>
                <div v-if="syncError" class="mt-2 text-sm text-error">{{ syncError }}</div>
                <div v-if="syncResult" class="mt-2 text-sm text-success">{{ syncResult }}</div>
            </div>


            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-4 md:p-6">
                <h2 class="text-lg font-semibold mb-4 flex items-center justify-between">
                    {{ $t('model.listTitle') }}
                    <button @click="openAddModel" class="btn btn-xs btn-ghost gap-1">
                        <PlusIcon class="w-3 h-3" />
                        {{ $t('common.add') }}
                    </button>
                </h2>

                <!-- Model Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">

                    <!-- Add New Card -->
                    <!-- <div @click="openAddModel"
                        class="aspect-square bg-base-200/30 rounded-lg p-3 sm:p-4 flex flex-col items-center justify-center hover:bg-base-200 transition-all cursor-pointer border-2 border-dashed border-base-content/10 hover:border-primary/50 text-base-content/40 hover:text-primary">
                        <PlusIcon class="w-8 h-8 mb-2" />
                        <span class="text-xs font-semibold">{{ $t('common.add') }}</span>
                    </div> -->

                    <!-- Model Cards -->
                    <div v-for="item in modelList" :key="item.id" @click="openEditModel(item.original)"
                        class="aspect-square cursor-pointer bg-base-200/50 rounded-lg p-3 sm:p-4 flex flex-col hover:bg-base-200 transition-all group relative cursor-default">

                        <!-- Hover Actions -->
                        <div
                            class="absolute top-2 right-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex gap-1 bg-base-100/80 rounded-lg shadow-sm backdrop-blur-sm p-1">
                            <!-- <button @click.stop="openEditModel(item.original)" class="btn btn-ghost btn-xs btn-square">
                                <PencilIcon class="w-3 h-3" />
                            </button> -->
                            <button @click.stop="handleDeleteModel(item.id)"
                                class="btn btn-ghost btn-xs btn-square text-error">
                                <TrashIcon class="w-3 h-3" />
                            </button>
                        </div>

                        <!-- Model Icon -->
                        <div class="text-xl mb-2">🤖</div>

                        <!-- Model Info -->
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-sm truncate" :title="item.name">{{ item.name }}</div>
                            <div class="text-xs text-base-content/50 truncate" :title="item.id">{{ item.id }}</div>
                        </div>

                        <!-- Tags -->
                        <div class="flex flex-wrap gap-1 mt-2">
                            <span v-if="item.reasoning" class="badge badge-xs badge-primary">{{
                                $t('model.mode.reasoning') }}</span>
                            <span v-if="item.contextWindow > 0" class="badge badge-xs badge-ghost">
                                {{ $t('model.ctx') }} {{ formatNumber(item.contextWindow) }}
                            </span>
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

        <!-- Provider Edit Modal -->
        <ProviderFormModal :show="showEditProviderModal" mode="edit" :custom="provider?.custom" :initial-data="provider ? {
            id: provider.id,
            baseUrl: provider.baseUrl,
            api: provider.api,
            apiKey: provider.apiKey,
            headers: provider.headers,
            toolCallBridge: provider.toolCallBridge
        } : undefined" @close="showEditProviderModal = false" @saved="handleProviderSaved" />

        <!-- Model Form Modal -->
        <ModelFormModal :show="showModelModal" :mode="modelModalMode" :provider-id="providerId"
            :initial-data="selectedModel" :custom="provider?.custom" @close="showModelModal = false"
            @save="handleModelSaved" />
    </div>
</template>
