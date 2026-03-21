import { ref, watch, nextTick, onUnmounted, type Ref, type ComputedRef } from 'vue'

/**
 * useScrollManager — 管理聊天消息虚拟列表的智能滚动行为
 *
 * 职责：
 * 1. 跟踪用户是否向上滚动（控制 FAB 显示 & 自动滚动暂停）
 * 2. 提供 scrollToBottom（支持自动 & 强制模式）
 * 3. 按 sessionKey 保存/恢复滚动位置（基于消息 entryId + 视口偏移）
 * 4. 绑定 scroll/loading/busy/session-switch 等 watcher
 */

// ==================== 类型 ====================

export interface ScrollManagerOptions {
    /** 滚动容器的 ref */
    containerRef: Ref<HTMLElement | null>
    /** 处理后的消息列表（用于 entryId 查找） */
    messages: ComputedRef<{ entryId?: string }[]>
    /** 是否正在加载历史消息 */
    isLoading: ComputedRef<boolean | undefined>
    /** 是否正在生成（busy） */
    isBusy: ComputedRef<boolean | undefined>
    /** 流式输出引用（用于自动滚动 watcher） */
    streamingText: ComputedRef<any>
    /** Chat state（需要 sessionKey 和 sessionsMap） */
    state: {
        sessionKey?: string
        sessionsMap?: Map<string, any>
        [key: string]: any
    }
}

interface SavedScrollPosition {
    entryId: string
    offset: number  // px: 消息顶部相对于容器视口顶部的距离
}

// ==================== 常量 ====================

const SCROLL_THRESHOLD = 50       // 距底部多少 px 以内视为"在底部"
const ESTIMATED_ROW_HEIGHT = 136  // VirtualMessageList: ESTIMATED_HEIGHT(120) + ROW_GAP(16)

// ==================== Composable ====================

