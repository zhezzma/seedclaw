<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch, reactive, toRef, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { ChevronDoubleDownIcon } from '@heroicons/vue/24/outline'

import { useChatMessages, type DisplayMessage } from '../composables/useChatMessages'
import type { BranchInfo } from '../components/chat/MessageBubble.vue'
import { useTTS } from '../composables/useTTS'
import { useVoiceChat } from '../composables/useVoiceChat'
import ChatHeader from '../components/chat/ChatHeader.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import VirtualMessageList from '../components/chat/VirtualMessageList.vue'
import ChatInput from '../components/chat/ChatInput.vue'
import VoiceChatOverlay from '../components/chat/VoiceChatOverlay.vue'
import SessionSidebar from '../components/chat/SessionSidebar.vue'
import AppSidebar from '../components/AppSidebar.vue'

import { isNewSession, NEW_SESSION_PATH, NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'
import { useChatState } from '../composables/useChatState'
import { SessionRow, useSessionsState, type SessionsResult } from '../composables/useSessionsState'
import { useAgentsState } from '../composables/useAgentsState'
import { useToast } from '../composables/useToast'
import { truncateText } from '../utils/format'
import { buildBranchIndexes, findLeafId as findBranchLeafId, getBranchInfo as resolveBranchInfo } from '../utils/chatBranchNavigation'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const settingsStore = useUiSettingsStore()


const chatState = useChatState()
const sessionsState = useSessionsState()
const agentsState = useAgentsState()

const busyAllowedCommands = ['steer', 'follow-up', 'autocontinue']
const busyAllowedCommandPattern = new RegExp(`^\\/(${busyAllowedCommands
    .map(command => command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`)

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
    userScrolledUp,
    scrollToBottom,
    setupScrollWatchers,
    refreshChatAndScroll
} = useChatMessages(chatState as any, messagesContainerRef)

// TTS
const { currentReadingMsgId, readAloud: ttsReadAloud } = useTTS()

// 当前选中的 Agent（直接从 chatState 获取，无需额外 watch）
const selectedAgent = computed(() => chatState.currentAgent)

// 当前会话名称（优先从 sessionsState 获取最新值，因为 patchSession 会更新它）
const currentSessionName = computed(() => {
    const sessionKey = chatState.sessionKey
    if (!sessionKey) return ''

    // 从 sessionsState 中取最新数据（patchSession / triggerSessionRename 会更新这里）
    const sessions = sessionsState.sessionsResult?.sessions
    if (sessions) {
        const found = sessions.find((s: SessionRow) => s.id === sessionKey)
        if (found) {
            return found.name || truncateText(found.firstMessage, 9)
        }
    }

    // Fallback 到 chatState.currentSession
    const session = chatState.currentSession
    if (!session) return ''
    return session.name || truncateText(session.firstMessage, 9)
})

// Messages / Cron Mode Logic
// 根据路由 query.type 决定展示哪个 session 列表
const currentSessions = computed(() => {
    if (route.query && route.query.type === 'cron') {
        return sessionsState.cronSessionsResult?.sessions || []
    }
    return sessionsState.sessionsResult?.sessions || []
})
const isTypeMode = computed(() => route.query && route.query.type)


