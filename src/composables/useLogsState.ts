import { reactive, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useGateway } from './useGateway'
import type { LogsState } from '../openclaw/ui/src/ui/controllers/logs'
import { loadLogs as _loadLogs } from '~openclaw/ui/src/ui/controllers/logs'

const state = reactive<LogsState & { logsStreaming: boolean }>({
    client: null,
    connected: false,
    logsLoading: false,
    logsError: null,
    logsEntries: [],
    logsCursor: null,
    logsFile: null,
    logsTruncated: false,
    logsLastFetchAt: null,
    logsLimit: 1000,
    logsMaxBytes: 1000000,
    logsStreaming: false
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], () => {
        state.client = gatewayStore.client as any
        state.connected = gatewayStore.connected
    }, { immediate: true })
}

export function useLogsState() {
    ensureInit()

    const loadLogs = async (opts?: { reset?: boolean; quiet?: boolean }) => {
        await _loadLogs(state as any, opts)
    }

    const resetLogs = () => {
        state.logsCursor = null
        state.logsEntries = []
        state.logsFile = null
        state.logsTruncated = false
        state.logsLastFetchAt = null
    }

    const methods = {
        loadLogs,
        resetLogs
    }

    return createStateProxy(state, methods)

}
