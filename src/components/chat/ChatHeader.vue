<script setup lang="ts">
import { ref, computed } from 'vue'
import {
    Bars3Icon,
    ChevronDownIcon,
    CheckIcon,
    SunIcon,
    MoonIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    PlusIcon,
    PhoneIcon
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../../stores/setting'
import { useGatewayStore } from '../../stores/gateway'

interface Agent {
    id: string
    name: string
    icon: string
    description?: string
}

const props = defineProps<{
    selectedAgent: Agent
    showAgentDropdown: boolean
    currentSessionName: string
    agents: Agent[]
}>()

const emit = defineEmits<{
    (e: 'select-agent', agentId: string): void
    (e: 'create-session'): void
    (e: 'start-voice-chat'): void
}>()

const settingsStore = useUiSettingsStore()
const gatewayStore = useGatewayStore()
const dropdownRef = ref<HTMLDetailsElement | null>(null)

const selectedAgentId = computed(() => props.selectedAgent?.id || '')

const selectAgent = (agentId: string) => {
    emit('select-agent', agentId)
    if (dropdownRef.value) {
        dropdownRef.value.open = false
    }
}

const createNewSession = () => {
    emit('create-session')
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
        <!-- Hamburger menu (mobile only) -->
        <div class="flex-none lg:hidden">
            <label for="sidebar-drawer" class="btn btn-square btn-ghost drawer-button">
                <Bars3Icon class="h-5 w-5" />
            </label>
        </div>
        <div class="flex-1">
            <!-- Agent dropdown (for agent main sessions) -->
            <details v-if="showAgentDropdown" class="dropdown" ref="dropdownRef">
                <summary class="btn btn-ghost btn-sm gap-1 list-none">
                    <span class="font-semibold">{{ selectedAgent?.name || 'Assistant' }}</span>
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
            <span v-else class="btn btn-ghost btn-sm font-semibold">
                {{ currentSessionName }}
            </span>
        </div>
        <!-- Connection status indicator -->
        <div class="flex-none flex items-center gap-2">
            <div class="flex items-center gap-1">
                <div class="w-2 h-2 rounded-full" :class="gatewayStore.connected ? 'bg-success' : 'bg-error'"></div>
                <span class="text-xs text-base-content/60 hidden sm:inline">
                    {{ gatewayStore.connected ? '已连接' : '未连接' }}
                </span>
            </div>
        </div>
        <!-- Mobile buttons -->
        <div class="flex-none flex gap-1 lg:hidden">
            <button @click="startVoiceChat" class="btn btn-ghost btn-circle btn-sm" title="语音对话">
                <PhoneIcon class="h-5 w-5" />
            </button>
            <button @click="createNewSession" class="btn btn-ghost btn-circle btn-sm" title="新建对话">
                <PlusIcon class="h-5 w-5" />
            </button>
        </div>
        <!-- PC theme toggle button -->
        <div class="flex-none hidden lg:flex gap-2">
            <button @click="settingsStore.toggleLayout()" class="btn btn-ghost btn-circle btn-sm"
                :title="settingsStore.isWideMode ? '切换至窄屏' : '切换至宽屏'">
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
