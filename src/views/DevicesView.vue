<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGateway } from '../composables/useGateway'
import { useUiSettingsStore } from '../stores/setting'
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    ComputerDesktopIcon,
    CheckCircleIcon,
    XCircleIcon,
    ShieldCheckIcon,
    TrashIcon
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { PairedDevice, PendingDevice } from '~openclaw/ui/src/ui/controllers/devices'
import { useDevicesState } from '../composables/useDevicesState'

const router = useRouter()
const store = useGateway()
const devicesState = useDevicesState()
const settingsStore = useUiSettingsStore()

const goBack = () => {
    router.back()
}

const handleRefresh = () => {
    devicesState.loadDevices()
}

const handleApprove = async (req: PendingDevice) => {
    await devicesState.approveDevicePairing(req.requestId)
}

const handleReject = async (req: PendingDevice) => {
    await devicesState.rejectDevicePairing(req.requestId)
}

const handleRotate = async (device: PairedDevice, tokenRole: string) => {
    await devicesState.rotateDeviceToken({
        deviceId: device.deviceId,
        role: tokenRole
    })
}

const handleRevoke = async (device: PairedDevice, tokenRole: string) => {
    await devicesState.revokeDeviceToken({
        deviceId: device.deviceId,
        role: tokenRole
    })
}

const formatTime = (ts?: number) => {
    if (!ts) return ''
    return new Date(ts).toLocaleString('zh-CN')
}

// Helper to get relative time (e.g., "5m ago")
const getRelativeTime = (ts?: number) => {
    if (!ts) return ''
    const now = Date.now()
    const diff = now - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}小时前`
    return Math.floor(hours / 24) + '天前'
}

onMounted(async () => {
    await devicesState.loadDevices()
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <ViewHeader title="设备管理">
            <template #actions>
                <button @click="handleRefresh" class="btn btn-ghost btn-sm btn-circle"
                    :class="{ 'loading': devicesState.devicesLoading }" :disabled="devicesState.devicesLoading">
                    <ArrowPathIcon v-if="!devicesState.devicesLoading" class="w-5 h-5" />
                </button>
            </template>
        </ViewHeader>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <div class="mx-auto space-y-6" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">

                <!-- Error State -->
                <div v-if="devicesState.devicesError" class="alert alert-error shadow-sm">
                    <XCircleIcon class="w-6 h-6" />
                    <span>{{ devicesState.devicesError }}</span>
                </div>

                <!-- Intro/Description -->
                <div class="prose prose-sm">
                    <h3>设备列表</h3>
                    <p class="text-base-content/60">管理已配对的设备并审批新的连接请求。</p>
                </div>

                <!-- Pending Requests -->
                <div v-if="devicesState.devicesList?.pending?.length" class="space-y-4">
                    <h4 class="text-sm font-bold text-warning uppercase tracking-wider px-1">待审批请求</h4>
                    <div class="space-y-3">
                        <div v-for="req in devicesState.devicesList.pending" :key="req.requestId"
                            class="card bg-base-100 shadow-sm border border-warning/20">
                            <div class="card-body p-4 sm:p-5">
                                <div
                                    class="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                                    <div class="space-y-1 w-full min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="font-bold text-lg">{{ req.displayName || '未知设备'
                                                }}</span>
                                            <!-- <span v-if="req.platform" class="badge badge-sm badge-ghost">{{ req.platform
                                            }}</span> -->
                                            <span class="text-xs text-base-content/40 font-mono hidden sm:inline">{{
                                                req.remoteIp }}</span>
                                        </div>
                                        <div class="text-xs font-mono text-base-content/60 break-all">
                                            {{ req.deviceId }}
                                        </div>
                                        <div class="text-sm text-base-content/70">
                                            申请角色: <span class="font-medium text-primary">{{ req.role
                                            }}</span>
                                            <span class="text-base-content/40 mx-2">•</span>
                                            申请于 {{ getRelativeTime(req.ts) }}
                                        </div>
                                    </div>
                                    <div class="flex gap-2 w-full sm:w-auto shrink-0">
                                        <button class="btn btn-primary btn-sm flex-1 sm:flex-none"
                                            @click="handleApprove(req)">
                                            批准
                                        </button>
                                        <button class="btn btn-ghost btn-sm flex-1 sm:flex-none"
                                            @click="handleReject(req)">
                                            拒绝
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Paired Devices -->
                <div class="space-y-4">
                    <h4 class="text-sm font-bold text-base-content/40 uppercase tracking-wider px-1">已配对设备</h4>

                    <div v-if="!devicesState.devicesList?.paired?.length" class="text-center py-8 opacity-50">
                        <ComputerDesktopIcon class="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>暂无已配对设备</p>
                    </div>

                    <div v-else class="space-y-3">
                        <div v-for="device in (devicesState.devicesList?.paired || [])" :key="device.deviceId"
                            class="card bg-base-100 shadow-sm">
                            <div class="card-body p-4 sm:p-5">
                                <div class="space-y-4">
                                    <!-- Device Header -->
                                    <div class="flex flex-col sm:flex-row justify-between gap-2">
                                        <div>
                                            <div class="flex items-center gap-2 flex-wrap">
                                                <span class="font-bold text-lg">{{ device.displayName || '未知设备'
                                                    }}</span>
                                                <span v-if="device.roles?.length" class="flex gap-1">
                                                    <span v-for="r in device.roles" :key="r"
                                                        class="badge badge-sm badge-primary badge-outline">
                                                        {{ r }}
                                                    </span>
                                                </span>
                                            </div>
                                            <div class="text-xs font-mono text-base-content/50 break-all mt-1">
                                                {{ device.deviceId }}
                                                <span class="mx-1">·</span>
                                                {{ device.remoteIp }}
                                            </div>
                                            <div v-if="device.scopes?.length" class="text-xs text-base-content/60 mt-1">
                                                Scopes: {{ device.scopes.join(', ') }}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Tokens List -->
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
                                                        权限范围: {{ token.scopes?.join(', ') || '无' }}
                                                        <span v-if="token.lastUsedAtMs">· 使用于 {{
                                                            getRelativeTime(token.lastUsedAtMs) }}</span>
                                                    </div>
                                                </div>
                                                <div class="flex gap-2 shrink-0">
                                                    <button class="btn btn-xs btn-ghost border-base-300"
                                                        @click="handleRotate(device, token.role)">
                                                        轮换
                                                    </button>
                                                    <button class="btn btn-xs btn-ghost text-error hover:bg-error/10"
                                                        @click="handleRevoke(device, token.role)">
                                                        吊销
                                                    </button>
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
        </div>
    </div>
</template>
