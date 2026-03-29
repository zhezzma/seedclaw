<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

interface ModelOption {
    id: string
    name: string
}

interface ModelGroup {
    provider: string
    models: ModelOption[]
}

const props = withDefaults(defineProps<{
    availableModels: ModelGroup[]
    currentModel: string
    title?: string
    searchPlaceholder?: string
    showUnknownCurrent?: boolean
    unknownCurrentLabel?: string
}>(), {
    showUnknownCurrent: true,
})

const emit = defineEmits<{
    (e: 'select', modelId: string): void
}>()

const { t } = useI18n()

const searchText = ref('')

const resolvedTitle = computed(() => props.title || t('provider.selectModel'))
const resolvedSearchPlaceholder = computed(() => props.searchPlaceholder || t('provider.searchModels'))
const resolvedUnknownCurrentLabel = computed(() => props.unknownCurrentLabel || t('agent.unknownModel'))

const normalizedQuery = computed(() => searchText.value.trim().toLowerCase())
const filteredGroups = computed(() => {
    const query = normalizedQuery.value

    return props.availableModels
        .map((group) => ({
            provider: group.provider,
            models: group.models.filter((m) => {
                if (!query) return true
                return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
            })
        }))
        .filter((group) => group.models.length > 0)
})

const isCurrentModelAvailable = computed(() => props.availableModels.some((group) =>
    group.models.some((m) => `${group.provider}/${m.id}` === props.currentModel)
))

const unknownCurrent = computed(() => {
    if (!props.showUnknownCurrent || !props.currentModel || isCurrentModelAvailable.value) {
        return null
    }

    const query = normalizedQuery.value
    if (query && !props.currentModel.toLowerCase().includes(query)) {
        return null
    }

    return props.currentModel
})

const emitSelect = (provider: string, modelId: string) => emit('select', `${provider}/${modelId}`)
</script>

<template>
    <div class="flex max-h-full min-h-0 flex-col">
        <div class="sticky top-0 z-20 bg-base-100">
            <div class="px-4 py-2 text-xs opacity-50 font-bold uppercase tracking-wider block">
                {{ resolvedTitle }}
            </div>

            <div class="px-2 pb-2">
                <div class="relative">
                    <input v-model="searchText" type="text" :placeholder="resolvedSearchPlaceholder"
                        class="input input-sm input-bordered w-full pl-8" />
                    <MagnifyingGlassIcon class="w-4 h-4 absolute left-2.5 top-2.5 opacity-50" />
                </div>
            </div>
        </div>

        <div class="min-h-0 overflow-y-auto px-2 pb-2">
            <div class="space-y-1">
                <button v-if="unknownCurrent" @click="emit('select', unknownCurrent)"
                    class="flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer w-full text-left bg-primary/10 text-primary">
                    <span class="truncate block text-xs flex-1 min-w-0" :title="unknownCurrent">
                        {{ unknownCurrent }}
                        <span class="opacity-60">({{ resolvedUnknownCurrentLabel }})</span>
                    </span>
                    <CheckIcon class="h-4 w-4 shrink-0" />
                </button>

                <template v-for="group in filteredGroups" :key="group.provider">
                    <div class="px-4 py-1 text-[10px] uppercase tracking-wider bg-base-200/50 mb-1 font-bold block sticky top-[5.25rem] backdrop-blur-md z-10">
                        {{ group.provider }}
                    </div>
                    <button v-for="m in group.models" :key="m.id" @click="emitSelect(group.provider, m.id)"
                        class="flex items-center gap-2 p-2 rounded-lg hover:bg-base-200 transition-colors cursor-pointer w-full text-left"
                        :class="{ 'bg-primary/10 text-primary': currentModel === `${group.provider}/${m.id}` }">
                        <span class="truncate block text-xs flex-1 min-w-0" :title="m.name">
                            {{ m.name }}
                        </span>
                        <CheckIcon v-if="currentModel === `${group.provider}/${m.id}`" class="h-4 w-4 shrink-0" />
                        <span v-else class="w-4 h-4 shrink-0"></span>
                    </button>
                </template>
            </div>
        </div>
    </div>
</template>
