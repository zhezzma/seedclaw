import { ref, watch, nextTick, onUnmounted, type Ref, type ComputedRef } from 'vue'

/**
 * useScrollManager — 管理聊天消息虚拟列表的智能滚动行为
 *
 * 职责：
 * 1. 跟踪用户是否向上滚动（控制 "回到底部" FAB 显示 & 自动滚动暂停）
 * 2. 提供 scrollToBottom（支持自动 & 强制模式）
 * 3. 按 sessionKey 保存/恢复滚动位置（混合策略：anchor 优先，异常场景退回 scrollTop）
 * 4. 绑定 scroll/loading/busy/session-switch 等 watcher
 *
 * 保存/恢复原理：
 * - 保存时：优先记录稳定消息锚点（entryId + offset）；若当前视口只有明显不稳定的超高候选，改存 absolute scrollTop
 * - 恢复时：anchor 模式通过 data-key 找回目标元素并微调到原视觉位置；scrollTop 模式直接恢复绝对位置并做短时稳定校正
 * - 恢复期间临时抑制 auto-bottom，同步避免刚恢复又被非用户滚动抢回到底部
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

/**
 * 保存的滚动位置。
 *
 * 两种模式：
 * 1. anchor：常规情况，保存 entryId + 相对偏移，能更稳地跟随虚拟列表重排。
 * 2. scrollTop：当视口内只有超高候选（超长消息 / spacer）时，直接保存绝对 scrollTop
 *    反而比错误锚点更可靠。
 */
interface SavedScrollPositionByAnchor {
    /** 锚定消息的 entryId（用于在 DOM 中查找元素） */
    entryId: string
    /** 该消息行顶部到容器可视区域顶部的像素距离（保存时刻的视觉位置） */
    offset: number
    type: 'anchor'
}

interface SavedScrollPositionByScrollTop {
    /** 直接保存绝对 scrollTop，作为超高候选场景下的最小兜底。 */
    scrollTop: number
    type: 'scrollTop'
}

type SavedScrollPosition = SavedScrollPositionByAnchor | SavedScrollPositionByScrollTop

/** 判定"接近底部"的阈值（像素） */
const SCROLL_THRESHOLD = 50
/** 滚动事件保存位置的节流间隔（毫秒） */
const SAVE_THROTTLE_MS = 300

export interface ScrollMetrics {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
}

export interface ScrollStateAfterNonUserChange {
    nextUserScrolledUp: boolean
    shouldScrollToBottom: boolean
}

export interface ScrollAnchorCandidate {
    key: string
    top: number
    bottom: number
    height: number
}

export interface ScrollSaveTargetOptions {
    scrollTop: number
    viewportHeight: number
    rowCandidates: ScrollAnchorCandidate[]
    fallbackCandidates: ScrollAnchorCandidate[]
}

export type ScrollSaveTarget =
    | { type: 'anchor'; entryId: string; offset: number }
    | { type: 'scrollTop'; scrollTop: number }
    | null

export interface ScrollTopStabilizationOptions {
    expectedScrollTop: number
    actualScrollTop: number
    attempts: number
}

export interface AutoBottomSyncSuppressionOptions {
    isRestoringSavedPosition: boolean
    hasSavedPosition: boolean
}

const isNearBottomByMetrics = (metrics: ScrollMetrics, threshold = SCROLL_THRESHOLD): boolean => {
    if (metrics.scrollHeight <= metrics.clientHeight + 1) return true
    return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}

/**
 * 非用户主动滚动（如新消息、内容清空、键盘弹起导致视口变化）后的滚动状态决策。
 *
 * 规则：
 * 1. 内容已经贴底/不再溢出时，直接隐藏 FAB。
 * 2. 如果用户此前没有手动上滑，则继续保持贴底锚定。
 * 3. 只有用户确实手动上滑过，才继续显示 FAB，且不强制抢回到底部。
 */
