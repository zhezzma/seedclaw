<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAgentsState } from '../composables/useAgentsState'
import { useUiSettingsStore } from '@/stores/setting'
import { useI18n } from 'vue-i18n'
import ViewHeader from '@/components/ViewHeader.vue'

// Components
import AgentSidebar from '../components/agents/AgentSidebar.vue'
import AgentDetail from '../components/agents/AgentDetail.vue'
import AgentFormModal from '../components/agents/AgentFormModal.vue'

const router = useRouter()
const route = useRoute()
const agentsState = useAgentsState()
const settingsStore = useUiSettingsStore()
const { t } = useI18n()

const showAddModal = ref(false)

// Selected Agent from Query Params - this is the source of truth for navigation state
const selectedAgentId = computed(() => {
    return (route.query.agentId as string) || undefined
})

const selectedAgentName = computed(() => {
    if (!selectedAgentId.value) return ''
    const list = agentsState.agentsList || []
    const agent = list.find((a: any) => a.id === selectedAgentId.value)
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

const handleAgentCreated = async (newAgentId: string) => {
    selectAgent(newAgentId)
    showAddModal.value = false
}

// Default selection logic for Desktop
// If no agent selected and we have agents, select the first one on large screens
watch(() => [agentsState.agentsList, route.query.agentId], ([agentsList, currentId]) => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const agents = agentsList as any[]

    if (isDesktop && !currentId && agents && agents.length > 0) {
        const firstId = agents[0].id
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
            <AgentSidebar :agents="agentsState.agentsList || []" :selectedId="selectedAgentId ?? null"
                @select="selectAgent" @add="showAddModal = true" />
        </div>

        <!-- Detail Container -->
        <!-- 
            Mobile:
                - If !selectedAgentId: Hidden
                - If selectedAgentId: Visible (w-full)
            Desktop (lg):
                - Always Visible (flex-1)
        -->
        <div class="h-full flex flex-col min-w-0" :class="[
            selectedAgentId ? 'w-full flex lg:flex-1' : 'hidden lg:flex lg:flex-1'
        ]">

            <!-- Mobile Back Button Header (Only on Mobile + Selected) -->
            <div class="lg:hidden shrink-0">
                <ViewHeader :title="selectedAgentName" @click="clearSelection"></ViewHeader>
            </div>

            <AgentDetail v-if="selectedAgentId" :agent-id="selectedAgentId" @back="clearSelection"
                class="flex-1 overflow-hidden" />

            <!-- Empty State for Desktop (if no selection) -->
            <div v-else class="hidden lg:flex flex-1 items-center justify-center text-base-content/40">
                <div class="text-center">
                    <div class="text-6xl mb-4">🤖</div>
                    <h3 class="text-xl font-bold mb-2">{{ $t('agent.noAgentSelected') }}</h3>
                    <p>{{ $t('agent.selectAgentPrompt') }}</p>
                </div>
            </div>
        </div>

        <!-- Add Modal -->
        <AgentFormModal :show="showAddModal" mode="add" @close="showAddModal = false" @saved="handleAgentCreated" />
    </div>
</template>

<style scoped>
/* Custom transitions for smooth master-detail switch on mobile could be added here if needed, 
   but simplistic v-if/class toggling is usually robust enough. */
</style>
