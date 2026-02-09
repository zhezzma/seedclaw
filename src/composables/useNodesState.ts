import { reactive, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useGateway } from './useGateway'
import type { NodesState } from '../openclaw/ui/src/ui/controllers/nodes'
import { loadNodes as _loadNodes } from '~openclaw/ui/src/ui/controllers/nodes'
import {
    approveNodePairing as _approveNodePairing,
    rejectNodePairing as _rejectNodePairing,
    rotateNodeToken as _rotateNodeToken,
    revokeNodeToken as _revokeNodeToken
} from './useNodes'

const state = reactive<Omit<NodesState, 'nodes'> & { nodes: any; nodesError: string | null }>({
    client: null,
    connected: false,
    nodesLoading: false,
    nodesError: null,
    lastError: null,
    nodes: { pending: [], paired: [] }
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

    // Subscribe to gateway events for node pair updates
    gatewayStore.subscribe((evt) => {
        if (evt.event === 'node.pair.requested' || evt.event === 'node.pair.resolved') {
            void _loadNodes(state as any, { quiet: true })
        }
    })
}

export function useNodesState() {
    ensureInit()

    const loadNodes = async (opts?: { quiet?: boolean }) => {
        await _loadNodes(state as any, opts)
    }

    const approveNodePairing = async (requestId: string) => {
        await _approveNodePairing(state as any, requestId)
    }

    const rejectNodePairing = async (requestId: string) => {
        await _rejectNodePairing(state as any, requestId)
    }

    const rotateNodeToken = async (params: { deviceId: string; role: string; scopes?: string[] }) => {
        await _rotateNodeToken(state as any, params)
    }

    const revokeNodeToken = async (params: { deviceId: string; role: string }) => {
        await _revokeNodeToken(state as any, params)
    }

    const methods = {
        loadNodes,
        approveNodePairing,
        rejectNodePairing,
        rotateNodeToken,
        revokeNodeToken
    }

    return createStateProxy(state, methods)

}
