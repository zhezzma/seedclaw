<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
    type ASREngineType,
    type TTSEngineType,
    type EngineConfig,
    type BusySendBehavior,
    useUiSettingsStore,
} from '../stores/setting'
import {
    ChevronRightIcon,
    ServerIcon,
    SunIcon,
    MoonIcon,
    QuestionMarkCircleIcon,
    ArrowRightOnRectangleIcon,
    MicrophoneIcon,
    SpeakerWaveIcon,
    DocumentTextIcon,
    ArrowTopRightOnSquareIcon,
    BellIcon,
    LanguageIcon,
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { useConfirm } from '../composables/useConfirm'

const router = useRouter()
const { t } = useI18n()
const configStore = useUiSettingsStore()
const { confirm } = useConfirm()

const editForm = ref({
    apiBaseUrl: '',
    token: '',
    sessionsActiveDays: 3,
    silenceDuration: 1500,
    asrEngine: 'fun-asr' as ASREngineType,
    ttsEngine: 'edge' as TTSEngineType,
    asrConfig: {
        engine: 'fun-asr' as ASREngineType,
        baseUrl: '',
        token: '',
        model: '',
    },
    ttsConfig: {
        engine: 'edge' as TTSEngineType,
        baseUrl: '',
        token: '',
        model: '',
    },
    homePageBehavior: 'new_session' as 'last_active_session' | 'new_session',
    busySendBehavior: 'follow' as BusySendBehavior,
    externalUrl: '',
    gotifyUrl: '',
    gotifyToken: '',
})

const cloneConfig = <T extends string>(config: EngineConfig<T>): EngineConfig<T> => ({ ...config })

const loadAsrFormForEngine = (engine: ASREngineType) => {
    editForm.value.asrEngine = engine
    editForm.value.asrConfig = cloneConfig(configStore.getAsrConfig(engine))
}

const loadTtsFormForEngine = (engine: TTSEngineType) => {
    editForm.value.ttsEngine = engine
    editForm.value.ttsConfig = cloneConfig(configStore.getTtsConfig(engine))
}

const openGotifyModal = () => {
    editForm.value = {
        ...editForm.value,
        gotifyUrl: configStore.gotifyUrl,
        gotifyToken: configStore.gotifyToken,
    }
    const modal = document.getElementById('gotify_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const saveGotify = () => {
    configStore.save({
        gotifyUrl: editForm.value.gotifyUrl,
        gotifyToken: editForm.value.gotifyToken,
    })
}

const openConnectionModal = () => {
    editForm.value = {
        ...editForm.value,
        apiBaseUrl: configStore.apiBaseUrl,
        token: configStore.token,
        sessionsActiveDays: configStore.sessionsActiveDays,
        silenceDuration: configStore.silenceDuration,
        homePageBehavior: configStore.homePageBehavior || 'last_active_session',
        busySendBehavior: configStore.busySendBehavior || 'follow',
        externalUrl: configStore.externalUrl || '',
    }
    const modal = document.getElementById('basic_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const openAsrModal = () => {
    loadAsrFormForEngine(configStore.asrEngine || 'fun-asr')
    const modal = document.getElementById('asr_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const openTtsModal = () => {
    loadTtsFormForEngine(configStore.ttsEngine || 'edge')
    const modal = document.getElementById('tts_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const onAsrEngineChange = (event: Event) => {
    loadAsrFormForEngine((event.target as HTMLSelectElement).value as ASREngineType)
}

const onTtsEngineChange = (event: Event) => {
    loadTtsFormForEngine((event.target as HTMLSelectElement).value as TTSEngineType)
}

const saveConnection = () => {
    configStore.save({
        apiBaseUrl: editForm.value.apiBaseUrl,
        token: editForm.value.token,
        sessionsActiveDays: Number(editForm.value.sessionsActiveDays),
        silenceDuration: Number(editForm.value.silenceDuration),
        busySendBehavior: editForm.value.busySendBehavior,
        externalUrl: editForm.value.externalUrl,
    })
    if (window.location.protocol !== 'file:') {
        window.location.reload()
    }
}

const saveAsr = () => {
    configStore.save({
        asrEngine: editForm.value.asrEngine,
    })
    configStore.saveAsrEngineConfig(editForm.value.asrEngine, {
        baseUrl: editForm.value.asrConfig.baseUrl,
        token: editForm.value.asrConfig.token,
        model: editForm.value.asrConfig.model,
    })
}

const saveTts = () => {
    configStore.save({
        ttsEngine: editForm.value.ttsEngine,
    })
    configStore.saveTtsEngineConfig(editForm.value.ttsEngine, {
        baseUrl: editForm.value.ttsConfig.baseUrl,
        token: editForm.value.ttsConfig.token,
        model: editForm.value.ttsConfig.model,
    })
}

const openHelpDocs = () => {
    window.open('https://github.com/zhezzma/seedclaw', '_blank')
}

const navigateToLogs = () => {
    router.push('/logs')
}

const getAsrEngineLabel = (engine?: string) => {
    switch (engine) {
        case 'fun-asr':
            return t('settings.asrEngineFunAsr')
        case 'voice-gateway':
            return t('settings.asrEngineVoiceGateway')
        default:
            return t('settings.notConfigured')
    }
}

const getTtsEngineLabel = (engine?: string) => {
    switch (engine) {
        case 'qwen':
            return t('settings.ttsEngineQwen')
        case 'edge':
            return t('settings.ttsEngineEdge')
        case 'voice-gateway':
            return t('settings.ttsEngineVoiceGateway')
        default:
            return t('settings.notConfigured')
    }
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
        <ViewHeader :title="$t('settings.title')" :is-main-page="true">
        </ViewHeader>

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
                                            configStore.apiBaseUrl
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

                            <li class="flex items-center justify-between p-4">
                                <div class="flex items-center gap-3">
                                    <LanguageIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium ">{{ $t('settings.language') }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <select class="select select-bordered select-sm" :value="configStore.language"
                                        @change="(e: Event) => configStore.setLanguage((e.target as HTMLSelectElement).value as 'zh' | 'en')">
                                        <option value="zh">中文</option>
                                        <option value="en">English</option>
                                    </select>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

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
                                        <p class="text-xs text-base-content/50">{{ getAsrEngineLabel(configStore.asrEngine) }}
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
                                        <p class="text-xs text-base-content/50">{{ getTtsEngineLabel(configStore.ttsEngine) }}</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">{{ $t('settings.helpFeedback') }}</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
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

                <div class="pt-4">
                    <button @click="logout" class="btn btn-outline btn-error btn-block gap-2">
                        <ArrowRightOnRectangleIcon class="h-5 w-5" />
                        {{ $t('settings.clearData') }}
                    </button>
                </div>

                <div class="text-center py-4">
                    <p class="text-xs text-base-content/40">Seedclaw v0.1.0</p>
                </div>
            </div>
        </div>
    </div>

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
                    <input type="text" v-model="editForm.apiBaseUrl" :placeholder="$t('settings.gatewayUrlPlaceholder')"
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
                        <span class="label-text">{{ $t('settings.busySendBehavior') }}</span>
                    </label>
                    <select v-model="editForm.busySendBehavior" class="select select-bordered w-full">
                        <option value="steer">{{ $t('settings.busySendBehaviorSteer') }}</option>
                        <option value="follow">{{ $t('settings.busySendBehaviorFollow') }}</option>
                    </select>
                    <label class="label">
                        <span class="label-text-alt opacity-50">{{ $t('settings.busySendBehaviorDesc') }}</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.externalUrl') }}</span>
                    </label>
                    <input type="text" v-model="editForm.externalUrl"
                        :placeholder="$t('settings.externalUrlPlaceholder')" class="input input-bordered w-full" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">{{ $t('settings.externalUrlDesc') }}</span>
                    </label>
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
                    <select v-model="editForm.asrEngine" class="select select-bordered w-full" @change="onAsrEngineChange">
                        <option value="fun-asr">{{ $t('settings.asrEngineFunAsr') }}</option>
                        <option value="voice-gateway">{{ $t('settings.asrEngineVoiceGateway') }}</option>
                    </select>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.baseUrl') }}</span>
                    </label>
                    <input type="text" v-model="editForm.asrConfig.baseUrl"
                        :placeholder="$t('settings.baseUrlPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.engineToken') }}</span>
                    </label>
                    <input type="password" v-model="editForm.asrConfig.token"
                        :placeholder="$t('settings.engineTokenPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.modelId') }}</span>
                    </label>
                    <input type="text" v-model="editForm.asrConfig.model" :placeholder="$t('settings.asrModelPlaceholder')"
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
                    <select v-model="editForm.ttsEngine" class="select select-bordered w-full" @change="onTtsEngineChange">
                        <option value="qwen">{{ $t('settings.ttsEngineQwen') }}</option>
                        <option value="edge">{{ $t('settings.ttsEngineEdge') }}</option>
                        <option value="voice-gateway">{{ $t('settings.ttsEngineVoiceGateway') }}</option>
                    </select>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.baseUrl') }}</span>
                    </label>
                    <input type="text" v-model="editForm.ttsConfig.baseUrl"
                        :placeholder="$t('settings.baseUrlPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.engineToken') }}</span>
                    </label>
                    <input type="password" v-model="editForm.ttsConfig.token"
                        :placeholder="$t('settings.engineTokenPlaceholder')"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">{{ $t('settings.modelId') }}</span>
                    </label>
                    <input type="text" v-model="editForm.ttsConfig.model" :placeholder="$t('settings.ttsModelPlaceholder')"
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
