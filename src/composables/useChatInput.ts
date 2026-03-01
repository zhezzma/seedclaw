import { ref, watch } from 'vue'
import { SpeechRecognitionService } from '../utils/asr/speechRecognition'
import { takeAudioControl, releaseAudioControl } from '../utils/audioManager'
import { useUiSettingsStore } from '../stores/setting'
import { useToast } from './useToast'
import { readFile } from '../utils/fileReader'
import { useCommandState, type CommandInfo } from './useCommandState'

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
    { label: '/plan (计划模式)', value: '/plan', autoSend: false },
    { label: '/reset (会话重置)', value: '/reset' },
    { label: '/name (会话重命名)', value: '/name', autoSend: false },
    { label: '/compact (会话压缩)', value: '/compact' },
    { label: '/steer (干预插入消息)', value: '/steer', autoSend: false },
    { label: '/follow-up (排队后续消息)', value: '/follow-up', autoSend: false },
    { label: '/tools (工具列表)', value: '/tools' },
    { label: '/session (会话信息)', value: '/session' },
    { label: '/debug (调试信息)', value: '/debug' },
    { label: '/help (帮助)', value: '/help' }
]

// Global state for persistence
const inputText = ref('')
const attachments = ref<{ id: string; name: string; dataUrl: string; mimeType: string; content?: string }[]>([])

// ——— 命令补全 ———
const commandSuggestionsVisible = ref(false)
const commandSuggestions = ref<CommandInfo[]>([])
const commandSuggestionIndex = ref(0)

export function useChatInput() {
    const isRecording = ref(false)
    const { filterCommands } = useCommandState()

    const selectedModel = ref('glm')
    const commandDropdownOpen = ref(false)
    const modelDropdownOpen = ref(false)

    // 监听输入，当以 / 开头时显示命令补全
    watch(inputText, (val) => {
        // 只在输入以 / 开头、没有换行、且没有空格（即还在输入命令名）时激活
        if (/^\/[^\s]*$/.test(val)) {
            const prefix = val.slice(1) // 去掉开头的 /
            commandSuggestions.value = filterCommands.value(prefix) //.slice(0, 5)
            commandSuggestionsVisible.value = commandSuggestions.value.length > 0
            commandSuggestionIndex.value = 0
        } else {
            commandSuggestions.value = []
            commandSuggestionsVisible.value = false
        }
    })

    const selectCommand = (cmd: string) => {
        inputText.value = cmd + ' '
        commandDropdownOpen.value = false
        commandSuggestionsVisible.value = false
        // Focus input
        const el = document.querySelector('textarea') as HTMLTextAreaElement
        if (el) el.focus()
    }

    /** 从命令补全列表中选择某条命令 */
    const confirmCommandSuggestion = (cmd: CommandInfo) => {
        inputText.value = `/${cmd.name} `
        commandSuggestionsVisible.value = false
        commandSuggestions.value = []
        const el = document.querySelector('textarea') as HTMLTextAreaElement
        if (el) el.focus()
    }

    /** 关闭命令补全浮层 */
    const closeSuggestions = () => {
        commandSuggestionsVisible.value = false
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
        // 命令补全键盘导航
        if (commandSuggestionsVisible.value) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                commandSuggestionIndex.value = (commandSuggestionIndex.value + 1) % commandSuggestions.value.length
                return
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                commandSuggestionIndex.value =
                    (commandSuggestionIndex.value - 1 + commandSuggestions.value.length) % commandSuggestions.value.length
                return
            }
            if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault()
                const selected = commandSuggestions.value[commandSuggestionIndex.value]
                if (selected) confirmCommandSuggestion(selected)
                return
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                closeSuggestions()
                return
            }
        }

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
        // 命令补全
        commandSuggestionsVisible,
        commandSuggestions,
        commandSuggestionIndex,
        confirmCommandSuggestion,
        closeSuggestions,
    }
}
