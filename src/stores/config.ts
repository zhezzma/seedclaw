import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export interface OpenClawConfig {
    gatewayUrl: string
    authToken: string
}

const CONFIG_KEY = 'openclaw_config'

export const useConfigStore = defineStore('config', () => {
    // Load config from localStorage
    const loadConfig = (): OpenClawConfig | null => {
        try {
            const saved = localStorage.getItem(CONFIG_KEY)
            if (saved) {
                return JSON.parse(saved)
            }
        } catch (e) {
            console.error('Failed to load config:', e)
        }
        return null
    }

    const config = ref<OpenClawConfig | null>(loadConfig())

    // Check if config is valid (both url and token are set)
    const isConfigured = computed(() => {
        return config.value !== null &&
            config.value.gatewayUrl.trim() !== '' &&
            config.value.authToken.trim() !== ''
    })

    // Save config to localStorage
    const saveConfig = (newConfig: OpenClawConfig) => {
        config.value = newConfig
        localStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig))
    }

    // Clear config
    const clearConfig = () => {
        config.value = null
        localStorage.removeItem(CONFIG_KEY)
    }

    // Get gateway URL
    const gatewayUrl = computed(() => config.value?.gatewayUrl || '')

    // Get auth token
    const authToken = computed(() => config.value?.authToken || '')

    return {
        config,
        isConfigured,
        gatewayUrl,
        authToken,
        saveConfig,
        clearConfig
    }
})
