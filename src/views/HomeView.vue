<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, watch, reactive, toRef, nextTick } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { ChevronDoubleDownIcon, ChevronDownIcon, CheckIcon, FolderIcon, FolderOpenIcon } from '@heroicons/vue/24/outline'

import { useChatMessages, type DisplayMessage } from '../composables/useChatMessages'
import { useMediaPreview } from '../composables/useMediaPreview'
import { useScrollManager } from '../composables/useScrollManager'
import type { BranchInfo } from '../components/chat/MessageBubble.vue'
import { useTTS } from '../composables/useTTS'
import { useVoiceChat } from '../composables/useVoiceChat'
import ChatHeader from '../components/chat/ChatHeader.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import VirtualMessageList from '../components/chat/VirtualMessageList.vue'
import ChatInput from '../components/chat/ChatInput.vue'
import SessionTreeModal from '../components/chat/SessionTreeModal.vue'
import SubagentTraceDrawer from '../components/chat/SubagentTraceDrawer.vue'
import VoiceChatOverlay from '../components/chat/VoiceChatOverlay.vue'
import AppSidebar from '../components/AppSidebar.vue'
import MediaPreviewOverlay from '../components/chat/MediaPreviewOverlay.vue'
import WorkspacePanel from '../components/workspace/WorkspacePanel.vue'
import WorkspaceViewer from '../components/workspace/WorkspaceViewer.vue'
import WorkspaceContextMenu from '../components/workspace/ContextMenu.vue'
import WorkspaceBindDialog from '../components/workspace/WorkspaceBindDialog.vue'

