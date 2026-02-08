<script setup lang="ts">
import { computed, onMounted, watch, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGateway } from '../composables/useGateway'
import { useAgentsState } from '../composables/useAgentsState'
import { useConfigState } from '../composables/useConfigState'
import { useUiSettingsStore } from '@/stores/setting'
import ViewHeader from '@/components/ViewHeader.vue'

// Components
import AgentSidebar from '../components/agents/AgentSidebar.vue'
import AgentDetail from '../components/agents/AgentDetail.vue'

const router = useRouter()
const route = useRoute()
const gatewayStore = useGateway()

const agentsState = useAgentsState()
const configState = useConfigState()
const settingsStore = useUiSettingsStore()

// Selected Agent from Query Params - this is the source of truth for navigation state
const selectedAgentId = computed(() => {
    return (route.query.agentId as string) || undefined
})

const selectedAgentName = computed(() => {
    if (!selectedAgentId.value) return ''
    const list = agentsState.agentsList?.agents || []
    const agent = list.find((a: any) => (a.id || a.name) === selectedAgentId.value)
    return agent?.identity?.name || agent?.name || agent?.id || 'Agent'
})

const selectAgent = (agentId: string) => {
    // Update URL query parameter
    router.push({ query: { ...route.query, agentId } })
}

const clearSelection = () => {
    // Return to list view (Mobile)
    const query = { ...route.query }
    delete query.agentId
    router.replace({ query })
}



// Default selection logic for Desktop
// If no agent selected and we have agents, select the first one on large screens
watch(() => [agentsState.agentsList, route.query.agentId], ([agentsList, currentId]) => {
    // strict check for desktop using matchMedia to match Tailwind 'lg' breakpoint
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches

    const agents = (agentsList as any)?.agents // Extract agents array

    if (isDesktop && !currentId && agents && (agents as any[]).length > 0) {
        // Only redirect if we are strictly on desktop and have no selection
        const firstId = (agents as any[])[0].id || (agents as any[])[0].name
        router.replace({ query: { ...route.query, agentId: firstId } })
    }
}, { immediate: true })

</script>

<template>
    <!-- Simplified Master-Detail Layout -->
    <div class="flex h-full w-full overflow-hidden bg-base-200">

        <!-- Sidebar Container -->
        <!-- 
            Mobile: 
                - If !selectedAgentId: Visible (w-full)
                - If selectedAgentId: Hidden
            Desktop (lg):
                - Always Visible (w-80)
        -->
        <div class="h-full bg-base-100 border-r border-base-200 flex flex-col shrink-0" :class="[
            selectedAgentId ? 'hidden lg:flex lg:w-80' : 'w-full lg:w-80 flex'
        ]">
            <AgentSidebar :selected-id="selectedAgentId" :agents-list="agentsState.agentsList"
                :config-state="configState" @select="selectAgent" />
        </div>

        <!-- Detail Container -->
        <!-- 
            Mobile:
                - If !selectedAgentId: Hidden
                - If selectedAgentId: Visible (w-full)
            Desktop (lg):
                - Always Visible (flex-1)
        -->
        <div class="h-full bg-base-50 flex flex-col min-w-0" :class="[
            selectedAgentId ? 'w-full flex lg:flex-1' : 'hidden lg:flex lg:flex-1'
        ]">

            <!-- Mobile Back Button Header (Only on Mobile + Selected) -->
            <div class="lg:hidden shrink-0">
                <ViewHeader :title="selectedAgentName"></ViewHeader>
            </div>

            <AgentDetail v-if="selectedAgentId" :agent-id="selectedAgentId" :agents-list="agentsState.agentsList"
                :config-state="configState" :default-agent-id="gatewayStore.defaultAgentId"
                class="flex-1 overflow-hidden" />

            <!-- Empty State for Desktop (if no selection) -->
            <div v-else class="hidden lg:flex flex-1 items-center justify-center text-base-content/40">
                <div class="text-center">
                    <div class="text-6xl mb-4">👈</div>
                    <p>Select an agent to view details</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Custom transitions for smooth master-detail switch on mobile could be added here if needed, 
   but simplistic v-if/class toggling is usually robust enough. */
</style>
