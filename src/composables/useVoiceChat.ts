import { ref, watch, onUnmounted } from 'vue'
import { SpeechRecognitionService } from '../utils/asr/speechRecognition'
import { EdgeTTS } from '../utils/tts/edge-tts'

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export function useVoiceChat(onRecognizedText: (text: string) => Promise<void>) {
    const isVoiceChatActive = ref(false)
    const voiceStatus = ref<VoiceStatus>('idle')
    const errorMessage = ref('')
    const transcript = ref('')
    const currentlySpeakingText = ref('')

    const asrService = new SpeechRecognitionService()
    const ttsService = new EdgeTTS() // Default settings for now

    // Streaming TTS State
    let audioQueue: string[] = []
    let isPlayingAudio = false
    let currentAudio: HTMLAudioElement | null = null
    let processedTextLength = 0
    let textBuffer = ''
    let silenceTimer: number | null = null;
    let autoRestartListeningTimeout: number | null = null;

    const stopListening = async () => {
        try {
            await asrService.stop()
        } catch (e) {
            console.error('Error stopping ASR:', e)
        }
    }

    const startListening = async () => {
        if (!isVoiceChatActive.value) return

        voiceStatus.value = 'listening'
        transcript.value = ''
        currentlySpeakingText.value = ''
        errorMessage.value = ''

        try {
            await asrService.start((text, isFinal) => {
                // Update partial transcript for UI visualization if needed
                transcript.value = text;
            });
        } catch (e: any) {
            console.error('ASR Start Error:', e)
            voiceStatus.value = 'error'
            errorMessage.value = e.message || 'Failed to start microphone'
            isVoiceChatActive.value = false;
        }
    }

    // Watch transcript to detect silence/end of speech
    watch(transcript, (newText, oldText) => {
        if (!isVoiceChatActive.value || voiceStatus.value !== 'listening') return;

        if (silenceTimer) clearTimeout(silenceTimer);

        if (newText && newText !== oldText) {
            // 1.5s of silence triggers "Send"
            silenceTimer = window.setTimeout(() => {
                handleSpeechEnd();
            }, 1500);
        }
    });

    const handleSpeechEnd = async () => {
        if (!transcript.value.trim()) return;

        // Stop listening temporarily
        await stopListening();
        voiceStatus.value = 'processing';

        const textToSend = transcript.value;
        // Keep transcript visible while processing? 
        // User wants to see conversation content.
        // If we clear it here, it disappears. 
        // Let's keep it until AI starts speaking?
        // transcript.value = ''; // clear for next turn

        try {
            // Send to chat
            await onRecognizedText(textToSend);

            // Reset streaming state for new turn
            processedTextLength = 0
            textBuffer = ''
            audioQueue = []
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

        // Simple iteration to find cut points
        const endings = ['.', '?', '!', '。', '？', '！', '\n']
        let startIndex = 0

        for (let i = 0; i < textBuffer.length; i++) {
            const char = textBuffer[i]
            if (endings.includes(char)) {
                const sentence = textBuffer.substring(startIndex, i + 1).trim()
                if (sentence) {
                    queueAudio(sentence)
                }
                startIndex = i + 1
            }
        }

        if (startIndex > 0) {
            textBuffer = textBuffer.substring(startIndex)
        }
    }

    const flushSpeakStream = () => {
        if (textBuffer.trim()) {
            queueAudio(textBuffer.trim())
            textBuffer = ''
        }
    }

    const queueAudio = async (text: string) => {
        audioQueue.push(text)
        processAudioQueue()
    }

    const processAudioQueue = async () => {
        if (isPlayingAudio || audioQueue.length === 0) return

        isPlayingAudio = true
        const text = audioQueue.shift()!

        try {
            // Update currently speaking text to show what is being spoken
            currentlySpeakingText.value = text;

            const blob = await ttsService.ttsPromise(text)
            const url = URL.createObjectURL(blob)

            if (currentAudio) {
                currentAudio.pause()
                currentAudio = null
            }

            currentAudio = new Audio(url)
            currentAudio.onended = () => {
                URL.revokeObjectURL(url)
                isPlayingAudio = false

                if (audioQueue.length > 0) {
                    processAudioQueue()
                } else if (!isVoiceChatActive.value) {
                    voiceStatus.value = 'idle'
                } else if (voiceStatus.value === 'speaking' && !isGenerating) {
                    // Queue empty and generation done
                    onTurnComplete()
                }
            }

            await currentAudio.play()

        } catch (e) {
            console.error('TTS Play Error:', e)
            isPlayingAudio = false
            processAudioQueue() // Try next
        }
    }

    // Flag to track if we expect more text
    let isGenerating = false

    const startStream = () => {
        isGenerating = true
        processedTextLength = 0
        textBuffer = ''
        audioQueue = []
    }

    const finishStream = () => {
        isGenerating = false
        flushSpeakStream()

        // If nothing playing and queue empty, complete turn now
        if (!isPlayingAudio && audioQueue.length === 0) {
            onTurnComplete()
        }
    }

    const onTurnComplete = () => {
        if (isVoiceChatActive.value) {
            // currentlySpeakingText.value = ''; 
            voiceStatus.value = 'idle'
            autoRestartListeningTimeout = window.setTimeout(() => {
                startListening()
            }, 300)
        }
    }

    const speak = async (text: string) => {
        // Fallback for non-streaming calls
        startStream()
        speakStream(text)
        finishStream()
    }

    const start = () => {
        isVoiceChatActive.value = true;
        startListening();
    }

    const stop = async () => {
        isVoiceChatActive.value = false;
        isGenerating = false
        if (silenceTimer) clearTimeout(silenceTimer);
        if (autoRestartListeningTimeout) clearTimeout(autoRestartListeningTimeout);

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        await stopListening();
        voiceStatus.value = 'idle';
        transcript.value = '';
        currentlySpeakingText.value = '';
        audioQueue = []
        isPlayingAudio = false
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
        start,
        stop,
        speak,
        speakStream,
        startStream,
        finishStream
    }
}