import { isNewSession, NEW_SESSION_PATH, NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'
import { writeClipboard } from '../utils/clipboard.ts'
import { useChatState, splitModelId, type ChatSendOverrides } from '../composables/useChatState'
import { useChatInput } from '../composables/useChatInput'
import { useCommandState } from '../composables/useCommandState'
import { SessionRow, useSessionsState } from '../composables/useSessionsState'
import { useAgentsState } from '../composables/useAgentsState'
import { useToast } from '../composables/useToast'
import { useWorkspacePanel } from '../composables/useWorkspacePanel'
import { useWorkspaceViewer } from '../composables/useWorkspaceViewer'
import { truncateText } from '../utils/format'
import { collectSessionImageSources } from '../utils/session-image-gallery'
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

// busy 时仍允许走 /chat 的命令（goal 等）。/steer /follow-up /abort 走控制 API，不在此列。
const busyAllowedCommands = ['goal']
const busyAllowedCommandPattern = new RegExp(`^\\/(${busyAllowedCommands
    .map(command => command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?=\\s|$)`)
const deliveryCommandPattern = /^\/(follow-up|steer|abort)(?:\s+([\s\S]*))?$/i

// Refs
const messagesContainerRef = ref<HTMLDivElement | null>(null)
const chatHeaderRef = ref<InstanceType<typeof ChatHeader> | null>(null)
const chatInputRef = ref<InstanceType<typeof ChatInput> | null>(null)
const virtualMessageListRef = ref<InstanceType<typeof VirtualMessageList> | null>(null)
const welcomeAgentDropdownRef = ref<HTMLDetailsElement | null>(null)

// 欢迎页 agent 下拉选择（与原 ChatHeader 下拉行为一致：selectAgent + 命令列表跟随）
const selectWelcomeAgent = async (agentId: string) => {
    chatState.selectAgent(agentId)
    setCurrentAgent(agentId)
    await loadCommands(agentId)
    if (welcomeAgentDropdownRef.value) {
        welcomeAgentDropdownRef.value.open = false
    }
}

// 「选择文件夹」绑定弹窗：切换/新建 agent 后复用 selectWelcomeAgent（含命令列表跟随）
const showWorkspaceDialog = ref(false)

const onWorkspaceSwitch = async (agentId: string) => {
    await selectWelcomeAgent(agentId)
}

const onWorkspaceCreated = async (agentId: string) => {
    await agentsState.loadAgents()
    await selectWelcomeAgent(agentId)
}

// Chat messages composable
const {
    processedMessages,
    isLoading,
    isBusy,
    streamingText,
} = useChatMessages(chatState as any)

const { setLightboxSources } = useMediaPreview()

// 仅在可能改变画廊的输入变化时才重算，避免流式输出逐 chunk 全量解析 Markdown。
// 签名覆盖：API 基址、消息数量、末条 id/块数/文本长度（流式增长的主要信号）。
const gallerySignature = computed(() => {
    const messages = processedMessages.value
    const last = messages[messages.length - 1]
    const lastTextLen = last?.blocks?.reduce(
        (sum, b) => sum + ((b.type === 'text' || b.type === 'thinking') ? (b.text?.length ?? 0) : 0),
        0,
    ) ?? 0
    return `${settingsStore.apiBaseUrl}|${messages.length}|${last?.id ?? ''}|${last?.blocks?.length ?? 0}|${lastTextLen}`
})

watch(
    gallerySignature,
    () => setLightboxSources(
        collectSessionImageSources(processedMessages.value, settingsStore.apiBaseUrl),
    ),
    { immediate: true },
)

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

// 欢迎页 agent 下拉的显示名（顶栏下拉已移除，输入卡片内提供 agent 选择）
const selectedAgentName = computed(() => chatState.currentAgent?.name || '')

// 是否处于新会话欢迎页（模板与发送逻辑共用）
const isNewSessionPage = computed(() => isNewSession(route))

// 按当前时段生成问候语（新会话欢迎页）
const greetingKey = computed(() => {
    const hour = new Date().getHours()
    if (hour < 6) return 'home.greetingNight'
    if (hour < 12) return 'home.greetingMorning'
    if (hour < 18) return 'home.greetingAfternoon'
    return 'home.greetingEvening'
})

// 当前会话名称（优先从 sessionsState 获取最新值，因为 patchSession 会更新它）
const currentSessionName = computed(() => {
    const sessionKey = chatState.sessionKey
    if (!sessionKey) return ''

    // 从 sessionsState 三个桶中依次查找（patchSession / triggerSessionRename 会更新这里）
    const found =
        sessionsState.sessionsResult?.sessions.find((s: SessionRow) => s.id === sessionKey)
        || sessionsState.taskSessionsResult?.sessions.find((s: SessionRow) => s.id === sessionKey)
        || sessionsState.archivedSessionsResult?.sessions.find((s: SessionRow) => s.id === sessionKey)
    if (found) {
        return found.name || truncateText(found.firstMessage, 9)
    }

    // Fallback 到 chatState.currentSession
    const session = chatState.currentSession
    if (!session) return ''
    return session.name || truncateText(session.firstMessage, 9)
})

const isCreatingSession = ref(false)
const showSessionTreeModal = ref(false)
const sessionTreeBusy = ref(false)

const openSessionTree = async () => {
    if (!chatState.sessionKey) return
    await chatState.fetchSessionTree()
    showSessionTreeModal.value = true
}

const handleJumpToTreeEntry = async (entryId: string) => {
    if (sessionTreeBusy.value) return

    sessionTreeBusy.value = true
    try {
        const entries = chatState.sessionTree ?? []
        const entryById = new Map(entries.map(entry => [entry.id, entry]))

        // 1. 是否在当前分支：用 leaf→root 的真实路径判断。
        //    不能用 processedMessages，因为被合并 / 空内容 / 工具结果的 entry 不会出现在可见气泡里，
        //    否则这些节点会被误判为「别的分支」而错误触发 navigate。
        const currentPathIds = new Set<string>()
        let cursor: string | null = chatState.sessionLeafId
        while (cursor) {
            currentPathIds.add(cursor)
            cursor = entryById.get(cursor)?.parentId ?? null
        }

        // 2. 不在当前分支 → 先切到目标所在分支的叶子，让虚拟列表真正渲染出这条消息。
        if (!currentPathIds.has(entryId)) {
            if (isBusy.value) {
                useToast().warning(t('chat.waitMessage'))
                return
            }
            const leafId = findBranchLeafId(entryId, branchIndexes.value)
            const navigated = await chatState.navigateBranch(leafId)
            // 切分支失败（网络错误 / 后端未返回 messages）时早退：保留弹窗与提示，避免「弹窗关了但没切也没滚」的静默失败。
            if (!navigated) {
                useToast().error(t('chat.treeJumpFailed'))
                return
            }
            await nextTick()
        }

        showSessionTreeModal.value = false
        await nextTick()

        // 3. 找目标 entry 对应的可见气泡：若目标本身没有气泡（被合并 / 空内容 / 工具结果），
        //    沿 parent 链向上找最近一个有气泡的祖先（与 TUI findNearestVisible 一致）。
        const visibleIds = new Set(
            processedMessages.value
                .map(message => message.entryId)
                .filter((id): id is string => Boolean(id))
        )
        let target: string | null = entryId
        while (target && !visibleIds.has(target)) {
            target = entryById.get(target)?.parentId ?? null
        }
        if (target) {
            await virtualMessageListRef.value?.scrollToEntry(target)
        }
    } finally {
        sessionTreeBusy.value = false
    }
}

/**
 * 解析并执行控制命令：/follow-up | /steer | /abort。
 * 一律走专用 API，不经 POST /chat。
 * @returns true 表示已处理（含参数错误），调用方应直接 return
 */
const trySendDeliveryCommand = async (inputText: string): Promise<boolean> => {
    const match = inputText.match(deliveryCommandPattern)
    if (!match) return false

    const cmd = match[1].toLowerCase()
    const deliveryText = (match[2] || '').trim()

    if (cmd === 'abort') {
        // /abort 不接受正文；有多余参数也直接中止
        await chatState.abortChat()
        return true
    }

    if (!deliveryText) {
        useToast().warning(cmd === 'steer' ? '用法: /steer <text>' : '用法: /follow-up <text>')
        if (chatInputRef.value) {
            chatInputRef.value.inputText = inputText
        }
        return true
    }

    if (cmd === 'steer') {
        await chatState.steerMessage(deliveryText)
    } else {
        await chatState.followMessage(deliveryText)
    }
    scrollToBottom(true)
    return true
}

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

    const isTreeCommand = inputText.trim() === '/tree'
    if (isTreeCommand && !hasAttachments) {
        if (isBusy.value) {
            useToast().warning(t('home.commandNotAvailableWhileBusy'))
            return
        }
        if (chatInputRef.value) {
            chatInputRef.value.inputText = ''
        }
        await openSessionTree()
        return
    }

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
        // /follow-up /steer /abort：走控制 API，不经 /chat
        if (await trySendDeliveryCommand(inputText)) return

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
    // /follow-up /steer /abort 在 idle 也走控制 API，避免 POST /chat 返回 JSON 而非 SSE
    if (await trySendDeliveryCommand(inputText)) return

    // Determine session key
    let targetSessionKey = chatState.sessionKey
    const isNew = isNewSession(route)
    // 欢迎页暂存的模型/思考选择（仅新会话首条消息携带）
    let chatOverrides: ChatSendOverrides | undefined

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

        // 取走欢迎页暂存的模型/思考选择，随首条消息一并提交；
        // 同时补到本地会话缓存，避免聊天页显示回退到 agent 默认值。
        // updateSessionLocal 是 Object.assign 合并，patch 只放有值的键，
        // 避免 undefined 覆盖服务端返回的默认值，也保证只选思考级别时同样回填
        chatOverrides = chatInputRef.value?.consumePendingOverrides()
        const overridePatch: Partial<SessionRow> = {}
        const overrideSplit = chatOverrides?.model ? splitModelId(chatOverrides.model) : null
        if (overrideSplit) {
            overridePatch.modelProvider = overrideSplit.provider
            overridePatch.model = overrideSplit.model
        }
        if (chatOverrides?.thinkingLevel) {
            overridePatch.thinkingLevel = chatOverrides.thinkingLevel
        }
        if (Object.keys(overridePatch).length > 0) {
            sessionsState.updateSessionLocal(targetSessionKey, overridePatch)
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

    // Send message with explicit sessionKey (+ 新会话页暂存的模型/思考覆盖)
    await chatState.sendMessage(inputText, [...imageAttachments], targetSessionKey, chatOverrides)

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

const forkMessage = async (msg: DisplayMessage) => {
    // 合并气泡（assistantMsgMerge）显示为一整条，fork 应锚定组内最后一条 entry；
    // 未合并气泡无 lastEntryId，回落 entryId
    const entryId = msg.lastEntryId ?? msg.entryId
    if (!entryId) return
    // 从该条消息处分叉新会话（含该消息），成功后 chatState 会切换过去
    await chatState.forkFromEntry(entryId)
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
    if (welcomeAgentDropdownRef.value && !welcomeAgentDropdownRef.value.contains(event.target as Node)) {
        welcomeAgentDropdownRef.value.open = false
    }
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

// Workspace Panel 可见性：
// - 需要已选中 agent（面板内容依赖 agent workspace）
// - canShow 不含 isOpen：供移动端 drawer DOM 始终挂载，让 daisyUI drawer-toggle
//   动画能走；isOpen 仅影响 PC 内联 panel 是否 mount。
const canShowWorkspacePanel = computed(() => !!chatState.agentsSelectedId)
const showWorkspacePanel = computed(() =>
    wsPanel.isOpen.value && canShowWorkspacePanel.value,
)

// 移动端判断与 tailwind lg 断点一致（1024px）
const isMobile = useMediaQuery('(max-width: 1023px)')
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

// 移动端：viewer 打开 / 切换 target 时自动关 drawer。
// drawer 是从右侧滑出占满屏的，viewer 也是全屏替代主区，不关会被 drawer 盖不可见。
// 这里 watch viewer.current（而非 isActive）以便同样在从一个文件切到另一个时也生效。
watch(() => wsViewer.current.value, (curr) => {
    if (curr && isMobile.value) {
        wsPanel.close()
    }
})

// 移动端进入时强制收起 drawer：
// store.workspacePanel.open 是跨会话持久化的，适合 PC 记忆侧栏布局，
// 但移动端不应该在加载 / 视口变窄时默认展开盖住全屏。
// 规则：只要 isMobile 由 false→true（含初始）且 drawer 是开的 → close 一次。
watch(isMobile, (mobile) => {
    if (mobile && wsPanel.isOpen.value) {
        wsPanel.close()
    }
}, { immediate: true })

// 移动端 drawer 内容懒加载：只有用户第一次打开过（isOpen 变 true）才挂载 WorkspacePanel，
// 之后保持挂载利用缓存。这样未访问过 drawer 的用户不会付出任何 tree/repos 请求代价。
// daisyUI 的动画作用于 drawer-side > *:first-child，包一层 v-if 不影响滑入动画。
const mobilePanelMounted = ref(false)
watch(() => wsPanel.isOpen.value, (open) => {
    if (open) mobilePanelMounted.value = true
}, { immediate: true })

// Session / Agent 切换时关闭 viewer：
// - 设计决定（与用户确认）：切 session 一律关 viewer，不区分是否同 agent。
//   理由是 viewer 全屏占据主区，切换 session 通常意味着想看另一个会话上下文。
// - 同时监听 agentId：覆盖 /new 路由上用 ChatHeader dropdown 切 agent（sessionKey 不变但
//   workspace 换了）的场景，避免遗留一个针对旧 workspace 的 viewer 路径。
// - dirty 提示：有未保存改动 toast 告知，但不阻塞切换（已经发生）。
// - watch 默认非 immediate，mount 时不会误触发，无需 prev 守卫。
watch(
    [() => chatState.sessionKey, () => chatState.agentsSelectedId],
    ([nextSession, nextAgent], [prevSession, prevAgent]) => {
        if (nextSession === prevSession && nextAgent === prevAgent) return
        if (!wsViewer.isActive.value) return
        const dirty = wsViewer.dirty.value
        if (dirty) {
            useToast().warning(t('workspace.discardedDirty', { path: dirty.path }))
        }
        wsViewer.close()
    },
)

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
    setLightboxSources([])
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
        await chatState.setSessionKey(sessionkey)
        setCurrentAgent(chatState.agentsSelectedId || undefined)
        await loadCommands(chatState.agentsSelectedId || undefined)
        return
    }

    // 没有指定 sessionKey，执行默认行为
    await applyDefaultSessionBehavior()

}, { immediate: true })



