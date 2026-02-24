<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { XMarkIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
    show: boolean
    mode: 'create' | 'edit'
    promptData?: { id: string; name: string; description: string; content: string }
    saving?: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'save', data: { id: string; name: string; description: string; content: string }): void
}>()

const { t } = useI18n()

const form = ref({ id: '', name: '', description: '', content: '' })

// Reset form when modal opens or data changes
watch(() => props.show, (val) => {
    if (val && props.promptData) {
        form.value = { ...props.promptData }
    } else if (val) {
        form.value = { id: '', name: '', description: '', content: '' }
    }
}, { immediate: true })

const handleSave = () => {
    if (!form.value.id || !form.value.name || !form.value.content) return
    emit('save', { ...form.value })
}
</script>

<template>
    <dialog class="modal" :class="{ 'modal-open': show }">
        <div class="modal-box w-11/12 max-w-2xl">
            <div class="flex justify-between items-center mb-4">
                <h3 class="font-bold text-lg">
                    {{ mode === 'create' ? $t('prompt.addPrompt') : $t('prompt.editPrompt') }}
                </h3>
                <button class="btn btn-sm btn-circle btn-ghost" @click="$emit('close')">
                    <XMarkIcon class="w-5 h-5" />
                </button>
            </div>

            <div class="space-y-4">
                <!-- ID -->
                <div class="form-control w-full">
                    <label class="label w-full"><span class="label-text font-medium">{{ $t('prompt.id')
                            }}</span></label>
                    <input type="text" v-model="form.id" :placeholder="$t('prompt.idPlaceholder')"
                        class="input input-bordered input-sm w-full" :disabled="mode === 'edit'" />
                    <label class="label w-full"><span class="label-text-alt text-base-content/50">{{ $t('prompt.idHelp')
                    }}</span></label>
                </div>

                <!-- Name -->
                <div class="form-control w-full">
                    <label class="label w-full"><span class="label-text font-medium">{{ $t('prompt.name')
                            }}</span></label>
                    <input type="text" v-model="form.name" :placeholder="$t('prompt.namePlaceholder')"
                        class="input input-bordered input-sm w-full" />
                </div>

                <!-- Description -->
                <div class="form-control w-full">
                    <label class="label w-full"><span class="label-text font-medium">{{ $t('prompt.description')
                    }}</span></label>
                    <input type="text" v-model="form.description" :placeholder="$t('prompt.descPlaceholder')"
                        class="input input-bordered input-sm w-full" />
                </div>

                <!-- Content -->
                <div class="form-control w-full">
                    <label class="label w-full"><span class="label-text font-medium">{{ $t('prompt.content')
                    }}</span></label>
                    <textarea v-model="form.content" :placeholder="$t('prompt.contentPlaceholder')"
                        class="textarea textarea-bordered text-sm font-mono w-full" rows="10"></textarea>
                </div>
            </div>

            <div class="modal-action">
                <button class="btn btn-ghost" @click="$emit('close')">{{ $t('common.cancel') }}</button>
                <button class="btn btn-primary" @click="handleSave"
                    :disabled="saving || !form.id || !form.name || !form.content">
                    <span v-if="saving" class="loading loading-spinner loading-xs"></span>
                    {{ $t('common.save') }}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="$emit('close')">close</button>
        </form>
    </dialog>
</template>
