<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch, reactive, toRef, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { ChevronDoubleDownIcon } from '@heroicons/vue/24/outline'

import { useChatMessages, type DisplayMessage } from '../composables/useChatMessages'
import { useScrollManager } from '../composables/useScrollManager'
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
import MediaPreviewOverlay from '../components/chat/MediaPreviewOverlay.vue'
import WorkspacePanel from '../components/workspace/WorkspacePanel.vue'
import WorkspaceViewer from '../components/workspace/WorkspaceViewer.vue'

import { isNewSession, NEW_SESSION_PATH, NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'
import { writeClipboard } from '../utils/clipboard.ts'
import { useChatState } from '../composables/useChatState'
import { useChatInput } from '../composables/useChatInput'
import { useCommandState } from '../composables/useCommandState'
import { SessionRow, useSessionsState, type SessionsResult } from '../composables/useSessionsState'
import { useAgentsState } from '../composables/useAgentsState'
import { useToast } from '../composables/useToast'
import { useWorkspacePanel } from '../composables/useWorkspacePanel'
import { useWorkspaceViewer } from '../composables/useWorkspaceViewer'
import { truncateText } from '../utils/format'
import { buildBranchIndexes, findLeafId as findBranchLeafId, getBranchInfo as resolveBranchInfo } from '../utils/chatBranchNavigation'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const settingsStore = useUiSettingsStore()


const chatState = useChatState()
const { setSessionKeyResolver } = useChatInput()
setSessionKeyResolver(() => chatState.sessionKey)
const sessionsState = useSessionsState()
const agentsState = useAgentsState()
const { loadCommands, setCurrentAgent } = useCommandState()

const wsPanel = useWorkspacePanel()
const wsViewer = useWorkspaceViewer()

const busyAllowedCommands = ['steer', 'follow-up', 'autocontinue']
const busyAllowedCommandPattern = new RegExp(`^\\/(${busyAllowedCommands
    .map(command => command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?=\\s|$)`)

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
} = useChatMessages(chatState as any)

// 滚动管理 composable
const {
    userScrolledUp,
    scrollToBottom,
    setupScrollWatchers,
    restoreIfSaved,
} = useScrollManager({
    containerRef: messagesContainerRef,
    messages: processedMessages,
    isLoading,
    isBusy,
    streamingText,
    state: chatState as any,
})

// TTS
const { currentReadingMsgId, readAloud: ttsReadAloud } = useTTS()

// 当前选中的 Agent（直接从 chatState 获取，无需额外 watch）
const selectedAgent = computed(() => chatState.currentAgent)

