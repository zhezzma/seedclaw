import { ref } from 'vue'

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

    const handleMicClick = () => {
        if (isRecording.value) {
            isRecording.value = false
            return
        }

        isRecording.value = true
        // Simulate speech recognition flow
        setTimeout(() => {
            if (!isRecording.value) return
            inputText.value += '（听写内容...）'

            // Simulate silence detection
            setTimeout(() => {
                if (!isRecording.value) return
                isRecording.value = false
            }, 2000)
        }, 2000)
    }

    const handleKeydown = (e: KeyboardEvent, onSend: () => void) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
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
        handleKeydown,
        closeDropdowns,
        commands: COMMANDS,
        models: MODELS
    }
}
