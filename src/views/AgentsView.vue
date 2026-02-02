<script setup lang="ts">
import { useAgentStore } from '../stores/agent'
import {
    SparklesIcon
} from '@heroicons/vue/24/outline'

const agentStore = useAgentStore()
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
        <div class="flex-1 overflow-y-auto p-4 pb-20">
            <!-- Agents Grid -->
            <div class="grid grid-cols-1 gap-3">
                <div v-for="agent in agentStore.agents" :key="agent.id" @click="agentStore.selectAgent(agent.id)"
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
