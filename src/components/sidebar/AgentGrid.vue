<script setup lang="ts">
import { isAgentMainSession } from '../../services/includes/session-key-utils'

defineProps<{
    loading: boolean
    agents: any[]
    visibleAgents: any[]
    activeAgentId?: string | null
    currentSessionKey?: string | null
    hasMoreAgents: boolean
    expanded: boolean
    maxVisibleAgents: number
}>()

const emit = defineEmits<{
    (e: 'select-agent', id: string): void
    (e: 'update:expanded', value: boolean): void
}>()

const selectAgent = (id: string) => {
    emit('select-agent', id)
}
</script>

<template>
    <div class="shrink-0 px-3 pb-2">
        <!-- Loading state -->
        <div v-if="loading" class="flex items-center justify-center py-4">
            <span class="loading loading-spinner loading-sm"></span>
        </div>
        <!-- Empty state -->
        <div v-else-if="agents.length === 0" class="text-center py-4 text-base-content/50 text-sm">
            暂无智能体
        </div>
        <!-- Agents grid -->
        <template v-else>
            <div class="grid grid-cols-2 gap-1">
                <a v-for="agent in visibleAgents" :key="agent.id" @click="selectAgent(agent.id)"
                    class="flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer transition-colors"
                    :class="activeAgentId === agent.id && currentSessionKey && isAgentMainSession(currentSessionKey) ? 'bg-primary/20 text-primary' : 'hover:bg-base-300'">
                    <span class="text-base">{{ agent.icon }}</span>
                    <span class="text-sm font-medium truncate">{{ agent.name }}</span>
                </a>
            </div>
            <a v-if="hasMoreAgents && !expanded"
                class="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-xl cursor-pointer hover:bg-base-300 transition-colors text-base-content/60"
                @click="emit('update:expanded', true)">
                <span class="text-sm">展开更多</span>
                <span class="badge badge-sm badge-ghost">+{{ agents.length - maxVisibleAgents }}</span>
            </a>
        </template>
    </div>
</template>
