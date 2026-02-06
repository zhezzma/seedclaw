<script setup lang="ts">
import { computed, ref, watch, onErrorCaptured } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useGateway } from '../../composables/useGateway'
import {
    InformationCircleIcon,
    DocumentTextIcon,
    WrenchScrewdriverIcon,
    SparklesIcon,
    PencilIcon
} from '@heroicons/vue/24/outline'

// Tab components
import AgentOverview from './tabs/AgentOverview.vue'
import AgentTools from './tabs/AgentTools.vue'
import AgentSkills from './tabs/AgentSkills.vue'
import AgentFormModal from './AgentFormModal.vue'

const props = defineProps<{
    agentId: string
    agentsList?: any
    configState?: any
    defaultAgentId?: string
}>()

const gatewayStore = useGateway()

onErrorCaptured((err, instance, info) => {
    console.error('[AgentDetail Error]', err)
    console.error('Component:', instance)
    console.error('Info:', info)
    return false
})

// Get full agent object
const agent = computed(() => {
    console.log('[AgentDetail] Computing agent for ID:', props.agentId)
    const list = props.agentsList?.agents || []

    const rawAgent = list.find((a: any) => (a.id || a.name) === props.agentId)
    if (!rawAgent) {
        console.warn('[AgentDetail] Agent not found in list:', props.agentId, 'List:', list)
        return null
    }

    const typedAgent = rawAgent as any
    const identity = typedAgent.identity || {}

    console.log('[AgentDetail] Agent found:', typedAgent)
    return {
        id: typedAgent.id || typedAgent.name,
        name: identity.name || typedAgent.name || typedAgent.id,
        avatarUrl: identity.avatarUrl,
        // Icon logic: emoji > avatar > defaults
        icon: identity.emoji || '🤖',
        description: typedAgent.description || '', // Description might not be in type but maybe in runtime
        isDefault: (typedAgent.id || typedAgent.name) === props.defaultAgentId
    }
})

// Get raw agent data for editing
const rawAgentData = computed(() => {
    const list = props.agentsList?.agents || []
    return list.find((a: any) => (a.id || a.name) === props.agentId)
})

// Tab navigation state
const activeTab = ref('overview')

const tabs = [
    { id: 'overview', label: '概览', component: AgentOverview },
    { id: 'tools', label: '工具', component: AgentTools },
    { id: 'skills', label: '技能', component: AgentSkills },
]

// Edit modal state
const showEditModal = ref(false)

const openEditModal = () => {
    showEditModal.value = true
}
</script>

<template>
    <div class="h-full w-full relative">
        <div v-if="agent" class="h-full flex flex-col bg-base-100">
            <!-- Detail Header -->
            <div class="px-6 py-6 border-b border-base-200">
                <div class="flex flex-col items-center gap-4">
                    <!-- Avatar with Edit Button -->
                    <div class="relative shrink-0 group">
                        <div
                            class="w-12 h-12 lg:w-15 lg:h-15 rounded-full bg-base-200/50 flex items-center justify-center shadow-sm ring-4 ring-base-100 overflow-hidden">
                            <img v-if="agent.avatarUrl" :src="agent.avatarUrl" :alt="agent.name"
                                class="w-full h-full object-cover" />
                            <span v-else class="text-4xl lg:text-5xl select-none">{{ agent.icon }}</span>
                        </div>
                        <!-- Edit Button -->
                        <button @click="openEditModal"
                            class="absolute -bottom-1 -right-1 btn btn-circle btn-xs btn-primary shadow-md  group-hover:opacity-100 transition-opacity">
                            <PencilIcon class="w-3 h-3" />
                        </button>
                    </div>

                    <!-- Info -->
                    <div class="flex-1 text-center space-y-1.5 min-w-0">
                        <div class="flex flex-row items-center gap-2 justify-center">
                            <h1 class="text-xl lg:text-2xl font-bold tracking-tight truncate max-w-full">{{ agent.name
                                }}
                            </h1>
                            <!-- Compact ID & Default Badge -->
                            <div class="flex items-center gap-2">
                                <div class="badge badge-ghost badge-sm font-mono opacity-60 text-xs">{{ agent.id }}
                                </div>
                                <div v-if="agent.isDefault" class="badge badge-primary badge-xs">DEFAULT</div>
                            </div>
                        </div>

                        <!-- <p class="text-base-content/60 text-sm leading-relaxed max-w-2xl mx-auto">{{
                        agent.description || '这个智能体还很神秘，没有描述。' }}</p> -->
                    </div>
                </div>

                <!-- Tabs -->
                <!-- <div class="mt-6 flex justify-center w-full">
                <div role="tablist" class="bg-base-200/50 p-1 rounded-full inline-flex relative shadow-inner">
                    <a role="tab" v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
                        class="px-5 lg:px-10 py-2 rounded-full text-sm font-semibold transition-all duration-300 ease-out cursor-pointer select-none text-center min-w-[4rem]"
                        :class="activeTab === tab.id ? 'bg-base-100 text-primary shadow-sm scale-100' : 'text-base-content/60 hover:text-base-content/80 hover:bg-base-200/30'">
                        {{ tab.label }}
                    </a>
                </div>
            </div> -->
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-y-auto bg-base-50/50 p-4 md:px-8 md:py-6">
                <div class="w-full h-full max-w-6xl">
                    <keep-alive>
                        <component :is="tabs.find(t => t.id === activeTab)?.component" :agent="agent"
                            :config-state="props.configState" />
                    </keep-alive>
                </div>
            </div>
        </div>

        <!-- Empty State (Agent Not Found) -->
        <div v-else class="h-full flex items-center justify-center">
            <div class="text-center">
                <h3 class="font-bold text-lg">Agent not found</h3>
                <p class="text-base-content/60">Could not find configuration for {{ agentId }}</p>
            </div>
        </div>

        <!-- Edit Agent Modal -->
        <AgentFormModal :show="showEditModal" mode="edit" :agent-data="rawAgentData" @close="showEditModal = false" />
    </div>
</template>
