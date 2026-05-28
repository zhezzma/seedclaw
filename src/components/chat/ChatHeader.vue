<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { SessionUsage } from '../../composables/useChatState'
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
    ArrowPathIcon,
    RectangleGroupIcon
} from '@heroicons/vue/24/outline'
import { useUiSettingsStore } from '../../stores/setting'
import { isConnected } from '../../composables/notify-server-connection'
import { useWorkspacePanel } from '../../composables/useWorkspacePanel'

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
const { t } = useI18n()
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
const panel = useWorkspacePanel()


const dropdownRef = ref<HTMLDetailsElement | null>(null)
const showUsageTip = ref(false)

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

// Close dropdown / tooltip when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        dropdownRef.value.open = false
    }
    showUsageTip.value = false
}

// ---- Token usage formatting (mirrors TUI footer logic) ----
function formatTokens(count: number): string {
    if (count < 1000) return count.toString()
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`
    if (count < 1000000) return `${Math.round(count / 1000)}k`
    if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`
    return `${Math.round(count / 1000000)}M`
}

function buildUsageTip(usage: SessionUsage): string {
    const parts: string[] = []
    if (usage.input) parts.push(`↑${formatTokens(usage.input)}`)
    if (usage.output) parts.push(`↓${formatTokens(usage.output)}`)
    if (usage.cacheRead) parts.push(`R${formatTokens(usage.cacheRead)}`)
    if (usage.cacheWrite) parts.push(`W${formatTokens(usage.cacheWrite)}`)
    if (usage.cost) parts.push(`$${usage.cost.toFixed(3)}`)

    // Context window usage
    const auto = usage.autoCompactEnabled ? ` (${t('common.autoCompact')})` : ''
    if (usage.percent !== null) {
        parts.push(`${usage.percent.toFixed(1)}%/${formatTokens(usage.contextWindow)}${auto}`)
    } else if (usage.contextWindow > 0) {
        parts.push(`?/${formatTokens(usage.contextWindow)}${auto}`)
    }
    return parts.join(' ')
}

/** Tooltip 各行内容（空数组 = 只显示连接状态） */
const usageTipLines = computed<string[]>(() => {
    const usage = chatState.sessionUsage
    if (!usage) return []

    const lines: string[] = []

    // 第一行：token 统计
    const usageLine = buildUsageTip(usage)
    if (usageLine) lines.push(usageLine)

    // 第二行：提供商/模型 + 思考级别
    const session = chatState.currentSession
    const provider = session?.modelProvider || ''
    const model = session?.model || ''
    const thinking = session?.thinkingLevel
    const modelLabel = provider && model ? `${provider}/${model}` : model || provider
    if (modelLabel) {
        if (thinking && thinking !== 'off') {
            lines.push(`${modelLabel} · ${thinking}`)
        } else if (thinking === 'off') {
            lines.push(`${modelLabel} · thinking off`)
        } else {
            lines.push(modelLabel)
        }
    }

    return lines
})

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
            <div class="flex items-center">
                <!-- Connection Status Indicator -->
                <div class="relative group flex items-center" @click.stop="showUsageTip = !showUsageTip">
                    <div class="w-3 h-3 rounded-full transition-colors duration-300 cursor-pointer"
                        :class="isConnected ? 'bg-success' : 'bg-error/50'"></div>
                    <!-- Multi-line tooltip: hover (PC) + click (mobile) -->
                    <div class="pointer-events-none absolute top-full mt-2 right-0
                                transition-opacity duration-200
                                bg-neutral text-neutral-content text-xs rounded-lg px-3 py-2
                                shadow-lg whitespace-nowrap z-50"
                        :class="showUsageTip ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'">
                        <div>{{ isConnected ? $t('common.connected') : $t('common.disconnected') }}</div>
                        <div v-for="(line, i) in usageTipLines" :key="i"
                            class="text-neutral-content/70">{{ line }}</div>
                    </div>
                </div>

                <!-- Voice button -->
                <!-- <div v-if="settingsStore.isCurrentAsrConfigured && settingsStore.isCurrentTtsConfigured">
                    <button @click="startVoiceChat"
                        class="btn btn-ghost btn-circle btn-sm" :title="$t('chat.voiceChat')">
                        <PhoneIcon class="h-5 w-5" />
                    </button>
                </div> -->

         

                <!-- Mobile buttons -->
                <div class="flex lg:hidden">
                    <button @click="refreshPage" class="btn btn-ghost btn-circle btn-sm" :title="$t('common.refresh')">
                        <ArrowPathIcon class="h-5 w-5" />
                    </button>
                    <button @click="createNewSession" class="btn btn-ghost btn-circle btn-sm"
                        :title="$t('chat.newChat')">
                        <PlusIcon class="h-5 w-5" />
                    </button>
                </div>

                <!-- PC theme toggle button -->
                <div class="hidden lg:flex items-center">
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

                <!-- Workspace panel toggle: PC 与移动端共用（移动端在 ChatHeader
                     按钮区开 right-drawer，与左侧 sidebar drawer 对称）。
                     无 agent 选中时隐藏，避免点开个空 drawer。 -->
                <button v-if="chatState.agentsSelectedId" @click="panel.toggle()"
                    class="btn btn-ghost btn-circle btn-sm"
                    :class="{ 'text-primary': panel.isOpen.value }"
                    :title="$t('workspace.toggle')">
                    <RectangleGroupIcon class="h-5 w-5" />
                </button>
            </div>
        </template>
    </ViewHeader>
</template>
