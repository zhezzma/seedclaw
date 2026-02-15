import { ASREngine } from './types';
// UUID generation — replaced ~openclaw import with native API
const generateUUID = () => crypto.randomUUID();
import { useUiSettingsStore } from '../../stores/setting';
import { useToast } from '../../composables/useToast';
import WebSocket from '@tauri-apps/plugin-websocket';

export class FunASRService implements ASREngine {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private taskId: string = '';

    // 简单的结果状态管理
    private sessionTranscript: string = '';
    private currentSentenceText: string = '';
    // 当前句子的开始时间，用来区分是否是新句子
    // DashScope 返回的 sentence.begin_time
    private currentSentenceBeginTime: number = -1;

    private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null;

    // 北京地域 URL
    private static readonly URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

    constructor() { }

    private getApiKey(): string {
        const store = useUiSettingsStore();
        return store.asrToken;
    }

    private getModel(): string {
        const store = useUiSettingsStore();
        return store.asrModel || 'fun-asr-realtime';
    }

    async start(onResult: (text: string, isFinal: boolean) => void): Promise<void> {

        if (this.isConnected) {
            console.warn('FunASR is already running.');
            return;
        }

        const apiKey = this.getApiKey();

        if (!apiKey) {
            useToast().error('API Key is missing. Please configure it in settings.');
            throw new Error('API Key is missing');
        }

        this.onResultCallback = onResult;
        this.taskId = generateUUID().replace(/-/g, '').slice(0, 32);

        // Reset state
        this.sessionTranscript = '';
        this.currentSentenceText = '';
        this.currentSentenceBeginTime = -1;

        try {
            console.log('Connecting to Aliyun ASR via Tauri WebSocket...');

            // 使用 Tauri WebSocket 插件连接，支持自定义 Headers
            this.ws = await WebSocket.connect(FunASRService.URL, {
                headers: {
                    Authorization: `bearer ${apiKey}`
                }
            });

            this.ws.addListener((msg: any) => {
                if (msg.type === 'Text') {
                    try {
                        const message = JSON.parse(msg.data as string);
                        this.handleMessage(message);
                    } catch (e) {
                        console.error('Failed to parse message:', e);
                    }
                } else if (msg.type === 'Close') {
                    console.log('WebSocket closed:', msg.data);
                    this.cleanup();
                }
            });

            this.isConnected = true;
            console.log('Connected to Aliyun ASR');
            await this.sendRunTask();

        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            useToast().error('ASR connection failed. Please check your API Key and Network.');
            this.cleanup();
            throw error;
        }
    }

    async sendAudio(pcmData: Int16Array): Promise<void> {
        if (this.ws && this.isConnected) {
            // Tauri WebSocket send accepts string or number[] (for binary)
            // Need to convert Int16Array to number[] or Uint8Array (as standard WS usually takes ArrayBuffer/Blob)
            // The plugin document says: send(message: string | number[] | { [key: string]: any })
            // For binary, we usually send number[] of bytes.
            const buffer = new Uint8Array(pcmData.buffer); // View as bytes
            const data = Array.from(buffer); // Convert to number array for plugin
            try {
                await this.ws.send(data);
            } catch (e) {
                console.error('Failed to send audio data:', e);
            }
        }
    }

    async stop(): Promise<void> {
        if (!this.isConnected) return;

        if (this.ws) {
            const finishTaskMessage = {
                header: {
                    action: 'finish-task',
                    task_id: this.taskId,
                    streaming: 'duplex'
                },
                payload: {
                    input: {}
                }
            };
            try {
                await this.ws.send(JSON.stringify(finishTaskMessage));
            } catch (e) {
                console.error('Error sending finish-task:', e);
            }
        }

        // 短暂延迟后完全断开
        setTimeout(() => {
            this.cleanup();
        }, 1000);
    }

    private cleanup() {
        if (this.ws) {
            try {
                this.ws.disconnect(); // Tauri plugin uses disconnect()
            } catch (e) {
                console.warn('Error disconnecting websocket:', e);
            }
            this.ws = null;
        }
        this.isConnected = false;
        this.onResultCallback = null;
    }

    private handleMessage(message: any) {
        if (!message || !message.header) return;

        switch (message.header.event) {
            case 'task-started':
                console.log('Task started');
                break;
            case 'result-generated':
            case 'result-partially-generated': // Handle partials if needed, though 'result-generated' covers streaming usually in DashScope
                const sentence = message.payload?.output?.sentence;
                if (!sentence) return;

                const text = sentence.text;
                const beginTime = sentence.begin_time;
                // DashScope sends cumulative text for current sentence usually? 
                // Wait, logic from before:
                // "如果 beginTime 变了，说明是新的一句"

                if (this.onResultCallback) {
                    // Check if new sentence started
                    if (this.currentSentenceBeginTime !== -1 && this.currentSentenceBeginTime !== beginTime) {
                        // Previous sentence finished. Append to transcript.
                        this.sessionTranscript += (this.sessionTranscript ? ' ' : '') + this.currentSentenceText;
                        this.currentSentenceText = text;
                        this.currentSentenceBeginTime = beginTime;
                    } else {
                        // Same sentence updating or first sentence
                        this.currentSentenceText = text;
                        if (this.currentSentenceBeginTime === -1) {
                            this.currentSentenceBeginTime = beginTime;
                        }
                    }

                    // Assemble full text
                    const fullText = this.sessionTranscript + (this.sessionTranscript ? ' ' : '') + this.currentSentenceText;
                    this.onResultCallback(fullText, false);
                }
                break;
            case 'task-finished':
                console.log('Task finished');
                this.cleanup();
                break;
            case 'task-failed':
                const errorMsg = message.header.error_message || 'Unknown error';
                console.error('Task failed:', errorMsg);
                useToast().error(`ASR Task Failed: ${errorMsg}`);
                this.cleanup();
                break;
            default:
                // console.log('Unhandled event:', message.header.event);
                break;
        }
    }

    private async sendRunTask() {
        if (!this.ws) return;

        const runTaskMessage = {
            header: {
                action: 'run-task',
                task_id: this.taskId,
                streaming: 'duplex'
            },
            payload: {
                task_group: 'audio',
                task: 'asr',
                function: 'recognition',
                model: this.getModel(),
                parameters: {
                    sample_rate: 16000,
                    format: 'pcm'
                },
                input: {}
            }
        };

        try {
            await this.ws.send(JSON.stringify(runTaskMessage));
        } catch (e) {
            console.error("Failed to send run-task:", e);
        }
    }
}
