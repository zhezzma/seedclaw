<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
    MagnifyingGlassIcon,
    Cog6ToothIcon,
    PlusIcon,
    ChevronDownIcon,
    ChatBubbleLeftRightIcon,
    TrashIcon
} from '@heroicons/vue/24/outline'
import { useGatewayStore } from '../stores/gateway'
import { isAgentMainSession, createAgentMainSessionKey } from '../services/includes/session-key-utils'

const router = useRouter()
const gatewayStore = useGatewayStore()

// Agents expand/collapse state
const isAgentsExpanded = ref(false)
const MAX_VISIBLE_AGENTS = 4

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

const visibleAgents = computed(() => {
    if (isAgentsExpanded.value || agents.value.length <= MAX_VISIBLE_AGENTS) {
        return agents.value
    }
    return agents.value.slice(0, MAX_VISIBLE_AGENTS)
})

const hasMoreAgents = computed(() => agents.value.length > MAX_VISIBLE_AGENTS)

// Get sessions from gateway store (filter out agent main sessions)
const sessions = computed(() => {
    const list = gatewayStore.sessionsResult?.sessions || []
    return list
        .filter((s: any) => !isAgentMainSession(s.key))
        .map((s: any) => ({
            key: s.key,
            label: s.displayName || s.label || s.key,
            lastActiveAt: s.lastActiveAt || s.updatedAt
        }))
})


const currentSessionKey = computed(() => gatewayStore.sessionKey)
const activeAgentId = computed(() => gatewayStore.assistantAgentId)

const selectAgent = (agentId: string) => {
    gatewayStore.setSessionKey(createAgentMainSessionKey(agentId))
    // Close sidebar on mobile
    const drawer = document.getElementById('sidebar-drawer') as HTMLInputElement
    if (drawer) drawer.checked = false
}

const selectSession = (key: string) => {
    gatewayStore.setSessionKey(key)
    // Close sidebar on mobile
    const drawer = document.getElementById('sidebar-drawer') as HTMLInputElement
    if (drawer) drawer.checked = false
}

const createNewSession = async () => {
    await gatewayStore.createNewSession()
    // Close sidebar on mobile
    const drawer = document.getElementById('sidebar-drawer') as HTMLInputElement
    if (drawer) drawer.checked = false
}

const handleDeleteSession = async (key: string, event: Event) => {
    event.stopPropagation() // Prevent selecting the session

    if (!window.confirm(`Delete session "${key}"?\n\nDeletes the session entry and archives its transcript.`)) {
        return
    }

    await gatewayStore.deleteSession(key)
    // If deleted current session, switch to default
    if (gatewayStore.sessionKey === key) {
        gatewayStore.setSessionKey(createAgentMainSessionKey(gatewayStore.defaultAgentId))
    }
}

// Load sessions when connected
onMounted(() => {
    if (gatewayStore.connected) {
        gatewayStore.loadSessions()
    }
})

watch(() => gatewayStore.connected, (connected) => {
    if (connected) {
        gatewayStore.loadSessions()
    }
})
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
            <button @click="createNewSession"
                class="btn btn-primary btn-block gap-2 shadow-md hover:shadow-lg transition-shadow rounded-xl h-11">
                <PlusIcon class="h-5 w-5" />
                <span class="font-medium">新建对话</span>
            </button>
        </div>

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
            <!-- Loading state -->
            <div v-if="gatewayStore.agentsLoading" class="flex items-center justify-center py-4">
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
                        :class="activeAgentId === agent.id && isAgentMainSession(currentSessionKey) ? 'bg-primary/20 text-primary' : 'hover:bg-base-300'">
                        <span class="text-base">{{ agent.icon }}</span>
                        <span class="text-sm font-medium truncate">{{ agent.name }}</span>
                    </a>
                </div>
                <a v-if="hasMoreAgents && !isAgentsExpanded"
                    class="flex items-center justify-center gap-2 px-3 py-2 mt-1 rounded-xl cursor-pointer hover:bg-base-300 transition-colors text-base-content/60"
                    @click="isAgentsExpanded = true">
                    <span class="text-sm">展开更多</span>
                    <span class="badge badge-sm badge-ghost">+{{ agents.length - MAX_VISIBLE_AGENTS }}</span>
                </a>
            </template>
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
            <!-- Loading state -->
            <div v-if="gatewayStore.sessionsLoading" class="flex items-center justify-center py-4">
                <span class="loading loading-spinner loading-sm"></span>
            </div>
            <!-- Empty state -->
            <div v-else-if="sessions.length === 0" class="text-center py-4 text-base-content/50 text-sm">
                暂无对话记录
            </div>
            <!-- Sessions list -->
            <div v-else class="space-y-1">
                <a v-for="session in sessions" :key="session.key" @click="selectSession(session.key)"
                    class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-base-300 transition-colors group"
                    :class="{ 'bg-base-300': currentSessionKey === session.key }">
                    <ChatBubbleLeftRightIcon class="h-5 w-5 opacity-50 shrink-0" />
                    <span class="text-sm truncate flex-1">{{ session.label }}</span>
                    <!-- Delete button - visible on hover -->
                    <button @click="handleDeleteSession(session.key, $event)"
                        class="btn btn-ghost btn-circle btn-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error/20 hover:text-error">
                        <TrashIcon class="h-4 w-4" />
                    </button>
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
