import { watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useUiSettingsStore } from '../stores/setting'

export function useGotify() {
    const configStore = useUiSettingsStore()

    const start = async () => {
        if (!configStore.gotifyUrl || !configStore.gotifyToken) return
        try {
            await invoke('start_gotify', {
                url: configStore.gotifyUrl,
                token: configStore.gotifyToken
            })
            console.log('Gotify started')
        } catch (e) {
            console.error('Failed to start Gotify:', e)
        }
    }

    const stop = async () => {
        try {
            await invoke('stop_gotify')
            console.log('Gotify stopped')
        } catch (e) {
            console.error('Failed to stop Gotify:', e)
        }
    }

    // Initialize
    const initGotify = () => {
        // Only run in Tauri environment
        // @ts-ignore
        if (!window.__TAURI_INTERNALS__) return

        // Watch for changes
        watch(
            () => [configStore.gotifyUrl, configStore.gotifyToken],
            async ([url, token]) => {
                if (url && token) {
                    await start()
                } else {
                    await stop()
                }
            }
        )

        // Initial start
        if (configStore.gotifyUrl && configStore.gotifyToken) {
            start()
        }
    }

    return {
        initGotify,
        start,
        stop
    }
}