export const getScrollStateAfterNonUserChange = (
    metrics: ScrollMetrics,
    userScrolledUp: boolean,
    threshold = SCROLL_THRESHOLD,
): ScrollStateAfterNonUserChange => {
    if (isNearBottomByMetrics(metrics, threshold)) {
        return {
            nextUserScrolledUp: false,
            shouldScrollToBottom: false,
        }
    }

    if (!userScrolledUp) {
        return {
            nextUserScrolledUp: false,
            shouldScrollToBottom: true,
        }
    }

    return {
        nextUserScrolledUp: true,
        shouldScrollToBottom: false,
    }
}

const isReasonableAnchorCandidate = (candidate: ScrollAnchorCandidate, viewportHeight: number): boolean => {
    // 巨型候选（常见于超长上下文的 spacer / 超高消息）会把恢复直接带偏。
    // 这里不追求“必须找到锚点”，而是先排除明显不稳定的候选，再让上层决定是否退回 absolute scrollTop。
    if (candidate.height > viewportHeight * 3) return false
    if (candidate.top < -viewportHeight) return false
    return true
}

const selectRowAnchorCandidate = (candidates: ScrollAnchorCandidate[], viewportHeight: number): ScrollAnchorCandidate | null => {
    for (const candidate of candidates) {
        if (candidate.bottom <= 0) continue
        if (candidate.top >= viewportHeight) continue
        if (!isReasonableAnchorCandidate(candidate, viewportHeight)) continue
        if (candidate.top >= -candidate.height / 2) return candidate
    }
    return null
}

/**
 * 选择本次保存使用的目标。
 *
 * 优先级：
 * 1. 视口内的正常 row 锚点
 * 2. 视口内且形态合理的 fallback 候选
 * 3. 如果两者都不可靠，则直接退回 absolute scrollTop
 *
 * 不直接“一律保存 scrollTop”的原因：
 * - 不同 session 的总高度会因虚拟列表估算、流式输出、图片/代码块延迟测量而变化；
 * - 纯 scrollTop 在这些场景下会丢失“我正在看哪一条消息”的语义；
 * - 因此只有在锚点明显不可靠时，才退回 scrollTop 兜底。
 */
export const selectScrollSaveTarget = ({
    scrollTop,
    viewportHeight,
    rowCandidates,
    fallbackCandidates,
}: ScrollSaveTargetOptions): ScrollSaveTarget => {
    const rowAnchor = selectRowAnchorCandidate(rowCandidates, viewportHeight)
    if (rowAnchor) {
        return {
            type: 'anchor',
            entryId: rowAnchor.key,
            offset: rowAnchor.top,
        }
    }

    const fallback = fallbackCandidates.find(candidate => {
        if (candidate.bottom <= 0) return false
        if (candidate.top >= viewportHeight) return false
        return isReasonableAnchorCandidate(candidate, viewportHeight)
    })

    if (fallback) {
        return {
            type: 'anchor',
            entryId: fallback.key,
            offset: fallback.top,
        }
    }

    return {
        type: 'scrollTop',
        scrollTop,
    }
}

/**
 * scrollTop 兜底恢复后的短时稳定判定。
 *
 * 绝对 scrollTop 在恢复后仍可能被虚拟列表重算、内容高度更新等因素顶开，
 * 因此允许在极短时间内重复校正几次，但只用于 scrollTop 兜底分支，
 * 不把整个恢复流程扩展成通用轮询。
 */
export const shouldContinueScrollTopStabilization = ({
    expectedScrollTop,
    actualScrollTop,
    attempts,
}: ScrollTopStabilizationOptions): boolean => {
    if (attempts >= 5) return false
    return Math.abs(actualScrollTop - expectedScrollTop) > 24
}

/**
 * 在“已有保存位置的恢复阶段”临时屏蔽 auto-bottom 同步。
 *
 * 这是本次 bug 的关键之一：如果恢复刚把用户带回历史位置，
 * container/messages/streaming 的非用户变化又立刻执行 scrollToBottom(true)，
 * 就会把恢复结果再次冲掉。
 */