export function useScrollManager(options: ScrollManagerOptions) {
    const { containerRef, messages, isLoading, isBusy, streamingText, state } = options

    // ── 滚动状态 ──────────────────────────────────────────────────────
    const userScrolledUp = ref(false)
    const isAutoScrolling = ref(false) // 锁：忽略程序触发的滚动事件

    // ── 滚动位置记忆 ──────────────────────────────────────────────────
    const scrollPositionMap = new Map<string, SavedScrollPosition>()
    // 非响应式：仅在 watcher 回调中同步读写，无需变为 ref
    let pendingRestoreKey: string | null = null

    // ── 工具方法 ─────────────────────────────────────────────────────

    const isNearBottom = (): boolean => {
        const el = containerRef.value
        if (!el) return true
        if (el.scrollHeight <= el.clientHeight + 1) return true
        return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD
    }

    const handleScroll = () => {
        if (isAutoScrolling.value) return
        userScrolledUp.value = !isNearBottom()
    }

    // ── 滚动到底部 ───────────────────────────────────────────────────

    const scrollToBottom = (force = false) => {
        if (!force && userScrolledUp.value) return

        const el = containerRef.value
        if (!el) return

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

            // 保持锁定足够久，等浏览器完成布局并触发 scroll 事件
            setTimeout(() => {
                isAutoScrolling.value = false
                if (isNearBottom()) {
                    userScrolledUp.value = false
                }
            }, 200)
        })
    }

    // ── 保存 / 恢复位置 ──────────────────────────────────────────────

    /**
     * 保存当前会话的滚动位置。
     * 查找视口内第一个 .virtual-row[data-key] 的 entryId 和偏移量。
     */
    const saveScrollPosition = (sessionKey: string) => {
        const el = containerRef.value
        if (!el || !sessionKey) return

        const scrollTop = el.scrollTop
        const viewportBottom = scrollTop + el.clientHeight

        for (const row of el.querySelectorAll<HTMLElement>('.virtual-row[data-key]')) {
            const rowTop = row.offsetTop
            if (rowTop + row.offsetHeight > scrollTop && rowTop < viewportBottom) {
                scrollPositionMap.set(sessionKey, {
                    entryId: row.dataset.key!,
                    offset: rowTop - scrollTop,
                })
                return
            }
        }
    }

    /**
     * 恢复会话的滚动位置。
     *
     * 两阶段：先用 消息索引 × 估算高度 粗定位（触发虚拟列表渲染目标行），
     * 再用实际 DOM offsetTop 精校准。
     */
    const restoreScrollPosition = (sessionKey: string): boolean => {
        const saved = scrollPositionMap.get(sessionKey)
        if (!saved) return false

        const el = containerRef.value
        if (!el) return false

        const msgIndex = messages.value.findIndex(m => m.entryId === saved.entryId)
        if (msgIndex < 0) return false

        isAutoScrolling.value = true
        // 阶段1：粗定位 → 虚拟列表渲染目标行附近的 DOM
        el.scrollTop = Math.max(0, msgIndex * ESTIMATED_ROW_HEIGHT - saved.offset)

        // 阶段2：等虚拟列表重新渲染后，用实际 DOM 位置精确校准
        setTimeout(() => {
            const row = el.querySelector<HTMLElement>(`.virtual-row[data-key="${saved.entryId}"]`)
            if (row) {
                el.scrollTop = row.offsetTop - saved.offset
            }
            userScrolledUp.value = !isNearBottom()
            setTimeout(() => {
                isAutoScrolling.value = false
                userScrolledUp.value = !isNearBottom()
            }, 200)
        }, 150)

        return true
    }

    // ── 注册 watchers ────────────────────────────────────────────────

    const setupScrollWatchers = () => {
        const el = containerRef.value
        if (el) {
            el.addEventListener('scroll', handleScroll, { passive: true })
        }

        watch(containerRef, (newEl, oldEl) => {
            if (oldEl) oldEl.removeEventListener('scroll', handleScroll)
            if (newEl) newEl.addEventListener('scroll', handleScroll, { passive: true })
        })

        // ⚠️ 会话切换 watcher 必须在 messages watcher 之前注册！
        // Vue 按注册顺序触发 watcher。当 sessionKey 变化时，processedMessages
        // 也会同步变化。此 watcher 先执行，同步设置 userScrolledUp=true，
        // 确保后续 messages watcher 的 scrollToBottom() 被拦截。

        // 会话切换：保存旧位置，恢复或滚动到底部
        watch(() => state.sessionKey, (newKey, oldKey) => {
            if (newKey && newKey !== oldKey) {
                if (oldKey) {
                    saveScrollPosition(oldKey)
                }

                if (scrollPositionMap.has(newKey)) {
                    // 阻止 messages watcher 的自动滚动
                    userScrolledUp.value = true

                    if (state.sessionsMap?.has(newKey)) {
                        // 数据已缓存：DOM 更新后直接恢复
                        nextTick(() => restoreScrollPosition(newKey))
                    } else {
                        // 数据未缓存：等 isLoading watcher 加载完成后恢复
                        pendingRestoreKey = newKey
                    }
                } else {
                    // 没有保存的位置（首次访问）→ 滚动到底部
                    userScrolledUp.value = false
                    nextTick(() => {
                        scrollToBottom(true)
                        setTimeout(() => scrollToBottom(true), 300)
                    })
                }
            }
        })

        // 加载完成 → 恢复位置或滚动到底部
        watch(isLoading, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                const restoreKey = pendingRestoreKey
                pendingRestoreKey = null

                nextTick(() => {
                    if (restoreKey) {
                        restoreScrollPosition(restoreKey)
                    } else if (!userScrolledUp.value) {
                        scrollToBottom(true)
                        setTimeout(() => scrollToBottom(true), 500)
                    }
                })
            }
        })

        // 新消息 / 流式输出时自动滚动（受 userScrolledUp 控制）
        watch(messages, () => scrollToBottom(), { deep: true })
        watch(() => streamingText.value, () => scrollToBottom())

        // busy→idle：仅在用户处于底部时滚动
        watch(isBusy, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                nextTick(() => {
                    scrollToBottom()
                    setTimeout(() => scrollToBottom(), 300)
                })
            }
        })

        // 组件卸载时清理
        onUnmounted(() => {
            const el = containerRef.value
            if (el) el.removeEventListener('scroll', handleScroll)
        })
    }

    return {
        userScrolledUp,
        scrollToBottom,
        saveScrollPosition,
        setupScrollWatchers,
    }
}
