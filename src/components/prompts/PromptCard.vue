<script setup lang="ts">
import { ref, onBeforeUnmount, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../../composables/useToast'
import { writeClipboard } from '../../utils/clipboard'
import { PencilSquareIcon, TrashIcon, ClipboardDocumentIcon, CheckIcon } from '@heroicons/vue/24/outline'
import type { PromptInfo } from '../../composables/usePromptState'

const props = withDefaults(defineProps<{
    prompt: PromptInfo
    icon: Component
    variant?: 'primary' | 'warning'
    readonly?: boolean
    expanded?: boolean
}>(), {
    variant: 'primary',
    readonly: false,
    expanded: false,
})

const emit = defineEmits<{
    (e: 'toggle'): void
    (e: 'edit'): void
    (e: 'delete'): void
}>()

const { t } = useI18n()
const toast = useToast()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const handleCopy = async () => {
    try {
        await writeClipboard(props.prompt.content)
        copied.value = true
        if (copiedTimer) clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => { copied.value = false }, 1500)
        toast.success(t('common.copied'))
    } catch {
        toast.error(t('common.error'))
    }
}

onBeforeUnmount(() => {
    if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
    <div class="card bg-base-100 border border-base-200 shadow-sm hover:shadow-md transition-shadow">
        <div class="card-body p-4">
            <div class="flex items-start justify-between mb-2">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        :class="variant === 'warning' ? 'bg-warning/10' : 'bg-primary/10'">
                        <component :is="icon" class="w-4 h-4"
                            :class="variant === 'warning' ? 'text-warning' : 'text-primary'" />
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-sm truncate">{{ prompt.name }}</h3>
                        <p class="text-xs text-base-content/50 font-mono">/ {{ prompt.id }}</p>
                    </div>
                </div>
            </div>
            <p v-if="prompt.description" class="text-sm text-base-content/70 line-clamp-2 mb-2">
                {{ prompt.description }}
            </p>
            <div class="flex items-center gap-1 mt-auto pt-2 border-t border-base-200">
                <button class="btn btn-ghost btn-xs flex-1" @click="emit('toggle')">
                    {{ expanded ? $t('common.close') : $t('common.clickToView') }}
                </button>
                <button class="btn btn-ghost btn-xs btn-square" :title="$t('common.copy')"
                    :aria-label="$t('common.copy')" @click="handleCopy">
                    <CheckIcon v-if="copied" class="w-4 h-4 text-success" />
                    <ClipboardDocumentIcon v-else class="w-4 h-4" />
                </button>
                <template v-if="!readonly">
                    <button class="btn btn-ghost btn-xs btn-square" :title="$t('common.edit')"
                        :aria-label="$t('common.edit')" @click="emit('edit')">
                        <PencilSquareIcon class="w-4 h-4" />
                    </button>
                    <button class="btn btn-ghost btn-xs btn-square text-error" :title="$t('common.delete')"
                        :aria-label="$t('common.delete')" @click="emit('delete')">
                        <TrashIcon class="w-4 h-4" />
                    </button>
                </template>
            </div>
            <div v-if="expanded"
                class="mt-2 p-3 bg-base-200 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {{ prompt.content }}
            </div>
        </div>
    </div>
</template>
