import { defineStore } from 'pinia'

export type ASREngineType = 'fun-asr' | 'voice-gateway'
export type TTSEngineType = 'edge' | 'qwen' | 'voice-gateway'

export interface EngineConfig<T extends string> {
    engine: T
    baseUrl: string
    token: string
    model: string
}

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
    asrEngine: ASREngineType
    ttsEngine: TTSEngineType
    asrConfigs: EngineConfig<ASREngineType>[]
    ttsConfigs: EngineConfig<TTSEngineType>[]
    silenceDuration: number
    autoSendCommands: boolean
    homePageBehavior: 'new_session' | 'last_active_session'
    gotifyUrl: string
    gotifyToken: string
    assistantMsgMerge: boolean
    language: 'zh' | 'en'
    showAllProviders: boolean
    externalUrl: string
}

const CONFIG_KEY = 'openclaw_config'
const DEFAULT_VOICE_GATEWAY_URL = 'https://voice.godgodgame.com'

const defaultAsrConfigs = (): EngineConfig<ASREngineType>[] => ([
    { engine: 'fun-asr', baseUrl: '', token: '', model: '' },
    { engine: 'voice-gateway', baseUrl: DEFAULT_VOICE_GATEWAY_URL, token: '', model: '@cf/openai/whisper-large-v3-turbo' },
])

const defaultTtsConfigs = (): EngineConfig<TTSEngineType>[] => ([
    { engine: 'edge', baseUrl: '', token: '', model: '' },
    { engine: 'qwen', baseUrl: '', token: '', model: '' },
    { engine: 'voice-gateway', baseUrl: DEFAULT_VOICE_GATEWAY_URL, token: '', model: 'gemini-3.1-flash-tts-preview' },
])

const cloneEngineConfig = <T extends string>(config: EngineConfig<T>): EngineConfig<T> => ({ ...config })

const getDefaultAsrConfig = (engine: ASREngineType): EngineConfig<ASREngineType> => {
    const config = defaultAsrConfigs().find((item) => item.engine === engine)
    return config ? cloneEngineConfig(config) : { engine, baseUrl: '', token: '', model: '' }
}

const getDefaultTtsConfig = (engine: TTSEngineType): EngineConfig<TTSEngineType> => {
    const config = defaultTtsConfigs().find((item) => item.engine === engine)
    return config ? cloneEngineConfig(config) : { engine, baseUrl: '', token: '', model: '' }
}

const normalizeEngineConfig = <T extends string>(
    config: Partial<EngineConfig<T>> | null | undefined,
    fallback: EngineConfig<T>,
): EngineConfig<T> => ({
    engine: (config?.engine ?? fallback.engine) as T,
    baseUrl: typeof config?.baseUrl === 'string' ? config.baseUrl : fallback.baseUrl,
    token: typeof config?.token === 'string' ? config.token : fallback.token,
    model: typeof config?.model === 'string' ? config.model : fallback.model,
})

const mergeEngineConfigs = <T extends string>(
    defaults: EngineConfig<T>[],
    saved: unknown,
): EngineConfig<T>[] => {
    const merged = defaults.map((config) => cloneEngineConfig(config))

    if (!Array.isArray(saved)) {
        return merged
    }

    for (const rawItem of saved) {
        if (!rawItem || typeof rawItem !== 'object') {
            continue
        }

        const item = rawItem as Partial<EngineConfig<T>>
        const engine = typeof item.engine === 'string' ? item.engine as T : null
        if (!engine) {
            continue
        }

        const existingIndex = merged.findIndex((config) => config.engine === engine)
        const fallback = existingIndex >= 0
            ? merged[existingIndex]
            : { engine, baseUrl: '', token: '', model: '' }
        const normalized = normalizeEngineConfig(item, fallback)

        if (existingIndex >= 0) {
            merged[existingIndex] = normalized
        } else {
            merged.push(normalized)
        }
    }

    return merged
}

const upsertConfigInList = <T extends string>(
    list: EngineConfig<T>[],
    config: EngineConfig<T>,
): EngineConfig<T>[] => {
    const next = list.map((item) => cloneEngineConfig(item))
    const index = next.findIndex((item) => item.engine === config.engine)

    if (index >= 0) {
        next[index] = cloneEngineConfig(config)
    } else {
        next.push(cloneEngineConfig(config))
    }

    return next
}