export const shouldSuppressAutoBottomSync = ({
    isRestoringSavedPosition,
    hasSavedPosition,
}: AutoBottomSyncSuppressionOptions): boolean => {
    return isRestoringSavedPosition && hasSavedPosition
}

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
    /** 当前是否正在恢复已有保存位置；用于抑制恢复期间的自动贴底。 */
    let isRestoringSavedPosition = false
    /** 容器尺寸观察器：用于捕捉键盘弹起/收起、输入框高度变化等布局变化 */
    let containerResizeObserver: ResizeObserver | null = null

    // ── 工具方法 ─────────────────────────────────────────────────────

    const getScrollMetrics = (): ScrollMetrics | null => {
        const el = containerRef.value
        if (!el) return null
        return {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
        }
    }

    /**
     * 判断滚动容器是否接近底部。
     * 用于决定是否显示 "回到底部" FAB 以及是否自动跟随新消息。
     */
    const isNearBottom = (): boolean => {
        const metrics = getScrollMetrics()
        if (!metrics) return true
        return isNearBottomByMetrics(metrics)
    }

    /**
     * 处理非用户主动滚动引起的几何变化：
     * - 新消息/流式输出导致 scrollHeight 改变
     * - /reset 清空消息后不再溢出
     * - 移动端键盘弹起/收起导致 viewport / clientHeight 改变
     */
    const syncScrollStateAfterNonUserChange = () => {
        const metrics = getScrollMetrics()
        if (!metrics) {
            userScrolledUp.value = false
            return
        }

        if (shouldSuppressAutoBottomSync({
            isRestoringSavedPosition,
            hasSavedPosition: !!state.sessionKey && scrollPositionMap.has(state.sessionKey),
        })) {
            return
        }

        const decision = getScrollStateAfterNonUserChange(metrics, userScrolledUp.value)
        if (decision.shouldScrollToBottom) {
            scrollToBottom(true)
            return
        }

        userScrolledUp.value = decision.nextUserScrolledUp
    }

    const handleViewportResize = () => {
        if (isAutoScrolling.value) return
        syncScrollStateAfterNonUserChange()
    }

    const bindContainerResizeObserver = (el: HTMLElement | null) => {
        if (containerResizeObserver) {
            containerResizeObserver.disconnect()
            containerResizeObserver = null
        }

        if (!el || typeof ResizeObserver === 'undefined') return

        containerResizeObserver = new ResizeObserver(() => {
            if (isAutoScrolling.value) return
            syncScrollStateAfterNonUserChange()
        })
        containerResizeObserver.observe(el)
    }

    // ── 保存位置 ─────────────────────────────────────────────────────

    /**
     * 保存当前会话的滚动位置。
     *
     * 常规路径仍然优先保存“消息锚点”（entryId + offset），
     * 只有当当前视口里能拿到的候选明显不稳定（超高 row / spacer）时，
     * 才退回保存 absolute scrollTop。
     *
     * 这样做比“永远只存 scrollTop”更稳：
     * - 正常消息列表依然保留语义化锚点；
     * - 超长上下文 / 流式变化场景下避免把坏锚点存进去。
     */
    const saveCurrentPosition = () => {
        const sessionKey = state.sessionKey
        const el = containerRef.value
        if (!el || !sessionKey) return

        const containerRect = el.getBoundingClientRect()
        const rowCandidates = Array.from(el.querySelectorAll<HTMLElement>('.virtual-row[data-key]')).map(row => {
            const rect = row.getBoundingClientRect()
            return {
                key: row.dataset.key!,
                top: rect.top - containerRect.top,
                bottom: rect.bottom - containerRect.top,
                height: rect.height,
            }
        })

        const fallbackCandidates = Array.from(el.querySelectorAll<HTMLElement>('[data-key]')).map(node => {
            const rect = node.getBoundingClientRect()
            return {
                key: node.dataset.key!,
                top: rect.top - containerRect.top,
                bottom: rect.bottom - containerRect.top,
                height: rect.height,
            }
        })

        const target = selectScrollSaveTarget({
            scrollTop: el.scrollTop,
            viewportHeight: el.clientHeight,
            rowCandidates,
            fallbackCandidates,
        })

        if (!target) return

        if (target.type === 'anchor') {
            scrollPositionMap.set(sessionKey, {
                type: 'anchor',
                entryId: target.entryId,
                offset: target.offset,
            })
            return
        }

        scrollPositionMap.set(sessionKey, {
            type: 'scrollTop',
            scrollTop: target.scrollTop,
        })
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

        isAutoScrolling.value = true

        if (saved.type === 'scrollTop') {
            // 进入恢复态后，短时间内屏蔽 auto-bottom，避免恢复结果立即被 watcher 抢走。
            isRestoringSavedPosition = true
            let attempts = 0
            const stabilize = () => {
                el.scrollTop = saved.scrollTop

                // scrollTop 兜底分支允许短时间内重复校正，
                // 避免刚恢复就被虚拟列表/内容高度更新顶开。
                setTimeout(() => {
                    if (shouldContinueScrollTopStabilization({
                        expectedScrollTop: saved.scrollTop,
                        actualScrollTop: el.scrollTop,
                        attempts,
                    })) {
                        attempts += 1
                        stabilize()
                        return
                    }

                    isRestoringSavedPosition = false
                    isAutoScrolling.value = false
                    userScrolledUp.value = !isNearBottom()
                }, 120)
            }

            stabilize()
            return true
        }

        // 查找目标元素（spacer 和 row 都有 data-key 属性）
        const target = el.querySelector<HTMLElement>(`[data-key="${saved.entryId}"]`)
        if (!target) {
            isRestoringSavedPosition = false
            isAutoScrolling.value = false
            return false
        }

        // 第一步：粗定位 — 将目标滚动到保存时的视口位置
        isRestoringSavedPosition = true
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
                isRestoringSavedPosition = false
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
        // 绑定当前容器的 scroll / resize 监听
        const el = containerRef.value
        if (el) {
            el.addEventListener('scroll', handleScroll, { passive: true })
            bindContainerResizeObserver(el)
        }

        const viewportTarget = typeof window !== 'undefined' ? window.visualViewport : null
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', handleViewportResize, { passive: true })
        }
        viewportTarget?.addEventListener('resize', handleViewportResize, { passive: true })

        // 容器 ref 变化时重新绑定（理论上不常触发，作为安全保障）
        watch(containerRef, (newEl, oldEl) => {
            if (oldEl) oldEl.removeEventListener('scroll', handleScroll)
            if (newEl) newEl.addEventListener('scroll', handleScroll, { passive: true })
            bindContainerResizeObserver(newEl)

            if (newEl) {
                nextTick(() => syncScrollStateAfterNonUserChange())
            } else {
                userScrolledUp.value = false
            }
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

        // 消息列表变化后同步滚动状态：
        // - 用户贴底时继续贴底
        // - /reset 清空后若内容已不溢出，立即隐藏 FAB
        watch(messages, () => {
            nextTick(() => syncScrollStateAfterNonUserChange())
        }, { deep: true })

        // 流式输出内容变化时同步到底部/按钮状态
        watch(() => streamingText.value, () => {
            nextTick(() => syncScrollStateAfterNonUserChange())
        })

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

        // 组件卸载时清理：清除节流计时器、移除 scroll / resize 监听
        onUnmounted(() => {
            if (saveThrottleTimer) clearTimeout(saveThrottleTimer)
            const el = containerRef.value
            if (el) el.removeEventListener('scroll', handleScroll)
            if (typeof window !== 'undefined') {
                window.removeEventListener('resize', handleViewportResize)
                window.visualViewport?.removeEventListener('resize', handleViewportResize)
            }
            if (containerResizeObserver) {
                containerResizeObserver.disconnect()
                containerResizeObserver = null
            }
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
