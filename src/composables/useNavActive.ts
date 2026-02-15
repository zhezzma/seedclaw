import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'

import { useChatState } from './useChatState'
import { NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'

export interface NavItem {
    route: string
    query?: Record<string, string>
    label?: string
    icon?: any
    activeIcon?: any
}



export function useNavActive() {
    const router = useRouter()
    const route = useRoute()
    const chatState = useChatState()

    const isHomeActive = computed(() => {
        const currentRoute = router.currentRoute.value
        // Exclude new session route
        if (currentRoute.name == NEW_SESSION_ROUTE_NAME) {
            return true
        }

        // Check if current route is home/chat
        if (currentRoute.name !== 'home' && currentRoute.name !== 'chat') {
            return false
        }

        // Exclude any special modes with query.type (e.g., type=cron for Messages)
        if (currentRoute.query.type) {
            return false
        }
        // Check if current session is an agent main session
        const currentKey = chatState.sessionKey
        // Also include empty session key (default home) or specific main sessions
        return !currentKey
    })

    const isItemActive = (item: NavItem) => {
        const currentRoute = router.currentRoute.value

        if (item.route === 'home') {
            return isHomeActive.value
        }

        if (item.route === currentRoute.name) {
            // If item has specific query params (e.g. type=cron), they must match
            if (item.query && Object.keys(item.query).length > 0) {
                return Object.keys(item.query).every(k => currentRoute.query[k] === item.query![k])
            }

            // For items without specific query, check if we're not in a special mode
            // If currentRoute has query.type but item doesn't expect it, don't match
            if (currentRoute.query.type && (!item.query || !item.query.type)) {
                return false
            }

            return true
        }

        return false
    }

    /**
     * Get the active tab/route name for bottom nav
     * Returns the route name that should be considered active
     */
    const getActiveTab = computed(() => {
        const currentName = route.name as string

        // Check if we effectively are on 'home' (which includes 'chat' with main session)
        if (currentName === 'home' || currentName === 'chat' || currentName === NEW_SESSION_ROUTE_NAME) {
            // Special case for special modes (type query param)
            if (route.query.type) {
                return 'chat' // This matches the route name for special items like Messages
            }

            const currentKey = route.params.sessionkey as string

            // If no key, or key is main agent session, or key is default session -> it's Home
            if (!currentKey) {
                return 'home'
            }
        }

        return currentName
    })

    return {
        isHomeActive,
        isItemActive,
        getActiveTab
    }
}
