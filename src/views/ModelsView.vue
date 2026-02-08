<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { useGateway } from '../composables/useGateway'
import { useConfigState } from '../composables/useConfigState'
import { useUiSettingsStore } from '@/stores/setting'

// Components
import ModelSidebar from '../components/models/ModelSidebar.vue'
import ModelDetail from '../components/models/ModelDetail.vue'

const router = useRouter()
const route = useRoute()
const store = useGateway()
const configState = useConfigState()
const settingsStore = useUiSettingsStore()

// Selected Provider from Query Params
const selectedProviderId = computed(() => {
    return (route.query.providerId as string) || undefined
})

const selectedProviderName = computed(() => {
    return selectedProviderId.value || 'Provider'
})

// Get providers from configForm
const providers = computed(() => {
    const providersObj = (configState.configForm?.models as any)?.providers as Record<string, any> | undefined
    if (!providersObj) return []
    return Object.keys(providersObj)
})

const selectProvider = (providerId: string) => {
    router.push({ query: { ...route.query, providerId } })
}

const clearSelection = () => {
    const query = { ...route.query }
    delete query.providerId
    router.replace({ query })
}

// Default selection logic for Desktop
watch(() => [providers.value, route.query.providerId], ([providerList, currentId]) => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop && !currentId && providerList && (providerList as string[]).length > 0) {
        const firstId = (providerList as string[])[0]
        router.replace({ query: { ...route.query, providerId: firstId } })
    }
}, { immediate: true })

</script>

<template>
    <!-- Master-Detail Layout -->
    <div class="flex h-full w-full overflow-hidden bg-base-200">

        <!-- Sidebar Container -->
        <div class="h-full bg-base-100 border-r border-base-200 flex flex-col shrink-0" :class="[
            selectedProviderId ? 'hidden lg:flex lg:w-80' : 'w-full lg:w-80 flex'
        ]">
            <ModelSidebar :selected-id="selectedProviderId" @select="selectProvider" />
        </div>

        <!-- Detail Container -->
        <div class="h-full bg-base-50 flex flex-col min-w-0" :class="[
            selectedProviderId ? 'w-full flex lg:flex-1' : 'hidden lg:flex lg:flex-1'
        ]">

            <!-- Mobile Back Button Header -->
            <div class="lg:hidden shrink-0">
                <ViewHeader :title="selectedProviderName"></ViewHeader>
            </div>

            <ModelDetail v-if="selectedProviderId" :provider-id="selectedProviderId" class="flex-1 overflow-hidden" />

            <!-- Empty State for Desktop -->
            <div v-else class="hidden lg:flex flex-1 items-center justify-center text-base-content/40">
                <div class="text-center">
                    <div class="text-6xl mb-4">👈</div>
                    <p>选择一个提供商查看模型</p>
                </div>
            </div>
        </div>
    </div>
</template>
