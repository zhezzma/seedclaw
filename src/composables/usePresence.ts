/**
 * usePresence — STUB
 * 
 * The new SeedAgent API does not have presence tracking endpoints.
 * This is a no-op stub to prevent compilation errors.
 */
import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'

export interface PresenceState {
    connected: boolean
    presenceLoading: boolean
    presenceError: string | null
    presenceList: any[]
}

const state = reactive<PresenceState>({
    connected: false,
    presenceLoading: false,
    presenceError: null,
    presenceList: [],
})

export function usePresence() {
    const loadPresence = async () => { /* no-op */ }

    return createStateProxy(state, {
        loadPresence,
    })
}
