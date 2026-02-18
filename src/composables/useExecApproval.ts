import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { onServerMessage, sendRequest, WsMessage } from './notify-server-connection'

export interface ExecApprovalRequest {
    id: string
    command: string
    expiresAtMs: number
}

export interface ExecApprovalState {
    execApprovalQueue: ExecApprovalRequest[]
}

const state = reactive<ExecApprovalState>({
    execApprovalQueue: [],
})


function handleServerMessage(msg: WsMessage) {
    if (msg.type === 'exec_approval_request') {
        const { id, command, expiresAtMs } = msg.data
        if (id && command) {
            // Avoid duplicates
            if (!state.execApprovalQueue.find(req => req.id === id)) {
                state.execApprovalQueue.push({
                    id,
                    command,
                    expiresAtMs: expiresAtMs || (Date.now() + 60000) // Default 1 min expiry
                })
            }
        }
    } else if (msg.type === 'exec_approval_cancel') {
        // Optional: Handle cancellation if server sends it
        const { id } = msg.data
        if (id) {
            const idx = state.execApprovalQueue.findIndex(req => req.id === id)
            if (idx > -1) {
                state.execApprovalQueue.splice(idx, 1)
            }
        }
    }
}



export function useExecApproval() {

    // Global listener for execution approval requests
    onServerMessage(handleServerMessage)

    /**
     * Resolve an approval request with a decision
     */
    const resolveRequest = async (id: string, decision: 'allow' | 'deny') => {
        // Optimistically remove from queue
        // Note: state.client is injected by createStateProxy
        const idx = state.execApprovalQueue.findIndex(req => req.id === id)
        if (idx > -1) {
            state.execApprovalQueue.splice(idx, 1)
        }

        return await sendRequest('exec.approval.resolve', { id, decision })
    }

    const methods = {
        resolveRequest
    }

    return createStateProxy(state, methods)
}