const migrateLegacyVoiceSettings = (parsed: any, next: UiSettings): UiSettings => {
    const asrConfigs = mergeEngineConfigs(defaultAsrConfigs(), parsed?.asrConfigs)
    const ttsConfigs = mergeEngineConfigs(defaultTtsConfigs(), parsed?.ttsConfigs)

    const asrEngine: ASREngineType = parsed?.asrEngine === 'voice-gateway' ? 'voice-gateway' : 'fun-asr'
    const ttsEngine: TTSEngineType = parsed?.ttsEngine === 'qwen' || parsed?.ttsEngine === 'voice-gateway'
        ? parsed.ttsEngine
        : 'edge'

    const legacyVoiceGatewayUrl = typeof parsed?.voiceGatewayUrl === 'string' ? parsed.voiceGatewayUrl : ''
    const legacyVoiceGatewayToken = typeof parsed?.voiceGatewayToken === 'string' ? parsed.voiceGatewayToken : ''
    const legacyAsrToken = typeof parsed?.asrToken === 'string' ? parsed.asrToken : ''
    const legacyAsrModel = typeof parsed?.asrModel === 'string' ? parsed.asrModel : ''
    const legacyTtsToken = typeof parsed?.ttsToken === 'string' ? parsed.ttsToken : ''
    const legacyTtsModel = typeof parsed?.ttsModel === 'string' ? parsed.ttsModel : ''

    const applyPatch = <T extends string>(
        list: EngineConfig<T>[],
        engine: T,
        patch: Partial<Omit<EngineConfig<T>, 'engine'>>,
        getFallback: (engine: T) => EngineConfig<T>,
    ) => {
        const current = list.find((item) => item.engine === engine) ?? getFallback(engine)
        const nextConfig = normalizeEngineConfig({
            ...current,
            engine,
            ...patch,
        }, current)
        const updated = upsertConfigInList(list, nextConfig)
        list.splice(0, list.length, ...updated)
    }

    if (legacyVoiceGatewayUrl || legacyVoiceGatewayToken) {
        applyPatch(asrConfigs, 'voice-gateway', {
            baseUrl: legacyVoiceGatewayUrl || (asrConfigs.find((item) => item.engine === 'voice-gateway')?.baseUrl ?? getDefaultAsrConfig('voice-gateway').baseUrl),
            token: legacyVoiceGatewayToken || (asrConfigs.find((item) => item.engine === 'voice-gateway')?.token ?? ''),
        }, getDefaultAsrConfig)

        applyPatch(ttsConfigs, 'voice-gateway', {
            baseUrl: legacyVoiceGatewayUrl || (ttsConfigs.find((item) => item.engine === 'voice-gateway')?.baseUrl ?? getDefaultTtsConfig('voice-gateway').baseUrl),
            token: legacyVoiceGatewayToken || (ttsConfigs.find((item) => item.engine === 'voice-gateway')?.token ?? ''),
        }, getDefaultTtsConfig)
    }

    if (legacyAsrToken || legacyAsrModel) {
        const targetEngine: ASREngineType = asrEngine === 'voice-gateway' ? 'voice-gateway' : 'fun-asr'
        applyPatch(asrConfigs, targetEngine, {
            token: legacyAsrToken || (asrConfigs.find((item) => item.engine === targetEngine)?.token ?? ''),
            model: legacyAsrModel || (asrConfigs.find((item) => item.engine === targetEngine)?.model ?? ''),
        }, getDefaultAsrConfig)
    }

    if ((legacyTtsToken || legacyTtsModel) && (ttsEngine === 'qwen' || ttsEngine === 'voice-gateway')) {
        const targetEngine: TTSEngineType = ttsEngine
        applyPatch(ttsConfigs, targetEngine, {
            token: legacyTtsToken || (ttsConfigs.find((item) => item.engine === targetEngine)?.token ?? ''),
            model: legacyTtsModel || (ttsConfigs.find((item) => item.engine === targetEngine)?.model ?? ''),
        }, getDefaultTtsConfig)
    }

    const {
        asrToken: _legacyAsrToken,
        asrModel: _legacyAsrModel,
        ttsToken: _legacyTtsToken,
        ttsModel: _legacyTtsModel,
        voiceGatewayUrl: _legacyVoiceGatewayUrl,
        voiceGatewayToken: _legacyVoiceGatewayToken,
        ...rest
    } = next as UiSettings & Record<string, unknown>

    return {
        ...(rest as UiSettings),
        asrEngine,
        ttsEngine,
        asrConfigs,
        ttsConfigs,
    }
}

const getDefaultSettings = (): UiSettings => ({
    apiBaseUrl: '',
    token: '',
    deviceName: 'SeedClaw',
    lastActiveSessionKey: '',
    theme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    isSidebarOpen: false,
    isWideMode: true,
    showBottomNav: false,
    sessionsActiveDays: 3,
    asrEngine: 'fun-asr',
    ttsEngine: 'edge',
    asrConfigs: defaultAsrConfigs(),
    ttsConfigs: defaultTtsConfigs(),
    silenceDuration: 2000,
    autoSendCommands: true,
    homePageBehavior: 'new_session',
    gotifyUrl: '',
    gotifyToken: '',
    assistantMsgMerge: true,
    language: 'zh',
    showAllProviders: true,
    externalUrl: '',
})

