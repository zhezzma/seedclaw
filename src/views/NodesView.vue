<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useGatewayStore } from '../stores/gateway'
import { useUiSettingsStore } from '../stores/setting'
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    ServerIcon,
    CheckCircleIcon,
    XCircleIcon,
    ShieldCheckIcon,
    TrashIcon
} from '@heroicons/vue/24/outline'
import {
    type NodesState,
} from '~openclaw/ui/src/ui/controllers/nodes'
import { PairedNode, PendingNode } from '../stores/nodes'


const router = useRouter()
const store = useGatewayStore()
const settingsStore = useUiSettingsStore()

const goBack = () => {
    router.back()
}

const handleRefresh = async () => {
    await store.loadNodes()
}

const handleApprove = async (req: PendingNode) => {
    await store.approveNodePairing(req.requestId)
}

const handleReject = async (req: PendingNode) => {
    await store.rejectNodePairing(req.requestId)
}

const handleRotate = async (node: PairedNode, tokenRole: string) => {
    await store.rotateNodeToken({
        deviceId: node.deviceId,
        role: tokenRole
    })
}

const handleRevoke = async (node: PairedNode, tokenRole: string) => {
    await store.revokeNodeToken({
        deviceId: node.deviceId,
        role: tokenRole
    })
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
    await store.loadNodes()
})
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <span class="text-lg font-semibold px-4">节点管理</span>
            </div>
            <div class="flex-none">
                <button @click="handleRefresh" class="btn btn-ghost btn-sm btn-circle"
                    :class="{ 'loading': store.nodesLoading }" :disabled="store.nodesLoading">
                    <ArrowPathIcon v-if="!store.nodesLoading" class="w-5 h-5" />
                </button>
            </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            <div class="mx-auto space-y-6" :class="{ 'max-w-4xl': !settingsStore.isWideMode }">

                <!-- Error State -->
                <div v-if="store.nodesError" class="alert alert-error shadow-sm">
                    <XCircleIcon class="w-6 h-6" />
                    <span>{{ store.nodesError }}</span>
                </div>

                <!-- Intro/Description -->
                <div class="prose prose-sm">
                    <h3>节点列表</h3>
                    <p class="text-base-content/60">管理已配对的节点并审批新的连接请求。</p>
                </div>


            </div>
        </div>
    </div>
</template>
