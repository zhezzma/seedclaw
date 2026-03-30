import { createRouter, createWebHistory } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { useSessionsState } from '../composables/useSessionsState'
import { resolveSessionRouteRedirect } from '../utils/notification-routing'
import { NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'

// Layouts
import MainLayout from '../layouts/MainLayout.vue'

// Views
import SetupView from '../views/SetupView.vue'
import HomeView from '../views/HomeView.vue'
import SettingsView from '../views/SettingsView.vue'
import AgentsView from '../views/AgentsView.vue'
import ModelsView from '../views/ModelsView.vue'
import SkillsView from '../views/SkillsView.vue'
import CronView from '../views/CronView.vue'
import LogView from '../views/LogView.vue'
import PromptsView from '../views/PromptsView.vue'



const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/setup',
            name: 'setup',
            component: SetupView
        },
        {
            path: '/',
            component: MainLayout,
            meta: { requiresConfig: true },
            children: [
                {
                    path: '',
                    name: 'home',
                    redirect: { name: 'chat' }
                },
                {
                    path: 'chat/:sessionkey?',
                    name: 'chat',
                    component: HomeView
                },
                {
                    path: 'tasks/:sessionkey?',
                    name: 'tasks',
                    component: HomeView
                },
                {
                    path: 'archived/:sessionkey?',
                    name: 'archived',
                    component: HomeView
                },
                {
                    path: 'new',
                    name: NEW_SESSION_ROUTE_NAME,
                    component: HomeView
                },
                {
                    path: 'settings',
                    name: 'settings',
                    component: SettingsView
                },
                {
                    path: 'agents',
                    name: 'agents',
                    component: AgentsView
                },
                {
                    path: 'models',
                    name: 'models',
                    component: ModelsView
                },
                {
                    path: 'skills',
                    name: 'skills',
                    component: SkillsView
                },
                {
                    path: 'cron',
                    name: 'cron',
                    component: CronView
                },
                {
                    path: 'logs',
                    name: 'logs',
                    component: LogView
                },
                {
                    path: 'file-viewer',
                    name: 'file-viewer',
                    component: () => import('../views/FileView.vue')
                },
                {
                    path: 'prompts',
                    name: 'prompts',
                    component: PromptsView
                },
                {
                    path: 'a2ui-demo',
                    name: 'a2ui-demo',
                    component: () => import('../views/A2UIDemoView.vue')
                }
            ]
        }
    ]
})

// Navigation guard to check config
router.beforeEach(async (to, _from, next) => {
    const configStore = useUiSettingsStore()

    // If route requires config and user is not configured
    if (to.meta.requiresConfig && !configStore.isConfigured) {
        next({ name: 'setup' })
        return
    }

    // If user is on setup page but already configured
    if (to.name === 'setup' && configStore.isConfigured) {
        next({ name: 'home' })
        return
    }

    const routeName = to.name === 'tasks'
        ? 'tasks'
        : (to.name === 'archived' ? 'archived' : (to.name === 'chat' ? 'chat' : undefined))
    const sessionKey = typeof to.params.sessionkey === 'string' ? to.params.sessionkey : undefined
    if (routeName && sessionKey) {
        const latestRouteState = await useSessionsState().resolveNotificationSessionRouteState(sessionKey)
        const redirect = resolveSessionRouteRedirect(routeName, latestRouteState, sessionKey)
        if (redirect.shouldRedirect && redirect.location) {
            next(redirect.location)
            return
        }
    }

    next()
})

export default router