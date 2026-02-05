<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ArrowLeftIcon } from '@heroicons/vue/24/outline'
import { useGatewayStore } from '../../stores/gateway'

const props = defineProps<{
    selectedId?: string
}>()

const emit = defineEmits<{
    (e: 'select', id: string): void
}>()

const router = useRouter()
const gatewayStore = useGatewayStore()

const goBack = () => {
    router.back()
}

// Get agents from gateway store
const agents = computed(() => {
    const list = gatewayStore.agentsList?.agents || []
    return list.map((a: any) => ({
        id: a.id || a.name,
        name: a.identity?.name || a.name || a.id,
        avatarUrl: a.identity?.avatarUrl,
        icon: a.identity?.emoji || '🤖',
        description: a.description || '',
        isDefault: (a.id || a.name) === gatewayStore.defaultAgentId
    }))
})

const isLoading = computed(() => gatewayStore.agentsLoading)
</script>

<template>
    <div class="h-full flex flex-col bg-base-100 border-r border-base-200">
        <!-- Header -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-200 min-h-[4rem]">
            <div class="flex-1 flex gap-2 items-center">
                <button @click="goBack" class="btn btn-ghost btn-sm btn-circle lg:hidden">
                    <ArrowLeftIcon class="w-5 h-5" />
                </button>
                <span class="text-lg font-semibold px-4">智能体</span>
            </div>
            <div class="flex-none">
            </div>
        </div>

        <!-- Agent List -->
        <div class="flex-1 overflow-y-auto">
            <div v-if="isLoading" class="flex justify-center p-4">
                <span class="loading loading-spinner loading-md"></span>
            </div>

            <div v-else>
                <ul>
                    <li v-for="agent in agents" :key="agent.id" @click="$emit('select', agent.id)"
                        class="group flex items-stretch pl-4 cursor-pointer hover:bg-base-200/50 transition-colors"
                        :class="selectedId === agent.id ? 'bg-primary/5' : ''">

                        <!-- Avatar -->
                        <div
                            class="self-center shrink-0 w-12 h-12 rounded-full bg-base-200 flex items-center justify-center border border-base-200 shadow-sm my-3 mr-3 overflow-hidden">
                            <img v-if="agent.avatarUrl" :src="agent.avatarUrl" :alt="agent.name"
                                class="w-full h-full object-cover" />
                            <span v-else class="text-3xl select-none">{{ agent.icon }}</span>
                        </div>

                        <!-- Content with Inset Divider -->
                        <div
                            class="flex-1 flex flex-col justify-center py-3 pr-4 border-b border-base-200 min-w-0 gap-0.5 group-last:border-none">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-[15px] text-base-content truncate"
                                    :class="selectedId === agent.id ? 'text-primary' : ''">
                                    {{ agent.name }}
                                </span>
                            </div>
                            <div class="text-sm text-base-content/60 truncate pr-2 leading-tight">
                                <span
                                    class="badge badge-sm border-blue-100 bg-blue-50 text-blue-600 text-[10px] h-5 px-1.5 font-normal">
                                    {{ agent.id }}
                                </span>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Footer -->
        <div class="p-4">
            <div class="text-center">
                <p class="text-xs text-base-content/40">Manage agent workspaces, tools, and identities.</p>
            </div>
        </div>
    </div>
</template>
