import { ref } from 'vue'
import { SpeechRecognitionService } from '../utils/asr/speechRecognition'
import { takeAudioControl, releaseAudioControl } from '../utils/audioManager'
import { useUiSettingsStore } from '../stores/setting'
import { useToast } from './useToast'
import { readFile } from '../utils/fileReader'

export interface CommandItem {
    label: string
    value: string
    autoSend?: boolean
}

export interface ModelItem {
    label: string
    value: string
}

export const COMMANDS: CommandItem[] = [
    { label: '/name (会话重命名)', value: '/name', autoSend: false },
    { label: '/compact (会话压缩)', value: '/compact' },
    { label: '/session (会话信息)', value: '/session' },
    { label: '/debug (调试信息)', value: '/debug' },
    { label: '/tools (工具列表)', value: '/tools' },
    { label: '/steer (干预插入消息)', value: '/steer', autoSend: false },
    { label: '/follow-up (排队后续消息)', value: '/follow-up', autoSend: false },
    { label: '/help (帮助)', value: '/help' }
]

// Global state for persistence
const inputText = ref('')
const attachments = ref<{ id: string; name: string; dataUrl: string; mimeType: string; content?: string }[]>([])

export function useChatInput() {
    const isRecording = ref(false)

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
        const settingsStore = useUiSettingsStore()
        if (!settingsStore.asrToken || !settingsStore.asrModel) {
            const toast = useToast()
            toast.error('请先在设置中配置语音识别及模型 (ASR Token & Model)')
            return
        }

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
            releaseAudioControl(stopRecording)
            return;
        }

        // START RECORDING
        takeAudioControl('ChatInput', stopRecording)

        isRecording.value = true;
        resetSilenceTimer(); // Start timer

        try {
            const currentBaseText = inputText.value;

            await speechService.start((text: string, isFinal: boolean) => {
                resetSilenceTimer(); // Reset on activity

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

    const stopRecording = async () => {
        if (isRecording.value) {
            await handleMicClick();
        }
    }

    const handleKeydown = (e: KeyboardEvent, onSend: () => void) => {
        // Ctrl+Enter (PC) 发送消息，Enter 换行
        // 移动端只能通过按钮发送
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            stopRecording(); // Stop if recording
            onSend()
        }
    }

    const closeDropdowns = () => {
        commandDropdownOpen.value = false
        modelDropdownOpen.value = false
    }

    const addAttachment = async (file: File) => {
        try {
            const isImage = file.type.startsWith('image/')
            // if (isImage && file.size > 1024 * 500) {
            //     const toast = useToast()
            //     toast.error(`图片大小不能超过 500KB: ${file.name}`)
            //     return
            // }

            const result = await readFile(file)

            // For images, result is DataURL (content preview) and also content for API
            // For docs, result is text content

            // However, readFile implementation returns:
            // - DataURL for images
            // - Text for docs

            attachments.value.push({
                id: crypto.randomUUID(),
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                dataUrl: isImage ? result : '', // Preview URL only for images? Or we might need a file icon
                content: isImage ? undefined : result // Store text content for docs
            })
        } catch (e) {
            console.error('Failed to read file', e)
            const toast = useToast()
            toast.error(`读取文件失败: ${file.name}`)
        }
    }

    const removeAttachment = (id: string) => {
        attachments.value = attachments.value.filter(a => a.id !== id)
    }

    return {
        inputText,
        isRecording,
        selectedModel,
        commandDropdownOpen,
        modelDropdownOpen,
        attachments,
        selectCommand,
        selectModel,
        handleMicClick,
        handleInputFocus,
        handleKeydown,
        closeDropdowns,
        stopRecording,
        addAttachment,
        removeAttachment,
        commands: COMMANDS,
    }
}
