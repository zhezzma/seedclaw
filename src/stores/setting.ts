import { defineStore } from 'pinia'

// ==================== Types ====================
export interface UiSettings {
    apiBaseUrl: string
    token: string
    deviceName: string
    lastActiveSessionKey: string
    theme: 'light' | 'dark'
    isSidebarOpen: boolean
    isWideMode: boolean
    showBottomNav: boolean
    sessionsActiveDays: number
    asrToken: string // ASR API Key
    asrEngine: string
    asrModel: string
    ttsEngine: 'qwen' | 'edge'
    ttsToken: string // TTS API Key (if different from ASR)
    ttsModel: string
    silenceDuration: number // Auto-send delay in ms
    autoSendCommands: boolean // Whether to auto-send after selecting a command
    homePageBehavior: 'new_session' | 'last_active_session'  // Default action on home page
    gotifyUrl: string
    gotifyToken: string
    assistantMsgMerge: boolean
    language: 'zh' | 'en'
    showAllProviders: boolean  // 是否显示没有 apiKey 的提供商
}

// ==================== Constants ====================
const CONFIG_KEY = 'openclaw_config'

const getDefaultSettings = (): UiSettings => ({
    apiBaseUrl: '',
    token: '',
    deviceName: "SeedClaw",
    lastActiveSessionKey: '',
    theme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    isSidebarOpen: false,
    isWideMode: true,
    showBottomNav: false,
    sessionsActiveDays: 3,
    asrToken: '',
    asrEngine: 'fun-asr',
    asrModel: '',
    ttsEngine: 'edge',
    ttsToken: '',
    ttsModel: '',
    silenceDuration: 2000,
    autoSendCommands: true,
    homePageBehavior: 'new_session',
    gotifyUrl: '',
    gotifyToken: '',
    assistantMsgMerge: true,
    language: 'zh',
    showAllProviders: true
})

const loadConfig = (): UiSettings => {
    try {
        const saved = localStorage.getItem(CONFIG_KEY)
        if (saved) {
            const parsed = JSON.parse(saved)
            // Migrate: old gatewayUrl → apiBaseUrl
            if (parsed.gatewayUrl && !parsed.apiBaseUrl) {
                // Convert ws:// to http:// if needed
                let url = parsed.gatewayUrl as string
                url = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
                parsed.apiBaseUrl = url
                delete parsed.gatewayUrl
            }
            return { ...getDefaultSettings(), ...parsed }
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
        isConfigured: (state) => state.apiBaseUrl.trim() !== '' && state.token.trim() !== '',
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

        // Session Key
        setLastActiveSessionKey(key: string) {
            this.lastActiveSessionKey = key
            this.persist()
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
        },

        // Language
        setLanguage(lang: 'zh' | 'en') {
            this.language = lang
            import('../i18n').then(({ i18n }) => {
                if (i18n.global.locale instanceof Object) {
                    // @ts-ignore
                    i18n.global.locale.value = lang
                } else {
                    // @ts-ignore
                    i18n.global.locale = lang
                }
            })
            this.persist()
        },

        initLanguage() {
            const lang = this.language
            import('../i18n').then(({ i18n }) => {
                if (i18n.global.locale instanceof Object) {
                    // @ts-ignore
                    i18n.global.locale.value = lang
                } else {
                    // @ts-ignore
                    i18n.global.locale = lang
                }
            })
        }
    }
})
