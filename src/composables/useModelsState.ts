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

//https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md
export type KnownApi = "openai-completions" | "openai-responses" | "anthropic-messages" | "google-generative-ai";

export const OAuthProviders = ['anthropic', 'github-copilot', 'openai-codex', 'google-antigravity', 'google-gemini-cli'];


/** Provider configuration in models.json */
export interface ProviderConfig {
    baseUrl: string
    type?: 'api_key' | 'oauth'
    apiKey?: string
    api: KnownApi
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

const saveProvider = async (providerData: { id: string, baseUrl: string, type?: 'api_key' | 'oauth', apiKey?: string, api: KnownApi, headers?: Record<string, string>, toolCallBridge?: boolean }) => {
    const existing = state.providers[providerData.id]
    if (existing) {
        await apiPatch(`/api/models/providers/${providerData.id}`, {
            baseUrl: providerData.baseUrl,
            type: providerData.type,
            apiKey: providerData.apiKey,
            api: providerData.api,
            headers: providerData.headers,
            toolCallBridge: providerData.toolCallBridge,
        })
        state.providers[providerData.id] = {
            ...existing,
            baseUrl: providerData.baseUrl,
            type: providerData.type,
            apiKey: providerData.apiKey,
            api: providerData.api,
            headers: providerData.headers,
            toolCallBridge: providerData.toolCallBridge,
        }
    } else {
        const newProvider: ProviderConfig = {
            baseUrl: providerData.baseUrl,
            type: providerData.type,
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

const clearProviderModels = async (providerId: string) => {
    const provider = state.providers[providerId]
    if (!provider) throw new Error('Provider not found')

    const res = await apiDelete<{ message: string, deleted: number }>(`/api/models/providers/${providerId}/models`)
    provider.models = []
    return res
}

/**
 * Trigger sync models from the server.
 */
const syncModels = async (providerId: string) => {
    const provider = state.providers[providerId]
    if (!provider) throw new Error('Provider not found')

    try {
        const res = await apiPost<any>(`/api/models/providers/${providerId}/models/sync`, {})

        if (res && res.models) {
            provider.models = res.models
        }

        return { created: res?.models?.length || provider.models?.length || 0, updated: 0 }
    } catch (err: any) {
        console.error('Sync failed:', err)
        throw err
    }
}


/** 
 * OAuth 认证相关动作 
 */

// 启动 OAuth 流程，返回会话 ID 和 授权 URL
const startOAuth = async (provider: string) => {
    return await apiPost<{ sessionId: string, url: string, instructions?: string, status: string }>(`/api/auth/oauth/${provider}`)
}

// 轮询 OAuth 状态
const pollOAuthStatus = async (sessionId: string) => {
    return await apiGet<{
        id: string,
        status: "pending" | "waiting_for_input" | "completed" | "failed",
        url?: string,
        instructions?: string,
        prompt?: { message: string, placeholder?: string },
        error?: string
    }>(`/api/auth/oauth/${sessionId}`)
}

// 提交用户手动输入（验证码、手动粘贴的回调 URL 等）
const submitOAuthInput = async (sessionId: string, input: string) => {
    return await apiPost(`/api/auth/oauth/${sessionId}/input`, { input })
}

// 终止 OAuth 流程并释放资源
const abortOAuthSession = async (sessionId: string) => {
    return await apiDelete(`/api/auth/oauth/${sessionId}`)
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
    clearProviderModels,
    syncModels,
    startOAuth,
    pollOAuthStatus,
    submitOAuthInput,
    abortOAuthSession
}

export function useModelsState() {
    return _modelsState
}
