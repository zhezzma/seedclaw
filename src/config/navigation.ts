import {
    Squares2X2Icon,
    DeviceTabletIcon,
    SparklesIcon,
    DocumentIcon,
    HomeIcon,
    Cog6ToothIcon,
    CubeIcon,
    ChatBubbleLeftRightIcon
} from '@heroicons/vue/24/outline'

import {
    HomeIcon as HomeIconSolid,
    Squares2X2Icon as Squares2X2IconSolid,
    Cog6ToothIcon as Cog6ToothIconSolid,
    DeviceTabletIcon as DeviceTabletIconSolid,
    SparklesIcon as SparklesIconSolid,
    DocumentIcon as DocumentIconSolid,
    CubeIcon as CubeIconSolid,
    ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid
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
        label: '首页',
        icon: HomeIcon,
        activeIcon: HomeIconSolid,
        route: 'home',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: '智能体',
        icon: Squares2X2Icon,
        activeIcon: Squares2X2IconSolid,
        route: 'agents',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: '模型',
        icon: CubeIcon,
        activeIcon: CubeIconSolid,
        route: 'models',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: '技能',
        icon: SparklesIcon,
        activeIcon: SparklesIconSolid,
        route: 'skills',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: '消息',
        icon: ChatBubbleLeftRightIcon,
        activeIcon: ChatBubbleLeftRightIconSolid,
        route: 'chat',
        query: { type: 'cron' },
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: '计划任务',
        icon: DocumentIcon,
        activeIcon: DocumentIconSolid,
        route: 'cron',
        showInSidebar: true,
        showInBottomNav: true
    },
    {
        label: '设置',
        icon: Cog6ToothIcon,
        activeIcon: Cog6ToothIconSolid,
        route: 'settings',
        showInSidebar: false, // Sidebar has a separate settings button usually
        showInBottomNav: true
    }
]

export const SIDEBAR_ITEMS = ALL_NAV_ITEMS.filter(item => item.showInSidebar)
export const BOTTOM_NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.showInBottomNav)
