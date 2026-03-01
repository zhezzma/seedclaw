import { reactive, computed } from 'vue'
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client'


// ==================== Types ====================

/** A single model entry returned by the API */
export interface AvailableModel {
    id: string
    name: string
    // Optional overrides
    contextWindow?: number
    maxTokens?: number
    cost?: {
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
    }
    reasoning?: boolean
    input?: string[]
}

/** Provider configuration in models.json */
export interface ProviderConfig {
    baseUrl: string
    apiKey?: string
    api: string
    headers?: Record<string, string>
    models: AvailableModel[]
    custom: boolean
    toolCallBridge?: boolean
}

/** Shape of the API response payload for /api/models */
export interface ModelsState {
    providers: Record<string, ProviderConfig>
}

// Flat model for UI
export interface ModelOption {
    id: string       // "provider/model"
    name: string     // display name
    provider: string
    model: string
}

export interface OpenAICompletionsCompat {
    supportsStore?: boolean;
    supportsDeveloperRole?: boolean;
    supportsReasoningEffort?: boolean;
    supportsUsageInStreaming?: boolean;
    maxTokensField?: "max_completion_tokens" | "max_tokens";
    requiresToolResultName?: boolean;
    requiresAssistantAfterToolResult?: boolean;
    requiresThinkingAsText?: boolean;
    requiresMistralToolIds?: boolean;
    thinkingFormat?: "openai" | "zai" | "qwen";
    supportsStrictMode?: boolean;
}
export interface OpenAIResponsesCompat {
}
export type KnownApi = "openai-completions" | "openai-responses" | "azure-openai-responses" | "openai-codex-responses" | "anthropic-messages" | "bedrock-converse-stream" | "google-generative-ai" | "google-gemini-cli" | "google-vertex";
export type Api = KnownApi | (string & {});

/** A provider derived from grouping available models */
export interface ProviderInfo extends ProviderConfig {
    id: string;
    name: string;
    provider: string; // same as id
}

// ==================== State ====================
const state = reactive<ModelsState>({
    providers: {}
})

// ==================== Derived Computeds（模块级，仅初始化一次）====================

/** All available models grouped by provider, filtered by apiKey presence */
const availableModels = computed<ProviderInfo[]>(() => {
    const result: ProviderInfo[] = []
    for (const [id, config] of Object.entries(state.providers)) {
        if (!config.apiKey) continue
        result.push({ id, name: id, provider: id, ...config })
    }
    return result.sort((a, b) => {
        if (a.custom && !b.custom) return -1
        if (!a.custom && b.custom) return 1
        return 0
    })
})

/** Providers list */
const providers = computed<ProviderInfo[]>(() => {
    const result: ProviderInfo[] = []
    for (const [id, config] of Object.entries(state.providers)) {
        result.push({ id, name: id, provider: id, ...config })
    }
    return result.sort((a, b) => {
        if (a.custom && !b.custom) return -1
        if (!a.custom && b.custom) return 1
        return 0
    })
})

// ==================== Actions ====================

const loadModels = async () => {
    try {
        const result = await apiGet<Record<string, ProviderConfig>>('/api/models')
        state.providers = result
        return state.providers
    } catch (err: any) {
        console.error('Failed to load models config:', err)
        throw err
    }
}

const saveProvider = async (providerData: { id: string, baseUrl: string, apiKey?: string, api: string, headers?: Record<string, string>, toolCallBridge?: boolean }) => {
    const existing = state.providers[providerData.id]
    if (existing) {
        await apiPatch(`/api/models/providers/${providerData.id}`, {
            baseUrl: providerData.baseUrl,
            apiKey: providerData.apiKey,
            api: providerData.api,
            headers: providerData.headers,
            toolCallBridge: providerData.toolCallBridge,
        })
        state.providers[providerData.id] = {
            ...existing,
            baseUrl: providerData.baseUrl,
            apiKey: providerData.apiKey,
            api: providerData.api,
            headers: providerData.headers,
            toolCallBridge: providerData.toolCallBridge,
        }
    } else {
        const newProvider: ProviderConfig = {
            baseUrl: providerData.baseUrl,
            apiKey: providerData.apiKey,
            api: providerData.api,
            headers: providerData.headers,
            models: [],
            custom: true,
            toolCallBridge: providerData.toolCallBridge
        }
        await apiPost('/api/models/providers', { id: providerData.id, ...newProvider })
        state.providers[providerData.id] = newProvider
    }
}

const deleteProvider = async (providerId: string) => {
    await apiDelete(`/api/models/providers/${providerId}`)
    delete state.providers[providerId]
}

const saveModel = async (providerId: string, model: AvailableModel) => {
    const provider = state.providers[providerId]
    if (!provider) throw new Error('Provider not found')
    const existingModelIndex = provider.models.findIndex(m => m.id === model.id)
    if (existingModelIndex !== -1) {
        await apiPatch(`/api/models/providers/${providerId}/models/${encodeURIComponent(model.id)}`, model)
        provider.models[existingModelIndex] = model
    } else {
        await apiPost(`/api/models/providers/${providerId}/models`, model)
        provider.models.push(model)
    }
}

const deleteModel = async (providerId: string, modelId: string) => {
    const provider = state.providers[providerId]
    if (!provider) return
    await apiDelete(`/api/models/providers/${providerId}/models/${encodeURIComponent(modelId)}`)
    provider.models = provider.models.filter(m => m.id !== modelId)
}

/**
 * Fetch models from the provider's API (e.g. OpenAI /models) and sync relevant ones.
 * This runs client-side to leverage the user's browser context.
 */
const syncModels = async (providerId: string) => {
    const provider = state.providers[providerId]
    if (!provider || !provider.baseUrl) throw new Error('Provider config invalid')

    const url = `${provider.baseUrl}/models`.replace('//models', '/models')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.apiKey) {
        headers['Authorization'] = `Bearer ${provider.apiKey}`
    }
    if (provider.headers) {
        Object.assign(headers, provider.headers)
    }

    try {
        const res = await fetch(url, { headers })
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`Failed to fetch models: ${res.status} ${text}`)
        }
        const data = await res.json()
        const remoteModels = (data.data || []) as any[]

        const currentModels = provider.models || []
        const currentMap = new Map(currentModels.map(m => [m.id, m]))

        let created = 0
        let updated = 0

        for (const remote of remoteModels) {
            if (!remote.id) continue
            if (!currentMap.has(remote.id)) {
                const newModel: AvailableModel = {
                    id: remote.id,
                    name: remote.id,
                    contextWindow: remote.context_window || 128000,
                }
                await apiPost(`/api/models/providers/${providerId}/models`, newModel)
                provider.models.push(newModel)
                created++
            }
        }

        return { created, updated }
    } catch (err: any) {
        console.error('Sync failed:', err)
        throw err
    }
}

const syncAgentsDefaultModels = async (agentIds?: string[]) => {
    // No-op for now — models are managed via the config state
}

// ==================== Export ====================

const _modelsState = {
    availableModels,
    providers,
    loadModels,
    saveProvider,
    deleteProvider,
    saveModel,
    deleteModel,
    syncModels,
    syncAgentsDefaultModels,
}

export function useModelsState() {
    return _modelsState
}
