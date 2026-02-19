import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { onServerMessage, sendRequest, WsMessage } from './notify-server-connection'

export interface ExecApprovalRequest {
    id: string
    sessionId: string,
    type: "select" | "confirm" | "input"
    title: string,
    options?: string[],
    message?: string,
    placeholder?: string,
    timeout: number
}

export interface ExecApprovalState {
    execApprovalQueue: ExecApprovalRequest[]
}

const state = reactive<ExecApprovalState>({
    execApprovalQueue: [],
})


function handleServerMessage(msg: WsMessage) {
    if (msg.event === 'ui_request') {
        const { id, sessionId, type, title, message, placeholder, options, timeout } = msg.payload
        if (id && type) {
            // Avoid duplicates
            if (!state.execApprovalQueue.find(req => req.id === id)) {
                state.execApprovalQueue.push({
                    id,
                    sessionId: sessionId || '',
                    type: type || 'confirm',
                    title: title || '',
                    message: message || '',
                    placeholder: placeholder || '',
                    options: options || undefined,
                    timeout: timeout ? (Date.now() + timeout) : (Date.now() + 60000)
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
    const resolveRequest = async (id: string, value: string | boolean) => {
        // Optimistically remove from queue
        // Note: state.client is injected by createStateProxy
        const idx = state.execApprovalQueue.findIndex(req => req.id === id)
        if (idx > -1) {
            state.execApprovalQueue.splice(idx, 1)
        }


        //value在input的时候是字符串..在select的时候是字符串..在confirm的时候是布尔值
        return await sendRequest('ui_response', { id, value })
    }

    const methods = {
        resolveRequest
    }

    return createStateProxy(state, methods)
}