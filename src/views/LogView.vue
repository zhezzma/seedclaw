<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGatewayStore } from '../stores/gateway'
import { useUiSettingsStore } from '../stores/setting'
import type { LogEntry, LogLevel } from '../services/types'
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

const router = useRouter()
const store = useGatewayStore()
const settingsStore = useUiSettingsStore()

const searchQuery = ref('')
const levelFilter = ref<LogLevel | 'all'>('all')
const autoRefresh = ref(false)
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

const goBack = () => {
    router.back()
}

const handleRefresh = () => {
    store.loadLogs({ reset: true })
}

const handleLoadMore = () => {
    store.loadLogs({ quiet: true })
}

// Filter logs based on search and level
const filteredLogs = computed(() => {
    let logs = store.logsEntries as LogEntry[]

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
            store.loadLogs({ quiet: true })
        }, 3000)
    } else if (refreshInterval) {
        window.clearInterval(refreshInterval)
        refreshInterval = null
    }
})

onMounted(() => {
    store.loadLogs({ reset: true })
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
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle lg:hidden">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <span class="text-lg font-semibold px-4">系统日志</span>
            </div>
            <div class="flex-none flex items-center gap-1">
                <!-- Auto-refresh toggle -->
                <label class="swap btn btn-ghost btn-sm tooltip tooltip-bottom"
                    :data-tip="autoRefresh ? '停止自动刷新' : '开启自动刷新'">
                    <input type="checkbox" v-model="autoRefresh" />
                    <PlayIcon class="swap-off w-5 h-5" />
                    <PauseIcon class="swap-on w-5 h-5 text-primary" />
                </label>
                <!-- Manual refresh -->
                <button @click="handleRefresh" class="btn btn-ghost btn-sm btn-circle tooltip tooltip-bottom"
                    :class="{ 'loading': store.logsLoading }" :disabled="store.logsLoading" data-tip="刷新">
                    <ArrowPathIcon v-if="!store.logsLoading" class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="shrink-0 bg-base-100 border-b border-base-300 p-3">
            <div class="flex flex-col sm:flex-row gap-3">
                <!-- Search -->
                <div class="flex-1 relative">
                    <MagnifyingGlassIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
                    <input type="text" v-model="searchQuery" placeholder="搜索日志内容..."
                        class="input input-bordered input-sm w-full pl-9" />
                </div>
                <!-- Level filter -->
                <div class="flex items-center gap-2">
                    <FunnelIcon class="w-4 h-4 text-base-content/60" />
                    <select v-model="levelFilter" class="select select-bordered select-sm">
                        <option v-for="opt in levelOptions" :key="opt.value" :value="opt.value">
                            {{ opt.label }}
                        </option>
                    </select>
                </div>
            </div>
            <!-- File info -->
            <div v-if="store.logsFile" class="mt-2 text-xs text-base-content/50 truncate">
                📄 {{ store.logsFile }}
                <span v-if="store.logsLastFetchAt">
                    · 更新于 {{ new Date(store.logsLastFetchAt).toLocaleTimeString('zh-CN') }}
                </span>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            <div class="mx-auto space-y-4" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">
                <!-- Loading state -->
                <div v-if="store.logsLoading && !store.logsEntries.length"
                    class="flex items-center justify-center py-12">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <!-- Error state -->
                <div v-else-if="store.logsError" class="alert alert-error">
                    <XCircleIcon class="w-5 h-5" />
                    <span>{{ store.logsError }}</span>
                </div>

                <!-- Empty state -->
                <div v-else-if="!filteredLogs.length" class="text-center py-12 text-base-content/50">
                    <InformationCircleIcon class="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p v-if="searchQuery || levelFilter !== 'all'">没有匹配的日志</p>
                    <p v-else>暂无日志记录</p>
                </div>

                <!-- Log entries -->
                <div v-else class="space-y-1">
                    <div v-for="(log, index) in filteredLogs" :key="index"
                        class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
                        <div class="card-body p-3">
                            <div class="flex items-start gap-3">
                                <!-- Level icon -->
                                <div class="shrink-0 mt-0.5">
                                    <component :is="getLevelIcon(log.level)" class="w-4 h-4 opacity-60" />
                                </div>
                                <!-- Content -->
                                <div class="flex-1 min-w-0">
                                    <!-- Header row -->
                                    <div class="flex items-center gap-2 flex-wrap mb-1">
                                        <span :class="['badge badge-sm', getLevelBadgeClass(log.level)]">
                                            {{ log.level?.toUpperCase() || 'LOG' }}
                                        </span>
                                        <span v-if="log.subsystem"
                                            class="badge badge-sm badge-outline text-base-content/70">
                                            {{ log.subsystem }}
                                        </span>
                                        <span v-if="log.time" class="text-xs text-base-content/40 ml-auto shrink-0">
                                            <span class="hidden sm:inline">{{ formatDate(log.time) }} </span>
                                            {{ formatTime(log.time) }}
                                        </span>
                                    </div>
                                    <!-- Message -->
                                    <p class="text-sm break-all whitespace-pre-wrap">
                                        {{ log.message || log.raw }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Load more -->
                    <div v-if="!store.logsTruncated && store.logsEntries.length > 0" class="text-center py-4">
                        <button @click="handleLoadMore" class="btn btn-ghost btn-sm"
                            :class="{ 'loading': store.logsLoading }" :disabled="store.logsLoading">
                            加载更多
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
