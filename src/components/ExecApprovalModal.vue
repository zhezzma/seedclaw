<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useExecApproval } from '../composables/useExecApproval'
import { useToast } from '../composables/useToast'
import { useI18n } from 'vue-i18n'

const execApproval = useExecApproval()
const toast = useToast()
const { t } = useI18n()

const currentRequest = computed(() => {
    return execApproval.execApprovalQueue.length > 0 ? execApproval.execApprovalQueue[0] : null
})

const timeLeft = ref<string>('')
let timer: number | null = null

const updateTime = () => {
    if (!currentRequest.value) return
    const ms = currentRequest.value.expiresAtMs - Date.now()
    if (ms <= 0) {
        timeLeft.value = t('execApproval.expired')
    } else {
        const secs = Math.ceil(ms / 1000)
        timeLeft.value = t('execApproval.expiresIn', { s: secs })
    }
}

onMounted(() => {
    timer = window.setInterval(updateTime, 1000)
    updateTime()
})

onUnmounted(() => {
    if (timer) clearInterval(timer)
})

const handleDecision = async (decision: 'allow-once' | 'allow-always' | 'deny') => {
    if (!currentRequest.value) return
    try {
        const res: any = await execApproval.resolveRequest(currentRequest.value.id, decision)
        if (res && res.ok === false) {
            throw new Error(res.error?.message || 'Unknown error')
        }
    } catch (e: any) {
        console.error('Failed to resolve request', e)
        toast.error(`Error: ${e.message || String(e)}`)
    }
}
</script>

<template>
    <div v-if="currentRequest"
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div class="bg-base-100 rounded-lg shadow-xl p-6 w-full max-w-lg border border-base-200">
            <div class="mb-4">
                <h3 class="text-lg font-bold">{{ $t('execApproval.title') }}</h3>
                <p class="text-sm text-base-content/60">{{ timeLeft }}</p>
            </div>

            <div class="bg-base-200/50 p-4 rounded-md font-mono text-sm break-all mb-6 border border-base-200">
                {{ currentRequest.request.command }}
            </div>

            <div class="flex gap-3">
                <button @click="handleDecision('allow-once')" class="btn btn-error text-white">
                    {{ $t('execApproval.allow') }}
                </button>
                <!-- <button @click="handleDecision('allow-always')" class="btn btn-outline">
                    {{ $t('execApproval.allowAlways') }}
                </button> -->
                <button @click="handleDecision('deny')" class="btn btn-outline btn-error">
                    {{ $t('execApproval.deny') }}
                </button>
            </div>
        </div>
    </div>
</template>
