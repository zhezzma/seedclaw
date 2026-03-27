<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/24/outline'
import { useWeixinLogin } from '../composables/useWeixinLogin'

const weixinLogin = useWeixinLogin()
</script>

<template>
    <div v-if="weixinLogin.isModalOpen.value" class="fixed inset-0 z-[10000] bg-base-100/95 backdrop-blur-sm flex flex-col">
        <div class="flex items-center justify-end p-4">
            <button class="btn btn-ghost btn-circle" @click="weixinLogin.closeModal()" :title="$t('common.close')">
                <XMarkIcon class="h-6 w-6" />
            </button>
        </div>
        <div class="flex-1 flex items-center justify-center px-6 pb-8">
            <div class="w-full max-w-md rounded-3xl bg-base-100 shadow-xl border border-base-300 p-8 text-center">
                <h3 class="text-xl font-semibold mb-3">{{ $t('sidebar.weixinLoginTitle') }}</h3>
                <p class="text-sm text-base-content/60 mb-6">{{ $t(weixinLogin.statusTextKey.value) }}</p>

                <div v-if="weixinLogin.qrCodeSrc.value && weixinLogin.status.value !== 'connected'" class="flex justify-center mb-6">
                    <img
                        :src="weixinLogin.qrCodeSrc.value"
                        :alt="$t('sidebar.weixinLoginQrAlt')"
                        class="w-64 h-64 rounded-2xl border border-base-300 bg-white object-contain p-3"
                    />
                </div>

                <div v-else-if="weixinLogin.isStarting.value" class="py-10">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <div v-else-if="weixinLogin.status.value === 'connected'" class="py-10 flex flex-col items-center gap-3">
                    <div class="w-16 h-16 rounded-full bg-success/15 text-success flex items-center justify-center text-3xl">✓</div>
                    <p class="text-lg font-medium">{{ $t('sidebar.weixinLoginSuccess') }}</p>
                </div>

                <div v-if="weixinLogin.errorMessage.value" class="mt-4 text-sm text-error break-words">
                    {{ weixinLogin.errorMessage.value }}
                </div>
            </div>
        </div>
    </div>
</template>
