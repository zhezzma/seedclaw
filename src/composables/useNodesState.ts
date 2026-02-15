/**
 * useNodesState — STUB
 * 
 * The new SeedAgent API does not have node management endpoints.
 * This is a no-op stub to prevent compilation errors.
 */
import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'

export interface NodesState {
    connected: boolean
    nodesLoading: boolean
    nodesError: string | null
    nodesList: any[]
    nodesPendingPairRequests: any[]
    nodesMyPairCode: string | null
}

const state = reactive<NodesState>({
    connected: false,
    nodesLoading: false,
    nodesError: null,
    nodesList: [],
    nodesPendingPairRequests: [],
    nodesMyPairCode: null,
})

export function useNodesState() {
    const loadNodes = async () => { /* no-op */ }
    const loadMyPairCode = async () => { /* no-op */ }
    const approvePairRequest = async (_id: string) => { /* no-op */ }
    const rejectPairRequest = async (_id: string) => { /* no-op */ }
    const revokeNode = async (_id: string) => { /* no-op */ }
    const rotateNodeToken = async (_id: string) => { /* no-op */ }

    return createStateProxy(state, {
        loadNodes,
        loadMyPairCode,
        approvePairRequest,
        rejectPairRequest,
        revokeNode,
        rotateNodeToken,
    })
}
