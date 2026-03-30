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
    ChevronLeftIcon,
    ArrowPathIcon
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../../stores/setting'
import { isConnected } from '../../composables/notify-server-connection'

import ViewHeader from '../ViewHeader.vue'
import { isNewSession, NEW_SESSION_ROUTE_NAME } from '../../utils/route-helpers'
import { useChatState } from '../../composables/useChatState'
import { AgentInfo, useAgentsState } from '~/src/composables/useAgentsState'
import { useCommandState } from '../../composables/useCommandState'

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
const { loadCommands, setCurrentAgent } = useCommandState()
const splitRouteNames = ['tasks', 'archived'] as const
const handleBack = () => {
    const splitListRouteName = splitRouteNames.find(name => name === route.name)
    const hasUsableHistoryEntry = window.history.length > 1 && typeof window.history.state?.back === 'string'

    // 分栏详情页优先走 history.back()，避免 /tasks -> /tasks/:id -> /tasks
    // 或 /archived -> /archived/:id -> /archived 这种链路污染移动端返回栈。
    // 但对于深链直达等没有可用历史记录的情况，需要安全回退到对应列表路由。
    if (splitListRouteName && !hasUsableHistoryEntry) {
        router.push({ name: splitListRouteName })
        return
    }

    router.back()
}
const settingsStore = useUiSettingsStore()


const dropdownRef = ref<HTMLDetailsElement | null>(null)

const showAgentDropdown = computed(() => isNewSession(route))

const selectedAgentId = computed(() => props.selectedAgent?.id || '')



// 选择 Agent（新会话下拉菜单）→ 通过 chatState.selectAgent 统一管理
const selectAgent = async (agentId: string) => {
    if (isNewSession(route)) {
        chatState.selectAgent(agentId)
        setCurrentAgent(agentId)
        await loadCommands(agentId)
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

const refreshPage = () => {
    window.location.reload()
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
    <ViewHeader>
        <!-- Back Button or Hamburger -->
        <template #left>
            <button v-if="splitRouteNames.includes(route.name as typeof splitRouteNames[number])" @click="handleBack"
                class="btn btn-ghost btn-sm btn-circle  lg:hidden">
                <ChevronLeftIcon class="h-5 w-5" />
            </button>
            <div v-else class="flex-none lg:hidden">
                <label for="sidebar-drawer" class="btn btn-ghost btn-sm btn-circle drawer-button">
                    <Bars3Icon class="h-5 w-5" />
                </label>
            </div>
        </template>

        <!-- Title / Agent Dropdown -->
        <template #title>
            <div class="flex-1 flex items-center min-w-0">
                <!-- Agent dropdown (for agent main sessions) -->
                <details v-if="showAgentDropdown && selectedAgent" class="dropdown" ref="dropdownRef">
                    <summary class="btn btn-ghost gap-1 list-none px-2 h-auto min-h-0">
                        <span class="font-semibold text-lg truncate max-w-[150px] sm:max-w-xs">{{
                            selectedAgent?.name || $t('agent.assistant') }}</span>
                        <ChevronDownIcon class="h-4 w-4 shrink-0" />
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
                <div v-else class="lg:pl-5 font-semibold flex items-center gap-2 min-w-0 flex-1">
                    <span class="truncate max-w-[150px] lg:max-w-none text-lg">{{ sessionName }}</span>
                    <span v-if="chatState.agentsSelectedId"
                        class="badge badge-sm badge-ghost shrink-0 max-w-[10ch] overflow-hidden align-middle"
                        :title="chatState.agentsSelectedId">
                        <span class="block truncate whitespace-nowrap">{{ chatState.agentsSelectedId }}</span>
                    </span>
                </div>
            </div>
        </template>

        <!-- Actions -->
        <template #actions>
            <div class="flex items-center gap-2">
                <!-- Connection Status Indicator -->
                <div class="tooltip tooltip-bottom flex items-center"
                    :data-tip="isConnected ? $t('common.connected') : $t('common.disconnected')">
                    <div class="w-3 h-3 rounded-full transition-colors duration-300"
                        :class="isConnected ? 'bg-success' : 'bg-error/50'"></div>
                </div>

                <!-- Mobile buttons -->
                <div class="flex gap-1 lg:hidden">
                    <button v-if="settingsStore.hasAsrToken && settingsStore.hasTtsToken" @click="startVoiceChat"
                        class="btn btn-ghost btn-circle btn-sm" :title="$t('chat.voiceChat')">
                        <PhoneIcon class="h-5 w-5" />
                    </button>
                    <button @click="refreshPage" class="btn btn-ghost btn-circle btn-sm" :title="$t('common.refresh')">
                        <ArrowPathIcon class="h-5 w-5" />
                    </button>
                    <button @click="createNewSession" class="btn btn-ghost btn-circle btn-sm"
                        :title="$t('chat.newChat')">
                        <PlusIcon class="h-5 w-5" />
                    </button>
                </div>

                <!-- PC theme toggle button -->
                <div class="hidden lg:flex gap-2 items-center">
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
    </ViewHeader>
</template>
