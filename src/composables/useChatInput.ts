import { ref } from 'vue'
import { SpeechRecognitionService } from '../utils/asr/speechRecognition'

export interface CommandItem {
    label: string
    value: string
}

export interface ModelItem {
    label: string
    value: string
}

export const COMMANDS: CommandItem[] = [
    { label: '/new (新建)', value: '/new' },
    { label: '/reset (重置)', value: '/reset' },
    { label: '/status (状态)', value: '/status' },
    { label: '/commands (命令)', value: '/commands' },
    { label: '/help (帮助)', value: '/help' }
]

export const MODELS: ModelItem[] = [
    { label: 'GLM-4', value: 'glm' },
    { label: 'Gemini Pro', value: 'gemini' },
    { label: 'GPT-4o', value: 'gpt4' }
]

export function useChatInput() {
    const inputText = ref('')
    const isRecording = ref(false)
    const isThinking = ref(true)
    const selectedModel = ref('glm')
    const commandDropdownOpen = ref(false)
    const modelDropdownOpen = ref(false)

    const selectCommand = (cmd: string) => {
        inputText.value = cmd + ' '
        commandDropdownOpen.value = false
        // Focus input
        const el = document.querySelector('textarea') as HTMLTextAreaElement
        if (el) el.focus()
    }

    const selectModel = (model: string) => {
        selectedModel.value = model
        modelDropdownOpen.value = false
    }


    // Initialize speech service
    let speechService: SpeechRecognitionService | null = null;

    // Dynamic import to avoid SSR/setup issues if any, though here it's fine.
    // Better to instantiate lazily.

    // Silence Detection
    let silenceTimer: number | null = null;
    const resetSilenceTimer = () => {
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = window.setTimeout(() => {
            if (isRecording.value) {
                console.log('Silence timeout, stopping recording');
                handleMicClick(); // Stop recording
            }
        }, 10000); // 10s
    };

    const handleMicClick = async () => {
        if (!speechService) {
            speechService = new SpeechRecognitionService();
        }

        if (isRecording.value) {
            isRecording.value = false;
            // Clear timer
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
            if (speechService) {
                await speechService.stop();
            }
            return;
        }

        isRecording.value = true;
        resetSilenceTimer(); // Start timer

        try {
            const currentBaseText = inputText.value;
            // Pass accumulated to service? No, service sends text.
            // But we want to handle "session" text properly.
            // We will let the service handle the accumulation logic mostly, 
            // or we expect the callback to give us the *Latest Sentence*?
            // User reported bug: New text overwrites old.
            // If we change service to return FULL text, we can just set it.
            // But better: Service returns "Diff" or "Current Sentence"?
            // If service returns "Current Sentence", we need to append it.
            // We will modify Service to handle accumulation separately. 
            // Here, we just expect `text` to be the *full appended text* for this session?
            // Or we handle it here.

            // Let's assume we fix the Service to return the "Full Text of Current Session".
            // Then we append that to `currentBaseText`.

            await speechService.start((text: string, isFinal: boolean) => {
                resetSilenceTimer(); // Reset on activity

                // Logic: 
                // Service now returns the FULL accumulated session text.
                // So we just append it to the base text (text present before recording started).
                const separator = (currentBaseText && !currentBaseText.endsWith('\n') && !currentBaseText.endsWith(' ')) ? ' ' : '';
                inputText.value = currentBaseText + separator + text;
            });

        } catch (error) {
            console.error('Failed to start recording:', error);
            isRecording.value = false;
            if (silenceTimer) clearTimeout(silenceTimer);
        }
    }

    const handleInputFocus = () => {
        if (isRecording.value) {
            handleMicClick();
        }
    }

    // Stop recording on send?
    // Usually handled by caller calling handleMicClick or checking isRecording.
    // We'll export a stopRecording function or just reuse handleMicClick logic in onSend?
    // But handleMicClick is a toggle.
    // Let's ensure stop.

    const stopRecording = async () => {
        if (isRecording.value) {
            await handleMicClick();
        }
    }

    const handleKeydown = (e: KeyboardEvent, onSend: () => void) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            stopRecording(); // Stop if recording
            onSend()
        }
    }

    const closeDropdowns = () => {
        commandDropdownOpen.value = false
        modelDropdownOpen.value = false
    }

    return {
        inputText,
        isRecording,
        isThinking,
        selectedModel,
        commandDropdownOpen,
        modelDropdownOpen,
        selectCommand,
        selectModel,
        handleMicClick,
        handleInputFocus, // Export this
        handleKeydown,
        closeDropdowns,
        stopRecording, // Export this
        commands: COMMANDS,
        models: MODELS
    }
}
