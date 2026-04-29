import WebSocket from '@tauri-apps/plugin-websocket'

import { useUiSettingsStore } from '../../stores/setting'
import { useToast } from '../../composables/useToast'
import { ASREngine } from './types'

export const DEFAULT_VOICE_GATEWAY_ASR_MODEL = '@cf/openai/whisper-large-v3-turbo'

const FINAL_TIMEOUT_MS = 5000

export function resolveVoiceGatewayAsrToken(token: string): string {
    return token.trim()
}

export function buildVoiceGatewaySttUrl(baseUrl: string, token: string): string {
    const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
    const normalizedBaseUrl = trimmedBaseUrl
        .replace(/^https:\/\//i, 'wss://')
        .replace(/^http:\/\//i, 'ws://')

    return `${normalizedBaseUrl}/ws/stt?provider=workers-ai&token=${encodeURIComponent(token)}`
}

export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'streaming' | 'stopping' | 'closed'

interface VoiceGatewayConfig {
    token: string
    model: string
    baseUrl: string
    language: 'zh' | 'en'
}

export class VoiceGatewayASRService implements ASREngine {
    private ws: WebSocket | null = null
    private state: ConnectionState = 'idle'
    private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null
    private stopPromise: Promise<void> | null = null
    private stopResolver: (() => void) | null = null
    private finalTimeoutId: ReturnType<typeof setTimeout> | null = null
    private listenerCleanup: (() => void) | null = null
    private configSent: boolean = false
    private sessionConfig: VoiceGatewayConfig | null = null

    private getConfig(): VoiceGatewayConfig {
        const store = useUiSettingsStore()
        const config = store.getAsrConfig('voice-gateway')
        return {
            token: resolveVoiceGatewayAsrToken(config.token),
            model: config.model.trim() || DEFAULT_VOICE_GATEWAY_ASR_MODEL,
            baseUrl: config.baseUrl.trim(),
            language: store.language,
        }
    }

    async start(onResult: (text: string, isFinal: boolean) => void): Promise<void> {
        if (this.state === 'connecting' || this.state === 'ready' || this.state === 'streaming') {
            console.warn('Voice Gateway ASR is already running.')
            return
        }

        const config = this.getConfig()

        if (!config.token) {
            useToast().error('ASR token is missing. Please configure it in settings.')
            throw new Error('ASR token is missing')
        }

        if (!config.baseUrl) {
            useToast().error('Voice Gateway URL is missing. Please configure it in settings.')
            throw new Error('Voice Gateway URL is missing')
        }

        const wsUrl = buildVoiceGatewaySttUrl(config.baseUrl, config.token)
        this.onResultCallback = onResult
        this.state = 'connecting'
        this.configSent = false
        this.sessionConfig = config

        try {
            console.info('[VoiceGatewayASR] connecting', { model: config.model, language: config.language })
            this.ws = await WebSocket.connect(wsUrl)
            console.info('[VoiceGatewayASR] connected')
            await this.attachListener()
            await this.sendConfig(config.model)

            if (!this.ws) {
                throw new Error('Voice Gateway ASR connection closed during startup')
            }

            this.state = 'ready'
        } catch (error) {
            console.error('Failed to start Voice Gateway ASR:', error)
            const startError = error instanceof Error ? error : new Error(String(error))
            this.cleanup()
            throw startError
        }
    }

    async sendAudio(pcmData: Int16Array): Promise<void> {
        if (!this.ws || !this.configSent || (this.state !== 'connecting' && this.state !== 'ready' && this.state !== 'streaming')) {
            return
        }

        const data = Array.from(new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength))

        try {
            await this.ws.send(data)
            if (this.state === 'connecting' || this.state === 'ready') {
                this.state = 'streaming'
            }
        } catch (error) {
            console.error('Failed to send Voice Gateway audio data:', error)
        }
    }

    async stop(): Promise<void> {
        if (!this.ws || this.state === 'idle' || this.state === 'closed') {
            this.cleanup()
            return
        }

        if (this.stopPromise) {
            return this.stopPromise
        }

        const sessionConfig = this.sessionConfig
        const language = sessionConfig?.language ?? this.getConfig().language
        this.state = 'stopping'

        this.stopPromise = new Promise<void>((resolve) => {
            this.stopResolver = resolve
        })

        this.finalTimeoutId = setTimeout(() => {
            this.finishStop()
        }, FINAL_TIMEOUT_MS)

        try {
            await this.ws.send(JSON.stringify({
                type: 'audio_end',
                language,
            }))
        } catch (error) {
            console.error('Failed to send Voice Gateway audio_end:', error)
            this.finishStop()
        }

        return this.stopPromise
    }

    private finishStop(): void {
        this.clearFinalTimeout()

        const resolve = this.stopResolver
        this.stopResolver = null
        this.stopPromise = null
        this.cleanup()
        resolve?.()
    }

    private clearFinalTimeout(): void {
        if (this.finalTimeoutId) {
            clearTimeout(this.finalTimeoutId)
            this.finalTimeoutId = null
        }
    }

    private async sendConfig(model: string): Promise<void> {
        if (!this.ws || this.configSent) {
            return
        }

        this.configSent = true
        const payload = {
            type: 'config',
            model,
        }
        await this.ws.send(JSON.stringify(payload))
    }

    private async attachListener(): Promise<void> {
        if (!this.ws) {
            return
        }

        const listenerHandle = await Promise.resolve(this.ws.addListener((msg: any) => {
            if (msg.type === 'Text') {
                try {
                    const message = JSON.parse(msg.data as string)
                    const messageType = String(message?.type || '').toLowerCase()

                    if (messageType === 'ready') {
                        this.state = 'ready'
                        return
                    }

                    if (messageType === 'error') {
                        const errorMessage = String(message?.error || message?.message || 'Unknown ASR error')
                        console.error('[VoiceGatewayASR] error:', errorMessage)
                        useToast().error(`Voice Gateway ASR error: ${errorMessage}`)
                        if (this.state === 'stopping') {
                            this.finishStop()
                        } else {
                            this.cleanup()
                        }
                        return
                    }

                    const text = this.extractText(message)
                    const isFinal = Boolean(message?.isFinal ?? message?.final ?? messageType === 'final')

                    if (text) {
                        this.onResultCallback?.(text, isFinal)
                    }

                    if (isFinal) {
                        if (this.state === 'stopping') {
                            this.finishStop()
                        } else if (this.state !== 'closed') {
                            this.state = 'ready'
                        }
                    } else if (text && (this.state === 'ready' || this.state === 'streaming')) {
                        this.state = 'streaming'
                    }
                } catch (error) {
                    console.error('Failed to parse Voice Gateway message:', error)
                }
            } else if (msg.type === 'Binary') {
                // Voice Gateway STT does not currently require binary server messages.
            } else if (msg.type === 'Close') {
                console.warn('[VoiceGatewayASR] close', msg.data)

                if (this.stopResolver) {
                    const resolve = this.stopResolver
                    this.stopResolver = null
                    this.stopPromise = null
                    this.cleanup()
                    resolve()
                    return
                }

                this.cleanup()
            }
        }) as any)

        this.listenerCleanup = this.resolveListenerCleanup(listenerHandle)
    }

    private resolveListenerCleanup(listenerHandle: any): (() => void) | null {
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

    private cleanup(): void {
        this.clearFinalTimeout()

        if (this.listenerCleanup) {
            try {
                this.listenerCleanup()
            } catch (error) {
                console.warn('Error removing Voice Gateway websocket listener:', error)
            }
            this.listenerCleanup = null
        }

        if (this.ws) {
            try {
                this.ws.disconnect()
            } catch (error) {
                console.warn('Error disconnecting Voice Gateway websocket:', error)
            }
        }

        this.ws = null
        this.state = 'closed'
        this.onResultCallback = null
        this.configSent = false
        this.sessionConfig = null
    }

    private extractText(message: Record<string, any>): string {
        return String(
            message?.text
            ?? message?.transcript
            ?? message?.result?.text
            ?? message?.data?.text
            ?? '',
        )
    }
}
