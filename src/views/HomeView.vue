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
import ChatInput from '../components/chat/ChatInput.vue'
import VoiceChatOverlay from '../components/chat/VoiceChatOverlay.vue'
import SessionSidebar from '../components/chat/SessionSidebar.vue'
import AppSidebar from '../components/AppSidebar.vue'

import { isNewSession, NEW_SESSION_PATH, NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'
import { useChatState } from '../composables/useChatState'
import { SessionRow, useSessionsState, type SessionsResult } from '../composables/useSessionsState'
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
        if (found?.name) return found.name
    }

    // Fallback 到 chatState.currentSession
    const session = chatState.currentSession
    if (!session) return ''
    return session.name || session.id || ''
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
        // 新会话：使用 chatState 中的 agentsSelectedId
        const agentId = chatState.agentsSelectedId
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

// ==================== Delete / Retry / Branch ====================

// Session tree data for branch navigation
const sessionTreeEntries = ref<any[] | null>(null)
// Map: parentId → array of child message entry IDs (only type="message")
const childrenMap = ref<Map<string, string[]>>(new Map())
// Map: parentId → array of ALL child entry IDs (for finding leaf nodes)
const allChildrenMap = ref<Map<string, string[]>>(new Map())
// Map: id → entry (for quick lookup)
const entryMap = ref<Map<string, any>>(new Map())

const loadSessionTree = async () => {
    if (!chatState.sessionKey) return
    const tree = await chatState.fetchSessionTree()
    sessionTreeEntries.value = tree

    const msgChildren = new Map<string, string[]>()
    const allChildren = new Map<string, string[]>()
    const entries = new Map<string, any>()

    if (tree && Array.isArray(tree)) {
        for (const entry of tree) {
            entries.set(entry.id, entry)
            if (!entry.parentId) continue
            // allChildrenMap: 所有类型的子节点
            const allArr = allChildren.get(entry.parentId)
            if (allArr) allArr.push(entry.id)
            else allChildren.set(entry.parentId, [entry.id])
            // childrenMap: 只包含 message 类型
            if (entry.type === 'message') {
                const msgArr = msgChildren.get(entry.parentId)
                if (msgArr) msgArr.push(entry.id)
                else msgChildren.set(entry.parentId, [entry.id])
            }
        }
    }
    childrenMap.value = msgChildren
    allChildrenMap.value = allChildren
    entryMap.value = entries
}

// 找到某个 entry 分支的叶子节点 ID
const findLeafId = (startId: string): string => {
    let leafId = startId
    while (true) {
        const childIds = allChildrenMap.value.get(leafId)
        if (!childIds || childIds.length === 0) break
        const messageChild = childIds.find(cid => entryMap.value.get(cid)?.type === 'message')
        leafId = messageChild || childIds[0]
    }
    return leafId
}

// Compute branch info for each message based on the session tree
const getBranchInfo = (msg: DisplayMessage): BranchInfo | null => {
    if (!msg.entryId || !msg.parentEntryId) return null

    // 1. 检查自身兄弟（直接 retry 场景：同一 parent 下多个 assistant）
    const ownSiblings = childrenMap.value.get(msg.parentEntryId)
    if (ownSiblings && ownSiblings.length > 1) {
        const currentIndex = ownSiblings.indexOf(msg.entryId)
        if (currentIndex >= 0) {
            return { siblings: ownSiblings, currentIndex }
        }
    }

    // 2. assistant 消息向上冒泡，检查父级 user 消息的兄弟
    //    场景：用户删除后重新发送，导致同一父节点下有多个 user 分支
    //    注意：中间可能包含非 message 类型的 entry（如 session_info），需要向上回溯找到最近的 message 祖先
    if (msg.role === 'assistant') {
        let curr = entryMap.value.get(msg.parentEntryId)
        // 向上回溯直到找到 message 类型的节点（即 User 消息），或者到顶
        while (curr && curr.type !== 'message' && curr.parentId) {
            curr = entryMap.value.get(curr.parentId)
        }

        if (curr && curr.type === 'message' && curr.parentId) {
            const parentSiblings = childrenMap.value.get(curr.parentId)
            if (parentSiblings && parentSiblings.length > 1) {
                const parentIndex = parentSiblings.indexOf(curr.id)
                if (parentIndex >= 0) {
                    return { siblings: parentSiblings, currentIndex: parentIndex }
                }
            }
        }
    }

    return null
}

const deleteMessage = async (msg: DisplayMessage) => {
    if (!msg.entryId) return
    await chatState.deleteMessage(msg.entryId)
    // delete 后 chatMessages 由后端刷新，entries 也需要更新
    await loadSessionTree()
}

const retryMessage = async (msg: DisplayMessage) => {
    if (!msg.entryId) return
    await chatState.retryMessage(msg.entryId)
    // retry 完成后 SSE done 事件会静默刷新 chatMessages，这里更新 entries
    await loadSessionTree()
}

const navigateBranch = async (msg: DisplayMessage, direction: 'prev' | 'next') => {
    const info = getBranchInfo(msg)
    if (!info) return

    const newIndex = direction === 'prev' ? info.currentIndex - 1 : info.currentIndex + 1
    if (newIndex < 0 || newIndex >= info.siblings.length) return

    // 找到目标分支的叶子节点 ID（后端需要 leaf ID 才能返回完整分支）
    const leafId = findLeafId(info.siblings[newIndex])
    await chatState.navigateBranch(leafId)
    // 切换后强制滚动到底部（延迟确保 DOM 渲染完成）
    scrollToBottom(true)
    setTimeout(() => scrollToBottom(true), 200)
}

// 切换会话时重新加载 session tree（确保分支导航更新）
watch(() => chatState.sessionKey, (newKey, oldKey) => {
    if (newKey && newKey !== oldKey) {
        loadSessionTree()
    }
})

// Reload session tree whenever chat history is loaded
watch(() => chatState.chatMessages, (msgs, oldMsgs) => {
    // 从空到有值 或 首次加载时加载 entries
    if (msgs?.length && (!oldMsgs || oldMsgs.length === 0)) {
        loadSessionTree()
    }
}, { deep: false })

// 监听发送状态：流结束时（chatSending: true -> false）刷新 tree，确保显示新生成的分支
watch(() => chatState.chatSending, (isSending) => {
    if (!isSending) {
        loadSessionTree()
    }
})


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
        chatState.setSessionKey(sessionkey)
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
            chatState.setSessionKey(targetKey)
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
                <div v-else-if="isNewSession(route)" class="flex-1 flex flex-col items-center justify-center p-4">
                    <div class="text-center">
                        <h1 class="text-3xl font-bold mb-2">{{ $t('home.welcomeTitle') }}</h1>
                        <p class="text-base-content/60">{{ $t('home.welcomeDesc') }}</p>
                    </div>
                </div>

                <!-- Chat messages - only this area scrolls -->
                <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-2 md:p-4 relative">
                    <div class="space-y-4 mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                        <MessageBubble v-for="(msg, index) in processedMessages" :key="msg.entryId || index"
                            :message="msg" @copy="copyMessage" @read-aloud="readAloud" @delete="deleteMessage"
                            @retry="retryMessage" @navigate-branch="navigateBranch"
                            :is-loading="isBusy && (index === processedMessages.length - 1)" :is-busy="isBusy"
                            :branch-info="getBranchInfo(msg)" />


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
