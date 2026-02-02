/**
 * OpenClaw WebSocket Client
 * 
 * 用于与OpenClaw Gateway通信，发送聊天消息并接收TTS语音响应
 */

export interface OpenClawConfig {
    gatewayUrl: string;
    authToken?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    audioUrl?: string;
    audioData?: string; // Base64 encoded audio
    timestamp: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface OpenClawEvents {
    onConnectionChange: (state: ConnectionState) => void;
    onMessage: (message: ChatMessage) => void;
    onAudio: (audioData: string, mimeType: string) => void;
    onError: (error: string) => void;
    onStreamingText: (text: string, messageId: string) => void;
}

export class OpenClawClient {
    private ws: WebSocket | null = null;
    private config: OpenClawConfig;
    private events: OpenClawEvents;
    private requestId = 0;
    private pendingRequests: Map<string, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }> = new Map();
    private currentStreamingMessage: { id: string; content: string } | null = null;

    constructor(config: OpenClawConfig, events: OpenClawEvents) {
        this.config = config;
        this.events = events;
    }

    /**
     * 生成唯一请求ID
     */
    private generateRequestId(): string {
        return `req-${++this.requestId}-${Date.now()}`;
    }

    /**
     * 连接到OpenClaw Gateway
     */
    async connect(): Promise<void> {
        if (this.ws) {
            this.disconnect();
        }

        this.events.onConnectionChange('connecting');

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.config.gatewayUrl);

                this.ws.onopen = () => {
                    console.log('[OpenClaw] WebSocket connected, sending handshake...');
                    this.sendHandshake()
                        .then(() => {
                            this.events.onConnectionChange('connected');
                            resolve();
                        })
                        .catch((error) => {
                            this.events.onConnectionChange('error');
                            this.events.onError(`Handshake failed: ${error.message}`);
                            reject(error);
                        });
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('[OpenClaw] WebSocket error:', error);
                    this.events.onConnectionChange('error');
                    this.events.onError('WebSocket connection error');
                    reject(new Error('WebSocket connection error'));
                };

