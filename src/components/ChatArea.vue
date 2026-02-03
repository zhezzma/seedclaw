<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
    Bars3Icon,
    ChevronDownIcon,
    ChevronUpIcon,
    CameraIcon,
    MicrophoneIcon,
    CheckIcon,
    SunIcon,
    MoonIcon,
    PaperAirplaneIcon,
    StopIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    PlusIcon,
    CommandLineIcon,
    CpuChipIcon,
    LightBulbIcon,
    SparklesIcon,
    ClipboardIcon,
    SpeakerWaveIcon
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../stores/setting'
import { useGatewayStore } from '../stores/gateway'
import { isAgentMainSession, createAgentMainSessionKey } from '../services/includes/session-key-utils'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ToolInvocation from './chat/ToolInvocation.vue'
import { EdgeTTS } from '../utils/tts/edge-tts'

const inputText = ref('')
const dropdownRef = ref<HTMLDetailsElement | null>(null)
const messagesContainerRef = ref<HTMLDivElement | null>(null)
const settingsStore = useUiSettingsStore()
const gatewayStore = useGatewayStore()

// Input Area State
const isRecording = ref(false)
const isThinking = ref(true)
const selectedModel = ref('glm')
const commandDropdownOpen = ref(false)
const modelDropdownOpen = ref(false)
const currentReadingMsgId = ref<string | null>(null)
const currentAudio = ref<HTMLAudioElement | null>(null)

const commands = [
    { label: '/new (新建)', value: '/new' },
    { label: '/reset (重置)', value: '/reset' },
    { label: '/status (状态)', value: '/status' },
    { label: '/commands (命令)', value: '/commands' },
    { label: '/help (帮助)', value: '/help' }
]

const models = [
    { label: 'GLM-4', value: 'glm' },
    { label: 'Gemini Pro', value: 'gemini' },
    { label: 'GPT-4o', value: 'gpt4' }
]

// Types for internal display
interface DisplayBlock {
    type: 'text' | 'tool'
    text?: string
    toolCallId?: string
    toolName?: string
    toolArgs?: any
    toolResult?: any
    toolState?: 'calling' | 'success' | 'error'
    toolError?: string
}

interface DisplayMessage {
    id: string
    role: 'user' | 'assistant'
    blocks: DisplayBlock[]
    timestamp?: number
}

// Transform raw messages into display messages with merged tool results
const processedMessages = computed(() => {
    const rawMessages = gatewayStore.chatMessages as any[]
    const displayMessages: DisplayMessage[] = []

    // map toolCallId -> { messageIndex, blockIndex }
    const toolCallRegistry = new Map<string, { msgIdx: number, blockIdx: number }>()

    for (const msg of rawMessages) {
        if (msg.role === 'toolResult') {
            // Find corresponding tool call and update it
            const reg = toolCallRegistry.get(msg.toolCallId)
            if (reg) {
                const targetMsg = displayMessages[reg.msgIdx]
                if (targetMsg) {
                    const targetBlock = targetMsg.blocks[reg.blockIdx]
                    if (targetBlock && targetBlock.type === 'tool') {
                        targetBlock.toolResult = msg.content

                        // Simple error detection logic
                        let isError = false
                        let errorMsg = ''

                        if (msg.isError) {
                            isError = true
                            errorMsg = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                        } else if (msg.details?.status === 'error') {
                            isError = true
                            errorMsg = msg.details.error || 'Unknown error'
                        }

                        targetBlock.toolState = isError ? 'error' : 'success'
                        targetBlock.toolError = errorMsg
                    }
                }
            }
            continue
        }

        const blocks: DisplayBlock[] = []
        // Determine if we should merge with the previous message
        const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
        const shouldMerge = lastMsg && lastMsg.role === 'assistant' && msg.role === 'assistant'

        const targetMsgIdx = shouldMerge ? displayMessages.length - 1 : displayMessages.length
        const baseBlockIdx = shouldMerge ? lastMsg.blocks.length : 0

        if (Array.isArray(msg.content)) {
            for (const item of msg.content) {
                if (item.type === 'text') {
                    if (item.text) blocks.push({ type: 'text', text: item.text })
                } else if (item.type === 'toolCall') {
                    blocks.push({
                        type: 'tool',
                        toolCallId: item.id,
                        toolName: item.name,
                        toolArgs: item.arguments,
                        toolState: 'calling'
                    })
                    // Register location
                    toolCallRegistry.set(item.id, { msgIdx: targetMsgIdx, blockIdx: baseBlockIdx + blocks.length - 1 })
                }
            }
        } else if (typeof msg.content === 'string') {
            blocks.push({ type: 'text', text: msg.content })
        }

        if (blocks.length > 0) {
            if (shouldMerge && lastMsg) {
                lastMsg.blocks.push(...blocks)
            } else {
                displayMessages.push({
                    id: msg.id || `msg-${Date.now()}-${displayMessages.length}`,
                    role: msg.role as 'user' | 'assistant',
                    blocks,
                    timestamp: msg.timestamp
                })
            }
        }
    }

    return displayMessages
})

