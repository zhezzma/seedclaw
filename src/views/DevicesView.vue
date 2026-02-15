<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useUiSettingsStore } from '../stores/setting'
import {
    ArrowPathIcon,
    ComputerDesktopIcon,
    XCircleIcon,
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
// Local type definitions (previously from ~openclaw)
interface PairedDevice {
    deviceId: string
    displayName?: string
    remoteIp?: string
    roles?: string[]
    scopes?: string[]
    tokens?: { role: string; scopes?: string[]; lastUsedAtMs?: number }[]
}

interface PendingDevice {
    requestId: string
    deviceId: string
    displayName?: string
    remoteIp?: string
    role: string
    ts?: number
}
import { useDevicesState } from '../composables/useDevicesState'
import { useI18n } from 'vue-i18n'
import NodesList from '../components/nodes/NodesList.vue'

const router = useRouter()

const devicesState = useDevicesState()
const settingsStore = useUiSettingsStore()
const { t } = useI18n()

const handleRefresh = () => {
    devicesState.loadDevices()
}

const handleApprove = async (req: PendingDevice) => {
    await devicesState.approvePairRequest(req.requestId)
}

const handleReject = async (req: PendingDevice) => {
    await devicesState.rejectPairRequest(req.requestId)
}

const handleRotate = async (device: PairedDevice, tokenRole: string) => {
    await devicesState.rotateDeviceToken(device.deviceId)
}

const handleRevoke = async (device: PairedDevice, tokenRole: string) => {
    await devicesState.revokeDevice(device.deviceId)
}

const getRelativeTime = (ts?: number) => {
    if (!ts) return ''
    const now = Date.now()
    const diff = now - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('common.justNow')
    if (mins < 60) return t('common.minutesAgo', { n: mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('common.hoursAgo', { n: hours })
    return t('common.daysAgo', { n: Math.floor(hours / 24) })
}

onMounted(async () => {
    await devicesState.loadDevices()
})



</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <ViewHeader :title="$t('device.title')">
            <template #actions>
                <button @click="handleRefresh" class="btn btn-ghost btn-sm btn-circle"
                    :class="{ 'loading': devicesState.devicesLoading }" :disabled="devicesState.devicesLoading">
                    <ArrowPathIcon v-if="!devicesState.devicesLoading" class="w-5 h-5" />
                </button>
            </template>
        </ViewHeader>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-10">
            <div class="mx-auto space-y-10" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">

                <!-- Devices Section -->
                <div class="space-y-6">
                    <!-- Error State -->
                    <div v-if="devicesState.devicesError" class="alert alert-error shadow-sm">
                        <XCircleIcon class="w-6 h-6" />
                        <span>{{ devicesState.devicesError }}</span>
                    </div>

                    <!-- Intro/Description -->
                    <div class="prose prose-sm">
                        <h3 class="mb-0">{{ $t('device.listTitle') }}</h3>
                        <p class="text-base-content/60 mt-0">{{ $t('device.listDesc') }}</p>
                    </div>

                    <!-- Pending Requests -->
                    <div v-if="devicesState.devicesList?.pending?.length" class="space-y-4">
                        <h4 class="text-sm font-bold text-warning uppercase tracking-wider px-1">{{
                            $t('device.pendingTitle') }}
                        </h4>
                        <div class="space-y-3">
                            <div v-for="req in devicesState.devicesList.pending" :key="req.requestId"
                                class="card bg-base-100 shadow-sm border border-warning/20">
                                <div class="card-body p-4 sm:p-5">
                                    <div
                                        class="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                                        <div class="space-y-1 w-full min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="font-bold text-lg">{{ req.displayName ||
                                                    $t('device.unknownDevice')
                                                    }}</span>
                                                <span class="text-xs text-base-content/40 font-mono hidden sm:inline">{{
                                                    req.remoteIp }}</span>
                                            </div>
                                            <div class="text-xs font-mono text-base-content/60 break-all">{{
                                                req.deviceId }}
                                            </div>
                                            <div class="text-sm text-base-content/70">
                                                {{ $t('device.requestRole') }}: <span
                                                    class="font-medium text-primary">{{
                                                        req.role }}</span>
                                                <span class="text-base-content/40 mx-2">•</span>
                                                {{ $t('device.requestedAt') }} {{ getRelativeTime(req.ts) }}
                                            </div>
                                        </div>
                                        <div class="flex gap-2 w-full sm:w-auto shrink-0">
                                            <button class="btn btn-primary btn-sm flex-1 sm:flex-none"
                                                @click="handleApprove(req)">{{ $t('common.approve') }}</button>
                                            <button class="btn btn-ghost btn-sm flex-1 sm:flex-none"
                                                @click="handleReject(req)">{{ $t('common.reject') }}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Paired Devices -->
                    <div class="space-y-4">
                        <h4 class="text-sm font-bold text-base-content/40 uppercase tracking-wider px-1">{{
                            $t('device.pairedTitle') }}</h4>
                        <div v-if="!devicesState.devicesList?.paired?.length"
                            class="text-center py-8 opacity-30 bg-base-100 rounded-xl border-2 border-dashed border-base-300">
                            <ComputerDesktopIcon class="w-12 h-12 mx-auto mb-2" />
                            <p>{{ $t('device.noPairedDevices') }}</p>
                        </div>
                        <div v-else class="space-y-3">
                            <div v-for="device in (devicesState.devicesList?.paired || [])" :key="device.deviceId"
                                class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
                                <div class="card-body p-4 sm:p-5">
                                    <div class="space-y-4">
                                        <div class="flex flex-col sm:flex-row justify-between gap-2">
                                            <div>
                                                <div class="flex items-center gap-2 flex-wrap">
                                                    <span class="font-bold text-lg">{{ device.displayName || '未知设备'
                                                        }}</span>
                                                    <span v-for="r in device.roles" :key="r"
                                                        class="badge badge-sm badge-primary badge-outline">{{ r
                                                        }}</span>
                                                </div>
                                                <div class="text-xs font-mono text-base-content/50 break-all mt-1">
                                                    {{ device.deviceId }} <span class="mx-1">·</span> {{ device.remoteIp
                                                    }}
                                                </div>
                                                <div v-if="device.scopes?.length"
                                                    class="text-xs text-base-content/60 mt-1">
                                                    Scopes: {{ device.scopes.join(', ') }}</div>
                                            </div>
                                        </div>
                                        <div v-if="device.tokens?.length" class="border-t border-base-200 pt-3">
                                            <div class="text-xs font-bold text-base-content/40 mb-2 uppercase">活跃令牌
                                            </div>
                                            <div class="space-y-2">
                                                <div v-for="(token, idx) in device.tokens" :key="idx"
                                                    class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-base-200/50 rounded p-2 text-sm">
                                                    <div class="flex-1 space-y-0.5">
                                                        <div class="flex items-center gap-2">
                                                            <span class="font-medium">{{ token.role }}</span>
                                                            <span class="badge badge-xs badge-success">活跃</span>
                                                        </div>
                                                        <div class="text-xs text-base-content/50">
                                                            权限: {{ token.scopes?.join(', ') || '无' }}
                                                            <span v-if="token.lastUsedAtMs">· 使用于 {{
                                                                getRelativeTime(token.lastUsedAtMs) }}</span>
                                                        </div>
                                                    </div>
                                                    <div class="flex gap-2 shrink-0">
                                                        <button class="btn btn-xs btn-ghost border-base-300"
                                                            @click="handleRotate(device, token.role)">轮换</button>
                                                        <button class="btn btn-xs btn-ghost text-error"
                                                            @click="handleRevoke(device, token.role)">吊销</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>



                <!-- Nodes Section (As Component) -->
                <NodesList />

            </div>
        </div>
    </div>
</template>