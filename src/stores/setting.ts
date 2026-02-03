import { defineStore } from 'pinia'

// ==================== Types ====================
export interface UiSettings {
    gatewayUrl: string
    token: string
    sessionKey: string
    lastActiveSessionKey: string
    theme: 'light' | 'dark'
    isSidebarOpen: boolean
    isWideMode: boolean
    showBottomNav: boolean
    sessionsActiveDays: number
    asrToken: string // ASR API Key
    ttsEngine: 'qwen' | 'edge'
}

// ==================== Constants ====================
const CONFIG_KEY = 'openclaw_config'

const getDefaultSettings = (): UiSettings => ({
    gatewayUrl: '',
    token: '',
    sessionKey: '',
    lastActiveSessionKey: '',
    theme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    isSidebarOpen: false,
    isWideMode: false,
    showBottomNav: false,
    sessionsActiveDays: 3,
    asrToken: '',
    ttsEngine: 'qwen'
})

const loadConfig = (): UiSettings => {
    try {
        const saved = localStorage.getItem(CONFIG_KEY)
        if (saved) {
            return { ...getDefaultSettings(), ...JSON.parse(saved) }
        }
    } catch (e) {
        console.error('Failed to load config:', e)
    }
    return getDefaultSettings()
}

// ==================== Store ====================
export const useUiSettingsStore = defineStore('ui-settings', {
    state: (): UiSettings => loadConfig(),

    getters: {
        isConfigured: (state) => state.gatewayUrl.trim() !== '' && state.token.trim() !== '',
        authToken: (state) => state.token,
        isDark: (state) => state.theme === 'dark'
    },

    actions: {
        // Persist
        persist() {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(this.$state))
        },

        // Config
        save(newConfig?: Partial<UiSettings>) {
            if (newConfig) Object.assign(this.$state, newConfig)
            this.persist()
        },

        clear() {
            Object.assign(this.$state, getDefaultSettings())
            localStorage.removeItem(CONFIG_KEY)
        },

        // Sidebar
        toggleSidebar() {
            this.isSidebarOpen = !this.isSidebarOpen
            this.persist()
        },

        openSidebar() {
            this.isSidebarOpen = true
            this.persist()
        },

        closeSidebar() {
            this.isSidebarOpen = false
            this.persist()
        },

        // Theme
        applyTheme(t: 'light' | 'dark') {
            document.documentElement.setAttribute('data-theme', t)
        },

        toggleTheme() {
            this.theme = this.theme === 'dark' ? 'light' : 'dark'
            this.applyTheme(this.theme)
            this.persist()
        },

        initTheme() {
            this.applyTheme(this.theme)
        },

        // Layout
        toggleLayout() {
            this.isWideMode = !this.isWideMode
            this.persist()
        }
    }
})