const loadConfig = (): UiSettings => {
    try {
        const saved = localStorage.getItem(CONFIG_KEY)
        if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed.gatewayUrl && !parsed.apiBaseUrl) {
                let url = parsed.gatewayUrl as string
                url = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
                parsed.apiBaseUrl = url
                delete parsed.gatewayUrl
            }

            const defaults = getDefaultSettings()
            const merged: UiSettings = {
                ...defaults,
                ...parsed,
                asrConfigs: defaults.asrConfigs,
                ttsConfigs: defaults.ttsConfigs,
            }

            const normalized = migrateLegacyVoiceSettings(parsed, merged)
            const serializedSaved = JSON.stringify(parsed)
            const serializedNormalized = JSON.stringify(normalized)

            if (serializedSaved !== serializedNormalized) {
                localStorage.setItem(CONFIG_KEY, serializedNormalized)
            }

            return normalized
        }
    } catch (e) {
        console.error('Failed to load config:', e)
    }
    return getDefaultSettings()
}

export const useUiSettingsStore = defineStore('ui-settings', {
    state: (): UiSettings => loadConfig(),

    getters: {
        isConfigured: (state) => state.apiBaseUrl.trim() !== '' && state.token.trim() !== '',
        authToken: (state) => state.token,
        isDark: (state) => state.theme === 'dark',
        getAsrConfig: (state) => (engine?: ASREngineType) => {
            const targetEngine = engine ?? state.asrEngine
            return state.asrConfigs.find((item) => item.engine === targetEngine) ?? getDefaultAsrConfig(targetEngine)
        },
        getTtsConfig: (state) => (engine?: TTSEngineType) => {
            const targetEngine = engine ?? state.ttsEngine
            return state.ttsConfigs.find((item) => item.engine === targetEngine) ?? getDefaultTtsConfig(targetEngine)
        },
        currentAsrConfig(): EngineConfig<ASREngineType> {
            return this.getAsrConfig(this.asrEngine)
        },
        currentTtsConfig(): EngineConfig<TTSEngineType> {
            return this.getTtsConfig(this.ttsEngine)
        },
        hasAsrToken(): boolean {
            return this.currentAsrConfig.token.trim() !== ''
        },
        hasTtsToken(): boolean {
            return this.ttsEngine === 'edge' || this.currentTtsConfig.token.trim() !== ''
        },
        isCurrentAsrConfigured(): boolean {
            if (!this.currentAsrConfig.token.trim()) {
                return false
            }

            if (this.asrEngine === 'voice-gateway') {
                return this.currentAsrConfig.baseUrl.trim() !== ''
            }

            return true
        },
        isCurrentTtsConfigured(): boolean {
            if (this.ttsEngine === 'edge') {
                return true
            }

            if (!this.currentTtsConfig.token.trim()) {
                return false
            }

            if (this.ttsEngine === 'voice-gateway') {
                return this.currentTtsConfig.baseUrl.trim() !== ''
            }

            return true
        },
    },

    actions: {
        persist() {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(this.$state))
        },

        save(newConfig?: Partial<UiSettings>) {
            if (newConfig) Object.assign(this.$state, newConfig)
            this.persist()
        },

        clear() {
            Object.assign(this.$state, getDefaultSettings())
            localStorage.removeItem(CONFIG_KEY)
        },

        upsertAsrConfig(config: EngineConfig<ASREngineType>) {
            this.asrConfigs = upsertConfigInList(this.asrConfigs, normalizeEngineConfig(config, getDefaultAsrConfig(config.engine)))
            this.persist()
        },

        upsertTtsConfig(config: EngineConfig<TTSEngineType>) {
            this.ttsConfigs = upsertConfigInList(this.ttsConfigs, normalizeEngineConfig(config, getDefaultTtsConfig(config.engine)))
            this.persist()
        },

        saveAsrEngineConfig(engine: ASREngineType, patch: Partial<Omit<EngineConfig<ASREngineType>, 'engine'>>) {
            const current = this.getAsrConfig(engine)
            this.asrConfigs = upsertConfigInList(this.asrConfigs, normalizeEngineConfig({ ...current, engine, ...patch }, current))
            this.persist()
        },

        saveTtsEngineConfig(engine: TTSEngineType, patch: Partial<Omit<EngineConfig<TTSEngineType>, 'engine'>>) {
            const current = this.getTtsConfig(engine)
            this.ttsConfigs = upsertConfigInList(this.ttsConfigs, normalizeEngineConfig({ ...current, engine, ...patch }, current))
            this.persist()
        },

        setLastActiveSessionKey(key: string) {
            this.lastActiveSessionKey = key
            this.persist()
        },

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

        toggleLayout() {
            this.isWideMode = !this.isWideMode
            this.persist()
        },

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
        },
    },
})
