<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGatewayStore } from '../stores/gateway'
import { SparklesIcon } from '@heroicons/vue/24/outline'
import { createAgentMainSessionKey } from '../services/includes/session-key-utils'

const router = useRouter()
const gatewayStore = useGatewayStore()

// Get agents from gateway store
const agents = computed(() => {
    const list = gatewayStore.agentsList?.agents || []
    return list.map((a: any) => ({
        id: a.id || a.name,
        name: a.name || a.id,
        icon: a.icon || '🤖',
        description: a.description || ''
    }))
})

const isLoading = computed(() => gatewayStore.agentsLoading)

const selectAgent = (agentId: string) => {
    // Navigate to home with sessionkey parameter
    router.push({ name: 'home', query: { sessionkey: createAgentMainSessionKey(agentId) } })
}

// Load agents when connected
onMounted(() => {
    if (gatewayStore.connected) {
        gatewayStore.loadAgents()
    }
})

watch(() => gatewayStore.connected, (connected) => {
    if (connected) {
        gatewayStore.loadAgents()
    }
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header - fixed -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <span class="text-lg font-semibold px-4">智能体</span>
            </div>
        </div>

        <!-- Content - scrollable -->
        <div class="flex-1 overflow-y-auto p-4">
            <!-- Loading state -->
            <div v-if="isLoading" class="flex items-center justify-center py-8">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <!-- Empty state -->
            <div v-else-if="agents.length === 0" class="flex flex-col items-center justify-center py-8 text-center">
                <SparklesIcon class="h-12 w-12 text-base-content/30 mb-4" />
                <p class="text-base-content/60">暂无可用的智能体</p>
                <p class="text-sm text-base-content/40 mt-1">请确保网关已正确配置</p>
            </div>

            <!-- Agents Grid -->
            <div v-else class="grid grid-cols-1 gap-3">
                <div v-for="agent in agents" :key="agent.id" @click="selectAgent(agent.id)"
                    class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
                    <div class="card-body p-4 flex-row items-center gap-4">
                        <div class="text-3xl">{{ agent.icon }}</div>
                        <div class="flex-1">
                            <h3 class="font-semibold">{{ agent.name }}</h3>
                            <p class="text-sm text-base-content/60">{{ agent.description }}</p>
                        </div>
                        <SparklesIcon class="h-5 w-5 text-primary opacity-50" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
