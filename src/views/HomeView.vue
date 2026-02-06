<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { useGatewayStore } from '../stores/gateway'
import { isAgentMainSession, createAgentMainSessionKey } from '../services/includes/session-key-utils'
import { useChatMessages, type DisplayMessage } from '../composables/useChatMessages'
import { useTTS } from '../composables/useTTS'
import { useVoiceChat } from '../composables/useVoiceChat'
import ChatHeader from '../components/chat/ChatHeader.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import ChatInput from '../components/chat/ChatInput.vue'
import MarkdownRenderer from '../components/chat/MarkdownRenderer.vue'
import VoiceChatOverlay from '../components/chat/VoiceChatOverlay.vue'
import AppSidebar from '../components/AppSidebar.vue'

const route = useRoute()
const router = useRouter()
const settingsStore = useUiSettingsStore()
const gatewayStore = useGatewayStore()

// Refs
const messagesContainerRef = ref<HTMLDivElement | null>(null)
const chatHeaderRef = ref<InstanceType<typeof ChatHeader> | null>(null)
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)

// Chat messages composable
const {
    processedMessages,
    isLoading,
    isBusy,
    streamingText,
    scrollToBottom,
    setupScrollWatchers,
    formatTime,
    isAvatarUrl,
    refreshChatAndScroll
} = useChatMessages(messagesContainerRef)

// TTS
const { currentReadingMsgId, readAloud: ttsReadAloud } = useTTS()

// Agent selection
const selectedAgentId = ref('')

// Get available agents from gateway (using store getter)
const agents = computed(() => gatewayStore.agents)


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

