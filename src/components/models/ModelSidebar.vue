<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeftIcon, PlusIcon, TrashIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { useGatewayStore } from '../../stores/gateway'
import { updateConfigFormValue, saveConfig, type ConfigState } from '../../services/controllers/config'

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
const newProvider = ref({
    id: '',
    baseUrl: '',
    apiKey: '',
    api: 'openai-completions',
    headers: ''
})
const showApiKey = ref(false)

const openAddModal = () => {
    newProvider.value = { id: '', baseUrl: '', apiKey: '', api: 'openai-completions', headers: '' }
    showAddModal.value = true
}

const addProvider = () => {
    if (!newProvider.value.id.trim()) return

    // Parse headers if provided
    let headersObj = undefined
    if (newProvider.value.headers.trim()) {
        try {
            headersObj = JSON.parse(newProvider.value.headers)
        } catch (e) {
            console.error('Invalid headers JSON:', e)
        }
    }

    const providerConfig: any = {
        baseUrl: newProvider.value.baseUrl,
        apiKey: newProvider.value.apiKey,
        api: newProvider.value.api,
        models: []
    }
    if (headersObj) {
        providerConfig.headers = headersObj
    }

    updateConfigFormValue(
        store as unknown as ConfigState,
        ['models', 'providers', newProvider.value.id.trim()],
        providerConfig
    )
    saveConfig(store as unknown as ConfigState)

    showAddModal.value = false
    emit('select', newProvider.value.id.trim())
}

const deleteProvider = (id: string, event: Event) => {
    event.stopPropagation()
    if (confirm(`确定要删除提供商 "${id}" 吗？这将同时删除其所有模型配置。`)) {
        // Get current providers, remove the one with id, then set
        const providersObj = (store.configForm?.models as any)?.providers as Record<string, any> | undefined
        if (providersObj && providersObj[id]) {
            const newProviders = { ...providersObj }
            delete newProviders[id]
            updateConfigFormValue(
                store as unknown as ConfigState,
                ['models', 'providers'],
                newProviders
            )
            // Sync agents.defaults.models
            syncAgentsDefaultModels(newProviders)
            saveConfig(store as unknown as ConfigState)
        }
    }
}

// Sync agents.defaults.models with all available models from providers
const syncAgentsDefaultModels = (providersObj: Record<string, any>) => {
    const allModels: Record<string, object> = {}
    Object.entries(providersObj).forEach(([providerId, providerConfig]) => {
        const providerModels = providerConfig.models || []
        providerModels.forEach((model: any) => {
            allModels[`${providerId}/${model.id}`] = {}
        })
    })

    updateConfigFormValue(
        store as unknown as ConfigState,
        ['agents', 'defaults', 'models'],
        allModels
    )
}
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
    <dialog :class="{ 'modal modal-open': showAddModal, 'modal': !showAddModal }">
        <div class="modal-box max-w-xl">
            <h3 class="font-bold text-lg mb-6">添加提供商</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">提供商 ID</span></label>
                    <input v-model="newProvider.id" type="text" placeholder="e.g. openai, anthropic"
                        class="input input-bordered w-full" />
                </div>

                <div class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">Base URL</span></label>
                    <input v-model="newProvider.baseUrl" type="text" placeholder="https://api.openai.com/v1"
                        class="input input-bordered w-full" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">API Key</span></label>
                    <div class="join w-full">
                        <input v-model="newProvider.apiKey" :type="showApiKey ? 'text' : 'password'"
                            placeholder="sk-..." class="input input-bordered join-item flex-1" />
                        <button type="button" @click="showApiKey = !showApiKey" class="btn btn-ghost join-item">
                            <EyeSlashIcon v-if="showApiKey" class="w-4 h-4" />
                            <EyeIcon v-else class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">API 类型</span></label>
                    <select v-model="newProvider.api" class="select select-bordered w-full">
                        <option value="openai-completions">OpenAI Completions</option>
                        <option value="anthropic">Anthropic</option>
                    </select>
                </div>

                <div class="form-control md:col-span-2">
                    <label class="label">
                        <span class="label-text">自定义请求头 (JSON)</span>
                        <span class="label-text-alt text-base-content/50">可选</span>
                    </label>
                    <textarea v-model="newProvider.headers" rows="3"
                        class="textarea textarea-bordered w-full font-mono text-sm"
                        placeholder='{"X-Proxy-Region": "us-west"}'></textarea>
                </div>
            </div>

            <div class="modal-action">
                <button @click="showAddModal = false" class="btn">取消</button>
                <button @click="addProvider" class="btn btn-primary" :disabled="!newProvider.id.trim()">添加</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="showAddModal = false">close</button>
        </form>
    </dialog>
</template>
