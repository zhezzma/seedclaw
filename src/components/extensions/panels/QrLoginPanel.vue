<script setup lang="ts">
/**
 * qr-login 面板：渲染扩展登录二维码并轮询结果。
 * 端点契约：POST /api/extensions/:extensionId/login/start | /login/wait。
 * 外层弹层壳由 ExtensionPanelModal 提供。
 */
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQrLogin } from '../../../composables/useQrLogin'

const props = defineProps<{
    extensionId: string
}>()

const { t } = useI18n()
const qrLogin = useQrLogin(props.extensionId)

onMounted(() => {
    qrLogin.activate()
})

onUnmounted(() => {
    qrLogin.deactivate()
})
</script>

<template>
    <div class="text-center">
        <p class="text-sm text-base-content/60 mb-6">{{ t(qrLogin.statusTextKey.value) }}</p>

        <div v-if="qrLogin.qrCodeSrc.value && qrLogin.status.value !== 'connected'" class="flex justify-center mb-6">
            <img
                :src="qrLogin.qrCodeSrc.value"
                :alt="t('extensions.qrLogin.qrAlt')"
                class="w-64 h-64 rounded-2xl border border-base-300 bg-white object-contain p-3"
            />
        </div>

        <div v-else-if="qrLogin.isStarting.value" class="py-10">
            <span class="loading loading-spinner loading-lg"></span>
        </div>

        <div v-else-if="qrLogin.status.value === 'connected'" class="py-10 flex flex-col items-center gap-3">
            <div class="w-16 h-16 rounded-full bg-success/15 text-success flex items-center justify-center text-3xl">✓</div>
            <p class="text-lg font-medium">{{ t('extensions.qrLogin.success') }}</p>
        </div>

        <div v-if="qrLogin.errorMessage.value" class="mt-4 text-sm text-error break-words">
            {{ qrLogin.errorMessage.value }}
        </div>
    </div>
</template>
