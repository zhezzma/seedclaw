import { ref, watch, nextTick, onUnmounted, type Ref, type ComputedRef } from 'vue'

/**
 * useScrollManager — 管理聊天消息虚拟列表的智能滚动行为
 *
 * 职责：
 * 1. 跟踪用户是否向上滚动（控制 "回到底部" FAB 显示 & 自动滚动暂停）
 * 2. 提供 scrollToBottom（支持自动 & 强制模式）
 * 3. 按 sessionKey 保存/恢复滚动位置（基于消息 entryId + 视口偏移）
 * 4. 绑定 scroll/loading/busy/session-switch 等 watcher
 *
 * 保存/恢复原理：
 * - 保存时：找到视口中第一个可见的消息行，记录其 entryId 和相对于容器顶部的偏移 (offset)
 * - 恢复时：通过 entryId 找到目标元素（可能是 spacer 或真实 row），
 *   计算当前偏移与保存偏移的差值，调整 scrollTop 使其恢复到保存时的视觉位置
 * - 使用 getBoundingClientRect 做视口相对定位，避免 offsetTop 在复杂 CSS 下的不准确
 */

// ==================== 类型 ====================

export interface ScrollManagerOptions {
    /** 滚动容器的 ref（HomeView 中的 messagesContainerRef） */
    containerRef: Ref<HTMLElement | null>
    /** 处理后的消息列表（用于消息变化时自动滚动到底部） */
    messages: ComputedRef<{ entryId?: string }[]>
    /** 是否正在加载历史消息（从服务端拉取 session 数据中） */
    isLoading: ComputedRef<boolean | undefined>
    /** 是否正在生成回复（LLM busy 状态） */
    isBusy: ComputedRef<boolean | undefined>
    /** 流式输出文本引用（内容变化时自动滚动到底部） */
    streamingText: ComputedRef<any>
    /** Chat 状态对象（需要 sessionKey 和 sessionsMap 属性） */
    state: {
        sessionKey?: string
        sessionsMap?: Map<string, any>
        [key: string]: any
    }
}

/** 保存的滚动位置 */
interface SavedScrollPosition {
    /** 锚定消息的 entryId（用于在 DOM 中查找元素） */
    entryId: string
    /** 该消息行顶部到容器可视区域顶部的像素距离（保存时刻的视觉位置） */
    offset: number
}

/** 判定"接近底部"的阈值（像素） */
const SCROLL_THRESHOLD = 50
/** 滚动事件保存位置的节流间隔（毫秒） */
const SAVE_THROTTLE_MS = 300

/**
 * 模块级别的滚动位置缓存，key = sessionKey，value = 保存的滚动位置。
 * 放在模块作用域（函数外），而非组件实例内，确保：
 * - HomeView 卸载/重新挂载时不丢失（如从"智能体"返回）
 * - 路由在 HomeView 内切换时不丢失（如首页 → 消息 → session）
 */
const scrollPositionMap = new Map<string, SavedScrollPosition>()

// ==================== Composable ====================

