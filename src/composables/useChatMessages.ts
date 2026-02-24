import { computed, watch, nextTick, ref, onMounted, onUnmounted, type Ref } from 'vue'
import { useChatState, type ChatMessage } from './useChatState'
import { useUiSettingsStore } from '../stores/setting'

// Types for internal display
export interface DisplayBlock {
    type: 'text' | 'tool' | 'image' | 'thinking' | 'error' | 'unknown'
    text?: string
    toolCallId?: string
    toolName?: string
    toolArgs?: any
    toolResult?: any
    toolState?: 'calling' | 'success' | 'error'
    toolError?: string
    error?: string // For top-level message errors
    source?: {
        type: 'base64' | 'url'
        media_type?: string
        data?: string
        url?: string
        name?: string
    }
}

export interface DisplayMessage {
    id: string
    role: 'user' | 'assistant'
    blocks: DisplayBlock[]
    timestamp?: number
    entryId?: string
    parentEntryId?: string | null
}

export interface ChatStateShape {
    chatMessages: ChatMessage[]
    chatToolMessages?: ChatMessage[]
    chatStream: any[] | null
    chatSending?: boolean
    chatRunId?: string | null
    chatLoading?: boolean
    sessionKey?: string
    [key: string]: any
}

export function useChatMessages(state: ChatStateShape, messagesContainerRef: Ref<HTMLDivElement | null>) {

    // 转换原始消息为显示格式，并合并工具调用结果
    const processedMessages = computed(() => {
        const rawMessages = state.chatMessages || []
        const toolMessages = state.chatToolMessages || [] // 单独存储的工具调用结果
        const allMessages = [...rawMessages, ...toolMessages]
        const displayMessages: DisplayMessage[] = []

        // 工具调用注册表: map toolCallId -> { messageIndex, blockIndex }
        // 用于快速查找并更新 Tool Call 状态
        const toolCallRegistry = new Map<string, { msgIdx: number, blockIdx: number }>()
        const settings = useUiSettingsStore()

        // 辅助函数：将API返回的内容项转换为显示 Block
        const convertToBlocks = (content: any): DisplayBlock[] => {
            const blocks: DisplayBlock[] = []

            // 如果 content 是数组，遍历处理
            if (Array.isArray(content)) {
                for (const item of content) {
                    if (item.type === 'text') {
                        if (item.text) blocks.push({ type: 'text', text: item.text })
                    } else if (item.type === 'toolCall') {
                        const block: DisplayBlock = {
                            type: 'tool',
                            toolCallId: item.id || item.toolCallId,
                            toolName: item.name,
                            toolArgs: item.arguments,
                            toolState: item.toolState || 'calling',
                            toolResult: item.toolResult,
                            toolError: item.toolError
                        }
                        blocks.push(block)
                    } else if (item.type === 'image') {
                        blocks.push({
                            type: 'image',
                            source: {
                                type: item.url ? 'url' : 'base64',
                                media_type: item.mimeType,
                                data: item.data || item.url,
                                url: item.url
                            }
                        })
                    } else if (item.type === 'thinking') {
                        // 过滤掉空的或仅包含空白的思考过程
                        if (item.thinking && item.thinking.trim().length > 0) {
                            blocks.push({
                                type: 'thinking',
                                text: item.thinking
                            })
                        }
                    } else {
                        // 未知类型，转为 JSON 字符串显示
                        blocks.push({
                            type: 'unknown',
                            text: JSON.stringify(item)
                        })
                    }
                }
            } else if (typeof content === 'string') {
                // 纯字符串内容
                blocks.push({ type: 'text', text: content })
            }
            return blocks
        }

        // 1. 处理历史消息
        for (const msg of allMessages) {
            // 1.1 处理 Tool Result 消息 (后端返回的独立消息 role='toolResult')
            if (msg.role === 'toolResult') {
                const toolCallId = msg.toolCallId;
                if (toolCallId) {
                    const reg = toolCallRegistry.get(toolCallId)
                    if (reg) {
                        const targetMsg = displayMessages[reg.msgIdx]
                        if (targetMsg) {
                            const targetBlock = targetMsg.blocks[reg.blockIdx]
                            // 更新目标 Tool Block 的状态和结果
                            if (targetBlock && targetBlock.type === 'tool') {
                                targetBlock.toolResult = msg.content

                                // 简单的错误检测逻辑
                                let isError = false
                                let errorMsg = ''

                                if (msg.isError) {
                                    isError = true
                                    errorMsg = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                                } else if (msg.details?.status === 'error') {
                                    isError = true
                                    errorMsg = msg.details.error || 'Unknown error'
                                }

                                if (isError) {
                                    targetBlock.toolState = 'error'
                                    targetBlock.toolError = errorMsg
                                } else if (!targetBlock.toolState || targetBlock.toolState === 'calling') {
                                    targetBlock.toolState = 'success'
                                }
                            }
                        }
                    }
                }
                continue // Tool Result 不作为独立气泡显示，而是更新对应 Tool Call
            }

            // 1.2 处理普通消息 (User / Assistant)
            const blocks: DisplayBlock[] = convertToBlocks(msg.content)

            // 顶级错误信息处理
            if (msg.errorMessage) {
                blocks.push({ type: 'error', error: msg.errorMessage })
            }

            if (blocks.length > 0) {
                // 判断是否合并消息 (Assistant 连续发言)
                const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
                let shouldMerge = false;

                if (settings.assistantMsgMerge && msg.role === 'assistant') {
                    if (lastMsg && lastMsg.role === 'assistant') {
                        shouldMerge = true;
                    }
                }

                if (shouldMerge && lastMsg) {
                    // 记录合并前的起始 Block 索引
                    const baseBlockIdx = lastMsg.blocks.length
                    lastMsg.blocks.push(...blocks)

                    // 注册合并后的 Tool Call
                    blocks.forEach((b, idx) => {
                        if (b.type === 'tool' && b.toolCallId) {
                            toolCallRegistry.set(b.toolCallId, { msgIdx: displayMessages.length - 1, blockIdx: baseBlockIdx + idx })
                        }
                    })
                } else {
                    // 创建新消息
                    const newMsg: DisplayMessage = {
                        id: msg.id || `${state.sessionKey || 'temp'}-msg-${displayMessages.length}`,
                        role: msg.role as 'user' | 'assistant',
                        blocks,
                        timestamp: msg.timestamp,
                        entryId: msg.entryId,
                        parentEntryId: msg.parentEntryId,
                    }
                    displayMessages.push(newMsg)
                    // 注册新消息中的 Tool Call
                    blocks.forEach((b, idx) => {
                        if (b.type === 'tool' && b.toolCallId) {
                            toolCallRegistry.set(b.toolCallId, { msgIdx: displayMessages.length - 1, blockIdx: idx })
                        }
                    })
                }
            }
        }

        // 2. 处理流式输出（Streaming）
        // 【条件说明】只有当 chatStream 非空且有实际内容时，才进入流式渲染分支。
        //
        // 为什么不用 "chatStream != null" 作为条件？
        //   - sendMessage 时 chatStream 被初始化为 []（空数组）
        //   - 服务器会先回显用户消息（发一对 message_start/message_end），此期间 stream 保持 []
        //   - 空数组虽然是 truthy，但没有内容可渲染，这时应该显示 loading 动画而非空 bubble
        //   - 如果条件是 "chatStream != null"，空数组会进入此分支，跳过 loading placeholder 的 else if，
        //     导致 loading 动画消失，用户无法感知系统正在工作
        if (state.chatStream && Array.isArray(state.chatStream) && state.chatStream.length > 0) {
            const streamBlocks: DisplayBlock[] = convertToBlocks(state.chatStream)

            if (streamBlocks.length > 0) {
                const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null

                // 根据设置决定是否合并到上一条 assistant 消息（多轮工具调用场景）
                const shouldMergeStream = settings.assistantMsgMerge && lastMsg && lastMsg.role === 'assistant'

                if (shouldMergeStream && lastMsg) {
                    // 合并模式：追加到前一条 assistant 消息的 blocks 中
                    lastMsg.blocks.push(...streamBlocks)
                } else {
                    // 独立模式：作为新的 streaming bubble 插入
                    displayMessages.push({
                        id: 'streaming-pending',
                        role: 'assistant',
                        blocks: streamBlocks,
                        timestamp: Date.now()
                    })
                }
            }
        } else if (state.chatSending || Boolean(state.chatRunId)) {
            // 3. 等待中状态（Loading placeholder）
            // 触发条件：chatStream 为 null 或空数组，但仍在发送中（chatSending 或 chatRunId 未清除）
            // 场景：
            //   a. 刚发送消息，等待服务器第一个响应
            //   b. user 消息回显的 message_end 后，等待 assistant 开始答复
            //   c. 两条 assistant 消息之间（多轮工具调用）
            const lastMsg = displayMessages.length > 0 ? displayMessages[displayMessages.length - 1] : null
            if (!lastMsg || lastMsg.role !== 'assistant') {
                // 仅当最后一条不是 assistant 时插入占位符，避免重复
                displayMessages.push({
                    id: 'streaming-pending',
                    role: 'assistant',
                    blocks: [{ type: 'text', text: '' }], // 空 block，由 MessageBubble 渲染为 loading 动画
                    timestamp: Date.now()
                })
            }
        }


        return displayMessages
    })

    const isLoading = computed(() => state.chatLoading)
    const isBusy = computed(() => state.chatSending || Boolean(state.chatRunId))
    const streamingText = computed(() => state.chatStream)

    // ==================== Smart Auto-Scroll ====================
    // Simple rule: track whether the user is scrolled away from the bottom.
    // - `userScrolledUp = true`  → FAB visible, auto-scroll paused
    // - `userScrolledUp = false` → FAB hidden, auto-scroll active
    const userScrolledUp = ref(false)
    const isAutoScrolling = ref(false) // Lock: ignore scroll events fired by programmatic scrolls
    const SCROLL_THRESHOLD = 50 // px from bottom to consider "at bottom"

    const isNearBottom = (): boolean => {
        const el = messagesContainerRef.value
        if (!el) return true
        // If content fits in container (no scrollbar), we are effectively at bottom
        if (el.scrollHeight <= el.clientHeight + 1) return true
        return Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) <= SCROLL_THRESHOLD
    }

    // Simple scroll handler: just check distance from bottom.
    // No direction tracking, no debounce — the isAutoScrolling lock is sufficient
    // to filter out programmatic scroll events.
    const handleScroll = () => {
        if (isAutoScrolling.value) return
        userScrolledUp.value = !isNearBottom()
    }

    const scrollToBottom = (force = false) => {
        // If not forcing and user has scrolled up, respect their position
        if (!force && userScrolledUp.value) return

        const el = messagesContainerRef.value
        if (!el) return

        // Activate lock so handleScroll ignores the resulting scroll event
        isAutoScrolling.value = true
        if (force) userScrolledUp.value = false

        nextTick(() => {
            if (!el) {
                isAutoScrolling.value = false
                return
            }

            const targetScrollTop = el.scrollHeight - el.clientHeight
            if (Math.abs(el.scrollTop - targetScrollTop) > 2) {
                el.scrollTop = targetScrollTop
            }

            // Keep lock active long enough for the browser to finish layout + fire scroll event.
            // 200ms covers most layout recalculations from new messages / images.
            setTimeout(() => {
                isAutoScrolling.value = false
                // Final consistency check after DOM settles
                if (isNearBottom()) {
                    userScrolledUp.value = false
                }
            }, 200)
        })
    }

    const setupScrollWatchers = () => {
        // Listen to user scroll events
        const el = messagesContainerRef.value
        if (el) {
            el.addEventListener('scroll', handleScroll, { passive: true })
        }

        // Watch for container ref changes (in case it mounts later)
        watch(messagesContainerRef, (newEl, oldEl) => {
            if (oldEl) oldEl.removeEventListener('scroll', handleScroll)
            if (newEl) newEl.addEventListener('scroll', handleScroll, { passive: true })
        })

        // Auto-scroll on new messages / stream updates (respects userScrolledUp)
        watch(processedMessages, () => scrollToBottom(), { deep: true })
        watch(() => streamingText.value, () => scrollToBottom())

        // Loading finished → force scroll to bottom (e.g. initial history load)
        watch(isLoading, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                nextTick(() => {
                    scrollToBottom(true)
                    setTimeout(() => scrollToBottom(true), 500)
                })
            }
        })

        // busy→idle: scroll to bottom only if user is already at bottom
        watch(isBusy, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                nextTick(() => {
                    scrollToBottom()
                    setTimeout(() => scrollToBottom(), 300)
                })
            }
        })

        // Session switch: force scroll to bottom + reset userScrolledUp
        watch(() => state.sessionKey, (newKey, oldKey) => {
            if (newKey && newKey !== oldKey) {
                userScrolledUp.value = false
                nextTick(() => {
                    scrollToBottom(true)
                    setTimeout(() => scrollToBottom(true), 300)
                })
            }
        })

        // Cleanup on unmount
        onUnmounted(() => {
            const el = messagesContainerRef.value
            if (el) el.removeEventListener('scroll', handleScroll)
        })
    }

    const formatTime = (timestamp?: number): string => {
        if (!timestamp) return ''
        const date = new Date(timestamp)
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    const isAvatarUrl = (avatar: string | null | undefined): boolean => {
        if (!avatar) return false
        return avatar.startsWith('http') || avatar.startsWith('data:') || avatar.startsWith('/')
    }

    const refreshChatAndScroll = async () => {
        const chatState = useChatState()
        await chatState.loadChatHistory()
        scrollToBottom()
    }

    return {
        processedMessages,
        isLoading,
        isBusy,
        streamingText,
        userScrolledUp,
        scrollToBottom,
        setupScrollWatchers,
        formatTime,
        isAvatarUrl,
        refreshChatAndScroll
    }
}
