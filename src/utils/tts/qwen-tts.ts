import { useUiSettingsStore } from '../../stores/setting'
import { TTSEngine } from './types'

export class QwenTTS implements TTSEngine {
    private apiKey: string
    private model: string

    constructor() {
        const store = useUiSettingsStore()
        this.apiKey = store.ttsToken || import.meta.env.VITE_TTSTOKEN || ''
        this.model = store.ttsModel || 'qwen3-tts-flash-realtime-2025-11-27'
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
        if (!this.apiKey) {
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
            // Use native WebSocket with query param auth
            const url = `${this.getWebSocketUrl()}?api_key=${this.apiKey}&model=${this.model}`
            ws = new WebSocket(url)
        } catch (e) {
            callbacks.onError(e)
            return
        }

        // Connection timeout
        const connectionTimeout = setTimeout(() => {
            if (ws && ws.readyState !== WebSocket.OPEN) {
                ws.close()
                callbacks.onError('Connection timeout')
            }
        }, 10000)

        const sendEvent = (event: any) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                    // Add event_id as per example
                    event.event_id = `event_${Date.now()}`
                    ws.send(JSON.stringify(event))
                } catch (e) {
                    console.error('Send event error', e)
                }
            }
        }

        ws.onopen = async () => {
            clearTimeout(connectionTimeout)

            // 1. Update Session
            sendEvent({
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
            sendEvent({
                type: "input_text_buffer.append",
                text: text
            })

            // 3. Finish (Delay slightly to allow processing)
            setTimeout(() => {
                sendEvent({ type: "session.finish" })
            }, 1000)
        }

        ws.onmessage = (event: MessageEvent) => {
            if (finished) return

            try {
                const msg = JSON.parse(event.data)
                const type = msg.type

                if (type === 'error') {
                    const errMsg = msg.error?.message || 'Unknown Error'
                    if (msg.error?.code) {
                        console.error('Qwen Error Code:', msg.error.code)
                    }
                    if (!finished) {
                        finished = true
                        callbacks.onError(new Error(errMsg))
                        ws?.close()
                    }
                } else if (type === 'response.audio.delta') {
                    const b64 = msg.delta
                    if (b64) {
                        const data = base64ToUint8Array(b64)
                        callbacks.onChunk(data)
                    }
                } else if (type === 'response.done') {
                    // Response finished
                } else if (type === 'session.finished') {
                    if (!finished) {
                        finished = true
                        callbacks.onEnd()
                        ws?.close()
                    }
                }
            } catch (err) {
                console.error('Qwen TTS Msg Error', err)
            }
        }

        ws.onerror = (e) => {
            clearTimeout(connectionTimeout)
            if (!finished) {
                finished = true
                console.error('WebSocket Error', e)
                callbacks.onError(new Error('WebSocket Connection Error'))
            }
        }

        ws.onclose = (e) => {
            clearTimeout(connectionTimeout)
            if (!finished) {
                if (e.code === 1000) {
                    finished = true
                    callbacks.onEnd()
                } else {
                    finished = true
                    callbacks.onError(new Error(`WebSocket closed: ${e.code} ${e.reason}`))
                }
            }
        }
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