export function useScrollManager(options: ScrollManagerOptions) {
    const { containerRef, messages, isLoading, isBusy, streamingText, state } = options

    /** 用户是否已向上滚动（控制 FAB 显示 & 暂停自动滚动） */
    const userScrolledUp = ref(false)
    /** 是否正在执行自动滚动（期间忽略 scroll 事件，防止保存错误位置） */
    const isAutoScrolling = ref(false)
    /** 等待加载完成后恢复位置的 sessionKey（session 数据尚未加载时暂存） */
    let pendingRestoreKey: string | null = null

    // ── 工具方法 ─────────────────────────────────────────────────────

    /**
     * 判断滚动容器是否接近底部。
     * 用于决定是否显示 "回到底部" FAB 以及是否自动跟随新消息。
     */
    const isNearBottom = (): boolean => {
        const el = containerRef.value
        if (!el) return true
        // 内容不足以撑满容器时视为在底部
        if (el.scrollHeight <= el.clientHeight + 1) return true
        return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD
    }

    // ── 保存位置 ─────────────────────────────────────────────────────

    /**
     * 保存当前会话的滚动位置。
     *
     * 遍历视口中已渲染的 .virtual-row[data-key] 元素（DOM 顺序从上到下），
     * 选取第一个在视口内可见（或大部分可见）的行作为锚点，记录：
     * - entryId: 该行的 data-key（消息的唯一标识）
     * - offset: 行顶部到容器可视区域顶部的像素距离
     *
     * 注意：虚拟列表会渲染缓冲区外的行（OVERSCAN），因此不能直接取第一个 row，
     * 需要用 getBoundingClientRect 检查是否真正在视口内。
     */
    const saveCurrentPosition = () => {
        const sessionKey = state.sessionKey
        const el = containerRef.value
        if (!el || !sessionKey) return

        const containerRect = el.getBoundingClientRect()
        const rows = el.querySelectorAll<HTMLElement>('.virtual-row[data-key]')

        for (const row of rows) {
            const rowRect = row.getBoundingClientRect()
            // 跳过完全在视口外的行（完全在上方或完全在下方）
            if (rowRect.bottom <= containerRect.top || rowRect.top >= containerRect.bottom) continue
            const offset = rowRect.top - containerRect.top
            // 选第一个 top 在视口内（offset >= 0）的行，
            // 或者虽然部分在视口上方但超过一半仍可见的行
            if (offset >= -rowRect.height / 2) {
                scrollPositionMap.set(sessionKey, { entryId: row.dataset.key!, offset })
                return
            }
        }
    }

    // ── 滚动事件处理 ─────────────────────────────────────────────────

    /** 节流计时器：防止高频 scroll 事件下频繁保存位置 */
    let saveThrottleTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * 滚动事件处理函数（绑定到容器的 scroll 事件）。
     *
     * 两个职责：
     * 1. 更新 userScrolledUp 状态（是否显示"回到底部"按钮）
     * 2. 节流保存当前滚动位置（每 SAVE_THROTTLE_MS 保存一次）
     *
     * 自动滚动期间（isAutoScrolling = true）跳过，
     * 避免恢复/自动滚动过程中的中间状态被误存。
     */
    const handleScroll = () => {
        if (isAutoScrolling.value) return
        userScrolledUp.value = !isNearBottom()

        // 节流：第一次触发立即启动定时器，定时器到期后保存并清除
        if (!saveThrottleTimer) {
            saveThrottleTimer = setTimeout(() => {
                saveThrottleTimer = null
                saveCurrentPosition()
            }, SAVE_THROTTLE_MS)
        }
    }

    // ── 滚动到底部 ───────────────────────────────────────────────────

    /**
     * 滚动到底部。
     *
     * @param force - true: 强制滚动（忽略 userScrolledUp 状态，用于按钮点击 / 新消息发送）
     *                false: 仅在用户未向上滚动时才自动跟随（用于流式输出 / 消息更新）
     *
     * 使用 nextTick 确保 DOM 更新后再滚动。
     * 设置 isAutoScrolling 标志防止 handleScroll 干扰。
     */
    const scrollToBottom = (force = false) => {
        // 非强制模式下，如果用户已向上滚动则不干扰
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
            // 仅在差距 > 2px 时滚动，避免不必要的抖动
            if (Math.abs(el.scrollTop - targetScrollTop) > 2) {
                el.scrollTop = targetScrollTop
            }
            // 延迟释放自动滚动标志，让浏览器完成渲染
            setTimeout(() => {
                isAutoScrolling.value = false
                if (isNearBottom()) {
                    userScrolledUp.value = false
                }
            }, 200)
        })
    }

    // ── 恢复位置 ─────────────────────────────────────────────────────

    /**
     * 恢复指定会话的滚动位置。
     *
     * 流程：
     * 1. 通过 [data-key="entryId"] 选择器查找目标元素
     *    - 如果目标在视口外，找到的是 .virtual-spacer（占位 div）
     *    - 如果在视口内，找到的是 .virtual-row（真实消息行）
     * 2. 用 getBoundingClientRect 计算当前偏移与保存偏移的差值
     * 3. 调整 scrollTop 使目标恢复到保存时的视觉位置
     * 4. 延迟 150ms 精校准：首次可能命中 spacer，scrollTop 改变后虚拟列表
     *    会将 spacer 替换为真实 row，真实 row 的高度可能不同，需要微调
     *
     * @returns 是否成功恢复
     */
    const restoreScrollPosition = (sessionKey: string): boolean => {
        const saved = scrollPositionMap.get(sessionKey)
        if (!saved) return false

        const el = containerRef.value
        if (!el) return false

        // 查找目标元素（spacer 和 row 都有 data-key 属性）
        const target = el.querySelector<HTMLElement>(`[data-key="${saved.entryId}"]`)
        if (!target) return false

        isAutoScrolling.value = true

        // 第一步：粗定位 — 将目标滚动到保存时的视口位置
        const containerRect = el.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        el.scrollTop += (targetRect.top - containerRect.top) - saved.offset

        // 第二步：精校准 — 等待虚拟列表将 spacer 替换为真实 row 后微调
        setTimeout(() => {
            const row = el.querySelector<HTMLElement>(`.virtual-row[data-key="${saved.entryId}"]`)
            if (row) {
                const cRect = el.getBoundingClientRect()
                const rRect = row.getBoundingClientRect()
                const delta = (rRect.top - cRect.top) - saved.offset
                // 差距 > 2px 才调整，避免不必要的抖动
                if (Math.abs(delta) > 2) el.scrollTop += delta
            }
            userScrolledUp.value = !isNearBottom()
            // 延迟释放自动滚动标志
            setTimeout(() => {
                isAutoScrolling.value = false
                userScrolledUp.value = !isNearBottom()
            }, 200)
        }, 150)

        return true
    }

    /**
     * 尝试恢复当前 session 的滚动位置，如果没有保存的位置则滚动到底部。
     *
     * 使用场景：
     * 1. HomeView 挂载时（onMounted）— 从智能体等非 HomeView 路由返回时，
     *    session 切换 watcher 尚未注册，需要兜底恢复
     * 2. 路由切换回同一个 session 时（sessionKey 未变）— HomeView 不卸载，
     *    但 scrollTop 可能被布局变化重置（如首页/消息切换）
     *
     * 延迟 200ms 执行恢复，确保 VirtualMessageList 已渲染完毕。
     */
    const restoreIfSaved = () => {
        const sessionKey = state.sessionKey
        if (sessionKey && scrollPositionMap.has(sessionKey)) {
            userScrolledUp.value = true
            // 延迟恢复，等待 DOM 就绪（VirtualMessageList 挂载 + spacer 渲染）
            setTimeout(() => restoreScrollPosition(sessionKey), 200)
        } else {
            // 没有保存的位置（新 session 或首次加载），滚动到底部
            scrollToBottom(true)
        }
    }

    // ── 注册 watchers ────────────────────────────────────────────────

    /**
     * 注册所有滚动相关的 watcher。
     * 在 HomeView 的 onMounted 中调用，确保 containerRef 已就绪。
     */
    const setupScrollWatchers = () => {
        // 绑定当前容器的 scroll 事件
        const el = containerRef.value
        if (el) {
            el.addEventListener('scroll', handleScroll, { passive: true })
        }

        // 容器 ref 变化时重新绑定（理论上不常触发，作为安全保障）
        watch(containerRef, (newEl, oldEl) => {
            if (oldEl) oldEl.removeEventListener('scroll', handleScroll)
            if (newEl) newEl.addEventListener('scroll', handleScroll, { passive: true })
        })

        /**
         * 会话切换 watcher：
         * - 有保存位置 → 恢复（如果 session 数据已加载则立即恢复，否则等 loading 完成）
         * - 无保存位置 → 滚动到底部（新 session 或从未滚动过的 session）
         */
        watch(() => state.sessionKey, (newKey, oldKey) => {
            if (newKey && newKey !== oldKey) {
                if (scrollPositionMap.has(newKey)) {
                    userScrolledUp.value = true
                    if (state.sessionsMap?.has(newKey)) {
                        // session 数据已在内存中 → 下一 tick 即可恢复
                        nextTick(() => restoreScrollPosition(newKey))
                    } else {
                        // session 数据需要从服务端加载 → 等 isLoading 变为 false 后恢复
                        pendingRestoreKey = newKey
                    }
                } else {
                    // 该 session 没有保存过滚动位置 → 滚动到底部
                    userScrolledUp.value = false
                    nextTick(() => {
                        scrollToBottom(true)
                        // 双重保险：数据可能在 nextTick 后才渲染完成
                        setTimeout(() => scrollToBottom(true), 300)
                    })
                }
            }
        })

        /**
         * 加载完成 watcher：
         * - 如果有 pendingRestoreKey → 恢复滚动位置
         * - 否则如果用户没有向上滚动 → 滚动到底部
         */
        watch(isLoading, (newVal, oldVal) => {
            // isLoading 从 true → false 表示加载完成
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

        // 消息列表变化时自动滚动到底部（新消息到达 / 消息编辑等）
        watch(messages, () => scrollToBottom(), { deep: true })

        // 流式输出内容变化时自动滚动到底部（逐字显示时跟随）
        watch(() => streamingText.value, () => scrollToBottom())

        /**
         * 生成结束 watcher：busy 从 true → false 时滚动到底部。
         * 确保 LLM 回复完成后显示最终内容。
         */
        watch(isBusy, (newVal, oldVal) => {
            if (!newVal && oldVal) {
                nextTick(() => {
                    scrollToBottom()
                    setTimeout(() => scrollToBottom(), 300)
                })
            }
        })

        // 组件卸载时清理：清除节流计时器、移除 scroll 事件监听
        onUnmounted(() => {
            if (saveThrottleTimer) clearTimeout(saveThrottleTimer)
            const el = containerRef.value
            if (el) el.removeEventListener('scroll', handleScroll)
        })
    }

    return {
        /** 用户是否向上滚动（控制 FAB 显示） */
        userScrolledUp,
        /** 滚动到底部（force=true 强制，false 仅在底部时跟随） */
        scrollToBottom,
        /** 注册所有 watcher（在 onMounted 中调用） */
        setupScrollWatchers,
        /** 恢复保存的滚动位置或滚动到底部（在 onMounted / 路由切换时调用） */
        restoreIfSaved,
    }
}
