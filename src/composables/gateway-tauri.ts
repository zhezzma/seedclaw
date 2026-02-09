import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
    GATEWAY_CLIENT_MODES,
    GATEWAY_CLIENT_NAMES,
} from '~openclaw/src/gateway/protocol/client-info';
import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from '~openclaw/ui/src/ui/device-auth';
import { loadOrCreateDeviceIdentity, signDevicePayload } from '~openclaw/ui/src/ui/device-identity';
import type { GatewayBrowserClientOptions, GatewayEventFrame, GatewayHelloOk, GatewayResponseFrame } from '~openclaw/ui/src/ui/gateway';
import { generateUUID } from '~openclaw/ui/src/ui/uuid';
import { buildDeviceAuthPayload } from '~openclaw/src/gateway/device-auth';

// Reuse types from original gateway
type Pending = {
    resolve: (value: unknown) => void;
    reject: (err: unknown) => void;
};

const CONNECT_FAILED_CLOSE_CODE = 4008;

export class GatewayTauriClient {
    private pending = new Map<string, Pending>();
    private closed = false;
    private lastSeq: number | null = null;
    private connectNonce: string | null = null;
    private connectSent = false;
    private connectTimer: number | null = null;
    private backoffMs = 800;

    // Tauri listeners
    private unlistenFunctions: UnlistenFn[] = [];
    private isConnected = false;
    private isReconnecting = false;


    constructor(private opts: GatewayBrowserClientOptions) { }

    async start() {
        this.closed = false;
        this.isReconnecting = false;
        await this.setupListeners();
        // Trigger Rust connection
        await invoke('gateway_connect', {
            url: this.opts.url,
            token: this.opts.token,
            origin: window.location.origin
        });
    }

    stop() {
        this.closed = true;
        this.isConnected = false;
        // Stop Rust connection
        void invoke('gateway_disconnect');
        void this.cleanupListeners();
        this.flushPending(new Error("gateway client stopped"));
    }

    get connected() {
        return this.isConnected;
    }

    private async setupListeners() {
        if (this.unlistenFunctions.length > 0) return;

        const unlistenMsg = await listen<string>('gateway://message', (event) => {
            this.handleMessage(event.payload);
        });

        const unlistenState = await listen<string>('gateway://connection-state', (event) => {
            if (event.payload === 'connected') {
                this.isConnected = true;
                this.queueConnect(); // Send Auth
            } else {
                this.isConnected = false;

                // If we are intentionally reconnecting, ignore this event to avoid double-triggering
                if (this.isReconnecting) return;

                this.opts.onClose?.({ code: 1006, reason: 'Disconnected' });
                // If we didn't initiate the close, we should reconnect
                if (!this.closed) {
                    void this.closeAndReconnect();
                } else {
                    this.flushPending(new Error('Disconnected'));
                }
            }
        });

        const unlistenError = await listen<string>('gateway://connection-error', (event) => {
            console.error("[GatewayTauri] Connection error:", event.payload);
            this.opts.onClose?.({ code: 1006, reason: event.payload });
            if (!this.closed) {
                void this.closeAndReconnect();
            }
        });

        this.unlistenFunctions.push(unlistenMsg, unlistenState, unlistenError);
    }

    private async cleanupListeners() {
        for (const fn of this.unlistenFunctions) {
            fn();
        }
        this.unlistenFunctions = [];
    }

    private flushPending(err: Error) {
        for (const [, p] of this.pending) {
            p.reject(err);
        }
        this.pending.clear();
    }

    // --- Auth & Connect Logic (Ported from GatewayBrowserClient) ---

    private queueConnect() {
        this.connectNonce = null;
        this.connectSent = false;
        if (this.connectTimer !== null) {
            window.clearTimeout(this.connectTimer);
        }
        this.connectTimer = window.setTimeout(() => {
            void this.sendConnect();
        }, 750);
    }