watch(() => route.query.type, async (val) => {
    if (route.query.type === 'cron') {
        await sessionsState.loadCronSessions()
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
        if (chatState.sessionKey === key) {
            // If we deleted the currently viewed session, clear selection
            router.push({ name: 'chat', query: { type: 'cron' } })
        }
    }
}

const typeSelectedKey = ref("")
const isCreatingSession = ref(false)

// Auto-select first session
watch(() => [route.query.type, currentSessions.value, route.params.sessionkey], (values) => {
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


// Send message handler
// Send message handler
const handleSend = async () => {
    let inputText = chatInputRef.value?.inputText?.trim() || ''
    // Check if there are any attachments
    const rawAttachments = chatInputRef.value?.attachments ?? []
    const hasAttachments = rawAttachments.length > 0

    if (!inputText && !hasAttachments && !isBusy.value) return

    // Optimistic UI update: Clear input immediately
    if (chatInputRef.value) {
        chatInputRef.value.inputText = ''
        chatInputRef.value.attachments = []
    }

    // Case 1: Busy + no text → abort
    if (isBusy.value && !inputText && !hasAttachments) {
        await chatState.abortChat()
        return
    }

    // Case 2: Busy + has text
    if (isBusy.value && inputText) {
        // 检查是否为 / 开头的命令
        if (inputText.startsWith('/')) {
            // Allow a small set of commands to pass through as normal messages while busy.
            if (busyAllowedCommandPattern.test(inputText)) {
                await chatState.sendMessage(inputText)
                scrollToBottom(true)
                return
            }
            // 其他命令在 busy 状态下不可用
            useToast().warning(t('home.commandNotAvailableWhileBusy'))
            // 恢复输入框内容
            if (chatInputRef.value) {
                chatInputRef.value.inputText = inputText
            }
            return
        }
        // 非命令文本 → steer（inject prompt while agent is running）
        await chatState.steerMessage(inputText)
        scrollToBottom(true)
        return
    }

    // Case 3: Not busy → normal send
    // Determine session key
    let targetSessionKey = chatState.sessionKey
    const isNew = isNewSession(route)

    if (isNew) {
        // 新会话：使用 chatState 中的 agentsSelectedId
        const agentId = chatState.agentsSelectedId
        if (!agentId) {
            useToast().warning('请先创建一个智能体')
            return
        }

        isCreatingSession.value = true
        try {
            targetSessionKey = await sessionsState.commitNewSession(agentId, inputText)
        } catch (e) {
            isCreatingSession.value = false
            console.error('Failed to create session', e)
            return
        }
    }

    // Process attachments:
    // - Images: Keep as attachments
    // - Files: Append content to inputText
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

    // Send message with explicit sessionKey
    await chatState.sendMessage(inputText, [...imageAttachments], targetSessionKey)

    // Navigate to the chat session immediately
    if (isNew) {
        await router.push({ name: 'chat', params: { sessionkey: targetSessionKey } })
        isCreatingSession.value = false
    }

    scrollToBottom(true)
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

// ==================== Delete / Retry / Branch ====================

// Session tree data for branch navigation
const sessionTreeEntries = computed(() => chatState.sessionTree)
const branchIndexes = computed(() => buildBranchIndexes(sessionTreeEntries.value))

const getBranchInfo = (msg: DisplayMessage): BranchInfo | null => {
    return resolveBranchInfo(msg, branchIndexes.value)
}

const deleteMessage = async (msg: DisplayMessage) => {
    if (!msg.entryId) return
    await chatState.deleteMessage(msg.entryId)
    // delete 后 chatState 内部会自动 fetchSessionTree，这里无需手动调用
}

const retryMessage = async (msg: DisplayMessage) => {
    if (!msg.entryId) return
    await chatState.retryMessage(msg.entryId)
    // retry 逻辑同上，chatState 会接管
}

const editMessage = async (msg: DisplayMessage, newText: string) => {
    if (!msg.entryId) return
    await chatState.editMessage(msg.entryId, newText)
}

const navigateBranch = async (msg: DisplayMessage, direction: 'prev' | 'next') => {
    const info = getBranchInfo(msg)
    if (!info) return

    const newIndex = direction === 'prev' ? info.currentIndex - 1 : info.currentIndex + 1
    if (newIndex < 0 || newIndex >= info.siblings.length) return

    // 找到目标分支的叶子节点 ID（后端需要 leaf ID 才能返回完整分支）
    const leafId = findBranchLeafId(info.siblings[newIndex], branchIndexes.value)
    await chatState.navigateBranch(leafId)
    // 切换后强制滚动到底部（延迟确保 DOM 渲染完成）
    scrollToBottom(true)
    setTimeout(() => scrollToBottom(true), 200)
}

// 原有的复杂 Session Tree 监听逻辑全部移除
// chatState 内部现在负责在合适时机更新 sessionTree
// HomeView 只需要响应式消费 chatState.sessionTree 即可


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



// 路由变化 → 切换会话（核心路由处理逻辑）
watch(() => [route.params.sessionkey, route.path], async ([sessionkey, routePath]) => {
    console.log("[HomeView] watch route.params", sessionkey, routePath)

    // /new 路由 → 创建新会话
    if (isNewSession(route)) {
        // 新会话时，如果还没选择 agent，默认选第一个
        if (agentsState.agentsList.length > 0) {
            chatState.selectAgent(agentsState.agentsList[0].id)
        }
        await chatState.createNewSession()
        return
    }

    // 路由中有 sessionKey → 切换到该会话（setSessionKey 内部会处理 currentSession / currentAgent）
    if (sessionkey && typeof sessionkey === 'string') {
        // 优化：如果 sessionKey 未变则跳过
        if (chatState.sessionKey === sessionkey) {
            console.log('[HomeView] Session key unchanged, skipping reload', sessionkey)
            return
        }
        const type = route.query.type as string | undefined
        chatState.setSessionKey(sessionkey, true, type)
        return
    }

    // 没有指定 sessionKey，执行默认行为
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
        if (targetKey && sessionsState.hasSession(targetKey)) {
            console.log('Default: last active session', targetKey)
            chatState.setSessionKey(targetKey, true, route.query.type as string | undefined)
            router.replace({ name: 'chat', params: { sessionkey: targetKey } })
        } else {
            // If session doesn't exist, go to new session
            router.replace({ path: NEW_SESSION_PATH })
        }
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
            <SessionSidebar :title="$t('home.messageList')" :sessions="currentSessions" :selected-key="typeSelectedKey"
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
                @start-voice-chat="startVoiceChat" :session-name="currentSessionName" />

            <!-- Main content area -->
            <div class="flex-1 flex flex-col min-h-0">
                <!-- Loading state -->
                <div v-if="isLoading" class="flex-1 flex items-center justify-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- Welcome message when no messages -->
                <div v-else-if="isNewSession(route) || isCreatingSession"
                    class="flex-1 flex flex-col items-center justify-center p-4">
                    <!-- <div v-if="isCreatingSession" class="flex flex-col items-center gap-4 animate-pulse">
                        <div class="loading loading-spinner loading-lg opacity-50"></div>
                        <p class="text-base-content/60 text-sm font-medium">创建会话...</p>
                    </div> -->
                    <div class="text-center">
                        <h1 class="text-3xl font-bold mb-2">{{ $t('home.welcomeTitle') }}</h1>
                        <p class="text-base-content/60">{{ $t('home.welcomeDesc') }}</p>
                    </div>
                </div>

                <!-- Chat messages - only this area scrolls -->
                <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-2 md:p-4 relative">
                    <div class="mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                        <VirtualMessageList :messages="processedMessages" :is-busy="isBusy"
                            :scroll-container="messagesContainerRef" :is-wide-mode="settingsStore.isWideMode"
                            :get-branch-info="getBranchInfo" @copy="copyMessage" @read-aloud="readAloud"
                            @delete="deleteMessage" @retry="retryMessage" @edit="editMessage"
                            @navigate-branch="navigateBranch" />
                    </div>

                    <!-- Scroll to bottom FAB -->
                    <Transition name="fade-up">
                        <button v-if="userScrolledUp" @click="scrollToBottom(true)"
                            class="sticky bottom-4 left-1/2 -translate-x-1/2 btn btn-circle btn-sm bg-base-200 hover:bg-base-300 text-base-content border border-base-300 shadow-lg opacity-90 hover:opacity-100 transition-all duration-200 z-10"
                            :title="$t('common.scrollToBottom')">
                            <ChevronDoubleDownIcon class="h-4 w-4" />
                        </button>
                    </Transition>
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
