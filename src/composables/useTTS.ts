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

import { cleanTextForTTS, splitText } from '../utils/textUtils'

// Shared state
const currentReadingMsgId = ref<string | null>(null)
const currentAudio = ref<HTMLAudioElement | { pause: () => void, removeAttribute: () => void } | null>(null)
let currentPlaybackResolve: (() => void) | null = null

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
        // Resolve any pending playback promise to unblock readAloud loop
        if (currentPlaybackResolve) {
            currentPlaybackResolve()
            currentPlaybackResolve = null
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

            const cleaned = cleanTextForTTS(text)
            if (!cleaned) return

            currentReadingMsgId.value = msgId

            // Split text if too long
            const chunks = splitText(cleaned)

            for (const chunk of chunks) {
                // Check if we were stopped/interrupted during previous chunk
                if (currentReadingMsgId.value !== msgId) break

                if (store.ttsEngine === 'qwen') {
                    // Use Qwen TTS (PCM Streaming)
                    const tts = new QwenTTS()
                    // @ts-ignore
                    await playWithPCM(tts, chunk, msgId)
                } else {
                    // Use Edge TTS (MSE/Blob)
                    const tts = new EdgeTTS()

                    if (window.MediaSource && MediaSource.isTypeSupported('audio/mpeg')) {
                        // @ts-ignore
                        await playWithMSE(tts, chunk, msgId)
                    } else {
                        // @ts-ignore
                        await playWithBlob(tts, chunk, msgId)
                    }
                }
            }

            // Finished all chunks naturally
            if (currentReadingMsgId.value === msgId) {
                currentReadingMsgId.value = null
            }
        } catch (error) {
            console.error('TTS Error:', error)
            currentReadingMsgId.value = null
        }
    }

    /**
     * Play audio using MediaSource Extensions (streaming)
     */
    const playWithMSE = (tts: QwenTTS | EdgeTTS, text: string, msgId: string): Promise<void> => {
        return new Promise((resolve) => {
            // Register global resolve for cancellation
            currentPlaybackResolve = resolve

            const mediaSource = new MediaSource()
            const url = URL.createObjectURL(mediaSource)
            const audio = new Audio(url)
            currentAudio.value = audio

            const cleanup = () => {
                // Only clean global state if we are still the active message
                // (though cleanup is called on end/error, so usually yes)
                URL.revokeObjectURL(url)
                if (currentPlaybackResolve === resolve) {
                    currentPlaybackResolve = null
                    resolve()
                }
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
                            // Should we force cleanup?
                            // Let's rely on mediaSource.endOfStream triggering audio end or error
                        }
                    }).catch((err) => {
                        console.error('TTS Stream Error', err)
                        cleanup()
                    })
                } catch {
                    // SourceBuffer creation failed
                    cleanup()
                }
            })

            audio.play().catch(() => { cleanup() })
        })
    }

    /**
     * Play raw PCM audio using AudioContext (True Streaming)
     */
    const playWithPCM = (tts: QwenTTS, text: string, msgId: string): Promise<void> => {
        return new Promise((resolve) => {
            currentPlaybackResolve = resolve

            // Initialize AudioContext
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext
            const ctx = new AudioContext({ sampleRate: 24000 })
            let nextStartTime = 0

            // Cleanup function
            const cleanup = () => {
                if (ctx.state !== 'closed') {
                    ctx.close()
                }
                if (currentPlaybackResolve === resolve) {
                    currentPlaybackResolve = null
                    resolve()
                }
            }

            // START HACK: Monkey patch currentAudio to hold our custom player
            // @ts-ignore
            currentAudio.value = {
                pause: () => {
                    cleanup()
                },
                removeAttribute: () => { },
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
                    }, Math.max(0, delay + 100))
                },
                onError: (err) => {
                    console.error('PCM Stream Error', err)
                    cleanup()
                }
            }).catch(cleanup)
        })
    }

    /**
     * Play audio using Blob (download then play)
     */
    const playWithBlob = (tts: QwenTTS | EdgeTTS, text: string, msgId: string): Promise<void> => {
        return new Promise(async (resolve) => {
            currentPlaybackResolve = resolve

            try {
                const blob = await tts.ttsPromise(text)
                const url = URL.createObjectURL(blob)
                const audio = new Audio(url)
                currentAudio.value = audio

                audio.onended = () => {
                    URL.revokeObjectURL(url)
                    if (currentPlaybackResolve === resolve) {
                        currentPlaybackResolve = null
                        resolve()
                    }
                }

                audio.play().catch(() => {
                    if (currentPlaybackResolve === resolve) {
                        currentPlaybackResolve = null
                        resolve()
                    }
                })
            } catch (e) {
                console.error('Blob TTS Error', e)
                if (currentPlaybackResolve === resolve) {
                    currentPlaybackResolve = null
                    resolve()
                }
            }
        })
    }

    return {
        currentReadingMsgId,
        currentAudio,
        isReading,
        readAloud,
        stopPlayback
    }
}