const isLoading = computed(() => gatewayStore.chatLoading)
const isBusy = computed(() => gatewayStore.isChatBusy)
const streamingText = computed(() => gatewayStore.chatStream)

// Get available agents from gateway
const agents = computed(() => {
    const list = gatewayStore.agentsList?.agents || []
    return list.map((a: any) => ({
        id: a.id || a.name,
        name: a.name || a.id,
        icon: a.icon || '🤖',
        description: a.description || ''
    }))
})

const selectedAgentId = ref('')
const selectedAgent = computed(() => {
    return agents.value.find(a => a.id === selectedAgentId.value) || agents.value[0] || { id: 'main', name: 'Assistant', icon: '🤖' }
})

// Check if current session is an agent main session (show dropdown) or a specific session (show session name)
const showAgentDropdown = computed(() => isAgentMainSession(gatewayStore.sessionKey) || gatewayStore.isNewSessionPending)

// Get current session name from sessions list
const currentSessionName = computed(() => {
    const sessionKey = gatewayStore.sessionKey
    if (!sessionKey) return 'Chat Session'

    if (gatewayStore.isNewSessionPending) {
        const agentId = gatewayStore.assistantAgentId
        const agent = agents.value.find(a => a.id === agentId)
        return `新会话(${agent?.name || 'Assistant'})`
    }

    const sessions = gatewayStore.sessionsResult?.sessions || []
    const session = sessions.find((s: any) => s.key === sessionKey)
    return session?.displayName || session?.label || 'Chat Session'
})

// Format timestamp
const formatTime = (timestamp?: number): string => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// Helper to check if avatar string is a URL
const isAvatarUrl = (avatar: string | null | undefined): boolean => {
    if (!avatar) return false
    return avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/')
}

const selectAgent = (agentId: string) => {
    selectedAgentId.value = agentId
    if (dropdownRef.value) {
        dropdownRef.value.open = false
    }

    if (gatewayStore.isNewSessionPending) {
        gatewayStore.assistantAgentId = agentId
        return
    }

    // Switch to agent's main session
    gatewayStore.setSessionKey(createAgentMainSessionKey(agentId))
}

// Watch for assistant identity changes to update selection
watch(() => gatewayStore.assistantAgentId, (newId) => {
    if (newId) {
        selectedAgentId.value = newId
    }
}, { immediate: true })

const handleSend = async () => {
    const text = inputText.value.trim()
    if (!text && !isBusy.value) return

    if (isBusy.value) {
        // If busy, abort the current run
        await gatewayStore.abortChat()
        return
    }

    if (gatewayStore.isNewSessionPending) {
        await gatewayStore.commitNewSession()
    }

    inputText.value = ''
    await gatewayStore.sendMessage(text)
    scrollToBottom()
}

const copyMessage = (msg: DisplayMessage) => {
    const text = msg.blocks
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n')
    navigator.clipboard.writeText(text)
}

