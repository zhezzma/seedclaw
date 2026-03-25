export type ArrowKeyPriority = 'history' | 'suggestions' | 'none'

export interface ArrowKeyRoutingState {
    key: string
    commandSuggestionsVisible: boolean
    historyIndex: number
}

/**
 * 统一定义上下方向键的优先级。
 *
 * 根因：历史回溯到 `/command` 时会触发命令补全弹层，若仍然优先交给补全层，
 * 后续上下键就只能在补全项里移动，无法继续浏览历史。
 *
 * 规则：
 * 1. 只要已经处于历史浏览模式（historyIndex !== -1），上下键始终优先继续浏览历史。
 * 2. 仅在未进入历史浏览时，命令补全才接管上下键。
 */
export const decideArrowKeyPriority = ({
    key,
    commandSuggestionsVisible,
    historyIndex,
}: ArrowKeyRoutingState): ArrowKeyPriority => {
    if (key !== 'ArrowUp' && key !== 'ArrowDown') {
        return 'none'
    }

    if (historyIndex !== -1) {
        return 'history'
    }

    if (commandSuggestionsVisible) {
        return 'suggestions'
    }

    return 'none'
}

/**
 * 判断当前输入是否应该显示命令补全。
 *
 * 当输入值来自历史浏览时，不应立刻重新弹出补全层，
 * 否则会在视觉和交互上抢走用户继续翻历史的上下键。
 */
export const shouldOpenCommandSuggestions = (value: string, fromHistoryNavigation: boolean): boolean => {
    if (fromHistoryNavigation) {
        return false
    }

    return /^\/[^\s]*$/.test(value)
}
