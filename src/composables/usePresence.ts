import { reactive, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useGateway } from './useGateway'
import type { PresenceEntry } from '~openclaw/ui/src/ui/types'
import { loadPresence, type PresenceState } from '~openclaw/ui/src/ui/controllers/presence'

const state = reactive<PresenceState>({
    client: null,
    connected: false,
    presenceLoading: false,
    presenceEntries: [],
    presenceError: null,
    presenceStatus: null
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true

    const gatewayStore = useGateway()

    // Sync client/connected state
    watch(() => [gatewayStore.client, gatewayStore.connected], () => {
        state.client = gatewayStore.client as any
        state.connected = gatewayStore.connected
    }, { immediate: true })

    // Subscribe to gateway events for presence updates
    gatewayStore.subscribe((evt) => {
        if (evt.event === 'presence') {
            const payload = evt.payload as { presence?: PresenceEntry[] } | undefined
            if (payload?.presence && Array.isArray(payload.presence)) {
                state.presenceEntries = payload.presence
                state.presenceError = null
                state.presenceStatus = null
            }
        }
    })
}

export function usePresence() {
    ensureInit()

    const load = async () => {
        await loadPresence(state as any)
    }

    const methods = {
        loadPresence: load
    }

    return createStateProxy(state, methods)
}