const readAloud = async (msg: DisplayMessage) => {
    try {
        // If clicking the current playing message, stop it
        if (currentReadingMsgId.value === msg.id) {
            if (currentAudio.value) {
                currentAudio.value.pause()
                currentAudio.value.removeAttribute('src')
                currentAudio.value = null
            }
            if (window.speechSynthesis) window.speechSynthesis.cancel()
            currentReadingMsgId.value = null
            return
        }

        // Stop existing playback
        if (currentAudio.value) {
            currentAudio.value.pause()
            currentAudio.value.removeAttribute('src')
            currentAudio.value = null
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        currentReadingMsgId.value = msg.id

        if (!msg || !msg.blocks) return

        const text = msg.blocks
            .filter(b => b.type === 'text')
            .map(b => b.text || '')
            .join('\n')

        if (!text.trim()) return

        // Detect browser type for Chrome fallback
        const ua = navigator.userAgent
        // @ts-ignore
        const isTauri = !!(window.__TAURI_INTERNALS__ || window.__TAURI__)
        // Edge variants: Edg/ (PC), EdgA/ (Android), EdgiOS/ (iOS)
        const isEdge = /Edg\/|EdgA\/|EdgiOS\//.test(ua)
        const isChrome = ua.includes('Chrome/') && !isEdge

        // Chrome browsers can't use Edge TTS (server checks User-Agent for "Edg/")
        // Browser WebSocket API doesn't allow setting User-Agent header
        // Use Web Speech API as fallback for Chrome
        if (isChrome && !isTauri && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.lang = 'zh-CN'
            utterance.rate = 1.0
            utterance.onend = () => {
                if (currentReadingMsgId.value === msg.id) {
                    currentReadingMsgId.value = null
                }
            }
            utterance.onerror = () => {
                currentReadingMsgId.value = null
            }
            window.speechSynthesis.speak(utterance)
            return
        }

        const edge = new EdgeTTS()

        // Use MSE if supported (Chrome already handled above with Web Speech API)
        if (window.MediaSource && MediaSource.isTypeSupported('audio/mpeg')) {
            // MSE streaming playback
            const mediaSource = new MediaSource()
            const url = URL.createObjectURL(mediaSource)
            const audio = new Audio(url)
            currentAudio.value = audio

            const cleanup = () => {
                if (currentReadingMsgId.value === msg.id) {
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
        } else {
            // Blob fallback playback
            const blob = await edge.ttsPromise(text)
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            currentAudio.value = audio
            audio.onended = () => {
                if (currentReadingMsgId.value === msg.id) {
                    currentReadingMsgId.value = null
                    currentAudio.value = null
                }
                URL.revokeObjectURL(url)
            }
            audio.play().catch(() => { })
        }
    } catch (error) {
        console.error('EdgeTTS Error:', error)
        currentReadingMsgId.value = null
    }
}

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

const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
    }
}

// Scroll to bottom when new messages arrive
const scrollToBottom = () => {
    nextTick(() => {
        if (messagesContainerRef.value) {
            messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
        }
    })
}

watch(processedMessages, scrollToBottom, { deep: true })
watch(() => streamingText.value, scrollToBottom)
watch(isLoading, (newVal, oldVal) => {
    if (!newVal && oldVal) {
        // Wait for DOM update and potential markdown rendering
        nextTick(() => {
            scrollToBottom()
            setTimeout(scrollToBottom, 500)
        })
    }
})
// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    // Main agent dropdown
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        dropdownRef.value.open = false
    }

    // Close input toolbar dropdowns if clicking outside the input area
    // Simplified: just close them on any click outside specific dropdowns interactions
    // For now, let's rely on DaisyUI focus behavior or manual toggles, but manual close is safer
    const target = event.target as HTMLElement
    if (!target.closest('.dropdown-top')) {
        commandDropdownOpen.value = false
        modelDropdownOpen.value = false
    }
}

const refreshChatAndScroll = async () => {
    await gatewayStore.refreshChat()
    scrollToBottom()
}

