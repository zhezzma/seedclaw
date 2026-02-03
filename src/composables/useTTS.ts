import { ref } from 'vue'
import { EdgeTTS } from '../utils/tts/edge-tts'

// Shared state
const currentReadingMsgId = ref<string | null>(null)
const currentAudio = ref<HTMLAudioElement | null>(null)

/**
 * Composable for Text-to-Speech functionality
 * Supports Edge TTS for Edge browsers/Tauri, Web Speech API for Chrome
 */
export function useTTS() {
    /**
     * Stop current audio playback
     */
    const stopPlayback = () => {
        if (currentAudio.value) {
            currentAudio.value.pause()
            currentAudio.value.removeAttribute('src')
            currentAudio.value = null
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel()
        }
        currentReadingMsgId.value = null
    }

    /**
     * Check if a message is currently being read
     */
    const isReading = (msgId: string) => currentReadingMsgId.value === msgId

    /**
     * Read text aloud using the appropriate TTS engine
     */
    const readAloud = async (msgId: string, text: string) => {
        try {
            // If clicking the current playing message, stop it
            if (currentReadingMsgId.value === msgId) {
                stopPlayback()
                return
            }

            // Stop existing playback
            stopPlayback()
            currentReadingMsgId.value = msgId

            if (!text.trim()) return

            // Detect browser type
            const ua = navigator.userAgent
            // @ts-ignore
            const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
            // Edge variants: Edg/ (PC), EdgA/ (Android), EdgiOS/ (iOS)
            const isEdge = /Edg\/|EdgA\/|EdgiOS\//.test(ua)
            const isChrome = ua.includes('Chrome/') && !isEdge

            // Chrome browsers can't use Edge TTS (server checks User-Agent for "Edg/")
            // Use Web Speech API as fallback
            if (isChrome && !isTauri && window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance(text)
                utterance.lang = 'zh-CN'
                utterance.rate = 1.0
                utterance.onend = () => {
                    if (currentReadingMsgId.value === msgId) {
                        currentReadingMsgId.value = null
                    }
                }
                utterance.onerror = () => {
                    currentReadingMsgId.value = null
                }
                window.speechSynthesis.speak(utterance)
                return
            }

            // Use Edge TTS
            const edge = new EdgeTTS()

            // Use MSE if supported
            if (window.MediaSource && MediaSource.isTypeSupported('audio/mpeg')) {
                await playWithMSE(edge, text, msgId)
            } else {
                await playWithBlob(edge, text, msgId)
            }
        } catch (error) {
            console.error('TTS Error:', error)
            currentReadingMsgId.value = null
        }
    }

    /**
     * Play audio using MediaSource Extensions (streaming)
     */
    const playWithMSE = async (edge: EdgeTTS, text: string, msgId: string) => {
        const mediaSource = new MediaSource()
        const url = URL.createObjectURL(mediaSource)
        const audio = new Audio(url)
        currentAudio.value = audio

        const cleanup = () => {
            if (currentReadingMsgId.value === msgId) {
                currentReadingMsgId.value = null
                currentAudio.value = null
            }
            URL.revokeObjectURL(url)
        }

        audio.onended = cleanup
        audio.onerror = () => cleanup()

        mediaSource.addEventListener('sourceopen', () => {
            try {
                const sb = mediaSource.addSourceBuffer('audio/mpeg')
                const queue: Uint8Array[] = []
                let updating = false

                const processQueue = () => {
                    if (updating || queue.length === 0 || sb.updating) return
                    updating = true
                    try {
                        sb.appendBuffer(queue.shift()! as unknown as BufferSource)
                    } catch {
                        updating = false
                    }
                }

                sb.addEventListener('updateend', () => {
                    updating = false
                    processQueue()
                })

                edge.stream(text, {
                    onChunk: (data) => {
                        if (mediaSource.readyState === 'open') {
                            queue.push(data)
                            processQueue()
                            if (audio.paused && sb.buffered.length > 0) {
                                audio.play().catch(() => { })
                            }
                        }
                    },
                    onEnd: () => {
                        if (mediaSource.readyState === 'open' && !sb.updating && queue.length === 0) {
                            mediaSource.endOfStream()
                        } else {
                            const checkEnd = setInterval(() => {
                                if (mediaSource.readyState !== 'open') {
                                    clearInterval(checkEnd)
                                    return
                                }
                                if (!sb.updating && queue.length === 0) {
                                    mediaSource.endOfStream()
                                    clearInterval(checkEnd)
                                }
                            }, 100)
                        }
                    },
                    onError: () => {
                        if (mediaSource.readyState === 'open') mediaSource.endOfStream('network')
                    }
                }).catch(() => { })
            } catch {
                // SourceBuffer creation failed
            }
        })

        audio.play().catch(() => { })
    }

    /**
     * Play audio using Blob (download then play)
     */
    const playWithBlob = async (edge: EdgeTTS, text: string, msgId: string) => {
        const blob = await edge.ttsPromise(text)
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        currentAudio.value = audio

        audio.onended = () => {
            if (currentReadingMsgId.value === msgId) {
                currentReadingMsgId.value = null
                currentAudio.value = null
            }
            URL.revokeObjectURL(url)
        }

        audio.play().catch(() => { })
    }

    return {
        currentReadingMsgId,
        currentAudio,
        isReading,
        readAloud,
        stopPlayback
    }
}
