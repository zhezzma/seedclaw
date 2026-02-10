import { type RouteLocationNormalized, type RouteLocationNormalizedLoaded } from 'vue-router'

export const NEW_SESSION_PATH = '/new'
export const NEW_SESSION_ROUTE_NAME = 'new-session'

export function isNewSession(route: RouteLocationNormalized | RouteLocationNormalizedLoaded | null | undefined): boolean {
    if (!route) return false
    return route.path === NEW_SESSION_PATH
}
