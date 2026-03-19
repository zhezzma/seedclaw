export interface VirtualListHeightChange {
    key: string
    nextHeight: number
}

export interface VirtualScrollCompensationInput {
    /** 当前列表渲染顺序对应的稳定 key */
    orderedKeys: string[]
    /** 已测量高度表；未命中的 key 会退回 estimatedHeight */
    heights: Record<string, number>
    /** 未测量消息的预估高度 */
    estimatedHeight: number
    /** 当前滚动容器的 scrollTop */
    scrollTop: number
    /** 本轮 ResizeObserver 中检测到的高度变更 */
    changes: VirtualListHeightChange[]
}

/**
 * 计算虚拟列表在“上方消息真实高度回填”后需要补偿到 scrollTop 的像素值。
 *
 * 根因：初次从底部打开会话时，顶部大量旧消息尚未测量，只能使用估算高度。
 * 当用户向上滚动时，这些消息被挂载并测量出更大的真实高度；
 * 如果不把“视口上方已增长的高度差”同步加回 scrollTop，当前视口会被整体往下顶，
 * 体感上就像怎么上滑都到不了第一条消息。
 *
 * 这里只补偿“完全位于当前视口上方”的行，避免对正在视口内的行做强行位移。
 */
export function calculateVirtualScrollCompensation(input: VirtualScrollCompensationInput): number {
    if (input.scrollTop <= 0 || input.changes.length === 0 || input.orderedKeys.length === 0) {
        return 0
    }

    const changeMap = new Map(input.changes.map(change => [change.key, change.nextHeight]))

    let compensation = 0
    let top = 0

    for (const key of input.orderedKeys) {
        const previousHeight = input.heights[key] ?? input.estimatedHeight
        const bottom = top + previousHeight

        const nextHeight = changeMap.get(key)
        if (nextHeight !== undefined && bottom <= input.scrollTop) {
            compensation += nextHeight - previousHeight
        }

        top = bottom
    }

    return compensation
}
