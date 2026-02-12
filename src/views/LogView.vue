<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGateway } from '../composables/useGateway'
import { useUiSettingsStore } from '../stores/setting'
import type { LogEntry, LogLevel } from '~openclaw/ui/src/ui/types'
import { useLogsState } from '../composables/useLogsState'
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    FunnelIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    BugAntIcon,
    XCircleIcon,
    ExclamationCircleIcon,
    PlayIcon,
    PauseIcon
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const store = useGateway()
const logsState = useLogsState()
const settingsStore = useUiSettingsStore()
const { t } = useI18n()

// Local State
const searchQuery = ref('')
const autoRefresh = ref(true)
const levelFilter = ref<LogLevel | 'all'>('all')
let refreshInterval: number | null = null

const levelOptions: { value: LogLevel | 'all'; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'trace', label: 'TRACE' },
    { value: 'debug', label: 'DEBUG' },
    { value: 'info', label: 'INFO' },
    { value: 'warn', label: 'WARN' },
    { value: 'error', label: 'ERROR' },
    { value: 'fatal', label: 'FATAL' },
]


const handleRefresh = () => {
    logsState.loadLogs({ reset: true })
}

const handleLoadMore = () => {
    logsState.loadLogs({ quiet: true })
}

// Filter logs based on search and level
const filteredLogs = computed(() => {
    let logs = logsState.logsEntries as LogEntry[]

    // Apply level filter
    if (levelFilter.value !== 'all') {
        logs = logs.filter(log => log.level === levelFilter.value)
    }

    // Apply search filter
    if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase()
        logs = logs.filter(log => {
            const message = log.message?.toLowerCase() || ''
            const subsystem = log.subsystem?.toLowerCase() || ''
            const raw = log.raw?.toLowerCase() || ''
            return message.includes(query) || subsystem.includes(query) || raw.includes(query)
        })
    }

    return logs
})

// Get level badge style
const getLevelBadgeClass = (level: LogLevel | null | undefined): string => {
    switch (level) {
        case 'trace':
            return 'badge-ghost text-base-content/50'
        case 'debug':
            return 'badge-ghost'
        case 'info':
            return 'badge-info'
        case 'warn':
            return 'badge-warning'
        case 'error':
            return 'badge-error'
        case 'fatal':
            return 'badge-error badge-outline'
        default:
            return 'badge-ghost'
    }
}

// Get level icon
const getLevelIcon = (level: LogLevel | null | undefined) => {
    switch (level) {
        case 'trace':
        case 'debug':
            return BugAntIcon
        case 'info':
            return InformationCircleIcon
        case 'warn':
            return ExclamationTriangleIcon
        case 'error':
            return XCircleIcon
        case 'fatal':
            return ExclamationCircleIcon
        default:
            return InformationCircleIcon
    }
}

// Format time
const formatTime = (time: string | null | undefined): string => {
    if (!time) return ''
    try {
        const date = new Date(time)
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        })
    } catch {
        return time
    }
}

// Format date
const formatDate = (time: string | null | undefined): string => {
    if (!time) return ''
    try {
        const date = new Date(time)
        return date.toLocaleDateString('zh-CN', {
            month: '2-digit',
            day: '2-digit'
        })
    } catch {
        return ''
    }
}

// Auto-refresh toggle
watch(autoRefresh, (enabled) => {
    if (enabled) {
        refreshInterval = window.setInterval(() => {
            logsState.loadLogs({ quiet: true })
        }, 3000)
    } else if (refreshInterval) {
        window.clearInterval(refreshInterval)
        refreshInterval = null
    }
})

onMounted(() => {
    logsState.loadLogs({ reset: true })
})

// Watch connection
watch(() => store.connected, async (connected) => {
    if (connected) {
        await logsState.loadLogs({ reset: true })
    }
})

onUnmounted(() => {
    if (refreshInterval) {
        window.clearInterval(refreshInterval)
    }
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <ViewHeader :title="$t('log.title')">
            <template #actions>
                <div class="join">
                    <button @click="toggleAutoRefresh" class="btn btn-sm join-item"
                        :class="autoRefresh ? 'btn-active' : ''"
                        :title="autoRefresh ? $t('log.stopAutoRefresh') : $t('log.startAutoRefresh')">
                        <PauseIcon v-if="autoRefresh" class="w-4 h-4" />
                        <PlayIcon v-else class="w-4 h-4" />
                    </button>
                    <button @click="refreshLogs" class="btn btn-sm join-item"
                        :class="{ 'loading': logsState.logsLoading }">
                        <ArrowPathIcon v-if="!logsState.logsLoading" class="w-4 h-4" />
                    </button>
                    <button @click="logsState.resetLogs" class="btn btn-sm join-item text-error">
                        <XCircleIcon class="w-4 h-4" />
                    </button>
                </div>
            </template>
        </ViewHeader>

        <!-- Filters Toolbar -->
        <div class="p-2 border-b border-base-300 bg-base-100 flex gap-2 items-center overflow-x-auto">
            <div class="join shrink-0">
                <input v-model="filterText" type="text" class="input input-sm input-bordered join-item w-32 md:w-48"
                    :placeholder="$t('common.search')" />
            </div>

            <div class="join shrink-0">
                <select v-model="minLevel" class="select select-bordered select-sm join-item">
                    <option value="debug">DEBUG</option>
                    <option value="info">INFO</option>
                    <option value="warn">WARN</option>
                    <option value="error">ERROR</option>
                </select>
            </div>

            <div class="flex-1"></div>
            <div class="text-xs opacity-50 px-2 whitespace-nowrap">
                {{ filteredLogs.length }} / {{ logsState.logsEntries.length }}
            </div>
        </div>

        <!-- Logs Content -->
        <div class="flex-1 overflow-y-auto p-0 scroll-smooth font-mono text-xs md:text-sm bg-base-100"
            ref="logsContainer">
            <div v-if="filteredLogs.length === 0" class="flex flex-col items-center justify-center h-full opacity-50">
                <div class="text-4xl mb-2">📋</div>
                <div v-if="logsState.logsEntries.length > 0">{{ $t('log.noMatchingLogs') }}</div>
                <div v-else>{{ $t('log.noLogs') }}</div>
            </div>

            <table v-else class="table table-xs w-full">
                <tbody>
                    <tr v-for="(log, idx) in filteredLogs" :key="idx" class="hover group"
                        :class="getLevelClass(log.level)">
                        <!-- Time -->
                        <td class="whitespace-nowrap w-24 opacity-60 align-top">
                            {{ formatTime(log.ts) }}
                        </td>

                        <!-- Level Icon -->
                        <td class="w-8 align-top p-1">
                            <component :is="getLevelIcon(log.level)" class="w-4 h-4" />
                        </td>

                        <!-- Module/Source -->
                        <td class="w-24 align-top font-bold opacity-80 whitespace-nowrap">
                            {{ log.module }}
                        </td>

                        <!-- Message -->
                        <td class="align-top break-all whitespace-pre-wrap">
                            <span>{{ log.msg }}</span>
                            <!-- Fields -->
                            <div v-if="Object.keys(log.fields || {}).length > 0"
                                class="mt-1 p-1 bg-base-300/30 rounded text-xs opacity-80 overflow-x-auto">
                                <span v-for="(val, key) in log.fields" :key="key" class="mr-3 inline-block">
                                    <span class="opacity-60">{{ key }}:</span>
                                    <span class="ml-1 text-primary-content/80">{{ val }}</span>
                                </span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
