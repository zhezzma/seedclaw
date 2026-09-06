import { createRouter, createWebHistory } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'
import { ensureLocalServerLoaded, effectiveGatewayMode } from '../composables/local-server'

// Layouts
import MainLayout from '../layouts/MainLayout.vue'

// Views
import SetupView from '../views/SetupView.vue'
import HomeView from '../views/HomeView.vue'
import SettingsView from '../views/SettingsView.vue'
import ExtensionsView from '../views/ExtensionsView.vue'
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
                    path: 'extensions',
                    name: 'extensions',
                    component: ExtensionsView
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
    await ensureLocalServerLoaded()
    const configStore = useUiSettingsStore()

    // If route requires config and user is not configured
    if (to.meta.requiresConfig && !configStore.isConfigured) {
        if (effectiveGatewayMode() !== 'local') {
            next({ name: 'setup' })
            return
        }
    }

    // If user is on setup page but already configured
    if (to.name === 'setup' && configStore.isConfigured) {
        next({ name: 'home' })
        return
    }

    next()
})

export default router