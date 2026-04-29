import WebSocket from '@tauri-apps/plugin-websocket'

import { useUiSettingsStore } from '../../stores/setting'
import { createRuntimeId } from '../runtime-id'
import { TTSEngine } from './types'

export const DEFAULT_VOICE_GATEWAY_TTS_MODEL = 'gemini-3.1-flash-tts-preview'
export const DEFAULT_VOICE_GATEWAY_TTS_VOICE = 'Aoede'

const READY_TIMEOUT_MS = 10000
const SESSION_INACTIVITY_TIMEOUT_MS = 15000

export function resolveVoiceGatewayTtsToken(token: string): string {
    return token.trim()
}

export function buildVoiceGatewayTtsUrl(baseUrl: string, token: string): string {
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
    const normalizedBaseUrl = trimmedBaseUrl
        .replace(/^https:\/\//i, 'wss://')
        .replace(/^http:\/\//i, 'ws://')

    return `${normalizedBaseUrl}/ws/tts?provider=gemini&token=${encodeURIComponent(token)}`
}

export function pcm16ToWav(samples: Uint8Array, sampleRate: number, numChannels: number, bitDepth: number): Uint8Array {
    const buffer = new ArrayBuffer(44 + samples.length)
    const view = new DataView(buffer)

    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + samples.length, true)
    writeString(view, 8, 'WAVE')
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true)
    view.setUint16(32, numChannels * (bitDepth / 8), true)
    view.setUint16(34, bitDepth, true)
    writeString(view, 36, 'data')
    view.setUint32(40, samples.length, true)

    const bytes = new Uint8Array(buffer)
    bytes.set(samples, 44)
    return bytes
}

function writeString(view: DataView, offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i))
    }
}

interface VoiceGatewayTtsConfig {
    token: string
    model: string
    voice: string
    baseUrl: string
    language: 'zh' | 'en'
}

export class VoiceGatewayTTS implements TTSEngine {
    // Voice Gateway TTS currently streams raw PCM16 chunks; ttsPromise() wraps them into WAV for blob callers.
    readonly streamFormat = 'pcm' as const

    private getConfig(): VoiceGatewayTtsConfig {
        const store = useUiSettingsStore()
        const config = store.getTtsConfig('voice-gateway')

        return {
            token: resolveVoiceGatewayTtsToken(config.token),
            model: config.model.trim() || DEFAULT_VOICE_GATEWAY_TTS_MODEL,
            voice: DEFAULT_VOICE_GATEWAY_TTS_VOICE,
            baseUrl: config.baseUrl.trim(),
            language: store.language,
        }
    }

