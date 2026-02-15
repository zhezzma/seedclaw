/**
 * useExecApproval — STUB
 * 
 * The new SeedAgent API does not have execution approval endpoints.
 * This is a no-op stub to prevent compilation errors.
 */
import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'

export interface ExecApprovalState {
    connected: boolean
    execApprovalLoading: boolean
    execApprovalError: string | null
    execApprovalQueue: any[]
}

const state = reactive<ExecApprovalState>({
    connected: false,
    execApprovalLoading: false,
    execApprovalError: null,
    execApprovalQueue: [],
})

export function useExecApproval() {
    const loadQueue = async () => { /* no-op */ }
    const approveExec = async (_id: string) => { /* no-op */ }
    const rejectExec = async (_id: string) => { /* no-op */ }
    const resolveRequest = async (_id: string, _decision: string) => { return { ok: true } }

    return createStateProxy(state, {
        loadQueue,
        approveExec,
        rejectExec,
        resolveRequest,
    })
}
