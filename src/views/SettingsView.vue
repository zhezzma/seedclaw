<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import {
    ArrowLeftIcon,
    XMarkIcon,
    ChevronRightIcon,
    ServerIcon,
    SunIcon,
    MoonIcon,
    QuestionMarkCircleIcon,
    ChatBubbleLeftEllipsisIcon,
    ArrowRightOnRectangleIcon,
    MicrophoneIcon,
    SpeakerWaveIcon,
    DocumentTextIcon,
    ArrowTopRightOnSquareIcon,
    ComputerDesktopIcon,
    ViewColumnsIcon,
    BellIcon
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'

import { useConfirm } from '../composables/useConfirm'

const router = useRouter()
const { t } = useI18n()
const configStore = useUiSettingsStore()
const { confirm } = useConfirm()

const editForm = ref({
    gatewayUrl: '',
    token: '',
    sessionsActiveDays: 3,
    silenceDuration: 1500,
    // ASR
    asrToken: '',
    asrEngine: '',
    asrModel: '',
    // TTS
    ttsEngine: 'qwen' as 'qwen' | 'edge',
    ttsToken: '',
    ttsModel: '',
    homePageBehavior: 'last_active_session' as 'last_active_session' | 'new_session' | 'default_session',
    // Gotify
    gotifyUrl: '',
    gotifyToken: ''
})

// ... (existing code)

const openGotifyModal = () => {
    editForm.value = {
        ...editForm.value,
        gotifyUrl: configStore.gotifyUrl,
        gotifyToken: configStore.gotifyToken
    }
    const modal = document.getElementById('gotify_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

// ... (existing code)

const saveGotify = () => {
    configStore.save({
        gotifyUrl: editForm.value.gotifyUrl,
        gotifyToken: editForm.value.gotifyToken
    })


}

// ... (existing code)





const openConnectionModal = () => {
    editForm.value = {
        ...editForm.value,
        gatewayUrl: configStore.gatewayUrl,
        token: configStore.token,
        sessionsActiveDays: configStore.sessionsActiveDays,
        silenceDuration: configStore.silenceDuration,
        homePageBehavior: configStore.homePageBehavior || 'last_active_session'
    }
    const modal = document.getElementById('basic_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const openAsrModal = () => {
    editForm.value = {
        ...editForm.value,
        asrToken: configStore.asrToken,
        asrEngine: configStore.asrEngine || 'fun-asr',
        asrModel: configStore.asrModel
    }
    const modal = document.getElementById('asr_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const openTtsModal = () => {
    editForm.value = {
        ...editForm.value,
        ttsEngine: configStore.ttsEngine,
        ttsToken: configStore.ttsToken,
        ttsModel: configStore.ttsModel
    }
    const modal = document.getElementById('tts_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const saveConnection = () => {
    configStore.save({
        gatewayUrl: editForm.value.gatewayUrl,
        token: editForm.value.token,
        sessionsActiveDays: Number(editForm.value.sessionsActiveDays),
        silenceDuration: Number(editForm.value.silenceDuration),
        homePageBehavior: editForm.value.homePageBehavior
    })
    if (window.location.protocol !== 'file:') {
        window.location.reload()
    }
}

const saveAsr = () => {
    configStore.save({
        asrToken: editForm.value.asrToken,
        asrEngine: editForm.value.asrEngine,
        asrModel: editForm.value.asrModel
    })
}

const saveTts = () => {
    configStore.save({
        ttsEngine: editForm.value.ttsEngine,
        ttsToken: editForm.value.ttsToken,
        ttsModel: editForm.value.ttsModel
    })
}

const goBack = () => {
    router.back()
}

const openHelpDocs = () => {
    window.open('https://docs.openclaw.ai/', '_blank')
}

const navigateToLogs = () => {
    router.push('/logs')
}

const navigateToDevices = () => {
    router.push('/devices')
}

const logout = async () => {
    if (await confirm(t('settings.clearDataConfirm'), t('settings.confirmLogout'))) {
        configStore.clear()
        router.push('/setup')
    }
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header - fixed -->
        <ViewHeader :title="$t('settings.title')" :is-main-page="true">
        </ViewHeader>

        <!-- Content - scrollable -->
        <div class="flex-1 overflow-y-auto ">
            <div class="max-w-2xl mx-auto p-4 space-y-6">


                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">{{ $t('settings.basic') }}</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="openConnectionModal">
                                <div class="flex items-center gap-3">
                                    <ServerIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.basic') }}</span>
                                        <p class="text-xs text-base-content/50 truncate max-w-48">{{
                                            configStore.gatewayUrl
                                        }}</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>

                            <li class="flex items-center justify-between p-4">
                                <div class="flex items-center gap-3">
                                    <template v-if="configStore.isDark">
                                        <MoonIcon class="h-5 w-5 text-base-content/60" />
                                    </template>
                                    <template v-else>
                                        <SunIcon class="h-5 w-5 text-base-content/60" />
                                    </template>
                                    <span class="font-medium">{{ $t('settings.theme') }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-sm text-base-content/60">{{ configStore.isDark ?
                                        $t('settings.dark') : $t('settings.light')
                                        }}</span>
                                    <input type="checkbox" class="toggle toggle-primary" :checked="configStore.isDark"
                                        @change="configStore.toggleTheme()" />
                                </div>
                            </li>



                            <li class="flex items-center justify-between p-4 lg:hidden">
                                <div class="flex items-center gap-3">
                                    <ViewColumnsIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium">{{ $t('settings.showBottomNav') }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <input type="checkbox" class="toggle toggle-primary"
                                        v-model="configStore.showBottomNav" @change="configStore.persist()" />
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Notification Settings -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">{{ $t('settings.notifications') }}</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="openGotifyModal">
                                <div class="flex items-center gap-3">
                                    <BellIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.gotify') }}</span>
                                        <p class="text-xs text-base-content/50">{{ configStore.gotifyUrl ||
                                            $t('settings.notConfigured')
                                            }}</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Voice Settings -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">{{ $t('settings.voice') }}</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="openAsrModal">
                                <div class="flex items-center gap-3">
                                    <MicrophoneIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.asr') }}</span>
                                        <p class="text-xs text-base-content/50">{{ configStore.asrEngine || 'Default' }}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="openTtsModal">
                                <div class="flex items-center gap-3">
                                    <SpeakerWaveIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.tts') }}</span>
                                        <p class="text-xs text-base-content/50">{{ configStore.ttsEngine }}</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- OPEN CLAW Group -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2 uppercase tracking-wide">OPEN CLAW</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <!-- 配置管理 -->
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="router.push('/config')">
                                <div class="flex items-center gap-3">
                                    <DocumentTextIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.configManager') }}</span>
                                        <p class="text-xs text-base-content/50">{{ $t('settings.configManagerDesc') }}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                            <!-- 设备与节点 -->
                            <li @click="navigateToDevices"
                                class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                <div class="flex items-center gap-3">
                                    <ComputerDesktopIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.devicesNodes') }}</span>
                                        <p class="text-xs text-base-content/50">{{ $t('settings.devicesNodesDesc') }}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                            <!-- 系统日志 -->
                            <li @click="navigateToLogs"
                                class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                <div class="flex items-center gap-3">
                                    <DocumentTextIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.systemLogs') }}</span>
                                        <p class="text-xs text-base-content/50">{{ $t('settings.systemLogsDesc') }}</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Help & Feedback -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">{{ $t('settings.helpFeedback') }}</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li @click="openHelpDocs"
                                class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                <div class="flex items-center gap-3">
                                    <QuestionMarkCircleIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium">{{ $t('settings.usageHelp') }}</span>
                                </div>
                                <ArrowTopRightOnSquareIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Logout Button -->
                <div class="pt-4">
                    <button @click="logout" class="btn btn-outline btn-error btn-block gap-2">
                        <ArrowRightOnRectangleIcon class="h-5 w-5" />
                        {{ $t('settings.clearData') }}
                    </button>
                </div>

                <!-- Version Info -->
                <div class="text-center py-4">
                    <p class="text-xs text-base-content/40">Seedclaw v0.1.0</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Modals (Basic, ASR, TTS) -->
    <dialog id="basic_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">{{ $t('settings.basic') }}</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.deviceName') }}</span>
                    </label>
                    <input type="text" :value="configStore.deviceName" disabled
                        class="input input-bordered w-full opacity-70 cursor-not-allowed" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">{{ $t('settings.deviceNameDesc') }}</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.gatewayUrl') }}</span>
                    </label>
                    <input type="text" v-model="editForm.gatewayUrl" :placeholder="$t('settings.gatewayUrlPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.token') }}</span>
                    </label>
                    <input type="text" v-model="editForm.token" :placeholder="$t('settings.tokenPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.sessionActiveDays') }}</span>
                    </label>
                    <input type="number" v-model="editForm.sessionsActiveDays" class="input input-bordered w-full"
                        placeholder="3" min="1" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">{{ $t('settings.sessionActiveDaysDesc') }}</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.silenceDuration') }}</span>
                    </label>
                    <input type="number" v-model="editForm.silenceDuration" class="input input-bordered w-full"
                        placeholder="1500" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">{{ $t('settings.silenceDurationDesc') }}</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.homePageBehavior') }}</span>
                    </label>
                    <select v-model="editForm.homePageBehavior" class="select select-bordered w-full">
                        <option value="last_active_session">{{ $t('settings.loadLastSession') }}</option>
                        <option value="default_session">{{ $t('settings.loadDefaultSession') }}</option>
                        <option value="new_session">{{ $t('settings.createNewSession') }}</option>
                    </select>
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="saveConnection">{{ $t('common.save') }}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>

    <dialog id="asr_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">{{ $t('settings.asr') }}</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.asrEngine') }}</span>
                    </label>
                    <select v-model="editForm.asrEngine" class="select select-bordered w-full">
                        <option value="fun-asr">FunASR (Aliyun Realtime)</option>
                    </select>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.apiKey') }}</span>
                    </label>
                    <input type="password" v-model="editForm.asrToken" placeholder="sk-..."
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.modelId') }}</span>
                    </label>
                    <input type="text" v-model="editForm.asrModel" :placeholder="$t('settings.asrModelPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="saveAsr">{{ $t('common.save') }}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>

    <dialog id="tts_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">{{ $t('settings.tts') }}</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.ttsEngine') }}</span>
                    </label>
                    <select v-model="editForm.ttsEngine" class="select select-bordered w-full">
                        <option value="qwen">{{ $t('settings.ttsEngineQwen') }}</option>
                        <option value="edge">{{ $t('settings.ttsEngineEdge') }}</option>
                    </select>
                </div>
                <div v-if="editForm.ttsEngine === 'qwen'">
                    <label class="label">
                        <span class="label-text">{{ $t('settings.apiKey') }}</span>
                    </label>
                    <input type="password" v-model="editForm.ttsToken" placeholder="sk-..."
                        class="input input-bordered w-full" />
                </div>
                <div v-if="editForm.ttsEngine === 'qwen'">
                    <label class="label">
                        <span class="label-text">{{ $t('settings.modelId') }}</span>
                    </label>
                    <input type="text" v-model="editForm.ttsModel" :placeholder="$t('settings.ttsModelPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="saveTts">{{ $t('common.save') }}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
    <dialog id="gotify_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">{{ $t('settings.gotify') }}</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.serverAddress') }}</span>
                    </label>
                    <input type="text" v-model="editForm.gotifyUrl" :placeholder="$t('settings.gotifyUrlPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.clientToken') }}</span>
                    </label>
                    <input type="password" v-model="editForm.gotifyToken" placeholder="Client Token (C...)"
                        class="input input-bordered w-full" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">{{ $t('settings.clientTokenDesc') }}</span>
                    </label>
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="saveGotify">{{ $t('common.save') }}</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>