    async stream(text: string, callbacks: {
        onChunk: (data: Uint8Array) => void,
        onEnd: () => void,
        onError: (err: any) => void
    }): Promise<void> {
        const trimmedText = text.trim()
        if (!trimmedText) {
            callbacks.onError(new Error('TTS text is empty'))
            return
        }

        const config = this.getConfig()
        if (!config.token) {
            callbacks.onError(new Error('Voice Gateway TTS token is missing'))
            return
        }

        if (!config.baseUrl) {
            callbacks.onError(new Error('Voice Gateway URL is missing'))
            return
        }

        const wsUrl = buildVoiceGatewayTtsUrl(config.baseUrl, config.token)
        const requestId = createRuntimeId('tts')

        let ws: WebSocket | null = null
        let audioStarted = false
        let finished = false
        let synthesizeSent = false
        let listenerCleanup: (() => void) | null = null
        let readyTimeoutId: ReturnType<typeof setTimeout> | null = null
        let sessionTimeoutId: ReturnType<typeof setTimeout> | null = null

        const clearReadyTimeout = () => {
            if (readyTimeoutId) {
                clearTimeout(readyTimeoutId)
                readyTimeoutId = null
            }
        }

        const clearSessionTimeout = () => {
            if (sessionTimeoutId) {
                clearTimeout(sessionTimeoutId)
                sessionTimeoutId = null
            }
        }

        const armSessionTimeout = () => {
            clearSessionTimeout()
            sessionTimeoutId = setTimeout(() => {
                fail(new Error('Voice Gateway TTS session inactivity timeout'))
            }, SESSION_INACTIVITY_TIMEOUT_MS)
        }

        const disconnect = () => {
            clearReadyTimeout()
            clearSessionTimeout()

            if (listenerCleanup) {
                try {
                    listenerCleanup()
                } catch (error) {
                    console.warn('Error removing Voice Gateway TTS listener:', error)
                }
                listenerCleanup = null
            }

            if (ws) {
                try {
                    ws.disconnect()
                } catch (error) {
                    console.warn('Error disconnecting Voice Gateway TTS websocket:', error)
                }
                ws = null
            }
        }

        const sendSynthesize = async () => {
            if (!ws || synthesizeSent || finished) {
                return
            }

            synthesizeSent = true
            clearReadyTimeout()
            armSessionTimeout()

            await ws.send(JSON.stringify({
                type: 'synthesize',
                id: requestId,
                text: trimmedText,
                model: config.model,
                voice: config.voice,
                language: config.language,
            }))
        }

        const fail = (error: unknown) => {
            if (finished) {
                return
            }
            finished = true
            callbacks.onError(error instanceof Error ? error : new Error(String(error)))
            disconnect()
        }

        const succeed = () => {
            if (finished) {
                return
            }
            finished = true
            callbacks.onEnd()
            disconnect()
        }

        readyTimeoutId = setTimeout(() => {
            fail(new Error('Voice Gateway TTS ready timeout'))
        }, READY_TIMEOUT_MS)

        try {
            ws = await WebSocket.connect(wsUrl)
        } catch (error) {
            fail(error)
            return
        }

        const listenerHandle = await Promise.resolve(ws.addListener(async (msg: any) => {
            if (finished) {
                return
            }

            if (msg.type === 'Binary') {
                if (!audioStarted) {
                    fail(new Error('Received audio before audio_start'))
                    return
                }

                armSessionTimeout()
                callbacks.onChunk(new Uint8Array(msg.data))
                return
            }

            if (msg.type === 'Text') {
                try {
                    const message = JSON.parse(msg.data as string)
                    const type = String(message?.type || '').toLowerCase()

                    if (type === 'ready') {
                        await sendSynthesize()
                        return
                    }

                    if (type === 'audio_start') {
                        audioStarted = true
                        armSessionTimeout()
                        return
                    }

                    if (type === 'audio_end') {
                        clearSessionTimeout()
                        succeed()
                        return
                    }

                    if (type === 'error') {
                        const errorMessage = String(message?.error || message?.message || 'Unknown Voice Gateway TTS error')
                        fail(new Error(errorMessage))
                    }
                } catch (error) {
                    fail(error)
                }
                return
            }

            if (msg.type === 'Close') {
                if (!finished) {
                    const code = msg.data?.code
                    const reason = msg.data?.reason
                    fail(new Error(`Voice Gateway TTS connection closed: ${code ?? 'unknown'} ${reason ?? ''}`.trim()))
                }
            }
        }) as any)

        listenerCleanup = resolveListenerCleanup(listenerHandle)

        try {
            await sendSynthesize()
        } catch (error) {
            fail(error)
        }
    }

    async ttsPromise(text: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const chunks: Uint8Array[] = []

            this.stream(text, {
                onChunk: (data) => chunks.push(data),
                onEnd: () => {
                    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
                    const pcm = new Uint8Array(totalLength)
                    let offset = 0

                    for (const chunk of chunks) {
                        pcm.set(chunk, offset)
                        offset += chunk.length
                    }

                    const wav = pcm16ToWav(pcm, 24000, 1, 16)
                    resolve(new Blob([wav] as BlobPart[], { type: 'audio/wav' }))
                },
                onError: (err) => reject(err),
            }).catch(reject)
        })
    }
}

function resolveListenerCleanup(listenerHandle: any): (() => void) | null {
    if (typeof listenerHandle === 'function') {
        return listenerHandle
    }

    if (listenerHandle && typeof listenerHandle.unlisten === 'function') {
        return () => {
            listenerHandle.unlisten()
        }
    }

    if (listenerHandle && typeof listenerHandle.remove === 'function') {
        return () => {
            listenerHandle.remove()
        }
    }

    return null
}
