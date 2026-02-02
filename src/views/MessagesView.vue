<script setup lang="ts">
import {
    BellIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    InformationCircleIcon
} from '@heroicons/vue/24/outline'
import { useMessageStore } from '../stores/message'

const messageStore = useMessageStore()

const getIcon = (type: string) => {
    switch (type) {
        case 'success': return CheckCircleIcon
        case 'warning': return ExclamationCircleIcon
        default: return InformationCircleIcon
    }
}

const getIconColor = (type: string) => {
    switch (type) {
        case 'success': return 'text-success'
        case 'warning': return 'text-warning'
        default: return 'text-info'
    }
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header - fixed -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <span class="text-lg font-semibold px-4">消息</span>
            </div>
            <div class="flex-none px-2">
                <button @click="messageStore.markAllAsRead" class="btn btn-ghost btn-sm text-primary">全部已读</button>
            </div>
        </div>

        <!-- Content - scrollable -->
        <div class="flex-1 overflow-y-auto p-4 ">
            <!-- Empty state -->
            <div v-if="messageStore.messages.length === 0" class="flex flex-col items-center justify-center py-20">
                <BellIcon class="h-16 w-16 text-base-content/20 mb-4" />
                <p class="text-base-content/50">暂无消息</p>
            </div>

            <!-- Messages list -->
            <div v-else class="space-y-3">
                <div v-for="msg in messageStore.messages" :key="msg.id" @click="messageStore.markAsRead(msg.id)"
                    class="card bg-base-100 shadow-sm cursor-pointer" :class="{ 'opacity-60': msg.read }">
                    <div class="card-body p-4">
                        <div class="flex items-start gap-3">
                            <component :is="getIcon(msg.type)" class="h-6 w-6 shrink-0 mt-0.5"
                                :class="getIconColor(msg.type)" />
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between gap-2">
                                    <h3 class="font-semibold truncate">{{ msg.title }}</h3>
                                    <span class="text-xs text-base-content/50 shrink-0">{{ msg.time }}</span>
                                </div>
                                <p class="text-sm text-base-content/70 mt-1">{{ msg.content }}</p>
                            </div>
                            <div v-if="!msg.read" class="w-2 h-2 rounded-full bg-primary shrink-0 mt-2"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
