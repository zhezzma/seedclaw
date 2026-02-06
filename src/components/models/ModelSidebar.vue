<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import { useGatewayStore } from '../../stores/gateway'
import ProviderFormModal from './ProviderFormModal.vue'

const props = defineProps<{
    selectedId?: string
}>()

const emit = defineEmits<{
    (e: 'select', id: string): void
}>()

const router = useRouter()
const store = useGatewayStore()

const goBack = () => {
    router.back()
}

// Get providers from configForm
const providers = computed(() => {
    const providersObj = (store.configForm?.models as any)?.providers as Record<string, any> | undefined
    if (!providersObj) return []
    return Object.entries(providersObj).map(([id, config]) => ({
        id,
        baseUrl: config.baseUrl || '',
        apiKey: config.apiKey || '',
        api: config.api || 'openai-completions',
        models: config.models || []
    }))
})

// Add Provider Modal
const showAddModal = ref(false)

const openAddModal = () => {
    showAddModal.value = true
}

const handleProviderSaved = (providerId: string) => {
    emit('select', providerId)
}

const deleteProvider = async (id: string, event: Event) => {
    event.stopPropagation()
    if (confirm(`确定要删除提供商 "${id}" 吗？这将同时删除其所有模型配置。`)) {
        // Get current providers, remove the one with id, then set
        const providersObj = (store.configForm?.models as any)?.providers as Record<string, any> | undefined
        if (providersObj && providersObj[id]) {
            const newProviders = { ...providersObj }
            delete newProviders[id]
            store.updateConfigFormValue(
                ['models', 'providers'],
                newProviders
            )
            // Sync agents.defaults.models
            syncAgentsDefaultModels(newProviders)
            await store.saveConfig()
        }
    }
}

// Sync agents.defaults.models with all available models from providers
import { useModelConfig } from '../../composables/useModelConfig'

const { syncAgentsDefaultModels } = useModelConfig()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100 border-r border-base-200">
        <!-- Header -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-200 min-h-[4rem]">
            <div class="flex-1 flex gap-2 items-center">
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle lg:hidden">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <span class="text-lg font-semibold px-4">模型提供商</span>
            </div>
            <div class="flex-none">
                <button @click="openAddModal" class="btn btn-ghost btn-sm btn-circle">
                    <PlusIcon class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- Provider List -->
        <div class="flex-1 overflow-y-auto">
            <div v-if="providers.length === 0"
                class="flex flex-col items-center justify-center h-full p-8 text-base-content/50">
                <div class="text-4xl mb-4">📦</div>
                <p class="text-center">暂无模型提供商</p>
                <p class="text-sm text-center mt-2">点击右上角 + 号添加</p>
            </div>

            <ul v-else>
                <li v-for="provider in providers" :key="provider.id" @click="$emit('select', provider.id)"
                    class="group flex items-stretch pl-4 cursor-pointer hover:bg-base-200/50 transition-colors"
                    :class="selectedId === provider.id ? 'bg-primary/5' : ''">

                    <!-- Icon -->
                    <div
                        class="self-center shrink-0 w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center my-3 mr-3">
                        <span class="text-xl select-none">🔌</span>
                    </div>

                    <!-- Content -->
                    <div
                        class="flex-1 flex items-center py-3 pr-4 border-b border-base-200 min-w-0 group-last:border-none">
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-[15px] text-base-content truncate"
                                :class="selectedId === provider.id ? 'text-primary' : ''">
                                {{ provider.id }}
                            </div>
                            <div class="text-xs text-base-content/50 truncate">
                                {{ provider.models.length }} 个模型
                            </div>
                        </div>

                        <!-- Delete Button -->
                        <button @click="deleteProvider(provider.id, $event)"
                            class="btn btn-ghost btn-sm btn-circle text-error opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100 transition-opacity shrink-0">
                            <TrashIcon class="w-4 h-4" />
                        </button>
                    </div>
                </li>
            </ul>
        </div>

        <!-- Footer -->
        <div class="p-4">
            <div class="text-center">
                <p class="text-xs text-base-content/40">管理 AI 模型提供商和模型配置</p>
            </div>
        </div>
    </div>

    <!-- Add Provider Modal -->
    <ProviderFormModal :show="showAddModal" mode="add" @close="showAddModal = false" @saved="handleProviderSaved" />
</template>