// 当前会话名称（优先从 sessionsState 获取最新值，因为 patchSession 会更新它）
const currentSessionName = computed(() => {
    const sessionKey = chatState.sessionKey
    if (!sessionKey) return ''

    // 从 sessionsState 中取最新数据（patchSession / triggerSessionRename 会更新这里）
    const sessions = routeMode.value === 'tasks'
        ? sessionsState.taskSessionsResult?.sessions
        : (routeMode.value === 'archived'
            ? sessionsState.archivedSessionsResult?.sessions
            : sessionsState.sessionsResult?.sessions)
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

// Split-view Route Logic
const routeMode = computed<'chat' | 'tasks' | 'archived'>(() => {
    if (route.name === 'tasks') return 'tasks'
    if (route.name === 'archived') return 'archived'
    return 'chat'
})
const isTaskSessionsRoute = computed(() => routeMode.value === 'tasks')
const isArchivedSessionsRoute = computed(() => routeMode.value === 'archived')
const isSplitViewRoute = computed(() => routeMode.value === 'tasks' || routeMode.value === 'archived')
const currentSessions = computed(() => {
    if (routeMode.value === 'tasks') {
        return sessionsState.taskSessionsResult?.sessions || []
    }
    if (routeMode.value === 'archived') {
        return sessionsState.archivedSessionsResult?.sessions || []
    }
    return sessionsState.sessionsResult?.sessions || []
})
const splitViewTitle = computed(() => isArchivedSessionsRoute.value
    ? t('home.archivedSessionList')
    : t('home.taskSessionList'))
const splitViewEmptyState = computed(() => isArchivedSessionsRoute.value
    ? t('home.noArchivedSessions')
    : t('home.noTaskSessions'))
const splitViewRowActions = computed(() => {
    if (!isArchivedSessionsRoute.value) return undefined
    return [
        {
            key: 'unarchive',
            label: t('sidebar.unarchive'),
        },
        {
            key: 'delete',
            label: t('common.delete'),
            tone: 'danger' as const,
        },
    ]
})

watch(() => route.name, async (routeName) => {
    if (routeName === 'tasks') {
        await sessionsState.loadTaskSessions()
    }
    if (routeName === 'archived') {
        await sessionsState.loadArchivedSessions()
    }
}, { immediate: true })

const handleSplitSessionSelect = (key: string) => {
    router.push({
        name: routeMode.value,
        params: { sessionkey: key },
    })
}

const handleSplitSessionDelete = async (key: string) => {
    const result = await sessionsState.deleteSession(key)
    if (result?.deleted && chatState.sessionKey === key) {
        router.push({ name: routeMode.value })
    }
}

const handleSplitClearAll = async (keys: string[]) => {
    if (keys.length === 0) return

    const selectedKey = typeof route.params.sessionkey === 'string'
        ? route.params.sessionkey
        : null

    const result = await sessionsState.deleteSessions(keys)
    if (result?.deleted && selectedKey && keys.includes(selectedKey)) {
        router.push({ name: routeMode.value })
    }
}

const handleSplitSessionRowAction = async ({ key, action }: { key: string, action: string }) => {
    if (action === 'unarchive') {
        await sessionsState.unarchiveSession(key)
        if (chatState.sessionKey === key) {
            router.push({ name: 'archived' })
        }
    }
}

const typeSelectedKey = ref("")
const isCreatingSession = ref(false)

// Auto-select first session
watch(() => [route.name, currentSessions.value, route.params.sessionkey], (values) => {
    const currentRouteName = values[0] as string | null
    const sessions = values[1] as any[]
    const currentKey = values[2] as string | null
    if ((currentRouteName === 'tasks' || currentRouteName === 'archived') && currentKey && sessions && sessions.length > 0) {
        typeSelectedKey.value = currentKey
    }
    else {
        typeSelectedKey.value = ""
    }
}, { immediate: true })

const showMobileSessionList = computed(() => {
    if (!isSplitViewRoute.value) return false
    return !typeSelectedKey.value
})


// Send message handler
// Send message handler
const handleSend = async () => {
    let inputText = chatInputRef.value?.inputText?.trim() || ''
    // 用户原始输入快照（不含后续追加的附件文本），用于自动命名判断与生成
    const originalUserText = inputText
    // Check if there are any attachments
    const rawAttachments = chatInputRef.value?.attachments ?? []
    const hasAttachments = rawAttachments.length > 0

    if (!inputText && !hasAttachments && !isBusy.value) return

    const { pushInputHistory } = useChatInput()

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
        // 非命令文本：根据设置决定 busy 时是 steer 还是 follow-up
        if (settingsStore.busySendBehavior === 'follow') {
            await chatState.followMessage(inputText)
        } else {
            await chatState.steerMessage(inputText)
        }
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

    // 记录输入历史：必须绑定最终 sessionKey。
    // 新会话首条消息如果在 commitNewSession 之前写入，会因为 sessionKey 为空而丢失。
    pushInputHistory(inputText, targetSessionKey)

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

    // 自动命名策略：仅当消息非空、不是 / 或 ! 开头的命令、且 session 还没有 name 时触发
    const trimmedUserText = originalUserText.trimStart()
    const isCommand = trimmedUserText.startsWith('/') || trimmedUserText.startsWith('!')
    const currentSession = targetSessionKey ? sessionsState.findSessionLocal(targetSessionKey) : undefined
    if (targetSessionKey && originalUserText && !isCommand && !currentSession?.name) {
        sessionsState
            .triggerSessionRename(targetSessionKey, originalUserText)
            .catch(err => {
                console.error('Auto-rename failed', err)
            })
    }

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
    writeClipboard(text)
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

// Workspace panel 快捷键：
// - Ctrl/Cmd+B 切换面板
// - Ctrl/Cmd+Shift+G 打开面板并切到 Git tab
// - Ctrl/Cmd+Shift+E 打开面板并切到 Files tab
// 在输入框 / contentEditable / IME 输入中不拦截，避免冲突用户编辑。
function handleWorkspaceShortcut(e: KeyboardEvent) {
    if (e.isComposing) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return
    if (!(e.ctrlKey || e.metaKey)) return
    if (!e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault()
        wsPanel.toggle()
        return
    }
    if (e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        wsPanel.open()
        wsPanel.setTab('git')
        return
    }
    if (e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        wsPanel.open()
        wsPanel.setTab('files')
    }
}

const showWorkspacePanel = computed(() =>
    wsPanel.isOpen.value && !!chatState.agentsSelectedId && !isSplitViewRoute.value,
)
const showWorkspaceViewer = computed(() => wsViewer.isActive.value)

// Viewer 关闭后恢复聊天区滚动位置：viewer 打开时 messagesContainerRef 对应的 div 会被 v-else-if
// 卸载，关闭后重新挂载，但 useScrollManager 的 watch 只重新绑 listener、不会主动调 restore。
// 手动控制一下，让用户从 viewer 返回聊天后位置不丢。
watch(() => wsViewer.isActive.value, async (active, prev) => {
    if (prev && !active) {
        await nextTick()
        restoreIfSaved()
    }
})

onMounted(async () => {
    document.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleWorkspaceShortcut)
    setupScrollWatchers()
    // 重新挂载时恢复滚动位置（从智能体等非 HomeView 路由返回时需要）
    // 路由 watcher (immediate) 在 setup 阶段触发时 session 切换 watcher 尚未注册，
    // 需要在 onMounted 时兜底恢复。
    restoreIfSaved()
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    window.removeEventListener('keydown', handleWorkspaceShortcut)
})



// 路由变化 → 切换会话（核心路由处理逻辑）
watch(() => [route.params.sessionkey, route.path], async ([sessionkey, routePath]) => {

    // /new 路由 → 创建新会话
    if (isNewSession(route)) {
        // 新会话/首页进入时，始终重置为第一个 agent。
        // 不沿用上一个会话的 agent，否则用户点击首页后会看到“最后一次聊天所用 agent”。
        if (agentsState.agentsList.length > 0) {
            const defaultAgentId = agentsState.agentsList[0].id
            chatState.selectAgent(defaultAgentId)
            setCurrentAgent(defaultAgentId)
            await loadCommands(defaultAgentId)
        }
        await chatState.createNewSession()
        return
    }

    // 路由中有 sessionKey → 切换到该会话（setSessionKey 内部会处理 currentSession / currentAgent）
    if (sessionkey && typeof sessionkey === 'string') {
        // 优化：如果 sessionKey 未变则跳过加载，但恢复滚动位置
        // （从首页/消息等路由返回时，HomeView 不会卸载，scrollTop 可能已重置）
        if (chatState.sessionKey === sessionkey) {
            restoreIfSaved()
            return
        }
        const category = route.name === 'tasks' ? 'task' : undefined
        await chatState.setSessionKey(sessionkey, category)
        setCurrentAgent(chatState.agentsSelectedId || undefined)
        await loadCommands(chatState.agentsSelectedId || undefined)
        return
    }

    // 没有指定 sessionKey，执行默认行为
    await applyDefaultSessionBehavior()

}, { immediate: true })



// Helper function to apply default session behavior based on settings
async function applyDefaultSessionBehavior() {
    if (isSplitViewRoute.value) {
        console.log('[HomeView] Split-view route, skipping default chat behavior')
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

        <!-- Split-view Sessions List Column (Desktop: visible on split routes; Mobile: visible when no detail selected) -->
        <div v-if="isSplitViewRoute" class="w-full lg:w-80 bg-base-100 border-r border-base-200 flex flex-col shrink-0"
            :class="{ 'hidden lg:flex': !showMobileSessionList, 'flex': showMobileSessionList }">
            <SessionSidebar :title="splitViewTitle" :sessions="currentSessions" :selected-key="typeSelectedKey"
                :row-actions="splitViewRowActions"
                @select="handleSplitSessionSelect" @delete="handleSplitSessionDelete"
                @clear-all="handleSplitClearAll"
                @row-action="handleSplitSessionRowAction" />
        </div>


        <!-- Empty split-view list state -->
        <div v-if="isSplitViewRoute && !typeSelectedKey" class="flex-1 flex flex-col items-center justify-center p-4">
            <div class="text-center text-base-content/60">
                <div class="text-center">
                    <h1 class="text-3xl font-bold mb-2">{{ splitViewTitle }}</h1>
                    <p class="text-base-content/60">{{ splitViewEmptyState }}</p>
                </div>
            </div>
        </div>
        <!-- Chat Area: 始终保留 ChatHeader + ChatInput；Main 区域在 viewer 打开时被替换 -->
        <div v-else class="flex-1 flex flex-col h-full min-w-0"
            :class="{ 'hidden lg:flex': isSplitViewRoute && showMobileSessionList }">

            <!-- Header 始终可见：agent dropdown / panel toggle / 主题 / wide mode 都依赖它 -->
            <ChatHeader ref="chatHeaderRef" :selected-agent="selectedAgent" :agents="agentsState.agentsList"
                @start-voice-chat="startVoiceChat" :session-name="currentSessionName" />

            <!-- Main content area: chat messages OR viewer -->
            <div class="flex-1 flex flex-col min-h-0">
                <!-- Workspace Viewer（仅替换主消息区，不动 ChatHeader / ChatInput） -->
                <WorkspaceViewer v-if="showWorkspaceViewer" :agent-id="chatState.agentsSelectedId || ''" />

                <!-- Loading state -->
                <div v-else-if="isLoading" class="flex-1 flex items-center justify-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- Welcome message when no messages -->
                <div v-else-if="isNewSession(route) || isCreatingSession"
                    class="flex-1 flex flex-col items-center justify-center p-4">
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

            <!-- ChatInput 始终可见：viewer 打开时用户仍可与 agent 讨论 diff/文件内容 -->
            <ChatInput ref="chatInputRef" :is-busy="isBusy" :disabled="false" @send="handleSend" />

            <!-- Voice Chat Overlay -->
            <VoiceChatOverlay :is-open="isVoiceChatActive" :status="voiceStatus" :transcript="transcript"
                :speaking-text="currentlySpeakingText" :is-waiting="isWaitingForAudio" @close="stopVoiceChat" />

            <!-- Media Preview Overlay (shared image lightbox & file viewer) -->
            <MediaPreviewOverlay />
        </div>

        <!-- Workspace Panel (PC 右侧侧栏，可拖宽) -->
        <WorkspacePanel v-if="showWorkspacePanel" :agent-id="chatState.agentsSelectedId || ''"
            class="hidden lg:contents" />
    </div>
</template>
