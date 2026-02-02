<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
    MagnifyingGlassIcon,
    Cog6ToothIcon,
    PlusIcon,
    ChevronDownIcon,
    ChatBubbleLeftRightIcon
} from '@heroicons/vue/24/outline'
import { useAgentStore } from '../stores/agent'
import { useSessionStore } from '../stores/session'

const router = useRouter()
const agentStore = useAgentStore()
const sessionStore = useSessionStore()

// Agents expand/collapse state
const isAgentsExpanded = ref(false)
const MAX_VISIBLE_AGENTS = 4

const visibleAgents = computed(() => {
    if (isAgentsExpanded.value || agentStore.agents.length <= MAX_VISIBLE_AGENTS) {
        return agentStore.agents
    }
    return agentStore.agents.slice(0, MAX_VISIBLE_AGENTS)
})

const hasMoreAgents = computed(() => agentStore.agents.length > MAX_VISIBLE_AGENTS)
</script>

<template>
    <div class="flex flex-col h-full bg-base-200/50 pt-[env(safe-area-inset-top)]">
        <!-- Header -->
        <div class="shrink-0 px-5 py-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="text-2xl">🦀</span>
                <span class="text-lg font-bold tracking-tight">Seedclaw</span>
            </div>
            <div class="flex gap-1">
                <button @click="router.push('/settings')" class="btn btn-ghost btn-circle btn-sm hover:bg-base-300">
                    <Cog6ToothIcon class="h-5 w-5" />
                </button>
            </div>
        </div>

        <!-- New Chat Button -->
        <div class="shrink-0 px-4">
            <button class="btn btn-primary btn-block gap-2 shadow-md hover:shadow-lg transition-shadow rounded-xl h-11">
                <PlusIcon class="h-5 w-5" />
                <span class="font-medium">新建对话</span>
            </button>
        </div>

        <!-- All Apps -->
        <!-- <div class="shrink-0 px-3">
            <button
                class="btn btn-ghost justify-start w-full gap-3 h-11 rounded-xl hover:bg-base-300 font-normal text-base">
                <Squares2X2Icon class="h-5 w-5 opacity-70" />
                全部应用
            </button>
        </div> -->

        <!-- Divider -->
        <div class="shrink-0 px-4 py-3">
            <div class="border-t border-base-300"></div>
        </div>

        <!-- Agents Section -->
        <div class="shrink-0 px-4">
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-base-content/70 uppercase tracking-wider">智能体</span>
                <button v-if="hasMoreAgents"
                    class="btn btn-ghost btn-xs btn-circle hover:bg-base-300 transition-transform"
                    :class="{ 'rotate-180': isAgentsExpanded }" @click="isAgentsExpanded = !isAgentsExpanded">
                    <ChevronDownIcon class="h-4 w-4" />
                </button>
            </div>
        </div>

        <!-- Agents List - 2 columns -->
        <div class="shrink-0 px-3 pb-2">
            <div class="grid grid-cols-2 gap-1">
                <a v-for="agent in visibleAgents" :key="agent.id" @click="agentStore.selectAgent(agent.id)"
                    class="flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer transition-colors"
                    :class="agentStore.isSelected(agent.id) ? 'bg-primary/20 text-primary' : 'hover:bg-base-300'">
                    <span class="text-base">{{ agent.icon }}</span>
                    <span class="text-sm font-medium truncate">{{ agent.name }}</span>
                </a>
            </div>
            <a v-if="hasMoreAgents && !isAgentsExpanded"
                class="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-xl cursor-pointer hover:bg-base-300 transition-colors text-base-content/60"
                @click="isAgentsExpanded = true">
                <span class="text-sm">展开更多</span>
                <span class="badge badge-sm badge-ghost">+{{ agentStore.agents.length - MAX_VISIBLE_AGENTS }}</span>
            </a>
        </div>

        <!-- Divider -->
        <div class="shrink-0 px-4 py-2">
            <div class="border-t border-base-300"></div>
        </div>

        <!-- Conversations Header -->
        <div class="shrink-0 px-4 pt-2 pb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-base-content/70 uppercase tracking-wider">最近对话</span>
            <button class="btn btn-ghost btn-circle btn-xs hover:bg-base-300">
                <MagnifyingGlassIcon class="h-4 w-4" />
            </button>
        </div>

        <!-- Conversations List - scrollable -->
        <div class="flex-1 overflow-y-auto px-3 pb-4 min-h-0">
            <div class="space-y-1">
                <a v-for="session in sessionStore.sessions" :key="session.id"
                    @click="sessionStore.selectSession(session.id)"
                    class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-base-300 transition-colors group"
                    :class="{ 'bg-base-300': sessionStore.currentSessionId === session.id }">
                    <ChatBubbleLeftRightIcon class="h-5 w-5 opacity-50 shrink-0" />
                    <span class="text-sm truncate flex-1">{{ session.title }}</span>
                    <span v-if="session.hasNotification"
                        class="w-2 h-2 rounded-full bg-error shrink-0 animate-pulse"></span>
                </a>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Custom scrollbar for dark theme */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: oklch(var(--bc) / 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: oklch(var(--bc) / 0.3);
}
</style>
