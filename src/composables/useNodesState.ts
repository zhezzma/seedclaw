import { reactive, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useGateway } from './useGateway'
import type { NodesState } from '../openclaw/ui/src/ui/controllers/nodes'
import { loadNodes as _loadNodes } from '~openclaw/ui/src/ui/controllers/nodes'
import { useConfirm } from "./useConfirm";



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



// Re-using types from devices.ts as they share the same structure for pairing
// Ideally these should be in a shared types file, but for now we follow the pattern
export type NodeTokenSummary = {
    role: string;
    scopes?: string[];
    createdAtMs?: number;
    rotatedAtMs?: number;
    revokedAtMs?: number;
    lastUsedAtMs?: number;
};

export type PendingNode = {
    requestId: string;
    deviceId: string;
    displayName?: string;
    role?: string;
    remoteIp?: string;
    isRepair?: boolean;
    ts?: number;
};

export type PairedNode = {
    deviceId: string;
    displayName?: string;
    roles?: string[];
    scopes?: string[];
    remoteIp?: string;
    tokens?: NodeTokenSummary[];
    createdAtMs?: number;
    approvedAtMs?: number;
};

export type NodePairingList = {
    pending: PendingNode[];
    paired: PairedNode[];
};

export async function approveNodePairing(state: NodesState, requestId: string) {
    if (!state.client || !state.connected) {
        return;
    }
    try {
        await state.client.request("node.pair.approve", { requestId });
        await _loadNodes(state);
    } catch (err) {
        //@ts-ignore
        state.nodesError = String(err);
    }
}

export async function rejectNodePairing(state: NodesState, requestId: string) {
    if (!state.client || !state.connected) {
        return;
    }
    const { confirm } = useConfirm();
    const confirmed = await confirm("Reject this node pairing request?");
    if (!confirmed) {
        return;
    }
    try {
        await state.client.request("node.pair.reject", { requestId });
        await _loadNodes(state);
    } catch (err) {
        //@ts-ignore
        state.nodesError = String(err);
    }
}

export async function rotateNodeToken(
    state: NodesState,
    params: { deviceId: string; role: string; scopes?: string[] },
) {
    if (!state.client || !state.connected) {
        return;
    }
    try {
        const res: any = await state.client.request("node.token.rotate", params);
        if (res?.token) {
            window.prompt("New node token (copy and store securely):", res.token);
        }
        await _loadNodes(state);
    } catch (err) {
        //@ts-ignore
        state.nodesError = String(err);
    }
}

export async function revokeNodeToken(
    state: NodesState,
    params: { deviceId: string; role: string },
) {
    if (!state.client || !state.connected) {
        return;
    }
    const { confirm } = useConfirm();
    const confirmed = await confirm(`Revoke token for ${params.deviceId} (${params.role})?`);
    if (!confirmed) {
        return;
    }
    try {
        await state.client.request("node.token.revoke", params);
        await _loadNodes(state);
    } catch (err) {
        //@ts-ignore
        state.nodesError = String(err);
    }
}

export function useNodesState() {
    ensureInit()

    const loadNodes = async (opts?: { quiet?: boolean }) => {
        await _loadNodes(state as any, opts)
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