    private async sendConnect() {
        if (this.connectSent) return;
        this.connectSent = true;
        if (this.connectTimer !== null) {
            window.clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        const isSecureContext = true; // Tauri is secure
        const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
        const role = "operator";
        let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
        let canFallbackToShared = false;
        let authToken = this.opts.token;

        if (isSecureContext) {
            deviceIdentity = await loadOrCreateDeviceIdentity();
            const storedToken = loadDeviceAuthToken({
                deviceId: deviceIdentity.deviceId,
                role,
            })?.token;
            authToken = storedToken ?? this.opts.token;
            canFallbackToShared = Boolean(storedToken && this.opts.token);
        }

        const auth = authToken || this.opts.password
            ? { token: authToken, password: this.opts.password }
            : undefined;

        let device: any;

        if (isSecureContext && deviceIdentity) {
            const signedAtMs = Date.now();
            const nonce = this.connectNonce ?? undefined;
            const payload = buildDeviceAuthPayload({
                deviceId: deviceIdentity.deviceId,
                clientId: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
                clientMode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
                role,
                scopes,
                signedAtMs,
                token: authToken ?? null,
                nonce,
            });
            const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
            device = {
                id: deviceIdentity.deviceId,
                publicKey: deviceIdentity.publicKey,
                signature,
                signedAt: signedAtMs,
                nonce,
            };
        }

        const params = {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
                id: this.opts.clientName ?? GATEWAY_CLIENT_NAMES.CONTROL_UI,
                version: this.opts.clientVersion ?? "dev",
                platform: this.opts.platform ?? "tauri",
                mode: this.opts.mode ?? GATEWAY_CLIENT_MODES.WEBCHAT,
                instanceId: this.opts.instanceId,
            },
            role,
            scopes,
            device,
            caps: [],
            auth,
            userAgent: navigator.userAgent,
            locale: navigator.language,
        };

        // Use request() for handshake
        this.request<GatewayHelloOk>("connect", params)
            .then((hello) => {
                if (hello?.auth?.deviceToken && deviceIdentity) {
                    storeDeviceAuthToken({
                        deviceId: deviceIdentity.deviceId,
                        role: hello.auth.role ?? role,
                        token: hello.auth.deviceToken,
                        scopes: hello.auth.scopes ?? [],
                    });
                }
                this.backoffMs = 800;
                this.opts.onHello?.(hello);
            })
            .catch((err) => {
                console.error("[GatewayTauri] Connect handshake failed:", err);
                if (canFallbackToShared && deviceIdentity) {
                    clearDeviceAuthToken({ deviceId: deviceIdentity.deviceId, role });
                }
                // Notify UI of failure
                this.opts.onClose?.({ code: CONNECT_FAILED_CLOSE_CODE, reason: 'connect failed' });
                // Clean up current connection and schedule retry
                void this.closeAndReconnect();
            });
    }

    private handleMessage(raw: string) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            return;
        }

        const frame = parsed as { type?: unknown };

        // --- Event ---
        if (frame.type === "event") {
            const evt = parsed as GatewayEventFrame;
            if (evt.event === "connect.challenge") {
                const payload = evt.payload as { nonce?: unknown } | undefined;
                const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
                if (nonce) {
                    this.connectNonce = nonce;
                    void this.sendConnect();
                }
                return;
            }
            const seq = typeof evt.seq === "number" ? evt.seq : null;
            if (seq !== null) {
                if (this.lastSeq !== null && seq > this.lastSeq + 1) {
                    this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
                }
                this.lastSeq = seq;
            }
            try {
                this.opts.onEvent?.(evt);
            } catch (err) {
                console.error("[gateway] event handler error:", err);
            }
            return;
        }

        // --- Response ---
        if (frame.type === "res") {
            const res = parsed as GatewayResponseFrame;
            const pending = this.pending.get(res.id);
            if (!pending) return;

            this.pending.delete(res.id);
            if (res.ok) {
                pending.resolve(res.payload);
            } else {
                pending.reject(new Error(res.error?.message ?? "request failed"));
            }
            return;
        }
    }

    async request<T = unknown>(method: string, params?: unknown): Promise<T> {
        if (!this.isConnected) {
            return Promise.reject(new Error("gateway not connected"));
        }
        const id = generateUUID();
        const frame = { type: "req", id, method, params };

        const p = new Promise<T>((resolve, reject) => {
            this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
        });

        // Send via Tauri
        await invoke('gateway_send', { message: JSON.stringify(frame) }).catch(err => {
            this.pending.delete(id);
            return Promise.reject(err);
        });

        return p;
    }

    private async closeAndReconnect() {
        if (this.closed) return;

        // Prevent multiple re-entrant calls
        if (this.isReconnecting) return;
        this.isReconnecting = true;

        // Disconnect backend but keep "this.closed = false" to allow reconnect
        await invoke('gateway_disconnect');
        this.isConnected = false;

        this.flushPending(new Error("reconnecting"));
        this.scheduleReconnect();
    }

    private scheduleReconnect() {
        if (this.closed) return;

        const delay = this.backoffMs;
        this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
        console.log(`[GatewayTauri] Scheduling reconnect in ${delay}ms`);

        window.setTimeout(() => {
            if (!this.closed) {
                void this.start();
            }
        }, delay);
    }
}
