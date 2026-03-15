<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue'
import { useModelsState } from '../../composables/useModelsState'
import { useI18n } from 'vue-i18n'
import { ArrowTopRightOnSquareIcon, InformationCircleIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
    show: boolean
    providerId: string
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'completed'): void
}>()

const { t } = useI18n()
const { startOAuth, pollOAuthStatus, submitOAuthInput, abortOAuthSession } = useModelsState()

const sessionId = ref('')
const status = ref<'idle' | 'pending' | 'waiting_for_input' | 'completed' | 'failed'>('idle')
const url = ref('')
const instructions = ref('')
const prompt = ref<{ message: string, placeholder?: string } | null>(null)
const userInput = ref('')
const error = ref('')
const isSubmittingInput = ref(false)

let pollTimer: any = null

// 开始 OAuth 流程
const startFlow = async () => {
    status.value = 'pending'
    error.value = ''
    try {
        const res = await startOAuth(props.providerId) as any
        sessionId.value = res.sessionId
        url.value = res.url
        instructions.value = res.instructions || ''
        startPolling()
    } catch (err: any) {
        status.value = 'failed'
        error.value = err.message || t('common.error')
    }
}

// 轮询状态更新
const startPolling = () => {
    stopPolling()
    pollTimer = setInterval(async () => {
        try {
            const res = await pollOAuthStatus(sessionId.value)
            status.value = res.status
            if (res.prompt) prompt.value = res.prompt
            if (res.url) url.value = res.url
            if (res.instructions) instructions.value = res.instructions
            if (res.error) error.value = res.error
            
            if (res.status === 'completed') {
                stopPolling()
                emit('completed')
                // 成功后延迟 2 秒自动关闭
                setTimeout(() => handleClose(), 2000)
            } else if (res.status === 'failed') {
                stopPolling()
            }
        } catch (err: any) {
            // session 不存在（被清理）时停止轮询
            if (err?.status === 404 || err?.message?.includes('not found')) {
                stopPolling()
                status.value = 'failed'
                error.value = t('provider.sessionExpired', 'Session expired, please try again')
            }
        }
    }, 2000)
}

const stopPolling = () => {
    if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
    }
}

// 提交用户输入（验证码 / 手动粘贴的回调 URL）
const handleSubmit = async () => {
    if (!userInput.value) return
    isSubmittingInput.value = true
    try {
        await submitOAuthInput(sessionId.value, userInput.value)
        userInput.value = ''
        prompt.value = null
        status.value = 'pending'
    } catch (err: any) {
        error.value = err.message || t('common.error')
    } finally {
        isSubmittingInput.value = false
    }
}

const handleClose = () => {
    stopPolling()
    if (sessionId.value && status.value !== 'completed') {
        abortOAuthSession(sessionId.value).catch(err => console.error('Failed to abort session:', err))
    }
    emit('close')
}

// 监听弹窗显示状态
watch(() => props.show, (newVal) => {
    if (newVal) {
        // 重置所有状态并重新开始流程
        status.value = 'idle'
        sessionId.value = ''
        url.value = ''
        instructions.value = ''
        prompt.value = null
        userInput.value = ''
        error.value = ''
        startFlow()
    } else {
        stopPolling()
    }
})

onUnmounted(() => {
    stopPolling()
})
</script>

<template>
    <dialog :class="{ 'modal modal-open': show, 'modal': !show }">
        <div class="modal-box max-w-md">
            <h3 class="font-bold text-lg mb-4">{{ $t('provider.oauthLogin', 'OAuth Login') }}: {{ providerId }}</h3>

            <div class="space-y-4">
                <!-- Loading Spinner -->
                <div v-if="status === 'pending' && !url" class="flex flex-col items-center py-6">
                    <span class="loading loading-spinner loading-lg text-primary"></span>
                    <p class="mt-4 text-sm opacity-60">{{ $t('common.processing', 'Processing...') }}</p>
                </div>

                <!-- Instructions -->
                <p v-if="instructions" class="text-sm opacity-80 mb-2 border-l-2 border-primary pl-3 py-1 bg-base-200/50 rounded-r">
                    {{ instructions }}
                </p>

                <!-- Auth URL: Open Browser -->
                <div v-if="url && status !== 'completed'" class="bg-base-200 p-4 rounded-lg border border-base-300">
                    <div class="flex items-start gap-3">
                        <InformationCircleIcon class="w-5 h-5 text-info shrink-0 mt-0.5" />
                        <div class="text-sm flex-1">
                            <p class="font-semibold mb-1">{{ $t('provider.authStep1', 'Step 1: Authorize in Browser') }}</p>
                            <p class="opacity-70 mb-3">{{ $t('provider.authInstructions', 'Please complete the authorization in the opened browser window.') }}</p>
                            <a :href="url" target="_blank" class="btn btn-primary btn-sm gap-2">
                                {{ $t('provider.openBrowser', 'Open Browser') }}
                                <ArrowTopRightOnSquareIcon class="w-4 h-4" />
                            </a>
                        </div>
                    </div>
                </div>

                <!-- Unified Input: code / redirect URL / etc. -->
                <div v-if="status === 'waiting_for_input' && prompt" class="bg-primary/5 p-4 rounded-lg border border-primary/20">
                    <label class="label">
                        <span class="label-text font-bold text-primary" style="white-space: pre-line">{{ prompt.message || $t('provider.manualCodeHint') }}</span>
                    </label>
                    <div class="flex gap-2">
                        <input 
                            v-model="userInput" 
                            type="text" 
                            :placeholder="prompt.placeholder || '...'" 
                            class="input input-bordered flex-1"
                            @keyup.enter="handleSubmit"
                            :disabled="isSubmittingInput"
                        />
                        <button 
                            @click="handleSubmit" 
                            class="btn btn-primary"
                            :disabled="!userInput || isSubmittingInput"
                        >
                            <span v-if="isSubmittingInput" class="loading loading-spinner loading-xs"></span>
                            {{ $t('common.submit', 'Submit') }}
                        </button>
                    </div>
                </div>

                <!-- Success State -->
                <div v-if="status === 'completed'" class="alert alert-success">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{{ $t('provider.authSuccess', 'Login successful!') }}</span>
                </div>

                <!-- Error State -->
                <div v-if="error" class="alert alert-error text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{{ error }}</span>
                </div>
            </div>

            <div class="modal-action">
                <button @click="handleClose" class="btn" :disabled="status === 'pending'">{{ $t('common.close') }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="handleClose">{{ $t('common.close') }}</button>
        </form>
    </dialog>
</template>
