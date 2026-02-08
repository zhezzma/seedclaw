import { useUiSettingsStore } from '../../stores/setting'
import { TTSEngine } from './types'
import WebSocket from '@tauri-apps/plugin-websocket';

export class QwenTTS implements TTSEngine {
    constructor() { }

    private getApiKey(): string {
        const store = useUiSettingsStore()
        return store.ttsToken
    }

    private getModel(): string {
        const store = useUiSettingsStore()
        return store.ttsModel || 'qwen3-tts-flash-realtime'
    }

    private getWebSocketUrl(): string {
        return 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime'
    }

    private addWavHeader(samples: Uint8Array, sampleRate: number, numChannels: number, bitDepth: number): Uint8Array {
        const buffer = new ArrayBuffer(44 + samples.length)
        const view = new DataView(buffer)

        // RIFF identifier
        this.writeString(view, 0, 'RIFF')
        // RIFF chunk length
        view.setUint32(4, 36 + samples.length, true)
        // RIFF type
        this.writeString(view, 8, 'WAVE')
        // fmt chunk identifier
        this.writeString(view, 12, 'fmt ')
        // fmt chunk length
        view.setUint32(16, 16, true)
        // sample format (1 is PCM)
        view.setUint16(20, 1, true)
        // channel count
        view.setUint16(22, numChannels, true)
        // sample rate
        view.setUint32(24, sampleRate, true)
        // byte rate (sample rate * block align)
        view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true)
        // block align (channel count * bytes per sample)
        view.setUint16(32, numChannels * (bitDepth / 8), true)
        // bits per sample
        view.setUint16(34, bitDepth, true)
        // data chunk identifier
        this.writeString(view, 36, 'data')
        // data chunk length
        view.setUint32(40, samples.length, true)

        const bytes = new Uint8Array(buffer)
        bytes.set(samples, 44)

        return bytes
    }

    private writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i))
        }
    }

    async stream(text: string, callbacks: {
        onChunk: (data: Uint8Array) => void,
        onEnd: () => void,
        onError: (err: any) => void
    }): Promise<void> {
        const apiKey = this.getApiKey()
        if (!apiKey) {
            callbacks.onError('Missing API Key for Qwen TTS')
            return
        }

        let ws: WebSocket | null = null
        let finished = false
        // Helper to Base64 decode
        const base64ToUint8Array = (base64: string) => {
            const binaryString = window.atob(base64)
            const len = binaryString.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }
            return bytes
        }

        try {
            console.log('Connecting to Qwen TTS via Tauri WebSocket...');
            // Use Tauri WebSocket with Header Auth
            const url = `${this.getWebSocketUrl()}?model=${this.getModel()}`
            ws = await WebSocket.connect(url, {
                headers: {
                    Authorization: `bearer ${apiKey}`
                }
            });
        } catch (e) {
            callbacks.onError(e)
            return
        }


        // Connection timeout logic (manual, as Tauri Connect waits but we might want to enforce our own timeout?)
        // Tauri connect is await-ed, so if it hangs, we hang. Tauri usually has its own timeout.
        // We can keep a safety timeout for the *session* flow.

        const connectionTimeout = setTimeout(() => {
            if (ws && !finished) { // Check finished flag instead of readyState as Tauri WS object doesn't expose readyState property directly effectively in sync way without async check
                // Tauri WS doesn't have .readyState property compatible with standard WS enum (0,1,2,3) directly on the instance in the same way? 
                // Actually it does NOT have readyState property.
                // We rely on our `finished` flag or explicit close.
                try {
                    ws.disconnect();
                } catch (e) { }
                if (!finished) {
                    callbacks.onError('Connection/Protocol timeout');
                    finished = true;
                }
            }
        }, 15000)

        const sendEvent = async (event: any) => {
            if (ws) {
                try {
                    // Add event_id as per example
                    event.event_id = `event_${Date.now()}`
                    await ws.send(JSON.stringify(event))
                } catch (e) {
                    console.error('Send event error', e)
                }
            }
        }

        ws.addListener((msg: any) => {
            if (finished) return;

            if (msg.type === 'Text') {
                try {
                    const event = JSON.parse(msg.data as string);
                    // Logic from onmessage
                    const type = event.type;

                    if (type === 'error') {
                        const errMsg = event.error?.message || 'Unknown Error'
                        if (event.error?.code) {
                            console.error('Qwen Error Code:', event.error.code)
                        }
                        if (!finished) {
                            finished = true
                            clearTimeout(connectionTimeout);
                            callbacks.onError(new Error(errMsg))
                            ws?.disconnect()
                        }
                    } else if (type === 'response.audio.delta') {
                        const b64 = event.delta
                        if (b64) {
                            const data = base64ToUint8Array(b64)
                            callbacks.onChunk(data)
                        }
                    } else if (type === 'response.done') {
                        // Response finished
                    } else if (type === 'session.finished') {
                        if (!finished) {
                            finished = true
                            clearTimeout(connectionTimeout);
                            callbacks.onEnd()
                            ws?.disconnect()
                        }
                    }
                } catch (err) {
                    console.error('Qwen TTS Msg Error', err)
                }
            } else if (msg.type === 'Close') {
                if (!finished) {
                    finished = true;
                    // Check close code if available? msg.data might have code/reason
                    // msg structure: { type: 'Close', data: { code: number, reason: string } } ??
                    // Actually Tauri v2 plugin-websocket Close message data: { code: number, reason: string }
                    const closeData = msg.data as { code: number, reason: string };
                    if (closeData.code === 1000) {
                        callbacks.onEnd();
                    } else {
                        callbacks.onError(new Error(`WebSocket closed: ${closeData.code} ${closeData.reason}`));
                    }
                }
                clearTimeout(connectionTimeout);
            }
        });

        // On Open logic (Tauri connect resolves when open, so we execute this immediately after await connect)
        clearTimeout(connectionTimeout); // Clear initial connect timeout if we had one wrapping the connect call, but here we reset it for the SESSION flow.

        // Re-set timeout for the session flow duration/response?
        // Original code had a timeout that cleared on 'open'. 
        // Here we are 'open' now.

        // 1. Update Session
        await sendEvent({
            type: "session.update",
            session: {
                voice: "Serena",
                mode: "server_commit",
                response_format: "pcm",
                sample_rate: 24000,
                language_type: "Auto"
            }
        })

        // 2. Send Text
        await sendEvent({
            type: "input_text_buffer.append",
            text: text
        })

        // 3. Finish (Delay slightly to allow processing)
        setTimeout(async () => {
            await sendEvent({ type: "session.finish" })
        }, 1000)
    }


    async ttsPromise(text: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const chunks: Uint8Array[] = []
            this.stream(text, {
                onChunk: (data) => chunks.push(data),
                onEnd: () => {
                    // Concatenate all chunks
                    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
                    const concatenated = new Uint8Array(totalLength)
                    let offset = 0
                    for (const chunk of chunks) {
                        concatenated.set(chunk, offset)
                        offset += chunk.length
                    }

                    // Add WAV header
                    const wavData = this.addWavHeader(concatenated, 24000, 1, 16)
                    resolve(new Blob([wavData] as any, { type: 'audio/wav' }))
                },
                onError: (err) => reject(err)
            }).catch(reject)
        })
    }
}
