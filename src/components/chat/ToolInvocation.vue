<script setup lang="ts">
import { ref, computed } from 'vue'
import {
    WrenchScrewdriverIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon
} from '@heroicons/vue/24/outline'

const props = defineProps<{
    toolName: string
    args: Record<string, any>
    result?: any
    state?: 'calling' | 'success' | 'error'
    errorMessage?: string
}>()

const isOpen = ref(false)

const toggleOpen = () => {
    isOpen.value = !isOpen.value
}

const statusText = computed(() => {
    switch (props.state) {
        case 'calling':
            return `正在调用 ${props.toolName}...`
        case 'success':
            return `已使用 ${props.toolName}`
        case 'error':
            return `调用 ${props.toolName} 失败`
        default:
            return props.toolName
    }
})

const formatJson = (data: any) => {
    try {
        if (typeof data === 'string') {
            // Try to parse if it looks like JSON object/array
            if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
                return JSON.stringify(JSON.parse(data), null, 2)
            }
            return data
        }
        return JSON.stringify(data, null, 2)
    } catch (e) {
        return String(data)
    }
}
</script>

<template>
    <div class="card bg-base-200/50 border border-base-300 shadow-sm overflow-hidden my-2 text-sm">
        <!-- Header -->
        <div @click="toggleOpen"
            class="flex items-center gap-2 p-3 cursor-pointer hover:bg-base-200 transition-colors select-none">
            <!-- Status Icon -->
            <div class="flex-none">
                <span v-if="state === 'calling'" class="loading loading-spinner loading-xs text-primary"></span>
                <CheckCircleIcon v-else-if="state === 'success'" class="w-5 h-5 text-success" />
                <ExclamationCircleIcon v-else-if="state === 'error'" class="w-5 h-5 text-error" />
                <WrenchScrewdriverIcon v-else class="w-5 h-5 text-base-content/70" />
            </div>

            <!-- Title -->
            <div class="flex-1 font-medium text-base-content/80">
                {{ statusText }}
            </div>

            <!-- Toggle Icon -->
            <div class="flex-none text-base-content/50">
                <ChevronDownIcon v-if="isOpen" class="w-4 h-4" />
                <ChevronRightIcon v-else class="w-4 h-4" />
            </div>
        </div>

        <!-- Details Body -->
        <div v-if="isOpen" class="border-t border-base-300 bg-base-100/50">
            <div class="p-3 space-y-3">
                <!-- Arguments -->
                <div>
                    <div class="text-xs font-semibold text-base-content/50 mb-1 uppercase tracking-wider">输入参数</div>
                    <pre
                        class="bg-base-300/50 p-2 rounded text-xs font-mono overflow-x-auto">{{ formatJson(args) }}</pre>
                </div>

                <!-- Result -->
                <div v-if="result">
                    <div class="text-xs font-semibold text-base-content/50 mb-1 uppercase tracking-wider">执行结果</div>
                    <pre
                        class="bg-base-300/50 p-2 rounded text-xs font-mono overflow-x-auto max-h-60">{{ formatJson(result) }}</pre>
                </div>

                <!-- Error -->
                <div v-if="errorMessage">
                    <div class="text-xs font-semibold text-error mb-1 uppercase tracking-wider">错误信息</div>
                    <pre
                        class="bg-error/10 text-error p-2 rounded text-xs font-mono overflow-x-auto">{{ errorMessage }}</pre>
                </div>
            </div>
        </div>
    </div>
</template>
