import { useUiSettingsStore } from '../stores/setting'
import { useGateway } from './useGateway'
import { useAgentsState } from './useAgentsState'
import { useChatState } from './useChatState'
import { useConfigState } from './useConfigState'
import { useSessionsState } from './useSessionsState'

/**
 * Initializes all domain-specific state composables.
 * This ensures that their internal watchers are set up before the gateway connection is established.
 * By calling these composables, we execute their `ensureInit()` logic.
 */
export function useAppInit() {
    const agentsState = useAgentsState()
    const chatState = useChatState()
    const configState = useConfigState()
    const sessionsState = useSessionsState()

    const gatewayStore = useGateway()
    const settingsStore = useUiSettingsStore()

    const init = async () => {
        if (settingsStore.isConfigured && !gatewayStore.connected && !gatewayStore.connecting) {
            try {
                await gatewayStore.connect()
            } catch (err) {
                console.error('[AppInit] Auto-connect failed:', err)
            }
        }
    }

    return {
        init
    }
}
