/**
 * useVoiceChat - 语音对话 Composable
 * 
 * ============================================================================
 * TTS 流式播放处理流程
 * ============================================================================
 * 
 * 【核心流程】
 * 1. 文本累加器：创建字符串缓冲区 (textBuffer)，把流式返回的 delta 内容不断往里加
 * 2. 断句检测：检查缓冲区中是否有断句标点符号 (。？！.?!\n)
 * 3. 任务分发：一旦检测到完整句子且符合最小长度要求，提取句子送入 TTS 队列
 * 4. 收尾处理：当收到 state:"final" 时，合并剩余待处理内容，统一发送
 * 
 * 【关键组件】
 * - textBuffer: 文本缓冲区，累积流式文本
 * - processedTextLength: 已处理的文本长度，用于计算增量
 * - playbackQueue: 音频播放队列，存储 AudioSegment 对象
 * - AudioSegment: { id, text, status, audioUrl, blob, retryCount }
 *   - status: pending → fetching → ready → (播放) / error
 * 
 * 【断句规则】
 * - 断句标点：. ? ! 。 ？ ！ \n
 * - 最小长度阈值：MIN_SENTENCE_LENGTH (默认150字符)
 * - 文本清洗：移除 Markdown 标记、颜文字、代码块等不适合朗读的内容
 * 
 * 【预加载机制】
 * - 生产者：speakStream() 检测到完整句子后，立即调用 queueAudio()
 * - queueAudio() 创建 AudioSegment 并立即触发 fetchSegmentAudio() 后台下载
 * - 消费者：processPlaybackQueue() 按顺序播放 ready 状态的音频
 * - 当一个音频播放时，后续音频已在后台下载，实现流水线效果
 * 
 * 【收尾合并】
 * - 当 finishStream() 被调用时（AI 回复结束）：
 *   1. 先 flush 缓冲区剩余内容
 *   2. 检查队列中 pending 状态的 segment
 *   3. 如果有多个 pending segment，合并成一个大段落
 *   4. 已经 fetching/ready 的 segment 保持不变，正常播放
 * - 合并目的：减少 TTS 请求次数，减少音频间隙
 * 
 * 【失败重试】
 * - 最大重试次数：MAX_RETRIES (3次)
 * - 重试延迟：指数退避 500ms * retryCount
 * - 超过重试次数后标记为 error，跳过该 segment 继续播放下一个
 * 
 * 【文本清洗 cleanTextForTTS()】
 * - 移除代码块 ```...```
 * - 移除行内代码 `...`
 * - Markdown 链接 [text](url) → 保留 text
 * - Markdown 图片 ![alt](url) → 移除
 * - 粗体/斜体标记 **text** *text* → 保留 text
 * - 标题标记 # ## ### → 移除
 * - 分隔线 --- *** → 移除
 * - 颜文字表情 (๑>◡<๑) ╮(╯▽╰)╭ → 移除
 * - 装饰符号 ♪ ★ ❤ → 等 → 移除
 * - 连续标点 !!! ？？？ → 最多保留2个
 * 
 * ============================================================================
 * VAD (Voice Activity Detection) 模式
 * ============================================================================
 * 
 * 【说话打断】
 * - 麦克风始终保持开启，持续监听音频
 * - 使用音量阈值检测用户是否在说话
 * - 当检测到用户说话时，立即停止 TTS 播放
 * - 动态连接/断开 ASR 以节省资源
 * 
 * ============================================================================
 */

import { ref, watch, onUnmounted } from 'vue'
import { SpeechRecognitionService } from '../utils/asr/speechRecognition'
import { createTTSEngine } from '../utils/tts'
import { useUiSettingsStore } from '../stores/setting'
import { cleanTextForTTS, splitText, MAX_TTS_CHARS } from '../utils/textUtils'
import { takeAudioControl, releaseAudioControl } from '../utils/audioManager'
import { useToast } from './useToast'
import { getMicrophoneErrorMessage } from '../utils/microphone-errors'

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

// 断句标点符号
const endings = ['.', '?', '!', '。', '？', '！', '\n']
// 最小句子长度阈值（清洗后的字符数）
const MIN_SENTENCE_LENGTH = 150


