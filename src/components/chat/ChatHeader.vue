<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router' // Added useRoute
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
    ChevronLeftIcon // Import added
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../../stores/setting'
import { useGateway } from '../../composables/useGateway'
import { useChatState } from '../../composables/useChatState'
import { createAgentMainSessionKey, isAgentMainSession } from '../../utils/session-key-helpers'
import { isNewSession, NEW_SESSION_ROUTE_NAME } from '../../utils/route-helpers'
import { useSessionsState } from '~/src/composables/useSessionsState'

interface Agent {
    id: string
    name: string
    icon: string
    description?: string
}

const props = defineProps<{
    selectedAgent: any
    agents: any[]
}>()


const emit = defineEmits<{
    (e: 'start-voice-chat'): void
}>()

const router = useRouter()
const route = useRoute()

const handleBack = () => {
    // Go back to list view
    router.back()
}
const sessionsState = useSessionsState()
const settingsStore = useUiSettingsStore()
const gatewayStore = useGateway()
const chatState = useChatState()
const dropdownRef = ref<HTMLDetailsElement | null>(null)

const showAgentDropdown = computed(() => isAgentMainSession(chatState.sessionKey) || isNewSession(route))

const selectedAgentId = computed(() => props.selectedAgent?.id || '')

// Get current session name from sessions list
const currentSessionName = computed(() => {
    const sessionKey = chatState.sessionKey
    if (!sessionKey) return 'Chat Session'

    const sessions = sessionsState.sessionsResult?.sessions || []
    const session = sessions.find((s: any) => s.key === sessionKey)
    return session?.displayName || session?.label || 'Chat Session'
})


const selectAgent = (agentId: string) => {

    if (isNewSession(route)) {
        chatState.assistantAgentId = agentId
    }
    else {
        // Navigate to agent's main session
        router.push({ name: 'chat', params: { sessionkey: createAgentMainSessionKey(agentId) } })
    }

    if (dropdownRef.value) {
        dropdownRef.value.open = false
    }
}

const createNewSession = () => {
    router.push({ name: NEW_SESSION_ROUTE_NAME }) // Or use path '/new' if preferred, but name is safe with constant
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
        <button v-if="route.query.type" @click="handleBack" class="btn btn-ghost btn-circle btn-sm -ml-2 lg:hidden">
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
            <details v-if="showAgentDropdown" class="dropdown" ref="dropdownRef">
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
                <span class="truncate max-w-[200px] lg:max-w-none">{{ currentSessionName }}</span>
                <span v-if="chatState.assistantAgentId" class="badge badge-sm badge-ghost shrink-0">{{
                    chatState.assistantAgentId }}</span>
            </div>
        </div>
        <!-- Connection status indicator -->
        <div class="flex-none flex items-center gap-2 pr-1">
            <div class="flex items-center gap-3 min-w-0">


                <div class="flex items-center gap-1">
                    <div class="w-2 h-2 rounded-full" :class="gatewayStore.connected ? 'bg-success' : 'bg-error'"></div>
                    <span class="text-xs text-base-content/60 hidden sm:inline">
                        {{ gatewayStore.connected ? $t('chat.connected') : $t('chat.disconnected') }}
                    </span>
                </div>
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
