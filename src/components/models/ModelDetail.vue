<script setup lang="ts">
import { computed } from 'vue'
import { useModelsState } from '../../composables/useModelsState'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
    providerId: string
}>()

const { t } = useI18n()
const { providers } = useModelsState()

// Get provider from the providers list
const provider = computed(() => {
    return providers.value.find(p => p.id === props.providerId) || null
})

const modelList = computed(() => {
    return provider.value?.models.map(m => ({
        id: m.id,
        name: m.name,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        api: m.api,
    })) || []
})

const formatNumber = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
    return String(n)
}

</script>

<template>
    <div class="h-full w-full relative">
        <div v-if="provider" class="h-full flex flex-col bg-base-100">
            <!-- Header -->
            <div class="px-6 py-6 border-b border-base-200">
                <div class="flex items-center gap-4">
                    <div
                        class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                        <span class="text-2xl">🔌</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h1 class="text-xl font-bold truncate">{{ provider.id }}</h1>
                        <div v-if="provider.maskedKey" class="text-sm text-base-content/50 font-mono">
                            🔑 {{ provider.maskedKey }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-4 md:p-6">
                <h2 class="text-lg font-semibold mb-4">{{ $t('model.listTitle') }}</h2>

                <!-- Model Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">

                    <!-- Model Cards -->
                    <div v-for="model in modelList" :key="model.id"
                        class="aspect-square bg-base-200/50 rounded-lg p-3 sm:p-4 flex flex-col hover:bg-base-200 transition-all group relative cursor-default">

                        <!-- Model Icon -->
                        <div class="text-xl mb-2">🤖</div>

                        <!-- Model Info -->
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-sm truncate">{{ model.name }}</div>
                            <div class="text-xs text-base-content/50 truncate">{{ model.id }}</div>
                        </div>

                        <!-- Tags -->
                        <div class="flex flex-wrap gap-1 mt-2">
                            <span v-if="model.reasoning" class="badge badge-xs badge-primary">reasoning</span>
                            <span class="badge badge-xs badge-ghost">
                                ctx {{ formatNumber(model.contextWindow) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty State -->
        <div v-else class="h-full flex items-center justify-center">
            <div class="text-center">
                <h3 class="font-bold text-lg">{{ $t('provider.notFound') }}</h3>
                <p class="text-base-content/60">{{ $t('provider.notFoundDesc', { id: providerId }) }}</p>
            </div>
        </div>
    </div>
</template>
