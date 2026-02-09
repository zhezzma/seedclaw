import { reactive, watch } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { useGateway } from './useGateway'
import type { AgentsState } from '../openclaw/ui/src/ui/controllers/agents'
import { loadAgents as _loadAgents } from '~openclaw/ui/src/ui/controllers/agents'
import {
    loadAgentFiles as _loadAgentFiles,
    loadAgentFileContent as _loadAgentFileContent,
    saveAgentFile as _saveAgentFile,
    type AgentFilesState
} from '~openclaw/ui/src/ui/controllers/agent-files'
import { handleAgentEvent } from '~openclaw/ui/src/ui/app-tool-stream'

// Combined State Interface?
// The controller actions expect specific state shapes.
// loadAgents expects AgentsState.
// loadAgentFiles expects AgentFilesState.
// We can merge them into one reactive object IF we are careful, or maintain separate reactive states inside?
// Existing useAgentsState only had AgentsState.
// But useGateway had both.
// If I merge them into `useAgentsState`, I need to expose both capabilities.

// Define combined state
const state = reactive<AgentsState & AgentFilesState>({
    // AgentsState
    client: null,
    connected: false,
    agentsLoading: false,
    agentsError: null,
    agentsSelectedId: '',
    agentsList: {
        agents: [],
        defaultId: 'main',
        mainKey: '',
        scope: 'global'
    },
    // AgentFilesState
    agentFilesLoading: false,
    agentFilesError: null,
    agentFilesList: null,

    agentFileContents: {},
    agentFileDrafts: {},
    agentFileActive: null,
    agentFileSaving: false
})

let initialized = false
function ensureInit() {
    if (initialized) return
    initialized = true
    const gatewayStore = useGateway()
    watch(() => [gatewayStore.client, gatewayStore.connected], ([client, connected]) => {
        state.client = client as any
        state.connected = connected as boolean
        if (connected) {
            void _loadAgents(state as any)
        }
    }, { immediate: true })

    gatewayStore.subscribe((evt) => {
        if (evt.event === 'agent') {
            handleAgentEvent(state as any, evt.payload as any)
        }
    })
}

export function useAgentsState() {
    ensureInit()

    const loadAgents = async () => {
        await _loadAgents(state as any)
    }

    const loadAgentFiles = async (agentId: string) => {
        await _loadAgentFiles(state as any, agentId)
    }

    const loadAgentFileContent = async (agentId: string, name: string, opts?: { force?: boolean; preserveDraft?: boolean }) => {
        await _loadAgentFileContent(state as any, agentId, name, opts)
    }

    const saveAgentFile = async (agentId: string, name: string, content: string) => {
        await _saveAgentFile(state as any, agentId, name, content)
    }

    const methods = {
        loadAgents,
        loadAgentFiles,
        loadAgentFileContent,
        saveAgentFile,
        handleAgentEvent: (payload: any) => handleAgentEvent(state as any, payload)
    }

    return createStateProxy(state, methods)


}
