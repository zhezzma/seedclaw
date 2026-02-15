<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import { apiGet } from '../composables/api-client'
import { useDevicesState } from '../composables/useDevicesState'
import {
    ArrowRightIcon,
    EyeIcon,
    EyeSlashIcon,
    DevicePhoneMobileIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const { t } = useI18n()
const configStore = useUiSettingsStore()

const devicesState = useDevicesState()

const apiBaseUrl = ref('http://localhost:18789')
const authToken = ref('')
const isLoading = ref(false)
const error = ref('')
const showPassword = ref(false)
const deviceName = ref(configStore.deviceName || 'SeedClaw')

const pairingState = ref<{
    isPairing: boolean
    deviceId: string
    requestId: string
}>({
    isPairing: false,
    deviceId: '',
    requestId: ''
})



const handleSubmit = async () => {
    // Validate
    if (!apiBaseUrl.value.trim()) {
        error.value = t('setup.enterGatewayUrl')
        return
    }
    if (!authToken.value.trim()) {
        error.value = t('setup.enterToken')
        return
    }

    // Validate URL format (HTTP API)
    if (!apiBaseUrl.value.startsWith('http://') && !apiBaseUrl.value.startsWith('https://')) {
        error.value = t('setup.gatewayUrlFormatError')
        return
    }

    // Security check: HTTPS should be used over secure connections
    // (relaxed from previous WS-specific check)

    isLoading.value = true
    error.value = ''
    pairingState.value.isPairing = false

    try {
        // Save configuration first
        configStore.save({
            apiBaseUrl: apiBaseUrl.value.trim(),
            token: authToken.value.trim(),
            deviceName: deviceName.value.trim() || 'SeedClaw'
        })

        // Test the connection with a health check
        await apiGet('/api/agents')

        // Connection successful, redirect to home
        router.push('/')
    } catch (e: any) {
        // Handle pairing requirement
        if (e.code === 'NOT_PAIRED' || e.message?.includes('pairing required') || e.message?.includes('1008')) {
            // Pairing not supported in new API — show generic error
            error.value = t('setup.connectionFailed')

        } else {
            // Connection failed, show error
            error.value = e instanceof Error ? e.message : t('setup.connectionFailed')
            console.error(e)
        }
    } finally {
        isLoading.value = false
    }
}
</script>

<template>
    <div
        class="min-h-screen bg-gradient-to-br from-base-300 via-base-200 to-base-300 flex items-center justify-center p-4">
        <!-- Decorative background elements -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
            <div class="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
            <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl"></div>
        </div>

        <div
            class="card bg-base-100/80 backdrop-blur-xl shadow-2xl w-full max-w-md border border-base-300/50 relative z-10 transition-all duration-500">
            <div class="card-body p-8">
                <!-- Header -->
                <div class="text-center mb-8">
                    <div class="text-6xl mb-4 animate-bounce">🦀</div>
                    <h1
                        class="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        Seedclaw
                    </h1>
                    <p class="text-base-content/60 mt-3 text-sm">{{ $t('setup.subtitle') }}</p>
                </div>

                <!-- Error message -->
                <div v-if="error" role="alert" class="alert alert-error alert-soft">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>{{ error }}</span>
                </div>


                <!-- Pairing UI -->
                <div v-if="pairingState.isPairing" class="space-y-6 animate-fade-in">
                    <div class="alert alert-info shadow-sm">
                        <DevicePhoneMobileIcon class="h-6 w-6" />
                        <div>
                            <h3 class="font-bold">{{ $t('setup.pairingSent') }}</h3>
                            <div class="text-xs">{{ $t('setup.contactAdmin') }}</div>
                        </div>
                    </div>

                    <div class="bg-base-200/50 rounded-xl p-4 space-y-4 border border-base-content/5">
                        <div class="space-y-1">
                            <div class="text-xs text-base-content/50 font-medium uppercase tracking-wider">{{
                                $t('setup.deviceId') }}</div>
                            <div
                                class="font-mono text-sm break-all bg-base-100 p-2 rounded border border-base-content/10 select-all">
                                {{ pairingState.deviceId }}
                            </div>
                        </div>

                        <div class="space-y-1">
                            <div class="text-xs text-base-content/50 font-medium uppercase tracking-wider">{{
                                $t('setup.requestId') }}</div>
                            <div
                                class="font-mono text-sm break-all bg-base-100 p-2 rounded border border-base-content/10 select-all">
                                {{ pairingState.requestId }}
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-center gap-3 py-4 text-base-content/60">
                        <span class="loading loading-spinner loading-md text-primary"></span>
                        <span class="text-sm">{{ $t('setup.waitingApproval') }}</span>
                    </div>


                    <button @click="pairingState.isPairing = false" class="btn btn-ghost btn-block btn-sm">
                        {{ $t('setup.backToConfig') }}
                    </button>
                </div>

                <!-- Config Form -->
                <form v-else @submit.prevent="handleSubmit" class="space-y-6 animate-fade-in">

                    <!-- Gateway URL -->
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend text-sm font-medium">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                stroke="currentColor" class="w-4 h-4 inline mr-1">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" />
                            </svg>
                            {{ $t('setup.gatewayUrl') }}
                        </legend>
                        <input v-model="apiBaseUrl" type="text" class="input w-full focus:input-primary transition-all"
                            placeholder="http://localhost:18789" />
                        <p class="label text-xs opacity-60">{{ $t('setup.gatewayUrlHint') }}</p>
                    </fieldset>

                    <!-- Auth Token -->
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend text-sm font-medium">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                                stroke="currentColor" class="w-4 h-4 inline mr-1">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                            </svg>
                            {{ $t('setup.token') }}
                        </legend>
                        <div class="relative">
                            <input v-model="authToken" :type="showPassword ? 'text' : 'password'"
                                class="input w-full pr-12 focus:input-primary transition-all"
                                :placeholder="$t('setup.enterTokenPlaceholder')" />
                            <button type="button" @click="showPassword = !showPassword"
                                class="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle">
                                <EyeSlashIcon v-if="showPassword" class="h-4 w-4" />
                                <EyeIcon v-else class="h-4 w-4" />
                            </button>
                        </div>
                        <p class="label text-xs opacity-60">{{ $t('setup.tokenDesc') }}</p>
                    </fieldset>

                    <!-- Device Name -->
                    <fieldset class="fieldset">
                        <legend class="fieldset-legend text-sm font-medium">
                            <DevicePhoneMobileIcon class="w-4 h-4 inline mr-1" />
                            {{ $t('setup.deviceNameOptional') }}
                        </legend>
                        <input v-model="deviceName" type="text" class="input w-full focus:input-primary transition-all"
                            placeholder="SeedClaw Web" />
                        <p class="label text-xs opacity-60">{{ $t('setup.deviceNameDesc') }}</p>
                    </fieldset>



                    <!-- Submit button -->
                    <button type="submit"
                        class="btn btn-primary btn-block gap-2 h-12 text-base shadow-lg hover:shadow-primary/25 transition-all"
                        :disabled="isLoading">
                        <span v-if="isLoading" class="loading loading-spinner loading-sm"></span>
                        <template v-else>
                            {{ $t('setup.startUsing') }}
                            <ArrowRightIcon class="h-5 w-5" />
                        </template>
                    </button>
                </form>

                <!-- Footer -->
                <div class="divider my-6 text-xs opacity-50">{{ $t('common.or') }}</div>
                <p class="text-center text-sm text-base-content/60">
                    {{ $t('setup.noOpenClaw') }}
                    <a href="https://docs.openclaw.ai" target="_blank"
                        class="link link-primary font-medium hover:link-hover">
                        {{ $t('setup.learnMore') }} →
                    </a>
                </p>
            </div>
        </div>
    </div>
</template>

<style scoped>
@keyframes fade-in {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.animate-fade-in {
    animation: fade-in 0.3s ease-out forwards;
}
</style>
