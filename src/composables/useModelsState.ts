import { reactive, computed } from 'vue'
import { apiGet } from './api-client'


// ==================== Types ====================

/** A single model entry returned by the API */
export interface AvailableModel {
    id: string
    name: string
    api: string
    provider: string
    baseUrl: string
    reasoning: boolean
    input: string[]
    cost: {
        input: number
        output: number
        cacheRead: number
        cacheWrite: number
    }
    contextWindow: number
    maxTokens: number
    compat: {
        supportsDeveloperRole: boolean
    }
}

/** Shape of the API response payload for /api/models */
export interface ModelsData {
    maskedKeys: Record<string, string>
    available: AvailableModel[]
}

export interface ModelOption {
    id: string       // "provider/model"
    name: string     // display name
    provider: string
    model: string
}

export interface ModelGroup {
    provider: string
    models: ModelOption[]
}

/** A provider derived from grouping available models */
export interface ProviderInfo {
    id: string
    maskedKey?: string
    models: AvailableModel[]
}

export interface ModelsState {
    data: ModelsData | null
}

// ==================== State ====================
const state = reactive<ModelsState>({
    data: null
})

// ==================== Export ====================

export function useModelsState() {
    const loadModels = async () => {
        try {
            const result = await apiGet<ModelsData>('/api/models')
            state.data = result
            return result
        } catch (err: any) {
            console.error('Failed to load models config:', err)
            throw err
        }
    }

    /** All available models grouped by provider */
    const availableModels = computed<ModelGroup[]>(() => {
        const snapshot = state.data
        if (!snapshot?.available) return []

        // Group models by provider
        const grouped = new Map<string, AvailableModel[]>()
        for (const model of snapshot.available) {
            const list = grouped.get(model.provider) || []
            list.push(model)
            grouped.set(model.provider, list)
        }

        const groups: ModelGroup[] = []
        for (const [provider, models] of grouped) {
            groups.push({
                provider,
                models: models.map((m) => ({
                    id: `${provider}/${m.id}`,
                    name: m.name,
                    provider,
                    model: m.id,
                }))
            })
        }
        return groups
    })

    /** Providers derived from available models, with masked keys */
    const providers = computed<ProviderInfo[]>(() => {
        const snapshot = state.data
        if (!snapshot?.available) return []

        const grouped = new Map<string, AvailableModel[]>()
        for (const model of snapshot.available) {
            const list = grouped.get(model.provider) || []
            list.push(model)
            grouped.set(model.provider, list)
        }

        const result: ProviderInfo[] = []
        for (const [id, models] of grouped) {
            result.push({
                id,
                maskedKey: snapshot.maskedKeys?.[id],
                models,
            })
        }
        return result
    })

    const syncAgentsDefaultModels = async (agentIds?: string[]) => {
        // No-op for now — models are managed via the config state
    }

    return {
        models: computed(() => state.data),
        availableModels,
        providers,
        loadModels,
        syncAgentsDefaultModels,
    }
}
