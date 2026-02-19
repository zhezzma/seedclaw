<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
const inputValue = ref('')
let timer: number | null = null

// Reset input when request changes
watch(currentRequest, (newReq) => {
    if (newReq?.type === 'input') {
        inputValue.value = newReq.placeholder || ''
    } else {
        inputValue.value = ''
    }
})

const updateTime = () => {
    if (!currentRequest.value) return
    const ms = currentRequest.value.timeout - Date.now()
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

const handleResolve = async (value: string | boolean) => {
    if (!currentRequest.value) return
    try {
        const res: any = await execApproval.resolveRequest(currentRequest.value.id, value)
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
                <h3 class="text-lg font-bold">{{ currentRequest.title || $t('execApproval.title') }}</h3>
                <p class="text-sm text-base-content/60">{{ timeLeft }}</p>
            </div>

            <!-- Message / Command Display -->
            <div v-if="currentRequest.message"
                class="bg-base-200/50 p-4 rounded-md font-mono text-sm break-all mb-6 border border-base-200 whitespace-pre-wrap">
                {{ currentRequest.message }}
            </div>

            <!-- Input Type -->
            <div v-if="currentRequest.type === 'input'" class="flex gap-2 mb-6">
                <input v-model="inputValue" type="text" class="input input-bordered w-full"
                    :placeholder="currentRequest.placeholder" @keyup.enter="handleResolve(inputValue)" autofocus />
            </div>

            <!-- Actions -->
            <div class="flex gap-3 flex-wrap">
                <!-- Select Type -->
                <template v-if="currentRequest.type === 'select' && currentRequest.options">
                    <button v-for="opt in currentRequest.options" :key="opt" @click="handleResolve(opt)"
                        class="btn btn-primary">
                        {{ opt }}
                    </button>
                    <!-- Optional Cancel/Back button for select? Assuming selection is mandatory or handled by timeout/reject -->
                </template>

                <!-- Input Type Actions -->
                <template v-else-if="currentRequest.type === 'input'">
                    <button @click="handleResolve(inputValue)" class="btn btn-primary flex-1">
                        {{ $t('common.confirm') || 'Confirm' }}
                    </button>
                </template>

                <!-- Confirm Type (Default) -->
                <template v-else>
                    <button @click="handleResolve(true)" class="btn btn-primary text-white flex-1">
                        {{ $t('execApproval.allow') || 'Yes' }}
                    </button>
                    <button @click="handleResolve(false)" class="btn btn-outline btn-error flex-1">
                        {{ $t('execApproval.deny') || 'No' }}
                    </button>
                </template>
            </div>
        </div>
    </div>
</template>