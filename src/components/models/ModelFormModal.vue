<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AvailableModel } from '../../composables/useModelsState'

const props = defineProps<{
    show: boolean
    mode: 'add' | 'edit'
    providerId: string
    initialData?: AvailableModel
    custom?: boolean
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'save', model: AvailableModel): void
}>()

const { t } = useI18n()

const formData = reactive<AvailableModel>({
    id: '',
    name: '',
    contextWindow: 128000,
    maxTokens: 4096,
    cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0
    },
    reasoning: false,
    input: ['text'] // Default
})

const isSubmitting = ref(false)

watch(() => props.show, (newVal) => {
    if (newVal) {
        if (props.mode === 'edit' && props.initialData) {
            Object.assign(formData, JSON.parse(JSON.stringify(props.initialData)))
            // Ensure cost object exists
            if (!formData.cost) {
                formData.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
            }
        } else {
            // Reset
            formData.id = ''
            formData.name = ''
            formData.contextWindow = 128000
            formData.maxTokens = 4096
            formData.cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
            formData.reasoning = false
            formData.input = ['text']
        }
    }
})

const isFormValid = computed(() => {
    return formData.id.trim().length > 0 && formData.name.trim().length > 0
})

const isReadonly = computed(() => props.mode === 'edit' && props.custom === false)

const handleClose = () => {
    emit('close')
}

const handleSubmit = () => {
    if (!isFormValid.value) return
    emit('save', { ...formData })
}
</script>

<template>
    <dialog :class="{ 'modal modal-open': show, 'modal': !show }">
        <div class="modal-box w-11/12 max-w-3xl">
            <h3 class="font-bold text-lg mb-6">
                {{ mode === 'add' ? $t('model.addTitle') : $t('model.editTitle') }}
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Basic Info -->
                <div class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">{{ $t('model.id') }} <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.id" type="text" placeholder="e.g. gpt-4-turbo"
                        class="input input-bordered w-full font-mono" :disabled="mode === 'edit' || isReadonly" />
                </div>

                <div class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">{{ $t('model.name') }} <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.name" type="text" placeholder="e.g. GPT-4 Turbo"
                        class="input input-bordered w-full" :disabled="isReadonly" />
                </div>

                <!-- Parameters -->
                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('model.contextWindow') }}</span></label>
                    <input v-model.number="formData.contextWindow" type="number" class="input input-bordered w-full"
                        :disabled="isReadonly" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('model.maxOutputTokens') }}</span></label>
                    <input v-model.number="formData.maxTokens" type="number" class="input input-bordered w-full"
                        :disabled="isReadonly" />
                </div>

                <!-- Cost -->
                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('model.inputCost') }}</span></label>
                    <input v-model.number="formData.cost!.input" type="number" step="0.01"
                        class="input input-bordered w-full" :disabled="isReadonly" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('model.outputCost') }}</span></label>
                    <input v-model.number="formData.cost!.output" type="number" step="0.01"
                        class="input input-bordered w-full" :disabled="isReadonly" />
                </div>

                <!-- Capabilities -->
                <div class="form-control md:col-span-2">
                    <label class="label cursor-pointer justify-start gap-4">
                        <span class="label-text">{{ $t('model.reasoning') }}</span>
                        <input v-model="formData.reasoning" type="checkbox" class="checkbox" :disabled="isReadonly" />
                    </label>
                </div>
            </div>

            <div class="modal-action">
                <button @click="handleClose" class="btn">{{ $t('common.close') }}</button>
                <button v-if="!isReadonly" @click="handleSubmit" class="btn btn-primary" :disabled="!isFormValid">
                    {{ $t('common.save') }}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="handleClose">close</button>
        </form>
    </dialog>
</template>
