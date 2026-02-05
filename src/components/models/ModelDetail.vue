<script setup lang="ts">
import { computed, ref } from 'vue'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon, EyeIcon, EyeSlashIcon, ArrowPathIcon } from '@heroicons/vue/24/outline'
import { useGatewayStore } from '../../stores/gateway'
import { updateConfigFormValue, saveConfig, type ConfigState } from '../../services/controllers/config'

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

const store = useGatewayStore()

// Get provider from configForm
const provider = computed(() => {
    const providersObj = (store.configForm?.models as any)?.providers as Record<string, any> | undefined
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
const syncAgentsDefaultModels = () => {
    const providersObj = (store.configForm?.models as any)?.providers as Record<string, any> | undefined
    if (!providersObj) return

    const allModels: Record<string, object> = {}
    Object.entries(providersObj).forEach(([providerId, providerConfig]) => {
        const providerModels = providerConfig.models || []
        providerModels.forEach((model: ModelConfig) => {
            allModels[`${providerId}/${model.id}`] = {}
        })
    })

    updateConfigFormValue(
        store as unknown as ConfigState,
        ['agents', 'defaults', 'models'],
        allModels
    )
}

// Sync models from OpenAI-compatible API
const syncing = ref(false)
const syncError = ref('')

const syncModels = async () => {
    if (!provider.value?.baseUrl || !provider.value?.apiKey) {
        syncError.value = '缺少 Base URL 或 API Key'
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
            syncError.value = '未获取到模型列表'
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

        updateConfigFormValue(
            store as unknown as ConfigState,
            ['models', 'providers', props.providerId, 'models'],
            mergedModels
        )
        syncAgentsDefaultModels()
        saveConfig(store as unknown as ConfigState)

    } catch (err: any) {
        syncError.value = err.message || '同步失败'
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

const saveModel = () => {
    if (!modelForm.value.id.trim() || !props.providerId) return

    const currentModels = [...models.value]

    if (isEditing.value && editingModelIndex.value >= 0) {
        // Update existing model
        currentModels[editingModelIndex.value] = { ...modelForm.value }
    } else {
        // Add new model
        currentModels.push({ ...modelForm.value })
    }

    updateConfigFormValue(
        store as unknown as ConfigState,
        ['models', 'providers', props.providerId, 'models'],
        currentModels
    )
    syncAgentsDefaultModels()
    saveConfig(store as unknown as ConfigState)

    showModelModal.value = false
}

const deleteModel = (index: number, modelId: string) => {
    if (confirm(`确定要删除模型 "${modelId}" 吗？`)) {
        const currentModels = [...models.value]
        currentModels.splice(index, 1)

        updateConfigFormValue(
            store as unknown as ConfigState,
            ['models', 'providers', props.providerId, 'models'],
            currentModels
        )
        syncAgentsDefaultModels()
        saveConfig(store as unknown as ConfigState)
    }
}

// Edit Provider Modal
const showProviderModal = ref(false)
const providerForm = ref({
    baseUrl: '',
    apiKey: '',
    api: '',
    headers: ''
})
const showApiKey = ref(false)

const openEditProvider = () => {
    if (!provider.value) return
    // Convert headers object to JSON string for editing
    let headersStr = ''
    if (provider.value.headers && typeof provider.value.headers === 'object') {
        headersStr = JSON.stringify(provider.value.headers, null, 2)
    }
    providerForm.value = {
        baseUrl: provider.value.baseUrl || '',
        apiKey: provider.value.apiKey || '',
        api: provider.value.api || 'openai-completions',
        headers: headersStr
    }
    showProviderModal.value = true
}

const saveProvider = () => {
    updateConfigFormValue(
        store as unknown as ConfigState,
        ['models', 'providers', props.providerId, 'baseUrl'],
        providerForm.value.baseUrl
    )
    updateConfigFormValue(
        store as unknown as ConfigState,
        ['models', 'providers', props.providerId, 'apiKey'],
        providerForm.value.apiKey
    )
    updateConfigFormValue(
        store as unknown as ConfigState,
        ['models', 'providers', props.providerId, 'api'],
        providerForm.value.api
    )
    // Parse and save headers
    if (providerForm.value.headers.trim()) {
        try {
            const headersObj = JSON.parse(providerForm.value.headers)
            updateConfigFormValue(
                store as unknown as ConfigState,
                ['models', 'providers', props.providerId, 'headers'],
                headersObj
            )
        } catch (e) {
            console.error('Invalid headers JSON:', e)
        }
    } else {
        // Remove headers if empty
        updateConfigFormValue(
            store as unknown as ConfigState,
            ['models', 'providers', props.providerId, 'headers'],
            undefined
        )
    }
    saveConfig(store as unknown as ConfigState)
    showProviderModal.value = false
}
</script>

<template>
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
                    同步
                </button>
                <button @click="openEditProvider" class="btn btn-ghost btn-sm">
                    <PencilIcon class="w-4 h-4" />
                    编辑
                </button>
            </div>
            <div v-if="syncError" class="mt-2 text-sm text-error">{{ syncError }}</div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            <h2 class="text-lg font-semibold mb-4">模型列表</h2>

            <!-- Model Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <!-- Add Model Card -->
                <div @click="openAddModel"
                    class="aspect-square border-2 border-dashed border-base-300 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                    <PlusIcon class="w-6 h-6 text-base-content/30" />
                    <span class="text-xs text-base-content/50">添加</span>
                </div>

                <!-- Model Cards -->
                <div v-for="(model, index) in models" :key="model.id" @click="openEditModel(model, index)"
                    class="aspect-square bg-base-200/50 rounded-lg p-3 sm:p-4 flex flex-col cursor-pointer hover:bg-base-200 transition-all group relative">

                    <!-- Delete Button -->
                    <button @click.stop="deleteModel(index, model.id)"
                        class="absolute top-1 right-1 btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-error">
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
                        <span v-if="model.reasoning" class="badge badge-primary text-[10px] h-5 px-1.5">推理</span>
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
            <h3 class="font-bold text-lg">提供商未找到</h3>
            <p class="text-base-content/60">无法找到 ID 为 {{ providerId }} 的提供商</p>
        </div>
    </div>

    <!-- Model Edit Modal -->
    <dialog :class="{ 'modal modal-open': showModelModal, 'modal': !showModelModal }">
        <div class="modal-box max-w-2xl">
            <h3 class="font-bold text-lg mb-4">{{ isEditing ? '编辑模型' : '添加模型' }}</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-control">
                    <label class="label"><span class="label-text">模型 ID</span></label>
                    <input v-model="modelForm.id" type="text" placeholder="gpt-4" class="input input-bordered"
                        :disabled="isEditing" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">显示名称</span></label>
                    <input v-model="modelForm.name" type="text" placeholder="GPT-4" class="input input-bordered" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">上下文窗口</span></label>
                    <input v-model.number="modelForm.contextWindow" type="number" class="input input-bordered" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">最大 Token</span></label>
                    <input v-model.number="modelForm.maxTokens" type="number" class="input input-bordered" />
                </div>

                <div class="form-control">
                    <label class="label cursor-pointer justify-start gap-3">
                        <input v-model="modelForm.reasoning" type="checkbox" class="checkbox checkbox-primary" />
                        <span class="label-text">支持推理模式</span>
                    </label>
                </div>

                <div class="form-control">
                    <label class="label cursor-pointer justify-start gap-3">
                        <input v-model="modelForm.compat!.supportsDeveloperRole" type="checkbox"
                            class="checkbox checkbox-primary" />
                        <span class="label-text">支持 Developer Role</span>
                    </label>
                </div>
            </div>

            <div class="modal-action">
                <button @click="showModelModal = false" class="btn">取消</button>
                <button @click="saveModel" class="btn btn-primary" :disabled="!modelForm.id.trim()">保存</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="showModelModal = false">close</button>
        </form>
    </dialog>

    <!-- Provider Edit Modal -->
    <dialog :class="{ 'modal modal-open': showProviderModal, 'modal': !showProviderModal }">
        <div class="modal-box max-w-xl">
            <h3 class="font-bold text-lg mb-6">编辑提供商</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">Base URL</span></label>
                    <input v-model="providerForm.baseUrl" type="text" placeholder="https://api.openai.com/v1"
                        class="input input-bordered w-full" />
                </div>



                <div class="form-control">
                    <label class="label"><span class="label-text">API 类型</span></label>
                    <select v-model="providerForm.api" class="select select-bordered w-full">
                        <option value="openai-completions">OpenAI Completions</option>
                        <option value="anthropic">Anthropic</option>
                    </select>
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">API Key</span></label>
                    <div class="join w-full">
                        <input v-model="providerForm.apiKey" :type="showApiKey ? 'text' : 'password'"
                            placeholder="sk-..." class="input input-bordered join-item flex-1" />
                        <button type="button" @click="showApiKey = !showApiKey" class="btn btn-ghost join-item">
                            <EyeSlashIcon v-if="showApiKey" class="w-4 h-4" />
                            <EyeIcon v-else class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div class="form-control md:col-span-2">
                    <label class="label">
                        <span class="label-text">自定义请求头 (JSON)</span>
                        <span class="label-text-alt text-base-content/50">可选</span>
                    </label>
                    <textarea v-model="providerForm.headers" rows="3"
                        class="textarea textarea-bordered w-full font-mono text-sm"
                        placeholder='{"X-Proxy-Region": "us-west"}'></textarea>
                </div>
            </div>

            <div class="modal-action">
                <button @click="showProviderModal = false" class="btn">取消</button>
                <button @click="saveProvider" class="btn btn-primary">保存</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="showProviderModal = false">close</button>
        </form>
    </dialog>
</template>
