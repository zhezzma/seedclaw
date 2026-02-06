import { reactive, watch, toRefs } from 'vue'
import { useGateway } from './useGateway'
import type { ConfigState } from '../openclaw/ui/src/ui/controllers/config'
import {
    loadConfig as _loadConfig,
    saveConfig as _saveConfig,
    updateConfigFormValue as _updateConfigFormValue
} from '~openclaw/ui/src/ui/controllers/config'

const state = reactive<ConfigState>({
    client: null,
    connected: false,
    configLoading: false,
    configForm: null,
    configFormDirty: false,
    configSaving: false
} as any)

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], ([client, connected]) => {
        state.client = client as any
        state.connected = connected as boolean
        if (connected) {
            void _loadConfig(state as any)
        }
    }, { immediate: true })
}

export function useConfigState() {
    ensureInit()

    const loadConfig = async () => {
        await _loadConfig(state as any)
    }

    const updateConfigFormValue = (path: string[], value: unknown) => {
        _updateConfigFormValue(state as any, path, value)
    }

    const saveConfig = async () => {
        await _saveConfig(state as any)
        await loadConfig()
    }

    return reactive({
        ...toRefs(state),
        loadConfig,
        updateConfigFormValue,
        saveConfig
    })

}
