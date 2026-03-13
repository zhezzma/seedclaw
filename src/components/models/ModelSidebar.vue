<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import ViewHeader from '@/components/ViewHeader.vue'
import { useUiSettingsStore } from '@/stores/setting'
import { useModelsState } from '../../composables/useModelsState'
import { useI18n } from 'vue-i18n'
import { ArrowLeftIcon, PlusIcon, TrashIcon, FunnelIcon } from '@heroicons/vue/24/outline'
import ProviderFormModal from './ProviderFormModal.vue'
const props = defineProps<{
    selectedId?: string
}>()

const emit = defineEmits<{
    (e: 'select', id: string): void
}>()

const router = useRouter()
const { t } = useI18n()
const settingsStore = useUiSettingsStore()
const { providers } = useModelsState()

// 根据设置过滤 provider 列表
const filteredProviders = computed(() => {
    if (settingsStore.showAllProviders) return providers.value
    return providers.value.filter(p => !!p.apiKey)
})

const toggleShowAll = () => {
    settingsStore.showAllProviders = !settingsStore.showAllProviders
    settingsStore.persist()
}

// Add Provider Modal
const showAddModal = ref(false)

const openAddModal = () => {
    showAddModal.value = true
}

const handleProviderSaved = (providerId: string) => {
    emit('select', providerId)
}


</script>

<template>
    <div class="h-full">
        <div class="h-full flex flex-col bg-base-100 border-r border-base-200">
            <!-- Header -->
            <ViewHeader :title="$t('provider.title')" :is-main-page="true">
                <template #actions>
                    <button @click="toggleShowAll" class="btn btn-ghost btn-sm btn-circle"
                        :class="{ 'text-primary': !settingsStore.showAllProviders }"
                        :title="settingsStore.showAllProviders ? $t('provider.showConfigured') : $t('provider.showAll')">
                        <FunnelIcon class="w-4 h-4" />
                    </button>
                    <button @click="openAddModal" class="btn btn-ghost btn-sm btn-circle">
                        <PlusIcon class="w-5 h-5" />
                    </button>
                </template>
            </ViewHeader>

            <!-- Provider List -->
            <div class="flex-1 overflow-y-auto">
                <div v-if="filteredProviders.length === 0"
                    class="flex flex-col items-center justify-center h-full p-8 text-base-content/50">
                    <div class="text-4xl mb-4">📦</div>
                    <p class="text-center">{{ $t('provider.noProviders') }}</p>
                </div>

                <ul v-else>
                    <li v-for="provider in filteredProviders" :key="provider.id" @click="$emit('select', provider.id)"
                        class="group flex items-stretch pl-4 cursor-pointer hover:bg-base-300 transition-colors"
                        :class="selectedId === provider.id ? 'hover:bg-primary/20 bg-primary/20' : ''">

                        <!-- Icon -->
                        <div
                            class="self-center shrink-0 w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center  mr-3">
                            <span class="text-xl select-none">🔌</span>
                        </div>

                        <!-- Content -->
                        <div class="flex-1 flex items-center py-3 pr-4 border-b min-w-0 group-last:border-none "
                            :class="selectedId === provider.id ? 'border-base-300/0 ' : 'border-base-300 '">
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-[15px] text-base-content truncate">
                                    {{ provider.id }}
                                </div>
                                <div class="text-xs text-base-content/50 truncate">
                                    {{ $t('provider.modelCount', { n: provider.models.length }) }}
                                </div>
                            </div>
                        </div>
                    </li>
                </ul>
            </div>

            <!-- Footer -->
            <div class="p-4">
                <div class="text-center">
                    <p class="text-xs text-base-content/40">{{ $t('provider.manageDesc') }}</p>
                </div>
            </div>
        </div>


        <!-- Add Provider Modal -->
        <ProviderFormModal :show="showAddModal" mode="add" :custom="true" @close="showAddModal = false"
            @saved="handleProviderSaved" />
    </div>
</template>
