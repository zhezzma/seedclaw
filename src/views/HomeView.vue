<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch, reactive, toRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { useGateway } from '../composables/useGateway'
import { useChatMessages, type DisplayMessage } from '../composables/useChatMessages'
import { useTTS } from '../composables/useTTS'
import { useVoiceChat } from '../composables/useVoiceChat'
import ChatHeader from '../components/chat/ChatHeader.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import ChatInput from '../components/chat/ChatInput.vue'
import VoiceChatOverlay from '../components/chat/VoiceChatOverlay.vue'
import SessionSidebar from '../components/chat/SessionSidebar.vue'
import AppSidebar from '../components/AppSidebar.vue'
import { createAgentMainSessionKey, isAgentMainSession, isCronSession } from '../utils/session-key-helpers'
import { useChatState } from '../composables/useChatState'
import { useSessionsState } from '../composables/useSessionsState'
import { useAgentsState } from '../composables/useAgentsState'

const route = useRoute()
const router = useRouter()
const settingsStore = useUiSettingsStore()
const gatewayStore = useGateway()

const chatState = useChatState()
const sessionsState = useSessionsState()
const agentsState = useAgentsState()


// Helper to access delegated props that were in localState
const isNewSessionPending = toRef(chatState, 'isNewSessionPending')
const hello = toRef(gatewayStore, 'hello')

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
    refreshChatAndScroll
} = useChatMessages(chatState as any, messagesContainerRef)

// TTS
const { currentReadingMsgId, readAloud: ttsReadAloud } = useTTS()

// Agent selection
const selectedAgentId = ref('')

// Get available agents from local state
const agents = computed(() => {
    const list = agentsState.agentsList?.agents || []
    const defaultId = (hello.value?.snapshot as any)?.sessionDefaults?.defaultAgentId?.trim() || list[0]?.id || 'main'
    return list.map((a: any) => ({
        id: a.id,
        name: a.name || a.identity?.name || a.id,
        avatarUrl: a.identity?.avatarUrl,
        icon: a.identity?.emoji || '🤖',
        description: a.identity?.theme || '还未设定哟',
        isDefault: (a.id || a.name) === defaultId
    }))
})


const selectedAgent = computed(() => {
    return agents.value.find((a: any) => a.id === selectedAgentId.value) || agents.value[0] || { id: 'main', name: 'Assistant', icon: '🤖' }
})

// Check if current session is an agent main session (show dropdown) or a specific session (show session name)
const showAgentDropdown = computed(() => isAgentMainSession(chatState.sessionKey) || isNewSessionPending.value)

// Get current session name from sessions list
const currentSessionName = computed(() => {
    const sessionKey = chatState.sessionKey
    if (!sessionKey) return 'Chat Session'

    if (isNewSessionPending.value) {
        const agentId = chatState.assistantAgentId
        const agent = agents.value.find(a => a.id === agentId)
        return `新会话(${agent?.name || 'Assistant'})`
    }

    const sessions = sessionsState.sessionsResult?.sessions || []
    const session = sessions.find((s: any) => s.key === sessionKey)
    return session?.displayName || session?.label || 'Chat Session'
})

// Sessions list for sidebar - No longer needed here as AppSidebar handles it
// const sessions = computed(() => sessionsState.sessionsResult?.sessions || [])


// Messages / Cron Mode Logic
const isMessagesMode = computed(() => route.query.type)



const typeSessions = computed(() => {
    const list = sessionsState.sessionsResult?.sessions || []
    // If type is cron, filter cron sessions. If not, maybe return empty or all?
    // User context implies restoring typeSessions logic.
    // If isMessagesMode is truthy (type is present), we might want to filter by that type.
    // But for now, let's implement what was requested: "isMessagesMode且displaySessions是空...".
    // And user snippet called it "typeSessions".
    // So I assume we are handling "cron" type here.
    const type = route.query.type
    if (type === 'cron') {
        return list.filter((s: any) => isCronSession(s.key))
    }
    if (type === 'main') {
        return list.filter((s: any) => isAgentMainSession(s.key))
    }
    if (type === 'other') {
        return list.filter((s: any) => !isAgentMainSession(s.key) && !isCronSession(s.key))
    }
    return []
})

const handleTypeSessionselect = (key: string) => {
    router.push({
        name: 'chat',
        params: { sessionkey: key },
        query: { type: route.query.type }
    })
}

