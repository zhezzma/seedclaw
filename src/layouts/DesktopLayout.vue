<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppSidebar from '../components/AppSidebar.vue'
import { useGateway } from '../composables/useGateway'
import { useSessionsState } from '../composables/useSessionsState'
import { useAgentsState } from '../composables/useAgentsState'
import { useChatState } from '../composables/useChatState'

const router = useRouter()
const gatewayStore = useGateway()
const sessionsState = useSessionsState()
const agentsState = useAgentsState()
const chatState = useChatState() // We assume chat state holds the current session key globally

const sessions = computed(() => sessionsState.sessionsResult?.sessions || [])

const agents = computed(() => {
    const list = agentsState.agentsList?.agents || []
    return list.map((a: any) => ({
        id: a.id,
        name: a.name || a.identity?.name || a.id,
        avatar: a.identity?.avatar || null
    }))
})

// Current active agent ID (derived from session or explicit selection)
const activeAgentId = computed(() => {
    if (chatState.assistantAgentId) return chatState.assistantAgentId
    // Fallback?
    return ''
})

const handleDeleteSession = async (key: string) => {
    const result = await sessionsState.deleteSession(key)
    if (result?.deleted && chatState.sessionKey === key) {
        router.push({ name: 'home', query: { sessionkey: gatewayStore.defaultSessionKey } })
    }
}
</script>

<template>
    <div class="flex h-full bg-base-100 overflow-hidden">
        <!-- Sidebar -->
        <div class="w-64 h-full shrink-0 border-r border-base-200">
            <AppSidebar :sessions="sessions" :loading="sessionsState.sessionsLoading"
                :current-session-key="chatState.sessionKey" :default-session-key="gatewayStore.defaultSessionKey"
                :agents="agents" :active-agent-id="activeAgentId" @delete-session="handleDeleteSession" />
        </div>

        <!-- Main Content -->
        <div class="flex-1 h-full min-w-0 overflow-hidden relative">
            <router-view />
        </div>
    </div>
</template>
