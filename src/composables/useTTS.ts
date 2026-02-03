/**
 * 音频概念与在此实现中的用法：
 * 
 * 1. PCM (原始数据) -> Qwen TTS 使用
 *    - 最低延迟（实时）。
 *    - 原始音频采样通过 AudioContext 立即播放。
 *    - 实现：playWithPCM
 * 
 * 2. MSE (媒体源扩展) -> Edge TTS 使用
 *    - 低延迟（流式）。
 *    - 压缩音频块（MP3）被送入 SourceBuffer。
 *    - 实现：playWithMSE
 * 
 * 3. Blob (二进制大对象) -> 兜底方案
 *    - 高延迟。
 *    - 播放开始前必须下载完整文件。
 *    - 实现：playWithBlob
 */
import { ref } from 'vue'
import { EdgeTTS } from '../utils/tts/edge-tts'
import { QwenTTS } from '../utils/tts/qwen-tts'
import { useUiSettingsStore } from '../stores/setting'

// Shared state
const currentReadingMsgId = ref<string | null>(null)
const currentAudio = ref<HTMLAudioElement | null>(null)

/**
 * Composable for Text-to-Speech functionality
 * Supports Edge TTS for Edge browsers/Tauri, Web Speech API for Chrome
 */
export function useTTS() {
    const store = useUiSettingsStore()

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

            if (store.ttsEngine === 'qwen') {
                // Use Qwen TTS (PCM Streaming)
                const tts = new QwenTTS()
                // @ts-ignore
                await playWithPCM(tts, text, msgId)
            } else {
                // Use Edge TTS (MSE/Blob)
                const tts = new EdgeTTS()

                // Chrome browsers can't use Edge TTS (server checks User-Agent for "Edg/")
                // But if we are in Tauri or using Edge, we can try.
                // For simplicity, let's just attempt Edge TTS as the user likely wants.
                // We'll fallback to WebSpeech if EdgeTTS fails or based on UA logic if strictly needed,
                // but user asked for simple switch.

                // Use MSE if supported and capable of playing MP3 (EdgeTTS output)
                if (window.MediaSource && MediaSource.isTypeSupported('audio/mpeg')) {
                    // @ts-ignore
                    await playWithMSE(tts, text, msgId)
                } else {
                    // @ts-ignore
                    await playWithBlob(tts, text, msgId)
                }
            }
        } catch (error) {
            console.error('TTS Error:', error)
            currentReadingMsgId.value = null
        }
    }

    /**
     * Play audio using MediaSource Extensions (streaming)
     */
    const playWithMSE = async (tts: QwenTTS | EdgeTTS, text: string, msgId: string) => {
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

                tts.stream(text, {
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
                    onError: (e) => {
                        console.error('TTS Stream Config Error', e)
                        if (mediaSource.readyState === 'open') mediaSource.endOfStream('network')
                    }
                }).catch((err) => {
                    console.error('TTS Stream Error', err)
                })
            } catch {
                // SourceBuffer creation failed
            }
        })

        audio.play().catch(() => { })
    }

    /**
     * Play raw PCM audio using AudioContext (True Streaming)
     */
    const playWithPCM = async (tts: QwenTTS, text: string, msgId: string) => {
        // Initialize AudioContext
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioContext({ sampleRate: 24000 })
        let nextStartTime = 0

        // Store context for cleanup (we can hack this into currentAudio or need a new ref)
        // Since currentAudio is HTMLAudioElement, we might need to broaden the type or manage separately.
        // For now, let's attach a "stop" method to the context or track it.
        const audioState = {
            ctx,
            stop: () => {
                ctx.close()
            }
        }

        // Cleanup function
        const cleanup = () => {
            if (currentReadingMsgId.value === msgId) {
                currentReadingMsgId.value = null
                // We don't have a standardized way to store non-AudioElement players yet in this codebase
                // But valid cleanup is important.
            }
            if (ctx.state !== 'closed') {
                ctx.close()
            }
        }

        // We need to override stopPlayback to handle this custom player
        // Ideally we would refactor currentAudio to be more generic, but for now we can intercept.
        // Let's modify stopPlayback to check for this custom state if we stored it globally.
        // Or simpler: just wrap logic here.

        // However, useTTS exports stopPlayback. We need to register this player.
        // START HACK: Monkey patch currentAudio to hold our custom player
        // This is a bit dirty but keeps the interface compatible without major refactor
        // @ts-ignore
        currentAudio.value = {
            pause: () => ctx.close(),
            removeAttribute: () => { },
            // Mock other props if needed
        }

        tts.stream(text, {
            onChunk: (data: Uint8Array) => {
                if (currentReadingMsgId.value !== msgId || ctx.state === 'closed') return

                // Convert 16-bit PCM to Float32
                const numSamples = data.length / 2
                const float32 = new Float32Array(numSamples)
                const view = new DataView(data.buffer, data.byteOffset, data.length)

                for (let i = 0; i < numSamples; i++) {
                    const int16 = view.getInt16(i * 2, true) // Little-endian
                    float32[i] = int16 / 32768.0
                }

                const buffer = ctx.createBuffer(1, numSamples, 24000)
                buffer.getChannelData(0).set(float32)

                const source = ctx.createBufferSource()
                source.buffer = buffer
                source.connect(ctx.destination)

                const currentTime = ctx.currentTime
                if (nextStartTime < currentTime) {
                    nextStartTime = currentTime
                }

                source.start(nextStartTime)
                nextStartTime += buffer.duration
            },
            onEnd: () => {
                // Wait for playback to finish
                const delay = (nextStartTime - ctx.currentTime) * 1000
                setTimeout(() => {
                    cleanup()
                }, delay + 100)
            },
            onError: (err) => {
                console.error('PCM Stream Error', err)
                cleanup()
            }
        }).catch(cleanup)
    }

    /**
     * Play audio using Blob (download then play)
     */
    const playWithBlob = async (tts: QwenTTS | EdgeTTS, text: string, msgId: string) => {
        const blob = await tts.ttsPromise(text)
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
