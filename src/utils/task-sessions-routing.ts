import type { SessionCategory, SessionLike, TaskSessionsLocation } from './notification-routing'

export interface TaskSessionDetailLocation {
    name: 'tasks'
    params: { sessionkey: string }
}

export type TaskSessionRouteLocation = TaskSessionsLocation | TaskSessionDetailLocation
export type RouteNameLike = string | symbol | null | undefined

/**
 * 任务会话详情页的返回应优先使用浏览器历史记录。
 * 这样从“任务列表 -> 任务详情”进入时，返回不会再额外压入一个新的 /tasks，
 * 否则移动端在列表页再按一次返回会回到刚才的详情页。
 */
export const navigateBackFromTaskSession = (router: { back: () => void }) => {
    router.back()
}

/**
 * 通知跳进任务详情时，需要视当前路由决定是否先补一层任务列表历史：
 * - 当前已经在任务列表：直接打开详情
 * - 当前在其他页面 / 其他任务详情：先进入任务列表，再进入目标详情
 * 这样移动端从通知进入任务后，第一次返回回任务列表，第二次返回回到通知前页面。
 */
export const buildTaskSessionNotificationRoutePlan = (
    sessionKey: string,
    currentRouteName?: RouteNameLike,
    currentTaskSessionKey?: string,
): TaskSessionRouteLocation[] => {
    const detailLocation: TaskSessionDetailLocation = {
        name: 'tasks',
        params: { sessionkey: sessionKey },
    }

    const isOnTaskList = currentRouteName === 'tasks' && !currentTaskSessionKey
    const isOnSameTaskDetail = currentRouteName === 'tasks' && currentTaskSessionKey === sessionKey

    if (isOnTaskList || isOnSameTaskDetail) {
        return [detailLocation]
    }

    return [
        { name: 'tasks' },
        detailLocation,
    ]
}

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
