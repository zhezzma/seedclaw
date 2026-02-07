import type { GatewayBrowserClient } from "~openclaw/ui/src/ui/gateway";
import { clearDeviceAuthToken, storeDeviceAuthToken } from "~openclaw/ui/src/ui/device-auth";
import { loadOrCreateDeviceIdentity } from "~openclaw/ui/src/ui/device-identity";
import { loadNodes, type NodesState } from '~openclaw/ui/src/ui/controllers/nodes'
import { useConfirm } from "./useConfirm";
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
        await loadNodes(state);
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
        await loadNodes(state);
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
        await loadNodes(state);
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
        await loadNodes(state);
    } catch (err) {
        //@ts-ignore
        state.nodesError = String(err);
    }
}