                this.ws.onclose = () => {
                    console.log('[OpenClaw] WebSocket closed');
                    this.events.onConnectionChange('disconnected');
                    this.ws = null;
                };
            } catch (error) {
                this.events.onConnectionChange('error');
                reject(error);
            }
        });
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.pendingRequests.clear();
        this.events.onConnectionChange('disconnected');
    }

    /**
     * 发送握手请求
     */
    private async sendHandshake(): Promise<void> {
        const requestId = this.generateRequestId();

        const connectRequest = {
            type: 'req',
            id: requestId,
            method: 'connect',
            params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'webchat',
                    displayName: 'Seedclaw',
                    version: '0.1.0',
                    platform: 'web',
                    mode: 'ui'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                caps: ['voice'],
                commands: [],
                permissions: {},
                ...(this.config.authToken ? { auth: { token: this.config.authToken } } : {}),
                locale: navigator.language || 'en-US',
                userAgent: 'seedclaw/0.1.0'
            }
        };

        return this.sendRequest(connectRequest);
    }

    /**
     * 发送聊天消息
     */
    async sendMessage(text: string): Promise<void> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('Not connected to OpenClaw Gateway');
        }

        const requestId = this.generateRequestId();
        const idempotencyKey = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // 创建用户消息
        const userMessage: ChatMessage = {
            id: `user-${requestId}`,
            role: 'user',
            content: text,
            timestamp: Date.now()
        };
        this.events.onMessage(userMessage);

        // 初始化流式消息
        this.currentStreamingMessage = {
            id: `assistant-${requestId}`,
            content: ''
        };

        const sendRequest = {
            type: 'req',
            id: requestId,
            method: 'chat.send',
            params: {
                deliver: false,
                sessionKey: 'agent:main:main',
                message: text,
                idempotencyKey: idempotencyKey
            }
        };

        return this.sendRequest(sendRequest);
    }

    /**
     * 发送请求并等待响应
     */
    private sendRequest(request: object): Promise<void> {
        return new Promise((resolve, reject) => {
            const reqId = (request as { id: string }).id;

            this.pendingRequests.set(reqId, { resolve: resolve as (value: unknown) => void, reject });

            // 设置超时
            setTimeout(() => {
                if (this.pendingRequests.has(reqId)) {
                    this.pendingRequests.delete(reqId);
                    reject(new Error('Request timeout'));
                }
            }, 30000);

            this.ws?.send(JSON.stringify(request));
            console.log('[OpenClaw] Sent:', request);
        });
    }

    /**
     * 处理接收到的消息
     */
    private handleMessage(data: string): void {
        try {
            const msg = JSON.parse(data);
            console.log('[OpenClaw] Received:', msg);

            if (msg.type === 'res') {
                this.handleResponse(msg);
            } else if (msg.type === 'event') {
                this.handleEvent(msg);
            }
        } catch (error) {
            console.error('[OpenClaw] Failed to parse message:', error);
        }
    }

    /**
     * 处理响应消息
     */
    private handleResponse(msg: {
        id: string;
        ok: boolean;
        payload?: unknown;
        error?: { message: string };
    }): void {
        const pending = this.pendingRequests.get(msg.id);

        if (pending) {
            this.pendingRequests.delete(msg.id);

            if (msg.ok) {
                pending.resolve(msg.payload);
            } else {
                pending.reject(new Error(msg.error?.message || 'Request failed'));
                this.events.onError(msg.error?.message || 'Request failed');
            }
        }
    }

    /**
     * 处理事件消息
     */
    private handleEvent(msg: {
        event: string;
        payload: unknown;
    }): void {
        switch (msg.event) {
            case 'tick':
                // 心跳事件，忽略
                break;

            case 'agent':
            case 'agent.text':
            case 'agent.delta':
                this.handleAgentEvent(msg.payload);
                break;


            case 'chat':
                this.handleChatEvent(msg.payload);
                break;

            default:
                console.log('[OpenClaw] Unknown event:', msg.event, msg.payload);
        }
    }

    /**
     * 处理Agent事件（流式文本）
     * 
     * 格式:
     * - stream: "lifecycle" with data.phase: "start" | "end"
     * - stream: "assistant" with data.delta (增量文本) and data.text (累积文本)
     */
    private handleAgentEvent(payload: unknown): void {
        const p = payload as {
            runId?: string;
            stream?: string;
            data?: {
                phase?: string;
                text?: string;
                delta?: string;
            };
            audio?: { data?: string; url?: string; mimeType?: string };
        };

        // 处理生命周期事件
        if (p.stream === 'lifecycle') {
            if (p.data?.phase === 'start') {
                // 开始新的流式消息
                this.currentStreamingMessage = {
                    id: p.runId || `assistant-${Date.now()}`,
                    content: ''
                };
            } else if (p.data?.phase === 'end') {
                // 流式消息结束，创建最终消息
                if (this.currentStreamingMessage && this.currentStreamingMessage.content) {
                    const assistantMessage: ChatMessage = {
                        id: this.currentStreamingMessage.id,
                        role: 'assistant',
                        content: this.currentStreamingMessage.content,
                        timestamp: Date.now()
                    };
                    this.events.onMessage(assistantMessage);
                    this.currentStreamingMessage = null;
                }
            }
            return;
        }

        // 处理assistant流式文本
        if (p.stream === 'assistant' && p.data) {
            // 使用完整text而非delta，因为delta可能丢失
            const fullText = p.data.text || '';

            if (this.currentStreamingMessage && fullText) {
                this.currentStreamingMessage.content = fullText;
                this.events.onStreamingText(fullText, this.currentStreamingMessage.id);
            }
        }

    }


    /**
     * 处理Chat事件
     * 
     * 格式:
     * - state: "delta" - 增量更新
     * - state: "final" - 最终消息
     * - message.content: [{ type: "text", text: "..." }]
     */
    private handleChatEvent(payload: unknown): void {
        const p = payload as {
            runId?: string;
            state?: string;
            message?: {
                role?: string;
                content?: Array<{ type: string; text: string }> | string;
                timestamp?: number;
            };
            audio?: { data?: string; url?: string; mimeType?: string };
        };

        if (p.message) {
            // 提取文本内容
            let textContent = '';
            if (Array.isArray(p.message.content)) {
                textContent = p.message.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('');
            } else if (typeof p.message.content === 'string') {
                textContent = p.message.content;
            }

            if (p.state === 'final') {
                // 最终消息 - 如果还有streaming消息，先清除
                if (this.currentStreamingMessage) {
                    this.currentStreamingMessage = null;
                }

                // 发送最终消息
                const msg: ChatMessage = {
                    id: p.runId || `msg-${Date.now()}`,
                    role: (p.message.role as 'user' | 'assistant') || 'assistant',
                    content: textContent,
                    timestamp: p.message.timestamp || Date.now()
                };
                this.events.onMessage(msg);
            } else if (p.state === 'delta') {
                // 增量更新 - 更新streaming显示
                if (this.currentStreamingMessage) {
                    this.currentStreamingMessage.content = textContent;
                    this.events.onStreamingText(textContent, this.currentStreamingMessage.id);
                }
            }
        }
    }



    /**
     * 检查连接状态
     */
    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}

/**
 * 播放Base64编码的音频
 */
export function playAudio(base64Data: string, mimeType: string = 'audio/mp3'): HTMLAudioElement {
    const audio = new Audio(`data:${mimeType};base64,${base64Data}`);
    audio.play().catch(error => {
        console.error('[OpenClaw] Failed to play audio:', error);
    });
    return audio;
}
