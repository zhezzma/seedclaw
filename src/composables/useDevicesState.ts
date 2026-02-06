import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import type { DevicesState } from '../openclaw/ui/src/ui/controllers/devices'
import {
    loadDevices as _loadDevices,
    approveDevicePairing as _approveDevicePairing,
    rejectDevicePairing as _rejectDevicePairing,
    rotateDeviceToken as _rotateDeviceToken,
    revokeDeviceToken as _revokeDeviceToken
} from '~openclaw/ui/src/ui/controllers/devices'
import { loadOrCreateDeviceIdentity as _loadOrCreateDeviceIdentity } from '~openclaw/ui/src/ui/device-identity'

const state = reactive<DevicesState>({
    client: null,
    connected: false,
    devicesLoading: false,
    devicesError: null,
    devicesList: null
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], () => {
        state.client = gatewayStore.client as any
        state.connected = gatewayStore.connected
    }, { immediate: true })

    // Subscribe to gateway events for device pair updates
    gatewayStore.subscribe((evt) => {
        if (evt.event === 'device.pair.requested' || evt.event === 'device.pair.resolved') {
            void _loadDevices(state as any, { quiet: true })
        }
    })
}

export function useDevicesState() {
    ensureInit()

    const loadDevices = async (opts?: { quiet?: boolean }) => {
        await _loadDevices(state as any, opts)
    }

    const approveDevicePairing = async (requestId: string) => {
        await _approveDevicePairing(state as any, requestId)
    }

    const rejectDevicePairing = async (requestId: string) => {
        await _rejectDevicePairing(state as any, requestId)
    }

    const rotateDeviceToken = async (params: { deviceId: string; role: string; scopes?: string[] }) => {
        await _rotateDeviceToken(state as any, params)
    }

    const revokeDeviceToken = async (params: { deviceId: string; role: string }) => {
        await _revokeDeviceToken(state as any, params)
    }

    const loadOrCreateDeviceIdentity = async () => {
        return await _loadOrCreateDeviceIdentity()
    }

    return reactive({
        ...toRefs(state),
        loadDevices,
        approveDevicePairing,
        rejectDevicePairing,
        rotateDeviceToken,
        revokeDeviceToken,
        loadOrCreateDeviceIdentity
    })

}
