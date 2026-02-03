import { AudioProcessor } from './audioProcessor';
import { generateUUID } from '../../services/uuid';

import { useUiSettingsStore } from '../../stores/setting';

export class SpeechRecognitionService {
    private ws: WebSocket | null = null;
    private audioProcessor: AudioProcessor;
    private isConnected: boolean = false;
    private taskId: string = '';
    private sessionTranscript: string = '';
    private currentSentenceText: string = '';
    private currentSentenceBeginTime: number = -1;
    private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null;
    // 北京地域 URL
    private static readonly URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/';

    constructor() {
        this.audioProcessor = new AudioProcessor();
    }

    private getApiKey(): string {
        const store = useUiSettingsStore();
        return store.asrToken || import.meta.env.VITE_ASRTOKEN || '';
    }

    async start(onResult: (text: string, isFinal: boolean) => void): Promise<void> {
        if (this.isConnected) {
            console.warn('Speech recognition is already running.');
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
            // 这避免了 Tauri 插件在不同平台上的 TLS 兼容性问题
            const url = `${SpeechRecognitionService.URL}?api_key=${apiKey}`;
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
                    // Native WebSocket error event doesn't give much detail, but it's an Event
                    // alert('WS Connect Error (Native): Check console');
                    reject(error);
                };

                this.ws.onmessage = (msg) => {
                    // 消息可能是字符串或二进制
                    // 阿里云返回的是 JSON 字符串
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
                    this.internalStop();
                };
            });

            this.isConnected = true;
            this.sendRunTask();

        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            // alert('WS Start Error: ' + error);
            this.internalStop();
            throw error;
        }
    }

    private handleMessage(message: any) {
        switch (message.header.event) {
            case 'task-started':
                console.log('Task started, starting audio recording...');
                this.startAudioRecording();
                break;
            case 'result-generated':
                const sentence = message.payload?.output?.sentence;
                if (this.onResultCallback && sentence) {
                    const text = sentence.text;
                    const beginTime = sentence.begin_time;

                    // 检测是否是新句子 (根据 begin_time 变化)
                    // 或者如果是第一次收到
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
                this.internalStop();
                break;
            case 'task-failed':
                console.error('Task failed:', message.header.error_message);
                // alert('Task Failed: ' + message.header.error_message);
                this.internalStop();
                break;
            default:
                // console.log('Unknown event:', message.header.event);
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
                model: 'fun-asr-realtime',
                parameters: {
                    sample_rate: 16000,
                    format: 'pcm'
                },
                input: {}
            }
        };

        this.ws.send(JSON.stringify(runTaskMessage));
    }

    private async startAudioRecording() {
        try {
            await this.audioProcessor.start((pcmData) => {
                if (this.ws && this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                    // 发送二进制数据
                    // 将 Int16Array 转为 Uint8Array (bytes)
                    const buffer = pcmData.buffer;
                    // Native WebSocket send supports ArrayBuffer
                    this.ws.send(buffer);
                }
            });
        } catch (e) {
            console.error('Failed to start audio processor:', e);
            // alert('Audio Error: ' + e);
            this.stop();
        }
    }

    async stop(): Promise<void> {
        if (!this.isConnected) return;

        // 停止录音
        this.audioProcessor.stop();

        // 发送 finish-task
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
            this.internalStop();
        }, 1000);
    }

    private internalStop() {
        this.audioProcessor.stop();
        if (this.ws) {
            try {
                // Native WebSocket has close() method
                this.ws.close();
            } catch (e) {
                // Ignore
            }
            this.ws = null;
        }
        this.isConnected = false;
    }
}
