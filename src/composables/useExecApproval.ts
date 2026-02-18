import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { onServerMessage, sendRequest, WsMessage } from './notify-server-connection'

export interface ExecApprovalRequest {
    id: string
    command: string,
    reason: string,
    expiresAtMs: number
}

export interface ExecApprovalState {
    execApprovalQueue: ExecApprovalRequest[]
}

const state = reactive<ExecApprovalState>({
    execApprovalQueue: [],
})


function handleServerMessage(msg: WsMessage) {
    if (msg.event === 'permission_request') {
        const { id, command, expiresAtMs, reason } = msg.payload
        if (id && command) {
            // Avoid duplicates
            if (!state.execApprovalQueue.find(req => req.id === id)) {
                state.execApprovalQueue.push({
                    id,
                    command,
                    reason,
                    expiresAtMs: expiresAtMs || (Date.now() + 60000) // Default 1 min expiry
                })
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

        return await sendRequest('permission_response', { id, approved: decision === 'allow' })
    }

    const methods = {
        resolveRequest
    }

    return createStateProxy(state, methods)
}