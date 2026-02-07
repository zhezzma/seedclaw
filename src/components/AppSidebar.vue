<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
    MagnifyingGlassIcon,
    Cog6ToothIcon,
    PlusIcon,
    ChatBubbleLeftRightIcon,
    TrashIcon,
} from '@heroicons/vue/24/outline'
import { SIDEBAR_ITEMS } from '../config/navigation'
import { createAgentMainSessionKey, isAgentMainSession } from '../utils/session-key-helpers'
import { useConfirm } from '../composables/useConfirm'

const router = useRouter()
const { confirm } = useConfirm()

const props = defineProps<{
    sessions: any[],
    loading?: boolean,
    currentSessionKey: string,
    defaultSessionKey: string,
    agents?: any[],
    activeAgentId?: string,
}>()

const emit = defineEmits<{
    (e: 'delete-session', key: string): void
}>()

// Agents expand/collapse state
const isAgentsExpanded = ref(false)
const MAX_VISIBLE_AGENTS = 4

// Computed wrappers for props (optional, can use props directly)
const agentsList = computed(() => props.agents || [])

const visibleAgents = computed(() => {
    if (isAgentsExpanded.value || agentsList.value.length <= MAX_VISIBLE_AGENTS) {
        return agentsList.value
    }
    return agentsList.value.slice(0, MAX_VISIBLE_AGENTS)
})

const hasMoreAgents = computed(() => agentsList.value.length > MAX_VISIBLE_AGENTS)

// Filter sessions for display (exclude agent main sessions if needed, logic copied)
const displaySessions = computed(() => {
    return props.sessions
        .filter((s: any) => !isAgentMainSession(s.key))
        .map((s: any) => ({
            key: s.key,
            label: s.displayName || s.label || s.key,
            lastActiveAt: s.lastActiveAt || s.updatedAt
        }))
})

const closeSidebarDrawer = () => {
    const drawer = document.getElementById('sidebar-drawer') as HTMLInputElement
    if (drawer) drawer.checked = false
}

const selectAgent = (agentId: string) => {
    router.push({ name: 'chat', params: { sessionkey: createAgentMainSessionKey(agentId) } })
    closeSidebarDrawer()
}

const selectSession = (key: string) => {
    router.push({ name: 'chat', params: { sessionkey: key } })
    closeSidebarDrawer()
}

const createNewSession = () => {
    // Navigate to new-session route
    router.push({ name: 'new-session' })
    closeSidebarDrawer()
}

const handleDeleteSession = async (key: string, event: Event) => {
    event.stopPropagation() // Prevent selecting the session

    if (!await confirm(`确定要删除对话 "${key}" 吗？\n\n这将删除对话条目并归档其记录。`)) {
        return
    }

    emit('delete-session', key)
}

const navItems = SIDEBAR_ITEMS

const handleNavClick = (item: any) => {
    if (item.route) {
        // ... navigation logic
        if (item.route === 'home') {
            router.push({ name: 'chat', params: { sessionkey: props.defaultSessionKey } })
        } else {
            router.push({ name: item.route })
        }
        closeSidebarDrawer()
    }
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200/50 pt-[env(safe-area-inset-top)]">
        <!-- Header -->
        <div class="shrink-0 px-5 py-4 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <span class="text-2xl">🦀</span>
                <span class="text-lg font-bold tracking-tight">SeedClaw</span>
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


        <!-- Nav -->
        <div class="shrink-0 px-3 flex flex-col gap-1.5">
            <button v-for="item in navItems" :key="item.label" @click="handleNavClick(item)"
                class="group flex items-center gap-3  p-1 w-full rounded-2xl text-left transition-all duration-200 hover:bg-base-100 hover:shadow-sm border border-transparent hover:border-base-200/50 active:scale-[0.98] cursor-pointer"
                :class="{ 'bg-base-100 shadow-sm border-base-200/50': $route.name === item.route }">
                <div class="p-1 rounded-xl transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary text-base-content/60"
                    :class="{ 'bg-primary/10 text-primary': $route.name === item.route }">
                    <component :is="item.icon" class="h-5 w-5" />
                </div>
                <span class="font-medium text-sm text-base-content/70 group-hover:text-base-content transition-colors"
                    :class="{ 'text-base-content font-semibold': $route.name === item.route }">
                    {{ item.label }}
                </span>
            </button>
        </div>


        <!-- Agents Section -->
        <!-- <div class="shrink-0 px-4">
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-base-content/70 uppercase tracking-wider">智能体</span>
                <button v-if="hasMoreAgents"
                    class="btn btn-ghost btn-xs btn-circle hover:bg-base-300 transition-transform"
                    :class="{ 'rotate-180': isAgentsExpanded }" @click="isAgentsExpanded = !isAgentsExpanded">
                    <ChevronDownIcon class="h-4 w-4" />
                </button>
            </div>
        </div> -->

        <!-- Agents List - 2 columns -->
        <!-- <AgentGrid :loading="gatewayStore.agentsLoading" :agents="agents" :visible-agents="visibleAgents"
            :active-agent-id="activeAgentId" :current-session-key="currentSessionKey" :has-more-agents="hasMoreAgents"
            v-model:expanded="isAgentsExpanded" :max-visible-agents="MAX_VISIBLE_AGENTS" @select-agent="selectAgent" /> -->

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
            <div v-if="props.loading" class="flex items-center justify-center py-4">
                <span class="loading loading-spinner loading-sm"></span>
            </div>
            <!-- Empty state -->
            <div v-else-if="displaySessions.length === 0" class="text-center py-4 text-base-content/50 text-sm">
                暂无对话记录
            </div>
            <!-- Sessions list -->
            <div v-else class="space-y-1">
                <a v-for="session in displaySessions" :key="session.key" @click="selectSession(session.key)"
                    class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-base-300 transition-colors group"
                    :class="{ 'bg-base-300': currentSessionKey === session.key }">
                    <ChatBubbleLeftRightIcon class="h-5 w-5 opacity-50 shrink-0" />
                    <span class="text-sm truncate flex-1">{{ session.label }}</span>
                    <!-- Delete button - visible on hover -->
                    <button @click="handleDeleteSession(session.key, $event)"
                        class="btn btn-ghost btn-circle btn-xs opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-error/20 hover:text-error">
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
