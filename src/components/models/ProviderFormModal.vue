<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useModelsState } from '../../composables/useModelsState'
import { useI18n } from 'vue-i18n'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
    show: boolean
    mode: 'add' | 'edit'
    custom?: boolean
    initialData?: {
        id: string
        baseUrl: string
        type?: 'api_key' | 'oauth'
        api: string
        apiKey?: string
        headers?: Record<string, string>
        toolCallBridge?: boolean
    }
}>()

const isReadonly = computed(() => props.mode === 'edit' && props.custom === false)

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', providerId: string): void
}>()

const { t } = useI18n()
const { saveProvider } = useModelsState()

const formData = reactive({
    id: '',
    baseUrl: '',
    type: 'api_key' as 'api_key' | 'oauth',
    apiKey: '',
    api: 'openai-completions',
    headers: '',
    toolCallBridge: false
})
const showApiKey = ref(false)
const isSubmitting = ref(false)

// Watch for initial data
watch(() => props.show, (newVal) => {
    if (newVal) {
        if (props.mode === 'edit' && props.initialData) {
            formData.id = props.initialData.id
            formData.baseUrl = props.initialData.baseUrl
            formData.type = props.initialData.type || 'api_key'
            formData.api = props.initialData.api
            formData.apiKey = props.initialData.apiKey || ''
            formData.headers = props.initialData.headers ? JSON.stringify(props.initialData.headers, null, 2) : ''
            formData.toolCallBridge = props.initialData.toolCallBridge || false
        } else {
            // Reset for add
            formData.id = ''
            formData.baseUrl = ''
            formData.type = 'api_key'
            formData.apiKey = ''
            formData.api = 'openai-completions'
            formData.headers = ''
            formData.toolCallBridge = false
        }
    }
})

const isFormValid = computed(() => {
    if (!formData.id) return false
    // 自定义提供商或新增时，baseUrl 必填；非自定义编辑时不要求
    if ((props.custom || props.mode === 'add') && !formData.baseUrl) return false
    // Headers JSON validation
    if (formData.headers) {
        try {
            JSON.parse(formData.headers)
        } catch (e) {
            return false
        }
    }
    return true
})

const modalTitle = computed(() => {
    return props.mode === 'add' ? t('provider.addTitle') : t('provider.editTitle')
})

const submitLabel = computed(() => {
    return isSubmitting.value ? t('common.saving') : t('common.save')
})

const handleClose = () => {
    emit('close')
}

const handleSubmit = async () => {
    if (!isFormValid.value) return

    isSubmitting.value = true
    try {
        let parsedHeaders: Record<string, string> | undefined = undefined
        if (formData.headers && formData.headers.trim()) {
            parsedHeaders = JSON.parse(formData.headers)
        }

        await saveProvider({
            id: formData.id,
            baseUrl: formData.baseUrl,
            type: formData.type,
            apiKey: formData.apiKey,
            api: formData.api,
            headers: parsedHeaders,
            toolCallBridge: formData.toolCallBridge
        })

        emit('saved', formData.id)
        handleClose()
    } catch (err: any) {
        alert(err.message || t('provider.saveFailed'))
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <dialog :class="{ 'modal modal-open': show, 'modal': !show }">
        <div class="modal-box max-w-xl">
            <h3 class="font-bold text-lg mb-6">{{ modalTitle }}</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-if="mode === 'add'" class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">{{ $t('provider.id') }} <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.id" type="text" placeholder="e.g. openai, anthropic"
                        class="input input-bordered w-full font-mono" />
                </div>

                <div class="form-control ">
                    <label class="label"><span class="label-text">{{ $t('provider.baseUrl') }} <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.baseUrl" type="text" placeholder="https://...com/v1"
                        class="input input-bordered w-full" :disabled="isReadonly" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('provider.apiType') }}</span></label>
                    <select v-model="formData.api" class="select select-bordered w-full" :disabled="isReadonly">
                        <option value="openai-completions">OpenAI Completions</option>
                        <option value="anthropic-messages">Anthropic</option>
                    </select>
                </div>


                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('provider.authType', 'Auth Type')
                            }}</span></label>
                    <select v-model="formData.type" class="select select-bordered w-full">
                        <option value="api_key">API Key</option>
                        <option value="oauth">OAuth</option>
                    </select>
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('settings.apiKey') }}</span></label>
                    <div class="join w-full">
                        <input v-model="formData.apiKey" :type="showApiKey ? 'text' : 'password'" placeholder="sk-..."
                            class="input input-bordered join-item flex-1" />
                        <button type="button" @click="showApiKey = !showApiKey" class="btn btn-ghost join-item"
                            tabindex="-1">
                            <EyeSlashIcon v-if="showApiKey" class="w-4 h-4" />
                            <EyeIcon v-else class="w-4 h-4" />
                        </button>
                    </div>
                </div>


                <!-- <div v-if="custom" class="form-control md:col-span-2">
                    <label class="label cursor-pointer justify-start gap-4">
                        <span class="label-text">{{ $t('provider.toolCallBridge') }}</span>
                        <input type="checkbox" v-model="formData.toolCallBridge" class="checkbox"
                            :disabled="isReadonly" />
                    </label>
                    <div class="text-xs opacity-50 px-1">{{ $t('provider.toolCallBridgeDesc') }}</div>
                </div> -->

                <div class="form-control md:col-span-2">
                    <label class="label">
                        <span class="label-text">{{ $t('provider.customHeaders') }}</span>
                        <span class="label-text-alt text-base-content/50">{{ $t('common.optional') }}</span>
                    </label>
                    <textarea v-model="formData.headers" rows="3"
                        class="textarea textarea-bordered w-full font-mono text-sm"
                        placeholder='{"X-Proxy-Region": "us-west"}' :disabled="isReadonly"></textarea>
                </div>
            </div>

            <div class="modal-action">
                <button @click="handleClose" class="btn">{{ $t('common.cancel') }}</button>
                <button @click="handleSubmit" class="btn btn-primary" :disabled="!isFormValid || isSubmitting">{{
                    submitLabel
                    }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="handleClose">close</button>
        </form>
    </dialog>
</template>
