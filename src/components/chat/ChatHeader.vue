<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
    Bars3Icon,
    ChevronDownIcon,
    CheckIcon,
    SunIcon,
    MoonIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    PlusIcon,
    PhoneIcon,
    ChevronLeftIcon
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../../stores/setting'

import { isNewSession, NEW_SESSION_ROUTE_NAME } from '../../utils/route-helpers'
import { useChatState } from '../../composables/useChatState'
import { AgentInfo, useAgentsState } from '~/src/composables/useAgentsState'

const props = defineProps<{
    sessionName?: string
    selectedAgent: AgentInfo | null
    agents: AgentInfo[]
}>()


const emit = defineEmits<{
    (e: 'start-voice-chat'): void
}>()

const router = useRouter()
const route = useRoute()
const chatState = useChatState()
const handleBack = () => {
    // Go back to list view
    router.back()
}
const settingsStore = useUiSettingsStore()


const dropdownRef = ref<HTMLDetailsElement | null>(null)

const showAgentDropdown = computed(() => isNewSession(route))

const selectedAgentId = computed(() => props.selectedAgent?.id || '')



// 选择 Agent（新会话下拉菜单）→ 通过 chatState.selectAgent 统一管理
const selectAgent = (agentId: string) => {
    if (isNewSession(route)) {
        chatState.selectAgent(agentId)
    }
    if (dropdownRef.value) {
        dropdownRef.value.open = false
    }
}

const createNewSession = () => {
    router.push({ name: NEW_SESSION_ROUTE_NAME })
}

const startVoiceChat = () => {
    emit('start-voice-chat')
}

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        dropdownRef.value.open = false
    }
}

defineExpose({
    handleClickOutside
})
</script>

<template>
    <div class="navbar bg-base-100 border-b border-base-300">

        <!-- Back Button (Messages Mode) -->
        <button v-if="route.query && route.query.type" @click="handleBack"
            class="btn btn-ghost btn-circle btn-sm -ml-2 lg:hidden">
            <ChevronLeftIcon class="h-5 w-5" />
        </button>
        <!-- Hamburger menu (mobile only) -->
        <div v-else class="flex-none lg:hidden">
            <label for="sidebar-drawer" class="btn btn-square btn-ghost drawer-button">
                <Bars3Icon class="h-5 w-5" />
            </label>
        </div>

        <div class="flex-1">
            <!-- Agent dropdown (for agent main sessions) -->
            <details v-if="showAgentDropdown && selectedAgent" class="dropdown" ref="dropdownRef">
                <summary class="btn btn-ghost gap-1 list-none">
                    <span class="font-semibold text-lg">{{ selectedAgent?.name || 'Assistant' }}</span>
                    <ChevronDownIcon class="h-4 w-4" />
                </summary>
                <ul class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg">
                    <li v-for="agent in agents" :key="agent.id">
                        <a @click="selectAgent(agent.id)" class="flex justify-between items-center"
                            :class="{ 'active': selectedAgentId === agent.id }">
                            <span>{{ agent.name }}</span>
                            <CheckIcon v-if="selectedAgentId === agent.id" class="h-4 w-4" />
                        </a>
                    </li>
                </ul>
            </details>
            <!-- Session name (for specific sessions like agent:xxx:session:xxx) -->
            <div v-else class="lg:pl-5 font-semibold flex items-center gap-2 min-w-0">
                <span class="truncate max-w-[200px] lg:max-w-none">{{ sessionName }}</span>
                <span v-if="chatState.agentsSelectedId" class="badge badge-sm badge-ghost shrink-0">{{
                    chatState.agentsSelectedId }}</span>
            </div>
        </div>

        <!-- Mobile buttons -->
        <div class="flex-none flex gap-1 lg:hidden">
            <button @click="startVoiceChat" class="btn btn-ghost btn-circle btn-sm" :title="$t('chat.voiceChat')">
                <PhoneIcon class="h-5 w-5" />
            </button>
            <button @click="createNewSession" class="btn btn-ghost btn-circle btn-sm" :title="$t('chat.newChat')">
                <PlusIcon class="h-5 w-5" />
            </button>
        </div>
        <!-- PC theme toggle button -->
        <div class="flex-none hidden lg:flex gap-2">
            <button @click="settingsStore.toggleLayout()" class="btn btn-ghost btn-circle btn-sm"
                :title="settingsStore.isWideMode ? $t('chat.switchToNarrow') : $t('chat.switchToWide')">
                <ArrowsPointingInIcon v-if="settingsStore.isWideMode" class="h-5 w-5" />
                <ArrowsPointingOutIcon v-else class="h-5 w-5" />
            </button>
            <button @click="settingsStore.toggleTheme()" class="btn btn-ghost btn-circle btn-sm">
                <SunIcon v-if="settingsStore.isDark" class="h-5 w-5" />
                <MoonIcon v-else class="h-5 w-5" />
            </button>
        </div>
    </div>
</template>
