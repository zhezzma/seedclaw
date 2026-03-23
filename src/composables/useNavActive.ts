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

        const currentKey = chatState.sessionKey
        return !currentKey
    })

    const isItemActive = (item: NavItem) => {
        const currentRoute = router.currentRoute.value

        if (item.route === 'home') {
            return isHomeActive.value
        }

        if (item.route === currentRoute.name) {
            if (item.query && Object.keys(item.query).length > 0) {
                return Object.keys(item.query).every(k => currentRoute.query[k] === item.query![k])
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

        if (currentName === 'home' || currentName === 'chat' || currentName === NEW_SESSION_ROUTE_NAME) {
            const currentKey = route.params.sessionkey as string
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
