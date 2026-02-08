<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { SparklesIcon, ArrowLeftIcon, PlusIcon } from '@heroicons/vue/24/outline'
import { useGateway } from '../../composables/useGateway'
import { useToast } from '../../composables/useToast'
import AgentFormModal from './AgentFormModal.vue'
import { createAgentMainSessionKey } from '~/src/utils/session-key-helpers'
import ViewHeader from '@/components/ViewHeader.vue'
import { useUiSettingsStore } from '@/stores/setting'
import { useAgentsState } from '~/src/composables/useAgentsState'

const props = defineProps<{
    selectedId?: string
    agentsList?: any // Array inside object or just array? Store had agentsList properties. agentsList: { agents: [] }?
    // In store: agentsList IS the state object? No. state.agentsList.
    // In AgentsView, I'll pass localState.agentsList.
    // So prop type: any (AgentsState)
}>()

const emit = defineEmits<{
    (e: 'select', id: string): void
}>()

const router = useRouter()
const gatewayStore = useGateway()
const toast = useToast()
const agentState = useAgentsState()

const goBack = () => {
    router.back()
}

// Compute display agents from props
const agents = computed(() => {
    const list = props.agentsList?.agents || []
    return list.map((a: any) => ({
        id: a.id,
        name: a.name || a.identity?.name || a.id,
        avatarUrl: a.identity?.avatarUrl,
        icon: a.identity?.emoji || '🤖',
        description: a.identity?.theme || '',
        // isDefault not used in sidebar
    }))
})


// Add Agent Modal
const showAddModal = ref(false)

const openAddModal = () => {
    showAddModal.value = true
}

const handleAgentSaved = async (agentId: string) => {
    emit('select', agentId)
    await agentState.loadAgents();
    // Show prompt and redirect to chat
    toast.info('要先和我说句话，才能进行角色设定哟 ✨')
    router.push({ name: 'chat', params: { sessionkey: createAgentMainSessionKey(agentId) } })
}
</script>

<template>
    <div class="h-full">
        <div class="h-full flex flex-col bg-base-100 border-r border-base-200">
            <!-- Header -->
            <ViewHeader title="智能体" :is-main-page="true">
                <template #actions>
                    <button @click="openAddModal" class="btn btn-ghost btn-sm btn-circle">
                        <PlusIcon class="w-5 h-5" />
                    </button>
                </template>
            </ViewHeader>

            <!-- Agent List -->
            <div class="flex-1 overflow-y-auto">
                <div v-if="agents.length === 0"
                    class="flex flex-col items-center justify-center h-full p-8 text-base-content/50">
                    <div class="text-4xl mb-4">🤖</div>
                    <p class="text-center">暂无智能体</p>
                    <p class="text-sm text-center mt-2">点击右上角 + 号添加</p>
                </div>

                <ul v-else>
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
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-[15px] text-base-content truncate"
                                    :class="selectedId === agent.id ? 'text-primary' : ''">
                                    {{ agent.name }}
                                </span>
                                <span
                                    class="badge badge-sm border-blue-100 bg-blue-50 text-blue-600 text-[10px] h-5 px-1.5 font-normal">
                                    {{ agent.id }}
                                </span>
                            </div>
                            <div class="text-sm text-base-content/60 truncate pr-2 leading-tight">
                                {{ agent?.description }}
                            </div>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- Footer -->
            <div class="p-4">
                <div class="text-center">
                    <p class="text-xs text-base-content/40">管理你的智能体</p>
                </div>
            </div>
        </div>

        <!-- Add Agent Modal -->
        <AgentFormModal :show="showAddModal" mode="add" @close="showAddModal = false" @saved="handleAgentSaved" />
    </div>
</template>>
