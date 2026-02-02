<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
    Bars3Icon,
    ChevronDownIcon,
    CameraIcon,
    MicrophoneIcon,
    CheckIcon,
    SunIcon,
    MoonIcon,
    PaperAirplaneIcon,
    StopIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    PlusIcon
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../stores/setting'
import { useGatewayStore } from '../stores/gateway'
import { isAgentMainSession, createAgentMainSessionKey } from '../services/includes/session-key-utils'
import MarkdownRenderer from './MarkdownRenderer.vue'
const inputText = ref('')
const dropdownRef = ref<HTMLDetailsElement | null>(null)
const messagesContainerRef = ref<HTMLDivElement | null>(null)
const settingsStore = useUiSettingsStore()
const gatewayStore = useGatewayStore()

// Computed properties for chat
const messages = computed(() => gatewayStore.chatMessages as Array<{
    role: 'user' | 'assistant'
    content: unknown
    timestamp?: number
}>)

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
const showAgentDropdown = computed(() => isAgentMainSession(gatewayStore.sessionKey))

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

// Extract text from message content
const extractMessageText = (content: unknown): string => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
        return content
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text || '')
            .join('\n')
    }
    return ''
}

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

    inputText.value = ''
    await gatewayStore.sendMessage(text)
    scrollToBottom()
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

watch(messages, scrollToBottom)
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
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        dropdownRef.value.open = false
    }
}

const refreshChatAndScroll = async () => {
    await gatewayStore.refreshChat()
    scrollToBottom()
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
                        <li v-if="agents.length === 0">
                            <span class="text-base-content/50">加载中...</span>
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
                <!-- <button class="btn btn-ghost btn-circle btn-sm">
                    <SpeakerXMarkIcon class="h-5 w-5" />
                </button>
                <button class="btn btn-ghost btn-circle btn-sm">
                    <PhoneIcon class="h-5 w-5" />
                </button> -->
                <button @click="gatewayStore.createNewSession()" class="btn btn-ghost btn-circle btn-sm" title="新建对话">
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
            <div v-if="isLoading && messages.length === 0" class="flex-1 flex items-center justify-center">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <!-- Welcome message when no messages -->
            <div v-else-if="messages.length === 0" class="flex-1 flex flex-col items-center justify-center p-4">
                <div class="text-center">
                    <h1 class="text-3xl font-bold mb-2">Hi, 欢迎使用 Seedclaw</h1>
                    <p class="text-base-content/60">我是 Seedclaw，聊天、写作、搜索都在行，助你灵感无限</p>
                </div>
            </div>

            <!-- Chat messages - only this area scrolls -->
            <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-4">
                <div class="space-y-4 mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                    <div v-for="(msg, index) in messages" :key="index" class="chat"
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
                        <div class="chat-bubble whitespace-pre-wrap"
                            :class="msg.role === 'user' ? 'chat-bubble-primary' : 'w-full'">
                            <div class="whitespace-normal">
                                <div v-if="msg.role === 'user'">
                                    {{ extractMessageText(msg.content) }}
                                </div>
                                <div v-else>
                                    <MarkdownRenderer :content="extractMessageText(msg.content)" />
                                </div>
                            </div>
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
        <div class="p-4 border-t border-base-300">
            <div class="flex items-center gap-2 bg-base-200 rounded-full px-4 py-2">
                <button class="btn btn-ghost btn-circle btn-sm">
                    <CameraIcon class="h-5 w-5" />
                </button>
                <input v-model="inputText" type="text" :placeholder="isBusy ? '正在生成回复...' : '发消息或按住说话...'"
                    class="flex-1 bg-transparent border-none outline-none text-sm" @keydown="handleKeydown"
                    :disabled="!gatewayStore.connected" />
                <button class="btn btn-ghost btn-circle btn-sm">
                    <MicrophoneIcon class="h-5 w-5" />
                </button>
                <button @click="handleSend" class="btn btn-ghost btn-circle btn-sm" :class="{ 'text-error': isBusy }"
                    :disabled="!gatewayStore.connected">
                    <StopIcon v-if="isBusy" class="h-5 w-5" />
                    <PaperAirplaneIcon v-else class="h-5 w-5" />
                </button>
            </div>
        </div>
    </div>
</template>
