<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    ServerIcon,
    ArrowPathIcon,
    XCircleIcon,
} from '@heroicons/vue/24/outline'
import { useNodesState } from '../../composables/useNodesState'

const nodesState = useNodesState()
const { t } = useI18n()

// 计算已配对的节点（node.list 返回的对象中 paired 为 true 的）
const pairedNodes = computed(() => {
    if (!Array.isArray(nodesState.nodesList)) return []
    return nodesState.nodesList.filter((n: any) => n.paired) || []
})

// 计算待配对的节点。
// 注意：node.list 通常只返回已配对或已连接的。
// 真正的“待审批”通常还在 node.pair.list 中，或者 node.list 也会包含未配对但连接中的？
// 这里为了兼容性，我们将逻辑对齐 node.list 的结果集
const pendingNodes = computed(() => {
    if (!Array.isArray(nodesState.nodesList)) return []
    // 如果 node.list 有 pending 状态字段，根据实际 API 调整
    return nodesState.nodesList.filter((n: any) => n.status === 'pending') || []
})

const handleRefresh = async () => {
    await nodesState.loadNodes()
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
    await nodesState.loadNodes()
})
</script>

<template>
    <div class="space-y-6">
        <!-- Error State -->
        <div v-if="nodesState.nodesError" class="alert alert-error shadow-sm">
            <XCircleIcon class="w-6 h-6" />
            <span>{{ nodesState.nodesError }}</span>
        </div>

        <!-- Section Header with Refresh -->
        <div class="flex items-center justify-between px-1">
            <div class="prose prose-sm">
                <h3 class="mb-0">{{ $t('nodes.title') }}</h3>
                <p class="text-base-content/60 mt-0">{{ $t('nodes.desc') }}</p>
            </div>
            <button @click="handleRefresh" class="btn btn-ghost btn-sm btn-circle"
                :class="{ 'loading': nodesState.nodesLoading }" :disabled="nodesState.nodesLoading">
                <ArrowPathIcon v-if="!nodesState.nodesLoading" class="w-5 h-5" />
            </button>
        </div>

        <!-- Pending (We keep this section just in case, though node.list might focus on active ones) -->
        <div v-if="pendingNodes.length > 0" class="space-y-4">
            <h4 class="text-sm font-bold text-warning uppercase tracking-wider px-1">{{ $t('nodes.pendingTitle') }}</h4>
            <div class="space-y-3">
                <div v-for="node in pendingNodes" :key="node.nodeId"
                    class="card bg-base-100 shadow-sm border border-warning/20">
                    <div class="card-body p-4 sm:p-5">
                        <div class="flex items-center justify-between">
                            <div>
                                <div class="font-bold text-lg">{{ node.displayName || $t('nodes.unnamedNode') }}</div>
                                <div class="text-xs font-mono text-base-content/60">{{ node.nodeId }}</div>
                            </div>
                            <div class="badge badge-warning">{{ $t('nodes.statusPending') }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Combined Nodes List (Paired/Connected) -->
        <div class="space-y-4">
            <h4 class="text-sm font-bold text-base-content/40 uppercase tracking-wider px-1">{{ $t('nodes.listTitle') }}
            </h4>

            <div v-if="nodesState.nodesLoading && nodesState.nodesList.length === 0" class="flex justify-center py-10">
                <span class="loading loading-dots loading-lg text-primary"></span>
            </div>

            <div v-else-if="!nodesState.nodesList || nodesState.nodesList.length === 0"
                class="text-center py-8 opacity-30 bg-base-100 rounded-xl border-2 border-dashed border-base-300">
                <ServerIcon class="w-12 h-12 mx-auto mb-2" />
                <p>{{ $t('nodes.noData') }}</p>
                <p class="text-xs">{{ $t('nodes.noDataDesc') }}</p>
            </div>

            <div v-else class="space-y-3">
                <div v-for="node in nodesState.nodesList" :key="node.nodeId"
                    class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
                    <div class="card-body p-4 sm:p-5">
                        <div class="flex flex-col sm:flex-row justify-between gap-4">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-bold text-lg">{{ node.displayName || $t('nodes.unnamedNode')
                                    }}</span>
                                    <span v-if="node.connected" class="badge badge-sm badge-success">{{
                                        $t('common.online') }}</span>
                                    <span v-else class="badge badge-sm badge-ghost">{{ $t('common.offline') }}</span>
                                    <span v-if="node.platform" class="badge badge-sm badge-outline opacity-50">{{
                                        node.platform }}</span>
                                </div>
                                <div class="text-xs font-mono text-base-content/50 break-all mt-1">
                                    {{ node.nodeId }} <span v-if="node.remoteIp">· {{ node.remoteIp }}</span>
                                </div>

                                <!-- Capabilities -->
                                <div v-if="node.caps?.length" class="flex flex-wrap gap-1 mt-2">
                                    <span v-for="cap in node.caps" :key="cap"
                                        class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                        {{ cap }}
                                    </span>
                                </div>
                            </div>

                            <div class="text-right text-xs text-base-content/40 space-y-1">
                                <div v-if="node.connectedAtMs">{{ $t('nodes.connectedAt', {
                                    time:
                                        getRelativeTime(node.connectedAtMs)
                                }) }}</div>
                                <div v-if="node.version">{{ $t('nodes.version', { v: node.version }) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>