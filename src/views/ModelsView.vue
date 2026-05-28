<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ViewHeader from '@/components/ViewHeader.vue'

import { useModelsState } from '../composables/useModelsState'
import { useUiSettingsStore } from '@/stores/setting'

// Components
import ModelSidebar from '../components/models/ModelSidebar.vue'
import ModelDetail from '../components/models/ModelDetail.vue'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const route = useRoute()

const { providers } = useModelsState()
const configStore = useUiSettingsStore()
const { t } = useI18n()

// Layout state
const selectedProviderId = computed(() => {
    return (route.query.providerId as string) || undefined
})

const selectedProviderName = computed(() => {
    return selectedProviderId.value || 'Provider'
})

// Get provider IDs from computed providers
const providerIds = computed(() => {
    return providers.value.map(p => p.id)
})

const selectProvider = (providerId: string) => {
    router.push({ query: { ...route.query, providerId } })
}

const clearSelection = () => {
    const query = { ...route.query }
    delete query.providerId
    router.replace({ query })
}

// 删除提供商后清除选中，桌面端由 watch 自动选中第一个，移动端回到列表页
const handleProviderDeleted = () => {
    clearSelection()
}

// 桌面端自动选中逻辑：无选中或选中的提供商已不存在时，自动选中第一个
watch(() => [providerIds.value, route.query.providerId], ([providerList, currentId]) => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    if (!isDesktop) return
    const ids = providerList as string[]
    if (!ids || ids.length === 0) return
    // 无选中或当前选中的 id 已不在列表中（如被删除），自动选中第一个
    if (!currentId || !ids.includes(currentId as string)) {
        router.replace({ query: { ...route.query, providerId: ids[0] } })
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

            <ModelDetail v-if="selectedProviderId" :provider-id="selectedProviderId" class="flex-1 overflow-hidden" @deleted="handleProviderDeleted" />

            <!-- Empty State for Desktop -->
            <div v-else class="hidden lg:flex flex-1 items-center justify-center text-base-content/40">
                <div class="text-6xl mb-4">👈</div>
                <p>{{ $t('model.selectProviderHint') }}</p>
            </div>
        </div>
    </div>
</template>