// 首页默认行为：始终打开新会话页
async function applyDefaultSessionBehavior() {
    router.replace({ path: NEW_SESSION_PATH })
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

        <!-- Chat Area: 始终保留 ChatHeader + ChatInput；Main 区域在 viewer 打开时被替换 -->
        <div class="flex-1 flex flex-col h-full min-w-0">

            <!-- Header 始终可见：panel toggle / 主题 / 会话树 / 通知都依赖它 -->
            <ChatHeader ref="chatHeaderRef" @start-voice-chat="startVoiceChat" @open-session-tree="openSessionTree"
                :session-name="currentSessionName" />

            <!-- Main content area: chat messages OR viewer -->
            <div class="flex-1 flex flex-col min-h-0">
                <!-- Workspace Viewer（仅替换主消息区，不动 ChatHeader / ChatInput） -->
                <WorkspaceViewer v-if="showWorkspaceViewer" :agent-id="chatState.agentsSelectedId || ''" />

                <!-- Loading state -->
                <div v-else-if="isLoading" class="flex-1 flex items-center justify-center">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- 新会话欢迎页：居中问候语 + agent 下拉 + 输入框 -->
                <div v-else-if="isNewSessionPage || isCreatingSession"
                    class="flex-1 flex flex-col items-center justify-center px-4 py-6 overflow-y-auto">
                    <div class="w-full max-w-2xl sm:max-w-3xl lg:max-w-4xl flex flex-col gap-8">
                        <h1 class="text-3xl font-bold text-center">{{ $t(greetingKey) }}</h1>

                        <ChatInput ref="chatInputRef" centered :is-busy="isBusy" :disabled="false" @send="handleSend">
                            <template #top>
                                <details ref="welcomeAgentDropdownRef" class="dropdown px-2 pt-1.5">
                                    <summary class="btn btn-ghost btn-sm gap-1.5 list-none px-2 h-auto min-h-0 font-normal">
                                        <FolderIcon class="h-4 w-4 opacity-70" />
                                        <span class="font-medium">{{ selectedAgentName || $t('agent.assistant') }}</span>
                                        <ChevronDownIcon class="h-3.5 w-3.5 shrink-0 opacity-60" />
                                    </summary>
                                    <ul
                                        class="dropdown-content menu bg-base-100 rounded-box z-50 w-52 p-2 shadow-lg border border-base-300">
                                        <li v-for="agent in agentsState.agentsList" :key="agent.id">
                                            <a @click="selectWelcomeAgent(agent.id)"
                                                class="flex justify-between items-center"
                                                :class="{ 'active': chatState.agentsSelectedId === agent.id }">
                                                <span>{{ agent.name }}</span>
                                                <CheckIcon v-if="chatState.agentsSelectedId === agent.id"
                                                    class="h-4 w-4" />
                                            </a>
                                        </li>
                                        <li class="mt-1 border-t border-base-300/60 pt-1">
                                            <a @click="showWorkspaceDialog = true"
                                                class="flex items-center gap-2 text-base-content/80">
                                                <FolderOpenIcon class="h-4 w-4 opacity-70" />
                                                <span>{{ $t('workspaceBinding.openFolder') }}</span>
                                            </a>
                                        </li>
                                    </ul>
                                </details>
                            </template>
                        </ChatInput>
                    </div>
                </div>

                <!-- Chat messages - only this area scrolls -->
                <div v-else ref="messagesContainerRef" class="flex-1 overflow-y-auto p-2 md:p-4 relative">
                    <div class="mx-auto w-full" :class="{ 'max-w-3xl': !settingsStore.isWideMode }">
                        <VirtualMessageList ref="virtualMessageListRef" :messages="processedMessages" :is-busy="isBusy"
                            :scroll-container="messagesContainerRef" :is-wide-mode="settingsStore.isWideMode"
                            :get-branch-info="getBranchInfo" @copy="copyMessage" @read-aloud="readAloud"
                            @delete="deleteMessage" @retry="retryMessage" @edit="editMessage"
                            @fork="forkMessage" @navigate-branch="navigateBranch" />
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

            <!-- ChatInput：非新会话页固定在底部（新会话页的输入框居中展示在欢迎区）。
                 viewer 打开时也保留，用户仍可与 agent 讨论 diff/文件内容 -->
            <ChatInput v-if="!isNewSessionPage && !isCreatingSession" ref="chatInputRef" :is-busy="isBusy"
                :disabled="false" @send="handleSend" />

            <!-- Voice Chat Overlay -->
            <VoiceChatOverlay :is-open="isVoiceChatActive" :status="voiceStatus" :transcript="transcript"
                :speaking-text="currentlySpeakingText" :is-waiting="isWaitingForAudio" @close="stopVoiceChat" />

            <!-- Media Preview Overlay (shared image lightbox & file viewer) -->
            <MediaPreviewOverlay />

            <SessionTreeModal :open="showSessionTreeModal" :entries="chatState.sessionTree"
                :leaf-id="chatState.sessionLeafId" :busy="sessionTreeBusy"
                @close="showSessionTreeModal = false" @jump-to-entry="handleJumpToTreeEntry" />

            <!-- 子代理轨迹抽屉（全局状态驱动，ToolInvocation 卡片按钮打开） -->
            <SubagentTraceDrawer />
        </div>

        <!-- Workspace Panel (PC 右侧侧栏，可拖宽) -->
        <WorkspacePanel v-if="showWorkspacePanel" :agent-id="chatState.agentsSelectedId || ''"
            class="hidden lg:contents" />

        <!-- Workspace Panel (移动端右侧 drawer，与 AppSidebar 左侧 drawer 的模式一致)
             drawer-end 让它从右侧滑出。canShow 不含 isOpen： DOM 常驻才能走 daisyUI 动画。
             :checked 反映 store 状态、@change 接住点击 overlay 隐含的 toggle。
             内层 v-if="mobilePanelMounted" 实现懒加载：未访问过 drawer 的用户不走任何 fetch。 -->
        <div v-if="canShowWorkspacePanel" class="drawer drawer-end lg:hidden absolute inset-0 pointer-events-none z-[100]">
            <input id="workspace-drawer" type="checkbox" class="drawer-toggle pointer-events-auto"
                :checked="wsPanel.isOpen.value"
                @change="(e: Event) => (e.target as HTMLInputElement).checked ? wsPanel.open() : wsPanel.close()" />
            <div class="drawer-side pointer-events-auto h-full">
                <label for="workspace-drawer" :aria-label="$t('common.close')" class="drawer-overlay"></label>
                <div class="h-full bg-base-100" style="width: min(85vw, 400px)">
                    <WorkspacePanel v-if="mobilePanelMounted" :agent-id="chatState.agentsSelectedId || ''" :mobile="true" />
                </div>
            </div>
        </div>
        <!-- Workspace context menu (PC 右键 + 移动端 kebab 共用同一实例，
             Teleport 到 body 上避免被 panel / drawer 的 overflow-hidden 裁切) -->
        <WorkspaceContextMenu />

        <!-- 「选择文件夹」工作区绑定弹窗（欢迎页 agent 下拉入口） -->
        <WorkspaceBindDialog :show="showWorkspaceDialog" @close="showWorkspaceDialog = false"
            @switch-agent="onWorkspaceSwitch" @created="onWorkspaceCreated" />
    </div>
</template>
