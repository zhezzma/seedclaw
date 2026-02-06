import { useGatewayStore } from '../stores/gateway'

export function useModelConfig() {
    const store = useGatewayStore()

    // Sync agents.defaults.models with all available models from providers
    const syncAgentsDefaultModels = (explicitProvidersObj?: Record<string, any>) => {
        const providersObj = explicitProvidersObj || (store.configForm?.models as any)?.providers as Record<string, any> | undefined
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

        store.updateConfigFormValue(
            ['agents', 'defaults', 'models'],
            allModels
        )
    }

    return {
        syncAgentsDefaultModels
    }
}
