import type { GatewayBrowserClient } from "../gateway";
import { clearDeviceAuthToken, storeDeviceAuthToken } from "../device-auth";
import { loadOrCreateDeviceIdentity } from "../device-identity";

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

export type NodesState = {
    client: GatewayBrowserClient | null;
    connected: boolean;
    nodesLoading: boolean;
    nodesError: string | null;
    nodesList: NodePairingList | null;
};

export async function loadNodes(state: NodesState, opts?: { quiet?: boolean }) {
    if (!state.client || !state.connected) {
        return;
    }
    if (state.nodesLoading) {
        return;
    }
    state.nodesLoading = true;
    if (!opts?.quiet) {
        state.nodesError = null;
    }
    try {
        const res: any = await state.client.request("node.pair.list", {});
        state.nodesList = {
            pending: Array.isArray(res?.pending) ? res.pending : [],
            paired: Array.isArray(res?.paired) ? res.paired : [],
        };
    } catch (err) {
        if (!opts?.quiet) {
            state.nodesError = String(err);
        }
    } finally {
        state.nodesLoading = false;
    }
}

export async function approveNodePairing(state: NodesState, requestId: string) {
    if (!state.client || !state.connected) {
        return;
    }
    try {
        await state.client.request("node.pair.approve", { requestId });
        await loadNodes(state);
    } catch (err) {
        state.nodesError = String(err);
    }
}

export async function rejectNodePairing(state: NodesState, requestId: string) {
    if (!state.client || !state.connected) {
        return;
    }
    const confirmed = window.confirm("Reject this node pairing request?");
    if (!confirmed) {
        return;
    }
    try {
        await state.client.request("node.pair.reject", { requestId });
        await loadNodes(state);
    } catch (err) {
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
        await loadNodes(state);
    } catch (err) {
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
    const confirmed = window.confirm(`Revoke token for ${params.deviceId} (${params.role})?`);
    if (!confirmed) {
        return;
    }
    try {
        await state.client.request("node.token.revoke", params);
        await loadNodes(state);
    } catch (err) {
        state.nodesError = String(err);
    }
}