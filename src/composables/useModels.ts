import { computed } from 'vue'
import { useGateway } from './useGateway'

export interface ModelOption {
    id: string
    name: string
}

export interface ModelGroup {
    provider: string
    models: ModelOption[]
}

import { useConfigState } from './useConfigState'




export function useModels() {
    const configState = useConfigState()



    // Sync agents.defaults.models with all available models from providers
    const syncAgentsDefaultModels = (explicitProvidersObj?: Record<string, any>) => {
        const providersObj = explicitProvidersObj || (configState.configForm?.models as any)?.providers as Record<string, any> | undefined
        if (!providersObj) return

        const allModels: Record<string, object> = {}
        Object.entries(providersObj).forEach(([providerId, providerConfig]) => {
            const providerModels = providerConfig.models || []
            providerModels.forEach((model: any) => {
                const modelId = model.id || model.name
                if (modelId) {
                    allModels[`${providerId}/${modelId}`] = {}
                }
            })
        })

        configState.updateConfigFormValue(
            ['agents', 'defaults', 'models'],
            allModels
        )
    }

    const availableModels = computed(() => {
        const providers = (configState.configForm?.models as any)?.providers as Record<string, any> | undefined
        if (!providers) return []

        // Group by provider for display
        const groups: ModelGroup[] = []

        Object.entries(providers).forEach(([providerKey, provider]) => {
            if (Array.isArray(provider.models)) {
                groups.push({
                    provider: providerKey,
                    models: provider.models.map((m: any) => ({
                        id: `${providerKey}/${m.id}`,
                        name: m.name || m.id
                    }))
                })
            }
        })

        return groups
    })

    // Flat list for simple selection if needed
    const allModels = computed(() => {
        return availableModels.value.flatMap(g => g.models)
    })

    return {
        availableModels,
        allModels,
        syncAgentsDefaultModels
    }
}
