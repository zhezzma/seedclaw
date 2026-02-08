<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'
import { useGateway } from '../../composables/useGateway'
import { useConfigState } from '../../composables/useConfigState'
import { useToast } from '../../composables/useToast'


const props = defineProps<{
    show: boolean
    mode: 'add' | 'edit'
    providerId?: string
    providerData?: {
        baseUrl?: string
        apiKey?: string
        api?: string
        headers?: Record<string, string>
    }
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', providerId: string): void
}>()

const store = useGateway()
const configState = useConfigState()
const toast = useToast()

// Form data
const formData = ref({
    id: '',
    baseUrl: '',
    apiKey: '',
    api: 'openai-completions',
    headers: ''
})

const showApiKey = ref(false)

// Watch for show changes to reset/populate form
watch(() => props.show, (newVal) => {
    if (newVal) {
        showApiKey.value = false
        if (props.mode === 'edit' && props.providerData) {
            // Populate form with existing data
            let headersStr = ''
            if (props.providerData.headers && typeof props.providerData.headers === 'object') {
                headersStr = JSON.stringify(props.providerData.headers, null, 2)
            }
            formData.value = {
                id: props.providerId || '',
                baseUrl: props.providerData.baseUrl || '',
                apiKey: props.providerData.apiKey || '',
                api: props.providerData.api || 'openai-completions',
                headers: headersStr
            }
        } else {
            // Reset form for add mode
            formData.value = {
                id: '',
                baseUrl: '',
                apiKey: '',
                api: 'openai-completions',
                headers: ''
            }
        }
    }
})

const modalTitle = computed(() => props.mode === 'add' ? '添加提供商' : '编辑提供商')
const submitLabel = computed(() => props.mode === 'add' ? '添加' : '保存')

const isFormValid = computed(() => {
    const isBaseUrlValid = formData.value.baseUrl.trim().length > 0
    if (props.mode === 'add') {
        return formData.value.id.trim().length > 0 && isBaseUrlValid
    }
    return isBaseUrlValid
})

const handleSubmit = async () => {
    if (!isFormValid.value) return

    const providerId = props.mode === 'add' ? formData.value.id.trim() : props.providerId!

    // Parse headers if provided
    let headersObj = undefined
    if (formData.value.headers.trim()) {
        try {
            headersObj = JSON.parse(formData.value.headers)
        } catch (e) {
            console.error('Invalid headers JSON:', e)
            toast.error('自定义请求头 JSON 格式无效')
            return
        }
    }

    if (props.mode === 'add') {
        // Check for duplicate ID
        const providersObj = (configState.configForm?.models as any)?.providers as Record<string, any> | undefined
        if (providersObj && providersObj[providerId]) {
            toast.error('提供商 ID 已存在，请使用其他 ID')
            return
        }

        // Create new provider config
        const providerConfig: any = {
            baseUrl: formData.value.baseUrl,
            apiKey: formData.value.apiKey,
            api: formData.value.api,
            models: []
        }
        if (headersObj) {
            providerConfig.headers = headersObj
        }

        configState.updateConfigFormValue(
            ['models', 'providers', providerId],
            providerConfig
        )
    } else {
        // Edit mode: update existing provider
        configState.updateConfigFormValue(
            ['models', 'providers', providerId, 'baseUrl'],
            formData.value.baseUrl
        )
        configState.updateConfigFormValue(
            ['models', 'providers', providerId, 'apiKey'],
            formData.value.apiKey
        )
        configState.updateConfigFormValue(
            ['models', 'providers', providerId, 'api'],
            formData.value.api
        )
        if (headersObj) {
            configState.updateConfigFormValue(
                ['models', 'providers', providerId, 'headers'],
                headersObj
            )
        } else {
            configState.updateConfigFormValue(
                ['models', 'providers', providerId, 'headers'],
                undefined
            )
        }
    }

    await configState.saveConfig()
    emit('saved', providerId)
    emit('close')
    toast.success('保存成功')
}

const handleClose = () => {
    emit('close')
}
</script>

<template>
    <dialog :class="{ 'modal modal-open': show, 'modal': !show }">
        <div class="modal-box max-w-xl">
            <h3 class="font-bold text-lg mb-6">{{ modalTitle }}</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-if="mode === 'add'" class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">提供商 ID <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.id" type="text" placeholder="e.g. openai, anthropic"
                        class="input input-bordered w-full font-mono" />
                </div>

                <div class="form-control md:col-span-2">
                    <label class="label"><span class="label-text">Base URL <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.baseUrl" type="text" placeholder="https://api.openai.com/v1"
                        class="input input-bordered w-full" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">API Key</span></label>
                    <div class="join w-full">
                        <input v-model="formData.apiKey" :type="showApiKey ? 'text' : 'password'" placeholder="sk-..."
                            class="input input-bordered join-item flex-1" />
                        <button type="button" @click="showApiKey = !showApiKey" class="btn btn-ghost join-item">
                            <EyeSlashIcon v-if="showApiKey" class="w-4 h-4" />
                            <EyeIcon v-else class="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">API 类型</span></label>
                    <select v-model="formData.api" class="select select-bordered w-full">
                        <option value="openai-completions">OpenAI Completions</option>
                        <option value="anthropic">Anthropic</option>
                    </select>
                </div>

                <div class="form-control md:col-span-2">
                    <label class="label">
                        <span class="label-text">自定义请求头 (JSON)</span>
                        <span class="label-text-alt text-base-content/50">可选</span>
                    </label>
                    <textarea v-model="formData.headers" rows="3"
                        class="textarea textarea-bordered w-full font-mono text-sm"
                        placeholder='{"X-Proxy-Region": "us-west"}'></textarea>
                </div>
            </div>

            <div class="modal-action">
                <button @click="handleClose" class="btn">取消</button>
                <button @click="handleSubmit" class="btn btn-primary" :disabled="!isFormValid">{{ submitLabel
                }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="handleClose">close</button>
        </form>
    </dialog>
</template>