// Agent selection handler
const handleSelectAgent = (agentId: string) => {
    selectedAgentId.value = agentId

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

// Send message handler
const handleSend = async () => {
    const inputText = chatInputRef.value?.inputText?.trim() || ''
    if (!inputText && !isBusy.value) return

    if (isBusy.value) {
        // If busy, abort the current run
        await gatewayStore.abortChat()
        return
    }

    if (gatewayStore.isNewSessionPending) {
        await gatewayStore.commitNewSession()
    }

    // Clone attachments immediately to avoid reference issues when clearing
    const attachments = [...(chatInputRef.value?.attachments ?? [])]

    if (chatInputRef.value) {
        chatInputRef.value.inputText = ''
        // Clear attachments in UI
        if (chatInputRef.value.attachments) {
            chatInputRef.value.attachments.length = 0
        }
    }

    // We need to clone attachments because we clear the UI state immediately
    await gatewayStore.sendMessage(inputText, [...attachments])

    // Clear attachments in UI (actually we should do it here to completely reset)
    if (chatInputRef.value && chatInputRef.value.attachments) {
        chatInputRef.value.attachments = []
    }
    scrollToBottom()
}

// Message actions
const copyMessage = (msg: DisplayMessage) => {
    const text = msg.blocks
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n')
    navigator.clipboard.writeText(text)
}

const readAloud = (msg: DisplayMessage) => {
    const text = msg.blocks
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n')
    ttsReadAloud(msg.id, text)
}

// Create new session
const createNewSession = async () => {
    await gatewayStore.createNewSession()
}

// Voice Chat
const handleRecognizedText = async (text: string) => {
    // Need to send this text to the chat
    // Just simulating input and send
    if (chatInputRef.value) {
        chatInputRef.value.inputText = text
        await handleSend()
    } else {
        // Fallback if ref is missing
        await gatewayStore.sendMessage(text)
        scrollToBottom()
    }
}

const {
    isVoiceChatActive,
    voiceStatus,
    transcript,
    currentlySpeakingText,
    isWaitingForAudio,
    start: startVoiceChat,
    stop: stopVoiceChat,
    speakStream,
    startStream,
    finishStream
} = useVoiceChat(handleRecognizedText)

// Watch streaming text to speak
watch(() => streamingText.value, (newText) => {
    if (isVoiceChatActive.value && newText) {
        speakStream(newText)
    }
})

// Watch busy state to manage stream life cycle
watch(isBusy, (busy, prevBusy) => {
    if (!isVoiceChatActive.value) return

    if (!prevBusy && busy) {
        // Started generating
        startStream()
    } else if (prevBusy && !busy) {
        // Finished generating - get the final complete text from last message
        const lastMessages = processedMessages.value
        if (lastMessages.length > 0) {
            const lastMsg = lastMessages[lastMessages.length - 1]
            if (lastMsg.role === 'assistant') {
                const fullText = lastMsg.blocks
                    .filter(b => b.type === 'text')
                    .map(b => b.text || '')
                    .join('\n')
                // Ensure the complete text is processed
                if (fullText) {
                    speakStream(fullText)
                }
            }
        }
        finishStream()
    }
})

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    chatHeaderRef.value?.handleClickOutside(event)
    chatInputRef.value?.handleToolbarClickOutside(event)
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
    setupScrollWatchers()

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

// Handle route query parameters for session switching
watch(() => route.query, async (query) => {
    if (query.sessionkey && typeof query.sessionkey === 'string') {
        // Switch to the specified session
        gatewayStore.setSessionKey(query.sessionkey)
        // Clear the query parameter after processing
        router.replace({ name: 'home' })
    } else if (query.new === '1') {
        // Create a new session
        await gatewayStore.createNewSession()
        // Clear the query parameter after processing
        router.replace({ name: 'home' })
    }
}, { immediate: true })
</script>

<template>
    <div class="h-full w-full flex">
        <!-- Sidebar drawer (Mobile) -->
        <div class="drawer lg:hidden absolute inset-0 pointer-events-none z-50">
            <input id="sidebar-drawer" type="checkbox" class="drawer-toggle pointer-events-auto" />
            <div class="drawer-side pointer-events-auto h-full">
                <label for="sidebar-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
                <div class="w-80 h-full bg-base-200">
                    <AppSidebar />
                </div>
            </div>
        </div>

        <!-- Chat Area -->
        <div class="flex-1 flex flex-col h-full min-w-0">
            <!-- Header -->
            <ChatHeader ref="chatHeaderRef" :selected-agent="selectedAgent" :show-agent-dropdown="showAgentDropdown"
                :current-session-name="currentSessionName" :agents="agents" @select-agent="handleSelectAgent"
                @create-session="createNewSession" @start-voice-chat="startVoiceChat" />

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
                        <h1 class="text-3xl font-bold mb-2">Hi, 欢迎使用 SeedClaw</h1>
                        <p class="text-base-content/60">我是 SeedClaw，聊天、写作、搜索都在行，助你灵感无限</p>
                    </div>
                </div>

                <!-- Chat messages - only this area scrolls -->
                <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-4">
                    <div class="space-y-4 mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                        <MessageBubble v-for="(msg, index) in processedMessages" :key="index" :message="msg"
                            :assistant-name="gatewayStore.assistantName || 'Assistant'"
                            :assistant-avatar="isAvatarUrl(gatewayStore.assistantAvatar) ? gatewayStore.chatAvatarUrl : gatewayStore.assistantAvatar"
                            :current-reading-msg-id="currentReadingMsgId" :format-time="formatTime"
                            :is-avatar-url="isAvatarUrl" @copy="copyMessage" @read-aloud="readAloud" />

                        <!-- Streaming response -->
                        <div v-if="streamingText || isBusy" class="chat chat-start">
                            <div class="chat-image avatar hidden md:block">
                                <div
                                    class="w-10 rounded-full bg-base-300 flex items-center justify-center overflow-hidden">
                                    <img v-if="isAvatarUrl(gatewayStore.assistantAvatar)"
                                        :src="gatewayStore.chatAvatarUrl || undefined"
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
            <ChatInput ref="chatInputRef" :is-busy="isBusy" :disabled="!gatewayStore.connected" @send="handleSend" />

            <!-- Voice Chat Overlay -->
            <VoiceChatOverlay :is-open="isVoiceChatActive" :status="voiceStatus" :transcript="transcript"
                :speaking-text="currentlySpeakingText" :is-waiting="isWaitingForAudio" @close="stopVoiceChat" />
        </div>
    </div>
</template>
