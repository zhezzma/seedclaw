import { createRouter, createWebHistory } from 'vue-router'
import { useConfigStore } from '../stores/config'

// Layouts
import MainLayout from '../layouts/MainLayout.vue'

// Views
import SetupView from '../views/SetupView.vue'
import HomeView from '../views/HomeView.vue'
import SettingsView from '../views/SettingsView.vue'
import AgentsView from '../views/AgentsView.vue'
import MessagesView from '../views/MessagesView.vue'

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
                    path: 'messages',
                    name: 'messages',
                    component: MessagesView
                }
            ]
        }
    ]
})

// Navigation guard to check config
router.beforeEach((to, _from, next) => {
    const configStore = useConfigStore()

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

    next()
})

export default router
