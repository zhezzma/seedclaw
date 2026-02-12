<script setup lang="ts">
import { isAgentMainSession } from '~/src/utils/session-key-helpers';



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
            {{ $t('agent.noAgents') }}
        </div>
        <!-- Agents grid -->
        <template v-else>
            <div class="grid grid-cols-2 gap-1">
                <a v-for="agent in visibleAgents" :key="agent.id" @click="selectAgent(agent.id)"
                    class="flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer transition-colors"
                    :class="activeAgentId === agent.id && currentSessionKey && isAgentMainSession(currentSessionKey) ? 'bg-primary/20 text-primary' : 'hover:bg-base-300'">
                    <div
                        class="w-5 h-5 rounded-full flex items-center justify-center bg-base-100/50 overflow-hidden shrink-0">
                        <img v-if="agent.avatarUrl" :src="agent.avatarUrl" :alt="agent.name"
                            class="w-full h-full object-cover" />
                        <span v-else class="text-sm select-none">{{ agent.icon }}</span>
                    </div>
                    <span class="text-sm font-medium truncate">{{ agent.name }}</span>
                </a>
            </div>
            <a v-if="hasMoreAgents && !expanded"
                class="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-xl cursor-pointer hover:bg-base-300 transition-colors text-base-content/60"
                @click="emit('update:expanded', true)">
                <span class="text-sm">{{ $t('agent.showMore') }}</span>
                <span class="badge badge-sm badge-ghost">+{{ agents.length - maxVisibleAgents }}</span>
            </a>
        </template>
    </div>
</template>
