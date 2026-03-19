export interface AutoScrollOnScrollInput {
    /** 当前是否处于程序触发的自动滚动锁定期 */
    isAutoScrolling: boolean
    /** 当前是否仍接近底部 */
    nearBottom: boolean
    /** 当前滚动位置 */
    currentScrollTop: number
    /** 最近一次程序主动滚动到底部时的目标 scrollTop */
    lastAutoScrollTop: number
    /** 允许的用户手动打断阈值 */
    manualInterruptThreshold?: number
}

export interface AutoScrollOnScrollResult {
    isAutoScrolling: boolean
    userScrolledUp: boolean
}

/**
 * 处理消息列表 scroll 事件时的自动滚动状态转移。
 *
 * 根因：流式输出期间会连续触发 scrollToBottom()，旧逻辑在锁定期内直接忽略所有 scroll 事件，
 * 导致用户手动上滑无法打断自动滚动，表现为列表“卡住”，无法继续追到最早消息。
 *
 * 这里保留自动滚动锁对程序性滚动事件的屏蔽，但允许“明显偏离最近一次自动滚动目标”的上滑动作
 * 立即解除锁定并暂停后续自动滚动。
 */
export function resolveAutoScrollOnScroll(input: AutoScrollOnScrollInput): AutoScrollOnScrollResult {
    const threshold = input.manualInterruptThreshold ?? 24

    if (!input.isAutoScrolling) {
        return {
            isAutoScrolling: false,
            userScrolledUp: !input.nearBottom,
        }
    }

    const manuallyMovedAwayFromBottom =
        input.currentScrollTop < input.lastAutoScrollTop - threshold

    if (manuallyMovedAwayFromBottom) {
        return {
            isAutoScrolling: false,
            userScrolledUp: true,
        }
    }

    return {
        isAutoScrolling: true,
        userScrolledUp: false,
    }
}
