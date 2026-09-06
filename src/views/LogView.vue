<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useUiSettingsStore } from '../stores/setting'
import { useLogsState, type LogEntry } from '../composables/useLogsState'
import {
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

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const logsState = useLogsState()
const settingsStore = useUiSettingsStore()
const { t } = useI18n()

// Filters
const searchQuery = ref('') // Client-side search for current page only (or could be server-side if supported)
const levelFilter = ref<LogLevel | 'all'>('all')
const autoRefresh = ref(false)
let refreshInterval: number | null = null

const levelOptions = computed(() => [
    { value: 'all', label: t('common.all') },
    { value: 'trace', label: 'TRACE' },
    { value: 'debug', label: 'DEBUG' },
    { value: 'info', label: 'INFO' },
    { value: 'warn', label: 'WARN' },
    { value: 'error', label: 'ERROR' },
    { value: 'fatal', label: 'FATAL' },
])

const loadLogsWithFilters = (resetPage = false) => {
    const opts: any = {
        level: levelFilter.value === 'all' ? undefined : levelFilter.value,
        page: resetPage ? 1 : logsState.page
    }
    logsState.loadLogs(opts)
}

const handleRefresh = () => {
    loadLogsWithFilters(false)
}

const handleLoadMore = () => {
    // Legacy: load more logic replaced by pagination
}

// Watch filters
watch(levelFilter, () => {
    loadLogsWithFilters(true)
})

// Client-side search (filters CURRENT page entries)
// Note: ideally should be server-side search query
const filteredLogs = computed(() => {
    let logs = logsState.logsEntries || []

    // Search filter
    if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase()
        logs = logs.filter(log => {
            const message = log.message?.toLowerCase() || ''
            const raw = (log as any).raw?.toLowerCase() || ''
            return message.includes(query) || raw.includes(query)
        })
    }

    return logs
})


// Get level badge style
const getLevelBadgeClass = (level: LogLevel | string | null | undefined): string => {
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
const getLevelIcon = (level: LogLevel | string | null | undefined) => {
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
            // Quiet refresh
            const opts: any = {
                level: levelFilter.value === 'all' ? undefined : levelFilter.value,
                quiet: true
            }
            logsState.loadLogs(opts)
        }, 3000)
    } else if (refreshInterval) {
        window.clearInterval(refreshInterval)
        refreshInterval = null
    }
})

onMounted(() => {
    loadLogsWithFilters(true)
})

