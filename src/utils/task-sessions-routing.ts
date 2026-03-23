import type { SessionCategory, SessionLike, TaskSessionsLocation } from './notification-routing'

/**
 * 任务会话详情页的返回目标必须是稳定的列表路由，
 * 不能依赖浏览器 history 是否刚好存在上一页。
 */
export const buildTaskSessionBackLocation = (): TaskSessionsLocation => ({
    name: 'tasks',
})

/**
 * 首页默认恢复逻辑需要把普通会话与任务会话都视为“已存在会话”，
 * 否则 lastActiveSessionKey 指向任务会话时会误判为不存在。
 */
export const hasSessionInLists = (
    sessionId: string,
    defaultSessions: SessionLike[] = [],
    taskSessions: SessionLike[] = [],
): boolean => {
    if (!sessionId) return false
    return defaultSessions.some(session => session.id === sessionId)
        || taskSessions.some(session => session.id === sessionId)
}

export type { SessionCategory }
