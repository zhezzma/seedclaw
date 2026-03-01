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

// ==================== State（模块顶层，单例）====================

const inputText = ref('')
const attachments = ref<{ id: string; name: string; dataUrl: string; mimeType: string; content?: string }[]>([])

// ——— 命令补全 ———
const commandSuggestionsVisible = ref(false)
const commandSuggestions = ref<CommandInfo[]>([])
const commandSuggestionIndex = ref(0)

// ——— 其他 UI 状态 ———
const isRecording = ref(false)
const selectedModel = ref('glm')
const commandDropdownOpen = ref(false)
const modelDropdownOpen = ref(false)

// ——— 命令补全 watch（模块级，只注册一次）———
const { filterCommands } = useCommandState()
watch(inputText, (val) => {
    if (/^\/[^\s]*$/.test(val)) {
        const prefix = val.slice(1)
        commandSuggestions.value = filterCommands.value(prefix)
        commandSuggestionsVisible.value = commandSuggestions.value.length > 0
        commandSuggestionIndex.value = 0
    } else {
        commandSuggestions.value = []
        commandSuggestionsVisible.value = false
    }
})

// ==================== Actions ====================

const selectCommand = (cmd: string) => {
    inputText.value = cmd + ' '
    commandDropdownOpen.value = false
    commandSuggestionsVisible.value = false
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

// ——— 语音识别（模块级单例）———
let speechService: SpeechRecognitionService | null = null
let silenceTimer: number | null = null

const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer)
    silenceTimer = window.setTimeout(() => {
        if (isRecording.value) {
            console.log('Silence timeout, stopping recording')
            handleMicClick()
        }
    }, 10000)
}

const stopRecording = async () => {
    if (isRecording.value) {
        await handleMicClick()
    }
}

const handleMicClick = async () => {
    const settingsStore = useUiSettingsStore()
    if (!settingsStore.asrToken || !settingsStore.asrModel) {
        const toast = useToast()
        toast.error('请先在设置中配置语音识别及模型 (ASR Token & Model)')
        return
    }

    if (!speechService) {
        speechService = new SpeechRecognitionService()
    }

    if (isRecording.value) {
        isRecording.value = false
        if (silenceTimer) {
            clearTimeout(silenceTimer)
            silenceTimer = null
        }
        if (speechService) {
            await speechService.stop()
        }
        releaseAudioControl(stopRecording)
        return
    }

    // START RECORDING
    takeAudioControl('ChatInput', stopRecording)
    isRecording.value = true
    resetSilenceTimer()

    try {
        const currentBaseText = inputText.value
        await speechService.start((text: string, isFinal: boolean) => {
            resetSilenceTimer()
            const separator = (currentBaseText && !currentBaseText.endsWith('\n') && !currentBaseText.endsWith(' ')) ? ' ' : ''
            inputText.value = currentBaseText + separator + text
        })
    } catch (error) {
        console.error('Failed to start recording:', error)
        isRecording.value = false
        if (silenceTimer) clearTimeout(silenceTimer)
    }
}

const handleInputFocus = () => {
    if (isRecording.value) {
        handleMicClick()
    }
}

const handleKeydown = (e: KeyboardEvent, onSend: () => void) => {
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

    // Ctrl+Enter 发送消息
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        stopRecording()
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
        const result = await readFile(file)
        attachments.value.push({
            id: crypto.randomUUID(),
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            dataUrl: isImage ? result : '',
            content: isImage ? undefined : result
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

// ==================== Export ====================

const _chatInputState = {
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
    commandSuggestionsVisible,
    commandSuggestions,
    commandSuggestionIndex,
    confirmCommandSuggestion,
    closeSuggestions,
}

export function useChatInput() {
    return _chatInputState
}