onUnmounted(() => {
    if (refreshInterval) {
        window.clearInterval(refreshInterval)
    }
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-200/50">
        <!-- Header -->
        <ViewHeader :title="$t('log.title')" class="bg-base-100 border-b border-base-200 shadow-sm z-10">
            <template #actions>
                <div class="flex items-center gap-2">
                    <!-- Auto-refresh toggle -->
                    <div class="tooltip tooltip-bottom"
                        :data-tip="autoRefresh ? $t('log.stopAutoRefresh') : $t('log.startAutoRefresh')">
                        <label class="swap btn btn-ghost btn-sm btn-circle text-base-content/70 hover:bg-base-200">
                            <input type="checkbox" v-model="autoRefresh" />
                            <PlayIcon class="swap-off w-5 h-5" />
                            <PauseIcon class="swap-on w-5 h-5 text-primary" />
                        </label>
                    </div>

                    <!-- Manual refresh -->
                    <div class="tooltip tooltip-bottom" :data-tip="$t('common.refresh')">
                        <button @click="handleRefresh"
                            class="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:bg-base-200 transition-all duration-500"
                            :class="{ 'rotate-180': logsState.logsLoading }" :disabled="logsState.logsLoading">
                            <ArrowPathIcon class="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </template>
        </ViewHeader>

        <!-- Toolbar -->
        <div class="shrink-0 bg-base-100 border-b border-base-200 p-4 shadow-sm z-0">
            <div class="flex flex-row gap-2 items-center">
                <!-- Search -->
                <div class="flex-1 relative group min-w-0">
                    <MagnifyingGlassIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40 group-focus-within:text-primary transition-colors" />
                    <input type="text" v-model="searchQuery" :placeholder="$t('log.searchPlaceholder')"
                        class="input input-bordered input-sm w-full pl-9 bg-base-200/50 focus:bg-base-100 focus:border-primary transition-all" />
                </div>

                <!-- Filters Group -->
                <div class="flex items-center gap-2 shrink-0">
                    <!-- Level filter -->
                    <div class="join">
                        <div
                            class="join-item flex items-center bg-base-200/50 px-3 border border-base-300 border-r-0 rounded-l-lg hidden sm:flex">
                            <FunnelIcon class="w-4 h-4 text-base-content/60" />
                        </div>
                        <select v-model="levelFilter"
                            class="select select-bordered select-sm join-item w-24 sm:w-32 focus:border-primary focus:outline-none">
                            <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">
                                {{ opt.label }}
                            </option>
                        </select>
                    </div>
                </div>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth"
            :class="{ 'opacity-60 grayscale-[0.5] pointer-events-none': logsState.logsLoading }">
            <div class="mx-auto space-y-4 transition-all duration-300"
                :class="{ 'max-w-7xl': !settingsStore.isWideMode }">

                <!-- Error state -->
                <div v-if="logsState.logsError" class="alert alert-error shadow-lg">
                    <XCircleIcon class="w-6 h-6" />
                    <div class="flex flex-col">
                        <span class="font-bold">{{ $t('log.errorLoading') }}</span>
                        <span class="text-sm opacity-90">{{ logsState.logsError }}</span>
                    </div>
                </div>

                <!-- Empty state -->
                <div v-else-if="!filteredLogs.length && !logsState.logsLoading"
                    class="flex flex-col items-center justify-center py-20 text-base-content/40 bg-base-100 rounded-2xl border border-base-200 border-dashed">
                    <div class="bg-base-200 p-4 rounded-full mb-4">
                        <InformationCircleIcon class="w-8 h-8 opacity-50" />
                    </div>
                    <p class="text-lg font-medium">{{ $t('log.noLogs') }}</p>
                    <p class="text-sm mt-1">{{ $t('log.adjustFilters') }}</p>
                </div>

                <!-- Log Table -->
                <div v-else
                    class="bg-base-100 rounded-xl shadow-sm border border-base-200 overflow-hidden flex flex-col h-full">
                    <div class="overflow-x-auto w-full">
                        <!-- table-fixed：列宽固定，消息列占剩余空间自动换行，杜绝横向滚动条 -->
                        <table class="table table-sm w-full table-fixed [&_th]:py-2.5 [&_td]:py-2.5">
                            <thead class="bg-base-200/50 text-base-content/70">
                                <tr>
                                    <th class="w-24 sm:w-40 pl-4 sm:pl-6 font-semibold">{{ $t('common.time') }}</th>
                                    <th class="hidden md:table-cell w-24 text-center font-semibold">{{ $t('log.level') }}</th>
                                    <th class="font-semibold">{{ $t('common.message') }}</th>
                                    <th class="hidden md:table-cell w-20 text-center font-semibold">{{ $t('log.meta') }}</th>
                                </tr>
                            </thead>
                            <tbody class="text-sm">
                                <tr v-for="(log, index) in filteredLogs" :key="index"
                                    class="group hover:bg-base-200/40 transition-colors border-b border-base-100 last:border-0">
                                    <td
                                        class="pl-4 sm:pl-6 whitespace-nowrap font-mono text-xs opacity-60 group-hover:opacity-100 transition-opacity truncate">
                                        {{ formatTime(log.timestamp) }}
                                    </td>
                                    <td class="hidden md:table-cell text-center">
                                        <div
                                            :class="['badge badge-sm font-bold uppercase gap-1 border-0 shadow-sm', getLevelBadgeClass(log.level as LogLevel)]">
                                            <component :is="getLevelIcon(log.level as LogLevel)" class="w-3 h-3" />
                                            {{ log.level }}
                                        </div>
                                    </td>
                                    <td>
                                        <div
                                            class="font-mono text-xs text-base-content/80 break-all py-0.5 leading-snug selection:bg-primary/20 selection:text-primary">
                                            {{ log.message }}
                                        </div>
                                    </td>
                                    <td class="hidden md:table-cell text-center">
                                        <div v-if="log.meta && Object.keys(log.meta).length > 0"
                                            class="dropdown dropdown-end dropdown-left dropdown-hover">
                                            <div tabindex="0" role="button"
                                                class="btn btn-ghost btn-xs btn-circle text-primary opacity-60 group-hover:opacity-100">
                                                <InformationCircleIcon class="w-5 h-5" />
                                            </div>
                                            <div tabindex="0"
                                                class="dropdown-content z-[50] card card-compact w-80 p-0 shadow-xl bg-base-100 text-base-content border border-base-200 backdrop-blur-md">
                                                <div class="card-body gap-0 p-0">
                                                    <div
                                                        class="px-4 py-2 bg-base-200/50 border-b border-base-200 font-bold text-xs uppercase tracking-wider text-base-content/60">
                                                        {{ $t('log.metadata') }}
                                                    </div>
                                                    <div class="p-2 max-h-60 overflow-y-auto custom-scrollbar">
                                                        <div v-for="(val, key) in log.meta" :key="key"
                                                            class="grid grid-cols-[1fr,2fr] gap-2 px-2 py-1 hover:bg-base-200/50 rounded text-xs items-start">
                                                            <span
                                                                class="font-semibold text-base-content/70 break-all select-all">{{
                                                                    key }}:</span>
                                                            <pre
                                                                class="font-mono text-base-content/90 whitespace-pre-wrap break-all select-all">
                                                        {{ typeof val === 'object' ? JSON.stringify(val, null, 2) : val
                                                        }}</pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Pagination -->
                <div
                    class="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4 bg-base-100 py-1 px-3 rounded-xl border border-base-200 shadow-sm">
                    <span class="text-xs font-medium text-base-content/60 order-2 sm:order-1">
                        {{ $t('log.page') }} <span class="font-bold text-base-content">{{ logsState.page }}</span> {{
                            $t('log.of') }} <span class="font-bold text-base-content">{{ logsState.totalPages }}</span>
                        <span class="opacity-50 mx-2">|</span>
                        {{ $t('log.total') }} <span class="font-bold text-base-content">{{ logsState.total }}</span> {{
                            $t('log.entries') }}
                    </span>

                    <div class="join bg-base-200/50 p-1 rounded-lg order-1 sm:order-2">
                        <button class="join-item btn btn-sm btn-ghost hover:bg-base-100 hover:shadow-sm transition-all"
                            @click="logsState.prevPage()" :disabled="logsState.page <= 1">
                            « {{ $t('common.prev') }}
                        </button>
                        <button
                            class="join-item btn btn-sm bg-base-100 shadow-sm border border-base-200 px-4 min-w-[3rem] pointer-events-none">
                            {{ logsState.page }}
                        </button>
                        <button class="join-item btn btn-sm btn-ghost hover:bg-base-100 hover:shadow-sm transition-all"
                            @click="logsState.nextPage()" :disabled="logsState.page >= logsState.totalPages">
                            {{ $t('common.next') }} »
                        </button>
                    </div>
                </div>

            </div>
        </div>
    </div>
</template>
