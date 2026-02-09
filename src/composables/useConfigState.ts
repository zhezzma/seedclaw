import { reactive, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useGateway } from './useGateway'
import type { ConfigState } from '~openclaw/ui/src/ui/controllers/config'
import {
    loadConfig as _loadConfig,
    saveConfig as _saveConfig,
    applyConfig as _applyConfig,
    updateConfigFormValue as _updateConfigFormValue,
    removeConfigFormValue as _removeConfigFormValue
} from '~openclaw/ui/src/ui/controllers/config'

const state = reactive<ConfigState>({
    client: null,
    connected: false,
    configLoading: false,
    configForm: null,
    configFormDirty: false,
    configSaving: false,
    configFormMode: 'form',
    configSnapshot: null
} as any)

let initialized = false

const parseConfig = () => {
    //raw里面的maxtoken是有值的
    if (state.configRaw) {
        try {
            state.configForm = JSON.parse(state.configRaw)
            state.configFormOriginal = JSON.parse(state.configRaw);
        } catch (e) {
            // ignore parse error
        }
    }
}


function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], async ([client, connected]) => {
        state.client = client as any
        state.connected = connected as boolean
        if (connected) {
            await _loadConfig(state as any)
            parseConfig()
        }
    }, { immediate: true })
}

export function useConfigState() {
    ensureInit()

    const loadConfig = async () => {
        await _loadConfig(state as any)
        parseConfig()
    }

    const saveConfig = async () => {
        await _saveConfig(state as any)
        parseConfig()
    }

    const applyConfig = async () => {
        await _applyConfig(state as any)
        parseConfig()
    }

    const updateConfigFormValue = (path: string[], value: unknown) => {
        _updateConfigFormValue(state as any, path, value)
    }

    const removeConfigFormValue = (path: Array<string | number>) => {
        _removeConfigFormValue(state as any, path)
    }

    const methods = {
        loadConfig,
        saveConfig,
        applyConfig,
        updateConfigFormValue,
        removeConfigFormValue,
    }

    return createStateProxy(state, methods)
}
