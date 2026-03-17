import {
    Squares2X2Icon,
    DeviceTabletIcon,
    SparklesIcon,
    DocumentIcon,
    HomeIcon,
    Cog6ToothIcon,
    CubeIcon,
    ChatBubbleLeftRightIcon,
    DocumentTextIcon
} from '@heroicons/vue/24/outline'

import {
    HomeIcon as HomeIconSolid,
    Squares2X2Icon as Squares2X2IconSolid,
    Cog6ToothIcon as Cog6ToothIconSolid,
    DeviceTabletIcon as DeviceTabletIconSolid,
    SparklesIcon as SparklesIconSolid,
    DocumentIcon as DocumentIconSolid,
    CubeIcon as CubeIconSolid,
    ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
    DocumentTextIcon as DocumentTextIconSolid
} from '@heroicons/vue/24/solid'

export interface NavItem {
    label: string
    icon: any
    route: string
    query?: Record<string, string>
    activeIcon?: any
    showInSidebar?: boolean
    showInBottomNav?: boolean
}

export const ALL_NAV_ITEMS: NavItem[] = [
    {
        label: 'sidebar.home',
        icon: HomeIcon,
        activeIcon: HomeIconSolid,
        route: 'home',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: 'agent.agents',
        icon: Squares2X2Icon,
        activeIcon: Squares2X2IconSolid,
        route: 'agents',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: 'sidebar.chat',
        icon: ChatBubbleLeftRightIcon,
        activeIcon: ChatBubbleLeftRightIconSolid,
        route: 'chat',
        query: { type: 'cron' },
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: 'sidebar.models',
        icon: CubeIcon,
        activeIcon: CubeIconSolid,
        route: 'models',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: 'sidebar.skills',
        icon: SparklesIcon,
        activeIcon: SparklesIconSolid,
        route: 'skills',
        showInSidebar: false,
        showInBottomNav: false
    },

    {
        label: 'sidebar.cron',
        icon: DocumentIcon,
        activeIcon: DocumentIconSolid,
        route: 'cron',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: 'prompt.title',
        icon: DocumentTextIcon,
        activeIcon: DocumentTextIconSolid,
        route: 'prompts',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: 'settings.title',
        icon: Cog6ToothIcon,
        activeIcon: Cog6ToothIconSolid,
        route: 'settings',
        showInSidebar: false, // Sidebar has a separate settings button usually
        showInBottomNav: true
    }
]

export const SIDEBAR_ITEMS = ALL_NAV_ITEMS.filter(item => item.showInSidebar)
export const BOTTOM_NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.showInBottomNav)
