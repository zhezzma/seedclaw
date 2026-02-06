import { ASREngine } from './types';
import { generateUUID } from '~openclaw/ui/src/ui/uuid';
import { useUiSettingsStore } from '../../stores/setting';

export class FunASRService implements ASREngine {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private taskId: string = '';
    private sessionTranscript: string = '';
    private currentSentenceText: string = '';
    private currentSentenceBeginTime: number = -1;
    private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null;

    // 北京地域 URL
    private static readonly URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

    constructor() { }

    private getApiKey(): string {
        const store = useUiSettingsStore();
        return store.asrToken || import.meta.env.VITE_ASRTOKEN || '';
    }

    private getModel(): string {
        const store = useUiSettingsStore();
        return store.asrModel || 'fun-asr-realtime-2025-11-07';
    }

    async start(onResult: (text: string, isFinal: boolean) => void): Promise<void> {
        if (this.isConnected) {
            console.warn('FunASR is already running.');
            return;
        }

        const apiKey = this.getApiKey();

        if (!apiKey) {
            throw new Error('API Key is missing. Please configure it in settings.');
        }

        this.onResultCallback = onResult;
        this.taskId = generateUUID().replace(/-/g, '').slice(0, 32);

        // Reset state
        this.sessionTranscript = '';
        this.currentSentenceText = '';
        this.currentSentenceBeginTime = -1;

        try {
            // 使用原生 WebSocket 连接，通过 query param 鉴权
            const url = `${FunASRService.URL}?api_key=${apiKey}`;
            console.log('Connecting to Aliyun ASR via native WebSocket...');

            this.ws = new WebSocket(url);

            // 等待连接打开
            await new Promise<void>((resolve, reject) => {
                if (!this.ws) return reject('No WS');

                this.ws.onopen = () => {
                    console.log('Connected to Aliyun ASR');
                    resolve();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket Error:', error);
                    reject(error);
                };

                this.ws.onmessage = (msg) => {
                    if (typeof msg.data === 'string') {
                        try {
                            const message = JSON.parse(msg.data);
                            this.handleMessage(message);
                        } catch (e) {
                            console.error('Failed to parse message:', e);
                        }
                    }
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason);
                    this.cleanup();
                };
            });

            this.isConnected = true;
            this.sendRunTask();

        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.cleanup();
            throw error;
        }
    }

    sendAudio(pcmData: Int16Array): void {
        if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            const buffer = pcmData.buffer;
            this.ws.send(buffer);
        }
    }

    async stop(): Promise<void> {
        if (!this.isConnected) return;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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
                this.ws.send(JSON.stringify(finishTaskMessage));
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
                this.ws.close();
            } catch (e) {
                // Ignore
            }
            this.ws = null;
        }
        this.isConnected = false;
    }

    private handleMessage(message: any) {
        switch (message.header.event) {
            case 'task-started':
                console.log('Task started');
                break;
            case 'result-generated':
                const sentence = message.payload?.output?.sentence;
                if (this.onResultCallback && sentence) {
                    const text = sentence.text;
                    const beginTime = sentence.begin_time;

                    // 检测是否是新句子 (根据 begin_time 变化)
                    if (this.currentSentenceBeginTime !== -1 && this.currentSentenceBeginTime !== beginTime) {
                        // 提交上一句
                        this.sessionTranscript += (this.sessionTranscript ? ' ' : '') + this.currentSentenceText;
                        this.currentSentenceText = text;
                        this.currentSentenceBeginTime = beginTime;
                    } else {
                        // 更新当前句或初始化
                        this.currentSentenceText = text;
                        if (this.currentSentenceBeginTime === -1) {
                            this.currentSentenceBeginTime = beginTime;
                        }
                    }

                    // 返回完整文本 (历史 + 当前流)
                    const fullText = this.sessionTranscript + (this.sessionTranscript ? ' ' : '') + this.currentSentenceText;
                    this.onResultCallback(fullText, false);
                }
                break;
            case 'task-finished':
                console.log('Task finished');
                this.cleanup();
                break;
            case 'task-failed':
                console.error('Task failed:', message.header.error_message);
                this.cleanup();
                break;
            default:
                break;
        }
    }

    private sendRunTask() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

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

        this.ws.send(JSON.stringify(runTaskMessage));
    }
}
