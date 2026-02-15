<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch, reactive, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'

import { useChatMessages, type DisplayMessage } from '../composables/useChatMessages'
import { useTTS } from '../composables/useTTS'
import { useVoiceChat } from '../composables/useVoiceChat'
import ChatHeader from '../components/chat/ChatHeader.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import ChatInput from '../components/chat/ChatInput.vue'
import VoiceChatOverlay from '../components/chat/VoiceChatOverlay.vue'
import SessionSidebar from '../components/chat/SessionSidebar.vue'
import AppSidebar from '../components/AppSidebar.vue'

import { isNewSession, NEW_SESSION_PATH, NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'
import { useChatState, extractAgentId } from '../composables/useChatState'
import { useSessionsState, type SessionsResult } from '../composables/useSessionsState'
import { useAgentsState } from '../composables/useAgentsState'
import { useToast } from '../composables/useToast'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const settingsStore = useUiSettingsStore()


const chatState = useChatState()
const sessionsState = useSessionsState()
const agentsState = useAgentsState()




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
const selectedAgent = computed(() => {
    return agentsState.agentsList.find((a: any) => a.id === agentsState.agentsSelectedId) || agentsState.agentsList[0]
})



// Sessions list for sidebar - No longer needed here as AppSidebar handles it
// const sessions = computed(() => sessionsState.sessionsResult?.sessions || [])


// Messages / Cron Mode Logic
const isTypeMode = computed(() => route.query.type)


const cronSessionsResult = ref<SessionsResult | null>(null)
const typeSessions = computed(() => cronSessionsResult.value?.sessions || [])

watch(() => route.query.type, async (val) => {
    if (val === 'cron') {
        cronSessionsResult.value = await sessionsState.loadCronSessions()
    }
}, { immediate: true })

const handleTypeSessionselect = (key: string) => {
    router.push({
        name: 'chat',
        params: { sessionkey: key },
        query: { type: route.query.type }
    })
}

const handleTypeSessionDelete = async (key: string) => {
    const result = await sessionsState.deleteSession(key)
    if (result?.deleted) {
        if (cronSessionsResult.value?.sessions) {
            cronSessionsResult.value.sessions = cronSessionsResult.value.sessions.filter(s => s.id !== key)
        }
        if (chatState.sessionKey === key) {
            // If we deleted the currently viewed session, clear selection
            router.push({ name: 'chat', query: { type: 'cron' } })
        }
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
    if (!isTypeMode.value) return false
    return !typeSelectedKey.value
})







// Watch session key changes to update agent selection
// Watch session key changes to update agent selection
watch(() => chatState.sessionKey, (newKey) => {
    if (newKey) {
        agentsState.agentsSelectedId = extractAgentId(newKey)
    }
}, { immediate: true })



// Send message handler
const handleSend = async () => {
    let inputText = chatInputRef.value?.inputText?.trim() || ''
    // Check if there are any attachments
    const hasAttachments = (chatInputRef.value?.attachments?.length ?? 0) > 0

    if (!inputText && !hasAttachments && !isBusy.value) return

    // Case 1: Busy + no text → abort
    if (isBusy.value && !inputText && !hasAttachments) {
        await chatState.abortChat()
        return
    }

    // Case 2: Busy + has text → steer (inject prompt while agent is running)
    if (isBusy.value && inputText) {
        if (chatInputRef.value) {
            chatInputRef.value.inputText = ''
        }
        await chatState.steerMessage(inputText)
        scrollToBottom()
        return
    }

    // Case 3: Not busy → normal send
    // Determine session key
    let targetSessionKey = chatState.sessionKey
    const isNew = isNewSession(route)

    if (isNew) {
        // Create new session via sessionsState, get sessionKey directly
        const agentId = agentsState.agentsSelectedId
        if (!agentId) {
            useToast().warning('请先创建一个智能体')
            return
        }
        targetSessionKey = await sessionsState.commitNewSession(agentId, inputText)
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

    // Send message with explicit sessionKey
    await chatState.sendMessage(inputText, [...imageAttachments], targetSessionKey)

    // Clear attachments in UI
    if (chatInputRef.value && chatInputRef.value.attachments) {
        chatInputRef.value.attachments = []
    }

    // Navigate to the chat session immediately
    if (isNew) {
        router.push({ name: 'chat', params: { sessionkey: targetSessionKey } })
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
watch(() => streamingText.value, (newStream) => {
    if (isVoiceChatActive.value && newStream) {
        let text = ''
        if (Array.isArray(newStream)) {
            for (const block of newStream) {
                if (block.type === 'text' && block.text) {
                    text += block.text
                }
            }
        } else if (typeof newStream === 'string') {
            text = newStream
        }

        if (text) speakStream(text)
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
watch(() => [route.params.sessionkey, route.path], async ([sessionkey, routePath]) => {
    console.log("[HomeView] watch route.params", sessionkey, routePath)

    // Handle new session route
    // We can pass the route object if we accessed it, or just use implicit route from closure, 
    // but helper expects route object. 
    // Since we are inside component setup, 'route' is available.
    if (isNewSession(route)) {
        if (agentsState.agentsList.length > 0) {
            agentsState.agentsSelectedId = agentsState.agentsList[0].id
        }
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
    // HTTP API - always ready
    await applyDefaultSessionBehavior()

}, { immediate: true })



// Helper function to apply default session behavior based on settings
async function applyDefaultSessionBehavior() {
    if (isTypeMode.value) {
        console.log('[HomeView] Messages mode, skipping default session behavior')
        return
    }

    // Default behavior based on settings
    if (settingsStore.homePageBehavior === 'new_session') {
        router.replace({ path: NEW_SESSION_PATH })
    } else {
        // Default: last active session
        const targetKey = settingsStore.lastActiveSessionKey
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

        <!-- NEW: Messages List Column (Desktop: visible if isTypeMode; Mobile: visible if isTypeMode && showMobileSessionList) -->
        <div v-if="isTypeMode" class="w-full lg:w-80 bg-base-100 border-r border-base-200 flex flex-col shrink-0"
            :class="{ 'hidden lg:flex': !showMobileSessionList, 'flex': showMobileSessionList }">
            <SessionSidebar :title="$t('home.messageList')" :sessions="typeSessions" :selected-key="typeSelectedKey"
                @select="handleTypeSessionselect" @delete="handleTypeSessionDelete" />
        </div>


        <!-- Empty Messages list state -->
        <div v-if="isTypeMode && !typeSelectedKey" class="flex-1 flex flex-col items-center justify-center p-4">
            <div class="text-center text-base-content/60">
                <div class="text-center">
                    <h1 class="text-3xl font-bold mb-2">{{ $t('home.welcomeTitle') }}</h1>
                    <p class="text-base-content/60">{{ $t('home.welcomeDesc') }}</p>
                </div>
            </div>
        </div>
        <!-- Chat Area -->
        <div v-else class="flex-1 flex flex-col h-full min-w-0"
            :class="{ 'hidden lg:flex': isTypeMode && showMobileSessionList }">

            <!-- Header -->
            <ChatHeader ref="chatHeaderRef" :selected-agent="selectedAgent" :agents="agentsState.agentsList"
                @start-voice-chat="startVoiceChat" />

            <!-- Main content area -->
            <div class="flex-1 flex flex-col min-h-0">
                <!-- Loading state -->
                <div v-if="isLoading" class="flex-1 flex items-center justify-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- Welcome message when no messages -->
                <div v-else-if="isNewSession(route)" class="flex-1 flex flex-col items-center justify-center p-4">
                    <div class="text-center">
                        <h1 class="text-3xl font-bold mb-2">{{ $t('home.welcomeTitle') }}</h1>
                        <p class="text-base-content/60">{{ $t('home.welcomeDesc') }}</p>
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
            <ChatInput ref="chatInputRef" :is-busy="isBusy" :disabled="false" @send="handleSend" />

            <!-- Voice Chat Overlay -->
            <VoiceChatOverlay :is-open="isVoiceChatActive" :status="voiceStatus" :transcript="transcript"
                :speaking-text="currentlySpeakingText" :is-waiting="isWaitingForAudio" @close="stopVoiceChat" />
        </div>
    </div>
</template>
