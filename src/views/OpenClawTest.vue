<script setup lang="ts">
import { ref, nextTick, onUnmounted, watch } from "vue";
import { useI18n } from 'vue-i18n'

/**
 * OpenClaw WebSocket Client
 * 用于与OpenClaw Gateway通信，发送聊天消息并接收TTS语音响应
 */

interface OpenClawConfig {
    gatewayUrl: string;
    authToken?: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    audioUrl?: string;
    audioData?: string; // Base64 encoded audio
    timestamp: number;
}

const { t } = useI18n()

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface OpenClawEvents {
    onConnectionChange: (state: ConnectionState) => void;
    onMessage: (message: ChatMessage) => void;
    onAudio: (audioData: string, mimeType: string) => void;
    onError: (error: string) => void;
    onStreamingText: (text: string, messageId: string) => void;
}

class OpenClawClient {
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

            case 'agent.audio':
            case 'chat.audio':
                this.handleAudioEvent(msg.payload);
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

        // 处理内嵌音频
        if (p.audio) {
            if (p.audio.data) {
                this.events.onAudio(p.audio.data, p.audio.mimeType || 'audio/mp3');
            } else if (p.audio.url) {
                this.fetchAndPlayAudio(p.audio.url);
            }
        }
    }

    /**
     * 处理音频事件
     */
    private handleAudioEvent(payload: unknown): void {
        const p = payload as {
            data?: string;
            url?: string;
            mimeType?: string;
        };

        if (p.data) {
            this.events.onAudio(p.data, p.mimeType || 'audio/mp3');
        } else if (p.url) {
            this.fetchAndPlayAudio(p.url);
        }
    }

    /**
     * 处理Chat事件
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

            // 检测并播放 MEDIA 路径中的音频
            this.detectAndPlayMediaAudio(textContent);
        }

        if (p.audio) {
            if (p.audio.data) {
                this.events.onAudio(p.audio.data, p.audio.mimeType || 'audio/mp3');
            } else if (p.audio.url) {
                this.fetchAndPlayAudio(p.audio.url);
            }
        }
    }

    /**
     * 检测文本中的 MEDIA 路径并播放音频
     */
    private detectAndPlayMediaAudio(text: string): void {
        // 解析 MEDIA:xxx.mp3 路径
        const match = text.match(/MEDIA:(\S+\.mp3)/);
        if (match) {
            const audioPath = match[1];
            // 从 gatewayUrl 提取基础 HTTP URL
            const wsUrl = this.config.gatewayUrl;
            const httpUrl = wsUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
            const audioUrl = `${httpUrl}${audioPath.startsWith('/') ? '' : '/'}${audioPath}`;

            console.log('[OpenClaw] Playing media audio:', audioUrl);
            this.playMediaAudio(audioUrl);
        }
    }

    /**
     * 直接播放音频URL（不经过事件系统）
     */
    private playMediaAudio(url: string): void {
        const audio = new Audio(url);
        audio.play().catch(error => {
            console.error('[OpenClaw] Failed to play media audio:', error);
        });
    }

    /**
     * 获取并播放音频URL
     */
    private async fetchAndPlayAudio(url: string): Promise<void> {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const reader = new FileReader();

            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                this.events.onAudio(base64, blob.type || 'audio/mp3');
            };

            reader.readAsDataURL(blob);
        } catch (error) {
            console.error('[OpenClaw] Failed to fetch audio:', error);
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
function playAudio(base64Data: string, mimeType: string = 'audio/mp3'): HTMLAudioElement {
    const audio = new Audio(`data:${mimeType};base64,${base64Data}`);
    audio.play().catch(error => {
        console.error('[OpenClaw] Failed to play audio:', error);
    });
    return audio;
}

// ==================== Vue Component Logic ====================

// 配置状态 - 从localStorage加载
const gatewayUrl = ref(localStorage.getItem('openclaw_gateway_url') || "ws://127.0.0.1:18789");
const authToken = ref(localStorage.getItem('openclaw_auth_token') || "");

// 保存配置到localStorage
watch(gatewayUrl, (val) => localStorage.setItem('openclaw_gateway_url', val));
watch(authToken, (val) => localStorage.setItem('openclaw_auth_token', val));

// 连接状态
const connectionState = ref<ConnectionState>('disconnected');
const errorMessage = ref("");

// 聊天状态
const messages = ref<ChatMessage[]>([]);
const inputText = ref("");
const streamingText = ref("");
const isSending = ref(false);

// 音频状态
const isPlayingAudio = ref(false);
const audioQueue = ref<{ data: string; mimeType: string }[]>([]);

// OpenClaw客户端
let client: OpenClawClient | null = null;

// 消息列表容器引用
const messagesContainer = ref<HTMLElement | null>(null);

/**
 * 滚动到底部
 */
function scrollToBottom() {
    nextTick(() => {
        if (messagesContainer.value) {
            messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
    });
}

/**
 * 播放音频队列
 */
async function processAudioQueue() {
    if (isPlayingAudio.value || audioQueue.value.length === 0) {
        return;
    }

    isPlayingAudio.value = true;

    while (audioQueue.value.length > 0) {
        const audioItem = audioQueue.value.shift()!;

        await new Promise<void>((resolve) => {
            const audio = playAudio(audioItem.data, audioItem.mimeType);
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
        });
    }

    isPlayingAudio.value = false;
}

/**
 * 连接到OpenClaw Gateway
 */
async function connect() {
    if (client) {
        client.disconnect();
    }

    errorMessage.value = "";

    client = new OpenClawClient(
        {
            gatewayUrl: gatewayUrl.value,
            authToken: authToken.value || undefined
        },
        {
            onConnectionChange: (state) => {
                connectionState.value = state;
            },
            onMessage: (message) => {
                // 检查是否是更新现有的流式消息
                const existingIndex = messages.value.findIndex(m => m.id === message.id);
                if (existingIndex >= 0) {
                    messages.value[existingIndex] = message;
                } else {
                    messages.value.push(message);
                }
                streamingText.value = "";
                scrollToBottom();
            },
            onAudio: (audioData, mimeType) => {
                audioQueue.value.push({ data: audioData, mimeType });
                processAudioQueue();
            },
            onError: (error) => {
                errorMessage.value = error;
                isSending.value = false;
            },
            onStreamingText: (text, _messageId) => {
                streamingText.value = text;
                scrollToBottom();
            }
        }
    );

    try {
        await client.connect();
        messages.value = [];
    } catch (error) {
        console.error('Connection failed:', error);
    }
}

/**
 * 断开连接
 */
function disconnect() {
    if (client) {
        client.disconnect();
        client = null;
    }
}

/**
 * 发送消息
 */
async function sendMessage() {
    if (!client || !inputText.value.trim() || isSending.value) {
        return;
    }

    const text = inputText.value.trim();
    inputText.value = "";
    isSending.value = true;
    errorMessage.value = "";

    try {
        await client.sendMessage(text);
    } catch (error) {
        errorMessage.value = String(error);
    } finally {
        isSending.value = false;
    }
}

/**
 * 清空聊天记录
 */
function clearMessages() {
    messages.value = [];
    streamingText.value = "";
}

// 组件卸载时断开连接
onUnmounted(() => {
    disconnect();
});
</script>

<template>
    <main class="container">
        <h1>🦀 Seedclaw</h1>
        <p class="subtitle">{{ $t('test.title') }}</p>

        <!-- 连接配置 -->
        <div class="config-section" v-if="connectionState !== 'connected'">
            <div class="input-group">
                <label for="gateway-url">{{ $t('test.gatewayUrl') }}</label>
                <input id="gateway-url" v-model="gatewayUrl" placeholder="ws://127.0.0.1:18789"
                    :disabled="connectionState === 'connecting'"
                    :class="{ disabled: connectionState === 'connecting' }" />
            </div>

            <div class="input-group">
                <label for="auth-token">{{ $t('test.authToken') }}</label>
                <input id="auth-token" v-model="authToken" type="password"
                    :placeholder="$t('test.authTokenPlaceholder')" :disabled="connectionState === 'connecting'" />
            </div>

            <button class="connect-btn" @click="connect" :disabled="connectionState === 'connecting'">
                {{ connectionState === 'connecting' ? $t('test.connecting') : $t('test.connect') }}
            </button>
        </div>

        <!-- 已连接状态 -->
        <div class="chat-section" v-else>
            <!-- 状态栏 -->
            <div class="status-bar">
                <span class="status-indicator connected"></span>
                <span class="status-text">{{ $t('test.connectedTo', { url: gatewayUrl }) }}</span>
                <button class="disconnect-btn" @click="disconnect">{{ $t('test.disconnect') }}</button>
                <button class="clear-btn" @click="clearMessages">{{ $t('test.clear') }}</button>
            </div>

            <!-- 消息列表 -->
            <div class="messages-container" ref="messagesContainer">
                <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
                    <div class="message-role">{{ msg.role === 'user' ? $t('test.user') : $t('test.ai') }}</div>
                    <div class="message-content">{{ msg.content }}</div>
                </div>

                <!-- 流式响应 -->
                <div v-if="streamingText" class="message assistant streaming">
                    <div class="message-role">{{ $t('test.ai') }}</div>
                    <div class="message-content">{{ streamingText }}<span class="cursor">▌</span></div>
                </div>

                <!-- 空状态 -->
                <div v-if="messages.length === 0 && !streamingText" class="empty-state">
                    <p>{{ $t('test.startChat') }}</p>
                    <p class="hint">{{ $t('test.chatHint') }}</p>
                </div>
            </div>

            <!-- 音频播放状态 -->
            <div v-if="isPlayingAudio" class="audio-indicator">
                <span class="audio-icon">🔊</span> {{ $t('test.playingAudio') }}
            </div>

            <!-- 输入区域 -->
            <form class="input-section" @submit.prevent="sendMessage">
                <input v-model="inputText" :placeholder="$t('test.inputPlaceholder')" :disabled="isSending" autofocus />
                <button type="submit" :disabled="isSending || !inputText.trim()">
                    {{ isSending ? $t('test.sending') : $t('test.send') }}
                </button>
            </form>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="error-message">
            ⚠️ {{ errorMessage }}
        </div>
    </main>
</template>

<style scoped>
:root {
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    font-weight: 400;

    color: #e0e0e0;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;

    min-height: 100vh;
}

* {
    box-sizing: border-box;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

h1 {
    text-align: center;
    font-size: 2rem;
    margin: 0;
    background: linear-gradient(135deg, #ff6b6b, #ffa502);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.subtitle {
    text-align: center;
    color: #888;
    margin: 0.5rem 0 1.5rem;
}

/* 配置区域 */
.config-section {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 24px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.input-group {
    margin-bottom: 16px;
}

.input-group label {
    display: block;
    margin-bottom: 8px;
    color: #aaa;
    font-size: 0.9rem;
}

.input-group input {
    width: 100%;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 1rem;
    transition: all 0.2s;
}

.input-group input:focus {
    outline: none;
    border-color: #ffa502;
    box-shadow: 0 0 0 3px rgba(255, 165, 2, 0.2);
}

.input-group input.disabled {
    background: rgba(0, 0, 0, 0.2);
    color: #666;
    border-color: rgba(255, 255, 255, 0.05);
}

.connect-btn {
    width: 100%;
    padding: 14px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #ff6b6b, #ffa502);
    color: white;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
}

.connect-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
}

.connect-btn:disabled {
    opacity: 0.7;
    cursor: wait;
}

/* 对话区域 */
.chat-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    overflow: hidden;
}

.status-bar {
    padding: 12px 16px;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4caf50;
    margin-right: 8px;
    box-shadow: 0 0 10px #4caf50;
}

.status-text {
    flex: 1;
    font-size: 0.9rem;
    color: #aaa;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.disconnect-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 107, 107, 0.3);
    background: transparent;
    color: #ff6b6b;
    font-size: 0.8rem;
    cursor: pointer;
    margin-right: 8px;
    transition: all 0.2s;
}

.clear-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    color: #aaa;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
}

.disconnect-btn:hover {
    border-color: #ff6b6b;
    color: #ff6b6b;
}

.clear-btn:hover {
    border-color: #4caf50;
    color: #4caf50;
}

/* 消息列表 */
.messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 300px;
    max-height: 500px;
}

.message {
    max-width: 80%;
    padding: 12px 16px;
    border-radius: 12px;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.message.user {
    align-self: flex-end;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: #fff;
}

.message.assistant {
    align-self: flex-start;
    background: rgba(255, 255, 255, 0.1);
    color: #e0e0e0;
}

.message-role {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 4px;
}

.message-content {
    word-break: break-word;
    white-space: pre-wrap;
}

.message.streaming .cursor {
    animation: blink 0.8s infinite;
}

@keyframes blink {

    0%,
    50% {
        opacity: 1;
    }

    51%,
    100% {
        opacity: 0;
    }
}

.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #666;
    text-align: center;
}

.empty-state .hint {
    font-size: 0.9rem;
    margin-top: 8px;
}

/* 音频指示器 */
.audio-indicator {
    padding: 8px 16px;
    background: rgba(76, 175, 80, 0.2);
    color: #4caf50;
    text-align: center;
    font-size: 0.9rem;
    animation: fadeIn 0.3s ease;
}

.audio-icon {
    animation: bounce 0.5s infinite alternate;
}

@keyframes bounce {
    from {
        transform: translateY(0);
    }

    to {
        transform: translateY(-3px);
    }
}

/* 输入区域 */
.input-section {
    display: flex;
    gap: 8px;
    padding: 16px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.input-section input {
    flex: 1;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 1rem;
}

.input-section input:focus {
    outline: none;
    border-color: #667eea;
}

.input-section button {
    padding: 12px 24px;
    border-radius: 8px;
    border: none;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.input-section button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
}

.input-section button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* 错误消息 */
.error-message {
    margin-top: 16px;
    padding: 12px 16px;
    background: rgba(255, 107, 107, 0.2);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 8px;
    color: #ff6b6b;
    text-align: center;
}

/* 滚动条样式 */
.messages-container::-webkit-scrollbar {
    width: 6px;
}

.messages-container::-webkit-scrollbar-track {
    background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>