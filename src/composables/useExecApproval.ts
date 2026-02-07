import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import {
    addExecApproval,
    parseExecApprovalRequested,
    parseExecApprovalResolved,
    removeExecApproval,
    type ExecApprovalRequest
} from '~openclaw/ui/src/ui/controllers/exec-approval'

export interface ExecApprovalState {
    client: any
    connected: boolean
    execApprovalQueue: ExecApprovalRequest[]
    execApprovalError: string | null
}

const state = reactive<ExecApprovalState>({
    client: null,
    connected: false,
    execApprovalQueue: [],
    execApprovalError: null
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
        // Reset queue on reconnect
        if (state.connected) {
            state.execApprovalQueue = []
            state.execApprovalError = null
        }
    }, { immediate: true })

    // Subscribe to gateway events for exec approval
    gatewayStore.subscribe((evt) => {
        if (evt.event === 'exec.approval.requested') {
            const entry = parseExecApprovalRequested(evt.payload)
            if (entry) {
                state.execApprovalQueue = addExecApproval(state.execApprovalQueue, entry)
                state.execApprovalError = null
                // Auto-remove after expiry
                const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500)
                window.setTimeout(() => {
                    state.execApprovalQueue = removeExecApproval(state.execApprovalQueue, entry.id)
                }, delay)
            }
        }

        if (evt.event === 'exec.approval.resolved') {
            const resolved = parseExecApprovalResolved(evt.payload)
            if (resolved) {
                state.execApprovalQueue = removeExecApproval(state.execApprovalQueue, resolved.id)
            }
        }
    })
}

export function useExecApproval() {
    ensureInit()


    /**
     * Submit a command execution request (e.g. for deleting files)
     * Returns the approval object (containing id) if successful
     */
    const submitRequest = async (command: string) => {
        if (!state.client || !state.connected) throw new Error('Not connected')
        const res = await state.client.request('exec.approval.request', { command })
        return res
    }

    /**
     * Resolve an approval request with a decision
     */
    const resolveRequest = async (id: string, decision: 'allow-once' | 'allow-always' | 'deny') => {
        if (!state.client || !state.connected) throw new Error('Not connected')
        return await state.client.request('exec.approval.resolve', { id, decision })
    }

    return reactive({
        ...toRefs(state),
        submitRequest,
        resolveRequest
    })
}