const handleTypeSessionDelete = async (key: string) => {
    const result = await sessionsState.deleteSession(key)
    if (result?.deleted && chatState.sessionKey === key) {
        // If we deleted the currently viewed session, clear selection
        router.push({ name: 'chat', query: { type: 'cron' } })
    }
}

const typeSelectedKey = ref("")

// Auto-select first session
watch(() => [route.query.type, typeSessions.value, route.params.sessionkey], (values) => {
    const type = values[0] as string | null
    const sessions = values[1] as any[]
    const currentKey = values[2] as string | null
    if (type && currentKey && sessions && sessions.length > 0) {
        typeSelectedKey.value = currentKey
    }
    else {
        typeSelectedKey.value = ""
    }
}, { immediate: true })

const showMobileSessionList = computed(() => {
    if (!isMessagesMode.value) return false
    return !typeSelectedKey.value
})







// Watch for assistant identity changes to update selection
watch(() => chatState.assistantAgentId, (newId) => {
    if (newId) {
        selectedAgentId.value = newId
    }
}, { immediate: true })

// Send message handler
const handleSend = async () => {
    let inputText = chatInputRef.value?.inputText?.trim() || ''
    // Check if there are any attachments
    const hasAttachments = (chatInputRef.value?.attachments?.length ?? 0) > 0

    if (!inputText && !hasAttachments && !isBusy.value) return

    if (isBusy.value) {
        // If busy, abort the current run
        await chatState.abortChat()
        return
    }

    if (isNewSessionPending.value) {
        await chatState.commitNewSession(inputText)
    }

    // Process attachments:
    // - Images: Keep as attachments
    // - Files: Append content to inputText
    const rawAttachments = chatInputRef.value?.attachments ?? []
    const imageAttachments: any[] = []

    // Process file content appending
    let appendedText = ''
    for (const att of rawAttachments) {
        if (att.mimeType.startsWith('image/')) {
            imageAttachments.push(att)
        } else if (att.content) {
            appendedText += `\n=== File Content: ${att.name || "attachment"} ===\n${att.content}\n==============================\n`
        }
    }

    if (appendedText) {
        if (inputText) inputText += '\n'
        inputText += appendedText
    }

    if (chatInputRef.value) {
        chatInputRef.value.inputText = ''
        // Clear attachments in UI
        if (chatInputRef.value.attachments) {
            chatInputRef.value.attachments = []
        }
    }

    // We need to clone attachments because we clear the UI state immediately
    // Only send image attachments to the backend as "attachments"
    await chatState.sendMessage(inputText, [...imageAttachments])

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


// Voice Chat
const handleRecognizedText = async (text: string) => {
    // Need to send this text to the chat
    // Just simulating input and send
    if (chatInputRef.value) {
        chatInputRef.value.inputText = text
        await handleSend()
    } else {
        // Fallback if ref is missing
        await chatState.sendMessage(text)
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


onMounted(async () => {
    document.addEventListener('click', handleClickOutside)
    scrollToBottom()
    // Add a delay to ensure scroll happens after transition/layout updates
    setTimeout(scrollToBottom, 100)
    setupScrollWatchers()
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})



// Handle route params for session switching
watch(() => [route.params.sessionkey, route.name], async ([sessionkey, routeName]) => {
    console.log("[HomeView] watch route.params", sessionkey, routeName)

    // Handle new session route
    if (routeName === 'new-session') {
        await chatState.createNewSession()
        return
    }

    // Handle session key in route params
    if (sessionkey && typeof sessionkey === 'string') {
        // Optimize: Don't reload if session key is already set
        if (chatState.sessionKey === sessionkey) {
            console.log('[HomeView] Session key unchanged, skipping reload', sessionkey)
            return
        }
        chatState.setSessionKey(sessionkey)
        return
    }

    // No session key specified, apply default behavior
    // Wait for gateway to be connected before applying default behavior
    if (!gatewayStore.connected) {
        console.log('[HomeView] Gateway not connected yet, waiting...')
        return
    }
    await applyDefaultSessionBehavior()

}, { immediate: true })

// Watch for gateway connection to apply default session behavior
watch(() => gatewayStore.connected, async (connected, wasConnected) => {
    if (!connected || wasConnected) return

    // Only trigger when just connected (false -> true)
    if (!chatState.sessionKey) {
        console.log('[HomeView] Gateway connected, applying default session behavior')
        await applyDefaultSessionBehavior()
    } else {
        // If session key is already set (e.g. from URL), load history now that we are connected
        console.log('[HomeView] Gateway connected, loading history for existing session', chatState.sessionKey)
        await chatState.loadAssistantIdentity()
        await chatState.loadChatHistory()
    }
})

// Helper function to apply default session behavior based on settings
async function applyDefaultSessionBehavior() {
    if (isMessagesMode.value) {
        console.log('[HomeView] Messages mode, skipping default session behavior')
        return
    }

    // Default behavior based on settings
    if (settingsStore.homePageBehavior === 'new_session') {
        await chatState.createNewSession()
        router.replace({ name: 'new-session' })
    } else if (settingsStore.homePageBehavior === 'default_session') {
        // Load explicitly default session
        console.log('Default: default session', gatewayStore.defaultSessionKey)
        chatState.setSessionKey(gatewayStore.defaultSessionKey)
        router.replace({ name: 'chat', params: { sessionkey: gatewayStore.defaultSessionKey } })
    } else {
        // Default: last active session
        const targetKey = settingsStore.lastActiveSessionKey || gatewayStore.defaultSessionKey
        console.log('Default: last active session', targetKey)
        chatState.setSessionKey(targetKey)
        router.replace({ name: 'chat', params: { sessionkey: targetKey } })
    }
}
</script>

<template>
    <div class="h-full w-full flex">
        <!-- Sidebar drawer (Mobile) -->
        <div class="drawer lg:hidden absolute inset-0 pointer-events-none z-[100]">
            <input id="sidebar-drawer" type="checkbox" class="drawer-toggle pointer-events-auto" />
            <div class="drawer-side pointer-events-auto h-full">
                <label for="sidebar-drawer" aria-label="close sidebar" class="drawer-overlay"></label>
                <div class="w-80 h-full bg-base-200">
                    <AppSidebar />
                </div>
            </div>
        </div>

        <!-- NEW: Messages List Column (Desktop: visible if isMessagesMode; Mobile: visible if isMessagesMode && showMobileSessionList) -->
        <div v-if="isMessagesMode" class="w-full lg:w-80 bg-base-100 border-r border-base-200 flex flex-col shrink-0"
            :class="{ 'hidden lg:flex': !showMobileSessionList, 'flex': showMobileSessionList }">
            <SessionSidebar title="消息列表" :sessions="typeSessions" :selected-key="typeSelectedKey"
                @select="handleTypeSessionselect" @delete="handleTypeSessionDelete" />
        </div>


        <!-- Empty Messages list state -->
        <div v-if="isMessagesMode && !typeSelectedKey" class="flex-1 flex flex-col items-center justify-center p-4">
            <div class="text-center text-base-content/60">
                <div class="text-center">
                    <h1 class="text-3xl font-bold mb-2">Hi, 欢迎使用 SeedClaw</h1>
                    <p class="text-base-content/60">我是 SeedClaw，聊天、写作、搜索都在行，助你灵感无限</p>
                </div>
            </div>
        </div>
        <!-- Chat Area -->
        <div v-else class="flex-1 flex flex-col h-full min-w-0"
            :class="{ 'hidden lg:flex': isMessagesMode && showMobileSessionList }">

            <!-- Header -->
            <ChatHeader ref="chatHeaderRef" :selected-agent="selectedAgent" :show-agent-dropdown="showAgentDropdown"
                :current-session-name="currentSessionName" :agents="agents" @start-voice-chat="startVoiceChat" />

            <!-- Main content area -->
            <div class="flex-1 flex flex-col min-h-0">
                <!-- Loading state -->
                <div v-if="isLoading" class="flex-1 flex items-center justify-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- Welcome message when no messages -->
                <div v-else-if="isNewSessionPending" class="flex-1 flex flex-col items-center justify-center p-4">
                    <div class="text-center">
                        <h1 class="text-3xl font-bold mb-2">Hi, 欢迎使用 SeedClaw</h1>
                        <p class="text-base-content/60">我是 SeedClaw，聊天、写作、搜索都在行，助你灵感无限</p>
                    </div>
                </div>

                <!-- Chat messages - only this area scrolls -->
                <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-4">
                    <div class="space-y-4 mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                        <MessageBubble v-for="(msg, index) in processedMessages" :key="index" :message="msg"
                            @copy="copyMessage" @read-aloud="readAloud"
                            :is-loading="isBusy && (index === processedMessages.length - 1)" />


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