const createNewSession = async () => {
    await gatewayStore.createNewSession()
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    // Load chat history when mounted
    if (gatewayStore.connected) {
        refreshChatAndScroll()
    }
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

// Watch for connection and load chat
watch(() => gatewayStore.connected, (connected) => {
    if (connected) {
        refreshChatAndScroll()
    }
})
</script>

<template>
    <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="navbar bg-base-100 border-b border-base-300">
            <!-- Hamburger menu (mobile only) -->
            <div class="flex-none lg:hidden">
                <label for="sidebar-drawer" class="btn btn-square btn-ghost drawer-button">
                    <Bars3Icon class="h-5 w-5" />
                </label>
            </div>
            <div class="flex-1">
                <!-- Agent dropdown (for agent main sessions) -->
                <details v-if="showAgentDropdown" class="dropdown" ref="dropdownRef">
                    <summary class="btn btn-ghost btn-sm gap-1 list-none">
                        <span class="font-semibold">{{ selectedAgent?.name || 'Assistant' }}</span>
                        <ChevronDownIcon class="h-4 w-4" />
                    </summary>
                    <ul class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg">
                        <li v-for="agent in agents" :key="agent.id">
                            <a @click="selectAgent(agent.id)" class="flex justify-between items-center"
                                :class="{ 'active': selectedAgentId === agent.id }">
                                <span>{{ agent.name }}</span>
                                <CheckIcon v-if="selectedAgentId === agent.id" class="h-4 w-4" />
                            </a>
                        </li>
                    </ul>
                </details>
                <!-- Session name (for specific sessions like agent:xxx:session:xxx) -->
                <span v-else class="btn btn-ghost btn-sm font-semibold">
                    {{ currentSessionName }}
                </span>
            </div>
            <!-- Connection status indicator -->
            <div class="flex-none flex items-center gap-2">
                <div class="flex items-center gap-1">
                    <div class="w-2 h-2 rounded-full" :class="gatewayStore.connected ? 'bg-success' : 'bg-error'"></div>
                    <span class="text-xs text-base-content/60 hidden sm:inline">
                        {{ gatewayStore.connected ? '已连接' : '未连接' }}
                    </span>
                </div>
            </div>
            <!-- Mobile buttons -->
            <div class="flex-none flex gap-1 lg:hidden">
                <button @click="createNewSession" class="btn btn-ghost btn-circle btn-sm" title="新建对话">
                    <PlusIcon class="h-5 w-5" />
                </button>
            </div>
            <!-- PC theme toggle button -->
            <div class="flex-none hidden lg:flex gap-2">
                <button @click="settingsStore.toggleLayout()" class="btn btn-ghost btn-circle btn-sm"
                    :title="settingsStore.isWideMode ? '切换至窄屏' : '切换至宽屏'">
                    <ArrowsPointingInIcon v-if="settingsStore.isWideMode" class="h-5 w-5" />
                    <ArrowsPointingOutIcon v-else class="h-5 w-5" />
                </button>
                <button @click="settingsStore.toggleTheme()" class="btn btn-ghost btn-circle btn-sm">
                    <SunIcon v-if="settingsStore.isDark" class="h-5 w-5" />
                    <MoonIcon v-else class="h-5 w-5" />
                </button>
            </div>
        </div>

        <!-- Main content area -->
        <div class="flex-1 flex flex-col min-h-0">
            <!-- Loading state -->
            <div v-if="isLoading && processedMessages.length === 0" class="flex-1 flex items-center justify-center">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <!-- Welcome message when no messages -->
            <div v-else-if="processedMessages.length === 0"
                class="flex-1 flex flex-col items-center justify-center p-4">
                <div class="text-center">
                    <h1 class="text-3xl font-bold mb-2">Hi, 欢迎使用 Seedclaw</h1>
                    <p class="text-base-content/60">我是 Seedclaw，聊天、写作、搜索都在行，助你灵感无限</p>
                </div>
            </div>

            <!-- Chat messages - only this area scrolls -->
            <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-4">
                <div class="space-y-4 mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                    <div v-for="(msg, index) in processedMessages" :key="index" class="chat group"
                        :class="msg.role === 'user' ? 'chat-end' : 'chat-start'">
                        <!-- Avatar -->
                        <div class="chat-image avatar hidden md:block">
                            <div class="w-10 rounded-full bg-base-300 flex items-center justify-center overflow-hidden">
                                <template v-if="msg.role === 'user'">
                                    <span class="text-lg">👤</span>
                                </template>
                                <template v-else>
                                    <img v-if="isAvatarUrl(gatewayStore.assistantAvatar)"
                                        :src="gatewayStore.assistantAvatar || undefined"
                                        class="w-full h-full object-cover" />
                                    <span v-else-if="gatewayStore.assistantAvatar" class="text-lg">{{
                                        gatewayStore.assistantAvatar }}</span>
                                    <span v-else class="text-lg">🤖</span>
                                </template>
                            </div>
                        </div>
                        <!-- Header -->
                        <div class="chat-header opacity-70 text-xs mb-1">
                            {{ msg.role === 'user' ? '你' : gatewayStore.assistantName || 'Assistant' }}
                            <time v-if="msg.timestamp" class="ml-1">{{ formatTime(msg.timestamp) }}</time>
                        </div>
                        <!-- Bubble -->
                        <!-- User Message -->
                        <div v-if="msg.role === 'user'" class="chat-bubble chat-bubble-primary relative">
                            <div class="whitespace-normal">
                                <template v-for="(block, bIndex) in msg.blocks" :key="bIndex">
                                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''"
                                        :asUser="true" />
                                </template>
                            </div>
                        </div>
                        <!-- User Actions (Hover) -->
                        <div v-if="msg.role === 'user'"
                            class="chat-footer opacity-0 group-hover:opacity-100 transition-all duration-200 mt-1">
                            <button @click="copyMessage(msg)"
                                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                                title="复制">
                                <ClipboardIcon class="h-4 w-4" />
                            </button>
                        </div>

                        <!-- Assistant Message -->
                        <div v-else class="chat-bubble w-full relative">
                            <div class="whitespace-normal flex flex-col gap-2">
                                <template v-for="(block, bIndex) in msg.blocks" :key="bIndex">
                                    <MarkdownRenderer v-if="block.type === 'text'" :content="block.text || ''" />
                                    <ToolInvocation v-else-if="block.type === 'tool'"
                                        :toolName="block.toolName || 'Unknown Tool'" :args="block.toolArgs || {}"
                                        :result="block.toolResult" :state="block.toolState"
                                        :errorMessage="block.toolError" />
                                </template>
                            </div>
                        </div>
                        <!-- Assistant Actions (Fixed) -->
                        <div v-if="msg.role !== 'user'" class="chat-footer mt-1 flex gap-1">
                            <button @click="copyMessage(msg)"
                                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                                title="复制">
                                <ClipboardIcon class="h-4 w-4" />
                            </button>
                            <button @click="readAloud(msg)"
                                class="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                                :class="{ 'bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-700': currentReadingMsgId === msg.id }"
                                title="朗读">
                                <template v-if="currentReadingMsgId === msg.id">
                                    <StopIcon class="h-4 w-4" />
                                </template>
                                <template v-else>
                                    <SpeakerWaveIcon class="h-4 w-4" />
                                </template>
                            </button>
                        </div>
                    </div>

                    <!-- Streaming response -->
                    <div v-if="streamingText || isBusy" class="chat chat-start">
                        <div class="chat-image avatar hidden md:block">
                            <div class="w-10 rounded-full bg-base-300 flex items-center justify-center overflow-hidden">
                                <img v-if="isAvatarUrl(gatewayStore.assistantAvatar)"
                                    :src="gatewayStore.assistantAvatar || undefined"
                                    class="w-full h-full object-cover" />
                                <span v-else-if="gatewayStore.assistantAvatar" class="text-lg">{{
                                    gatewayStore.assistantAvatar }}</span>
                                <span v-else class="text-lg">🤖</span>
                            </div>
                        </div>
                        <div class="chat-header opacity-70 text-xs mb-1">
                            {{ gatewayStore.assistantName || 'Assistant' }}
                            <span class="ml-1 loading loading-dots loading-xs"></span>
                        </div>
                        <div class="chat-bubble w-full overflow-hidden" :class="{ 'opacity-50': !streamingText }">
                            <MarkdownRenderer :content="streamingText || '...'" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Input area -->
        <div class="p-4 border-t border-base-300 bg-base-100">
            <div
                class="bg-base-200/50 rounded-[2rem] p-2 pr-2 shadow-sm border border-base-300/50 flex flex-col gap-1 relative focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-300">
                <!-- Input Top -->
                <textarea v-model="inputText" rows="1" placeholder="发消息或输入'/'选择技能"
                    class="textarea textarea-ghost w-full resize-none focus:outline-none focus:bg-transparent text-base min-h-[44px] max-h-[200px] px-3 py-3 leading-6 placeholder:text-base-content/40 hide-scrollbar"
                    @keydown="handleKeydown"
                    @input="(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = target.scrollHeight + 'px' }"
                    :disabled="!gatewayStore.connected"></textarea>

                <!-- Toolbar Bottom -->
                <div class="flex items-center justify-between pb-1">
                    <!-- Left Actions -->
                    <div class="flex items-center gap-1 text-base-content/70">
                        <!-- Attach -->
                        <button
                            class="btn btn-ghost btn-circle btn-sm hover:bg-base-300 hover:text-primary transition-colors"
                            title="上传附件">
                            <CameraIcon class="h-5 w-5" />
                        </button>

                        <!-- Command -->
                        <div class="dropdown dropdown-top" :class="{ 'dropdown-open': commandDropdownOpen }">
                            <button @click.stop="commandDropdownOpen = !commandDropdownOpen; modelDropdownOpen = false"
                                class="btn btn-ghost btn-sm  gap-1 font-normal rounded-full border border-base-content/20 hover:border-base-content/40 hover:bg-base-300  transition-all"
                                title="命令">
                                <CommandLineIcon class="h-4 w-4 hidden sm:inline" />
                                <span class="sm:inline">命令</span>
                                <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                            </button>
                            <ul
                                class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-56 border border-base-300 mb-2 z-[100]">
                                <li class="menu-title px-4 py-2 text-xs opacity-50">常用指令</li>
                                <li v-for="cmd in commands" :key="cmd.value">
                                    <a @click="selectCommand(cmd.value)" class="rounded-lg">{{ cmd.label }}</a>
                                </li>
                            </ul>
                        </div>

                        <!-- Model -->
                        <div class="dropdown dropdown-top" :class="{ 'dropdown-open': modelDropdownOpen }">
                            <button @click.stop="modelDropdownOpen = !modelDropdownOpen; commandDropdownOpen = false"
                                class="btn btn-ghost btn-sm gap-1 font-normal rounded-full border border-base-content/20 hover:border-base-content/40 hover:bg-base-300  transition-all"
                                title="模型">
                                <CpuChipIcon class="h-4 w-4  hidden sm:inline" />
                                <span class=" sm:inline">模型</span>
                                <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                            </button>
                            <ul
                                class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-48 border border-base-300 mb-2 z-[100]">
                                <li class="menu-title px-4 py-2 text-xs opacity-50">选择模型</li>
                                <li v-for="m in models" :key="m.value">
                                    <a @click="selectModel(m.value)" class="rounded-lg justify-between"
                                        :class="{ 'active': selectedModel === m.value }">
                                        {{ m.label }}
                                        <CheckIcon v-if="selectedModel === m.value" class="h-4 w-4" />
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <!-- Think -->
                        <button @click="isThinking = !isThinking"
                            class="btn btn-sm gap-1 font-normal rounded-full transition-all duration-300 "
                            :class="isThinking ? 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20' : 'btn-ghost hover:bg-base-300'"
                            title="深度思考">
                            <SparklesIcon class="h-4 w-4" />
                            <span class=" sm:inline">思考</span>
                        </button>
                    </div>

                    <!-- Right Actions -->
                    <div class="flex items-center gap-2">
                        <!-- Mic -->
                        <button @click="handleMicClick"
                            class="btn btn-circle btn-sm transition-all duration-300 relative overflow-hidden"
                            :class="isRecording ? 'btn-success text-success-content scale-110 shadow-[0_0_15px_rgba(var(--sc),0.5)] border-success' : 'btn-ghost bg-base-300/50 hover:bg-base-300'"
                            title="语音输入">
                            <MicrophoneIcon class="h-5 w-5 relative z-10" />
                            <span v-if="isRecording"
                                class="absolute inset-0 bg-white/20 animate-ping rounded-full"></span>
                        </button>

                        <!-- Send -->
                        <button @click="handleSend"
                            class="btn btn-circle btn-sm btn-primary shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"
                            :disabled="!gatewayStore.connected || (!inputText.trim() && !isBusy)">
                            <StopIcon v-if="isBusy" class="h-5 w-5" />
                            <PaperAirplaneIcon v-else class="h-5 w-5 -rotate-45 translate-x-0.5 translate-y-px" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
    display: none;
}

.hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

textarea:focus,
input:focus {
    box-shadow: none;
}
</style>