export function useVoiceChat(onRecognizedText: (text: string) => Promise<void>) {
    const isVoiceChatActive = ref(false)
    const voiceStatus = ref<VoiceStatus>('idle')
    const errorMessage = ref('')
    const transcript = ref('')
    const currentlySpeakingText = ref('')
    const isWaitingForAudio = ref(false)

    const asrService = new SpeechRecognitionService()
    const store = useUiSettingsStore()

    // Streaming TTS State
    interface AudioSegment {
        id: string
        text: string
        status: 'pending' | 'fetching' | 'ready' | 'error'
        audioUrl?: string
        blob?: Blob
        retryCount?: number
        retryTimerId?: ReturnType<typeof setTimeout>
    }

    let playbackQueue: AudioSegment[] = []
    let isPlayingAudio = false
    let currentAudio: HTMLAudioElement | null = null
    let currentAudioUrl: string | null = null
    let processedTextLength = 0
    let textBuffer = ''
    let silenceTimer: number | null = null;
    let autoRestartListeningTimeout: number | null = null;
    let isASRConnected = false;

    const revokeSegmentAudioUrl = (segment: AudioSegment) => {
        if (segment.audioUrl && segment.audioUrl !== currentAudioUrl) {
            URL.revokeObjectURL(segment.audioUrl)
        }
        segment.audioUrl = undefined
        segment.blob = undefined
    }

    const clearSegmentRetry = (segment: AudioSegment) => {
        if (segment.retryTimerId) {
            clearTimeout(segment.retryTimerId)
            segment.retryTimerId = undefined
        }
    }

    const cleanupQueuedPlaybackSegments = () => {
        for (const segment of playbackQueue) {
            clearSegmentRetry(segment)
            revokeSegmentAudioUrl(segment)
        }
        playbackQueue = []
    }

    // Helper to stop only audio playback part (compatible with AudioManager)
    const stopAudioOnly = () => {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl)
            currentAudioUrl = null
        }
        isPlayingAudio = false
        cleanupQueuedPlaybackSegments()
        currentlySpeakingText.value = ''
        isWaitingForAudio.value = false
        isAudioInterrupted = true
    }

    /**
     * Handle voice start detected by VAD
     * - Interrupt TTS playback
     * - Connect ASR
     */
    const handleVoiceStart = async () => {
        if (!isVoiceChatActive.value) return;

        console.log('[VoiceChat] Voice start detected');

        // Interrupt TTS if playing
        if (voiceStatus.value === 'speaking' || isPlayingAudio) {
            console.log('[VoiceChat] Interrupting TTS playback');
            stopAudioOnly();
            releaseAudioControl(stopAudioOnly);
        }

        // Switch to listening mode
        voiceStatus.value = 'listening';
        transcript.value = '';
        currentlySpeakingText.value = '';
        errorMessage.value = '';

        // Clear any pending silence timer
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }

        // Connect ASR if not already connected
        if (!isASRConnected) {
            try {
                await asrService.connectASR();
                isASRConnected = true;
                console.log('[VoiceChat] ASR connected on voice start');
            } catch (e: any) {
                console.error('Failed to connect ASR:', e);
                errorMessage.value = e.message || 'Failed to connect ASR';
            }
        }
    }

    /**
     * Handle voice end detected by VAD
     * - Start silence timer for speech end detection
     */
    const handleVoiceEnd = () => {
        if (!isVoiceChatActive.value || voiceStatus.value !== 'listening') return;

        console.log('[VoiceChat] Voice end detected, starting silence timer');

        // Start silence timer
        if (silenceTimer) clearTimeout(silenceTimer);

        silenceTimer = window.setTimeout(() => {
            handleSpeechEnd();
        }, store.silenceDuration || 1500);
    }

    const stopListening = async () => {
        // Disconnect ASR to save resources
        if (isASRConnected) {
            try {
                await asrService.disconnectASR();
                isASRConnected = false;
            } catch (e) {
                console.error('Error disconnecting ASR:', e);
            }
        }
    }

    const startListening = async () => {
        if (!isVoiceChatActive.value) return

        voiceStatus.value = 'listening'
        transcript.value = ''
        currentlySpeakingText.value = ''
        errorMessage.value = ''

        // In VAD mode, microphone is already running
        // We just wait for voice detection to connect ASR
        console.log('[VoiceChat] Listening mode active (VAD waiting for voice)');
    }

    // Watch transcript changes from ASR
    watch(transcript, (newText, oldText) => {
        if (!isVoiceChatActive.value || voiceStatus.value !== 'listening') return;

        // Reset silence timer on each transcript change
        if (silenceTimer) clearTimeout(silenceTimer);

        if (newText && newText !== oldText) {
            silenceTimer = window.setTimeout(() => {
                handleSpeechEnd();
            }, store.silenceDuration || 1500);
        }
    });

    const handleSpeechEnd = async () => {
        if (!transcript.value.trim()) {
            // No text recognized, just disconnect ASR and keep listening
            await stopListening();
            voiceStatus.value = 'listening';
            return;
        }

        // Stop ASR
        await stopListening();
        voiceStatus.value = 'processing';

        const textToSend = transcript.value;

        try {
            // Send to chat
            await onRecognizedText(textToSend);

            // Reset streaming state for new turn
            processedTextLength = 0
            textBuffer = ''
            cleanupQueuedPlaybackSegments()
            isPlayingAudio = false

        } catch (e) {
            console.error('Error processing speech:', e);
            voiceStatus.value = 'error';
        }
    }

    // Process streaming text from AI
    const speakStream = async (fullText: string) => {
        if (!isVoiceChatActive.value) return

        // Calculate new part
        const newPart = fullText.slice(processedTextLength)
        if (!newPart) return

        processedTextLength = fullText.length
        textBuffer += newPart

        // Reset transcript/status when AI actually starts generating
        if (voiceStatus.value !== 'speaking') {
            voiceStatus.value = 'speaking'
            transcript.value = '' // Clear user input now
            currentlySpeakingText.value = ''
        }

        // Split into sentences
        let startIndex = 0
        let lastEndingIndex = -1

        for (let i = 0; i < textBuffer.length; i++) {
            const char = textBuffer[i]
            if (endings.includes(char)) {
                lastEndingIndex = i
                const rawSentence = textBuffer.substring(startIndex, i + 1)
                // Clean sentence for TTS
                const sentence = cleanTextForTTS(rawSentence)

                // Only queue if cleaned sentence meets minimum length
                if (sentence && sentence.length >= MIN_SENTENCE_LENGTH) {
                    console.log('[TTS] Queuing:', sentence, `(${sentence.length} chars)`)
                    queueAudio(sentence)
                    startIndex = i + 1
                }
                // If too short, continue accumulating
            }
        }

        // Keep unprocessed part in buffer
        if (startIndex > 0) {
            textBuffer = textBuffer.substring(startIndex)
        }
    }

    const flushSpeakStream = () => {
        console.log('[TTS] flushSpeakStream called, buffer length:', textBuffer.length)
        const cleaned = cleanTextForTTS(textBuffer)
        if (cleaned) {
            console.log('[TTS] Flushing remaining:', cleaned)
            queueAudio(cleaned)
            textBuffer = ''
        }
    }

    // producer: add to queue and trigger fetch
    const queueAudio = async (text: string) => {
        const segment: AudioSegment = {
            id: Math.random().toString(36).substring(7),
            text,
            status: 'pending',
            retryCount: 0
        }
        playbackQueue.push(segment)

        if (!isPlayingAudio) {
            isWaitingForAudio.value = true
        }

        // Trigger fetch immediately in background
        fetchSegmentAudio(segment)

        // Trigger playback consumer
        processPlaybackQueue()
    }

    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 500

    const fetchSegmentAudio = async (segment: AudioSegment, isRetry = false) => {
        if (segment.status !== 'pending' && !isRetry) return

        segment.status = 'fetching'
        try {
            const ttsService = createTTSEngine()
            const blob = await ttsService.ttsPromise(segment.text)
            segment.blob = blob
            segment.audioUrl = URL.createObjectURL(blob)
            segment.status = 'ready'
            segment.retryCount = 0 // Reset on success

            // If we were waiting for this segment (e.g. playback caught up), verify if we need to poke playback
            if (!isPlayingAudio) {
                processPlaybackQueue()
            }
        } catch (e) {
            console.error('TTS Fetch Error:', e, `(attempt ${(segment.retryCount || 0) + 1}/${MAX_RETRIES})`)

            // Retry logic
            segment.retryCount = (segment.retryCount || 0) + 1

            if (segment.retryCount < MAX_RETRIES) {
                console.log(`[TTS] Retrying in ${RETRY_DELAY_MS * segment.retryCount}ms...`)
                segment.status = 'pending' // Reset to pending for retry

                // Exponential backoff
                segment.retryTimerId = setTimeout(() => {
                    segment.retryTimerId = undefined
                    fetchSegmentAudio(segment, true)
                }, RETRY_DELAY_MS * segment.retryCount)
            } else {
                console.error('[TTS] Max retries reached, skipping segment:', segment.text.substring(0, 30) + '...')
                segment.status = 'error'
                // Still proceed to next segment
                if (!isPlayingAudio) {
                    processPlaybackQueue()
                }
            }
        }
    }

    const processPlaybackQueue = async () => {
        if (isPlayingAudio) return

        if (isAudioInterrupted) {
            cleanupQueuedPlaybackSegments()
            releaseAudioControl(stopAudioOnly)
            return
        }

        // Find next segment to play
        // We must play in order. So we look at index 0.
        if (playbackQueue.length === 0) return

        const segment = playbackQueue[0]

        if (segment.status === 'pending') {
            // It hasn't started fetching? Should have. Kick it just in case.
            fetchSegmentAudio(segment)
            // Wait. The fetch callback will re-trigger processPlaybackQueue
            return
        }

        if (segment.status === 'fetching') {
            // Wait. Fetching is in progress.
            return
        }

        // If error, skip it
        if (segment.status === 'error') {
            playbackQueue.shift() // Remove
            clearSegmentRetry(segment)
            revokeSegmentAudioUrl(segment)
            if (playbackQueue.length === 0) {
                releaseAudioControl(stopAudioOnly)
            }
            processPlaybackQueue()
            return
        }

        // Ready to play
        if (segment.status === 'ready' && segment.audioUrl) {
            // Request audio control. If rejected (or immediately stopped), currentAudio logic handles it.
            takeAudioControl('VoiceChat', stopAudioOnly)

            isPlayingAudio = true
            isWaitingForAudio.value = false // Audio started

            // Remove from queue primarily, BUT we hold reference to play
            playbackQueue.shift()

            try {
                currentlySpeakingText.value = segment.text

                const url = segment.audioUrl
                if (currentAudio) {
                    currentAudio.pause()
                    currentAudio = null
                }
                currentAudioUrl = url

                currentAudio = new Audio(url)
                currentAudio.onended = () => {
                    URL.revokeObjectURL(url)
                    currentAudio = null
                    currentAudioUrl = null
                    isPlayingAudio = false
                    currentlySpeakingText.value = ''

                    if (playbackQueue.length > 0) {
                        processPlaybackQueue()
                    } else {
                        // Queue empty - release audio control
                        releaseAudioControl(stopAudioOnly)

                        if (!isVoiceChatActive.value) {
                            voiceStatus.value = 'idle'
                        } else if (voiceStatus.value === 'speaking' && !isGenerating) {
                            onTurnComplete()
                        }
                    }
                }

                await currentAudio.play()

                // CRITICAL: While this is playing, ensure NEXT items are preloaded
                // (Though they are auto-fetched on creation, this double check doesn't hurt)
                preloadNextSegments()

            } catch (e) {
                console.error('TTS Play Error', e)
                URL.revokeObjectURL(segment.audioUrl)
                if (currentAudio) {
                    currentAudio.pause()
                    currentAudio = null
                }
                currentAudioUrl = null
                isPlayingAudio = false
                currentlySpeakingText.value = ''

                if (playbackQueue.length === 0) {
                    releaseAudioControl(stopAudioOnly)
                }

                processPlaybackQueue()
            }
        }
    }

    const preloadNextSegments = () => {
        // This is implicit because we call fetchSegmentAudio when adding to queue
        // But we could add logic here to prioritize strictly if we had concurrent limits
        // For now, simple "fetch on add" is sufficient for < 5 items.
        playbackQueue.forEach(seg => {
            if (seg.status === 'pending') fetchSegmentAudio(seg)
        })
    }

    // Flag to track if we expect more text
    let isGenerating = false
    // Flag to track if audio was interrupted by external source
    let isAudioInterrupted = false

    const startStream = () => {
        console.log('[TTS] startStream called')
        isGenerating = true
        isAudioInterrupted = false
        processedTextLength = 0
        cleanupQueuedPlaybackSegments()
        textBuffer = ''
    }

    const finishStream = () => {
        console.log('[TTS] finishStream called, buffer:', textBuffer, 'queue:', playbackQueue.length)
        isGenerating = false

        // Flush remaining buffer first
        flushSpeakStream()

        // Merge remaining PENDING queue items to reduce gaps
        // Items that are already 'fetching' or 'ready' should continue normally
        if (playbackQueue.length > 1) {
            // Find all pending items (not yet started fetching)
            const pendingItems = playbackQueue.filter(item => item.status === 'pending')

            // Only merge if there are multiple pending items
            if (pendingItems.length > 1) {
                // Combine all pending texts
                const mergedText = pendingItems.map(item => item.text).join(' ')

                // If merged text is within limits, make one segment. If too long, split.
                const chunks = splitText(mergedText, MAX_TTS_CHARS)
                console.log('[TTS] Merging', pendingItems.length, 'items into', chunks.length, 'chunks. Total chars:', mergedText.length)

                const newSegments = chunks.map(chunk => ({
                    id: Math.random().toString(36).substring(7),
                    text: chunk,
                    status: 'pending' as const
                }))

                pendingItems.forEach(segment => {
                    clearSegmentRetry(segment)
                    revokeSegmentAudioUrl(segment)
                })

                // Keep only non-pending items (ready/fetching) + add new segments
                const itemsToKeep = playbackQueue.filter(item => item.status !== 'pending')
                playbackQueue = [...itemsToKeep, ...newSegments]

                // Start fetching the first of the new segments (others will be prefetched by queue logic or processPlaybackQueue)
                // Actually, we should trigger fetch for all new segments to be fast?
                // Or just the first one. Let's trigger all since we just have a few.
                newSegments.forEach(seg => fetchSegmentAudio(seg))
            }
        }

        // If nothing playing and queue empty, complete turn now
        if (!isPlayingAudio && playbackQueue.length === 0) {
            onTurnComplete()
        }
    }

    const onTurnComplete = () => {
        if (isVoiceChatActive.value) {
            voiceStatus.value = 'listening'
            // Mic is already active in VAD mode, just wait for voice detection
            console.log('[VoiceChat] Turn complete, waiting for voice (VAD mode)');
        }
    }

    const speak = async (text: string) => {
        // Fallback for non-streaming calls
        startStream()
        speakStream(text)
        finishStream()
    }

    const start = async () => {
        if (!store.isCurrentAsrConfigured) {
            const toast = useToast()
            toast.error('请先在设置中完整配置语音识别')
            return
        }

        if (!store.isCurrentTtsConfigured) {
            const toast = useToast()
            toast.error('请先在设置中完整配置语音合成')
            return
        }

        if (isVoiceChatActive.value) return; // Prevent double start

        isVoiceChatActive.value = true;
        isAudioInterrupted = false;

        try {
            // Start microphone with VAD mode
            await asrService.startMicrophoneOnly({
                onResult: (text, isFinal) => {
                    transcript.value = text;
                },
                onVoiceStart: handleVoiceStart,
                onVoiceEnd: handleVoiceEnd
            });

            voiceStatus.value = 'listening';
            console.log('[VoiceChat] Started in VAD mode');

        } catch (e: any) {
            console.error('Failed to start voice chat:', e);
            releaseAudioControl(stopAudioOnly)
            voiceStatus.value = 'error';
            errorMessage.value = getMicrophoneErrorMessage(e);
            isVoiceChatActive.value = false;
        }
    }

    const stop = async () => {
        isVoiceChatActive.value = false;
        isGenerating = false
        if (silenceTimer) clearTimeout(silenceTimer);
        if (autoRestartListeningTimeout) clearTimeout(autoRestartListeningTimeout);

        stopAudioOnly()
        releaseAudioControl(stopAudioOnly)

        // Stop microphone and ASR
        await asrService.stop();
        isASRConnected = false;

        voiceStatus.value = 'idle';
        transcript.value = '';
    }

    onUnmounted(() => {
        stop();
    });

    return {
        isVoiceChatActive,
        voiceStatus,
        errorMessage,
        transcript,
        currentlySpeakingText,
        isWaitingForAudio,
        start,
        stop,
        speak,
        speakStream,
        startStream,
        finishStream
    }
}
