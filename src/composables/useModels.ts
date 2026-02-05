import { computed } from 'vue'
import { useGatewayStore } from '../stores/gateway'

export interface ModelOption {
    id: string
    name: string
}

export interface ModelGroup {
    provider: string
    models: ModelOption[]
}

export function useModels() {
    const store = useGatewayStore()

    const availableModels = computed(() => {
        const providers = (store.configForm?.models as any)?.providers as Record<string, any> | undefined
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
        allModels
    }
}
