/**
 * useDevicesState — STUB
 * 
 * The new SeedAgent API does not have device management endpoints.
 * This is a no-op stub to prevent compilation errors.
 */
import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'

export interface DevicesState {
    connected: boolean
    devicesLoading: boolean
    devicesError: string | null
    devicesList: {
        pending: any[]
        paired: any[]
    }
}

const state = reactive<DevicesState>({
    connected: false,
    devicesLoading: false,
    devicesError: null,
    devicesList: {
        pending: [],
        paired: []
    },
})

export function useDevicesState() {
    const loadDevices = async () => { /* no-op */ }
    const approvePairRequest = async (_id: string) => { /* no-op */ }
    const rejectPairRequest = async (_id: string) => { /* no-op */ }
    const revokeDevice = async (_id: string) => { /* no-op */ }
    const rotateDeviceToken = async (_id: string) => { /* no-op */ }

    return createStateProxy(state, {
        loadDevices,
        approvePairRequest,
        rejectPairRequest,
        revokeDevice,
        rotateDeviceToken,
    })
}
