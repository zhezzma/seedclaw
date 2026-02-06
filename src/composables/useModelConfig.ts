import { useGateway } from './useGateway'

import { useConfigState } from './useConfigState'
import { updateConfigFormValue } from '../openclaw/ui/src/ui/controllers/config'

export function useModelConfig() {
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

        updateConfigFormValue(
            configState as any,
            ['agents', 'defaults', 'models'],
            allModels
        )
    }

    return {
        syncAgentsDefaultModels
    }
}
