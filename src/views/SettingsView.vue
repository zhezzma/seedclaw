<script setup lang="ts">
import { computed, ref } from 'vue'
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
    LanguageIcon,
    ClockIcon,
    ChatBubbleLeftRightIcon,
    LinkIcon,
    PlusIcon,
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { localServer, restartLocalServer, switchGateway } from '../composables/local-server'
import { LOCAL_GATEWAY_ID, type GatewayProfile } from '../stores/setting'

const router = useRouter()
const { t } = useI18n()
const configStore = useUiSettingsStore()
const { confirm } = useConfirm()
const toast = useToast()

/** 连接弹窗的编辑态：__new__ 表示「新增服务器」草稿；其余为已存在条目 id。 */
const NEW_GATEWAY_DRAFT = '__new__'
const editForm = ref({
    editingGatewayId: NEW_GATEWAY_DRAFT,
    name: '',
    apiBaseUrl: '',
    token: '',
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
})

const editingEntry = computed<GatewayProfile | null>(() =>
    editForm.value.editingGatewayId === NEW_GATEWAY_DRAFT
        ? null
        : configStore.gateways.find((g) => g.id === editForm.value.editingGatewayId) ?? null)
const editingIsLocal = computed(() => editingEntry.value?.type === 'local')

const cloneConfig = <T extends string>(config: EngineConfig<T>): EngineConfig<T> => ({ ...config })

const loadAsrFormForEngine = (engine: ASREngineType) => {
    editForm.value.asrEngine = engine
    editForm.value.asrConfig = cloneConfig(configStore.getAsrConfig(engine))
}

const loadTtsFormForEngine = (engine: TTSEngineType) => {
    editForm.value.ttsEngine = engine
    editForm.value.ttsConfig = cloneConfig(configStore.getTtsConfig(engine))
}

const openConnectionModal = () => {
    // 打开时聚焦当前激活条目（没有则落入新增草稿）
    const active = configStore.activeGateway
    if (active) {
        selectGatewayForEdit(active.id)
    } else {
        startNewGatewayDraft()
    }
    const modal = document.getElementById('basic_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

/** 选中某条目进入编辑（local 条目地址/token 只读，由 local-server 托管）。 */
const selectGatewayForEdit = (id: string) => {
    const entry = configStore.gateways.find((g) => g.id === id)
    if (!entry) return
    editForm.value.editingGatewayId = id
    editForm.value.name = entry.name
    editForm.value.apiBaseUrl = entry.apiBaseUrl
    editForm.value.token = entry.token
}

const startNewGatewayDraft = () => {
    editForm.value.editingGatewayId = NEW_GATEWAY_DRAFT
    editForm.value.name = ''
    editForm.value.apiBaseUrl = ''
    editForm.value.token = ''
}

/**
 * 保存并连接：
 * - 新增草稿：创建条目并激活（switchGateway 负责同步生效值 + reload）
 * - 已存在条目：先把编辑写回条目，再激活并连接
 * local 条目不走这里（地址/令牌托管，弹窗内只读）
 */
const saveConnection = () => {
    const url = editForm.value.apiBaseUrl.trim()
    if (editForm.value.editingGatewayId === NEW_GATEWAY_DRAFT) {
        if (!url) return
        const entry = configStore.addGateway({
            type: 'remote',
            name: editForm.value.name.trim(),
            apiBaseUrl: url,
            token: editForm.value.token,
        })
        switchGateway(entry.id)
        return
    }
    const id = editForm.value.editingGatewayId
    const entry = configStore.gateways.find((g) => g.id === id)
    if (!entry || entry.type === 'local' || !url) return
    configStore.updateGateway(id, {
        name: editForm.value.name.trim(),
        apiBaseUrl: url,
        token: editForm.value.token,
    })
    switchGateway(id)
}

/** 列表行点击 = 切换激活账号（守卫与侧栏菜单一致，通过则保存并 reload）。 */
const activateGateway = (entry: GatewayProfile) => {
    if (entry.id === configStore.activeGatewayId) return
    if (entry.type === 'local') {
        if (localServer.state === 'failed' || !localServer.url || !localServer.token) {
            toast.warning(t('sidebar.localServerNotReady'))
            return
        }
    } else if (!entry.apiBaseUrl.trim()) {
        toast.warning(t('sidebar.remoteNotConfigured'))
        return
    }
    switchGateway(entry.id)
}

const removeGatewayEntry = async (entry: GatewayProfile) => {
    const ok = await confirm(
        t('settings.removeGatewayConfirm', { name: entry.name }),
        t('settings.removeGateway'),
    )
    if (!ok) return
    configStore.removeGateway(entry.id)
    // 删的是编辑中的条目：编辑态切到新的激活条目（或新增草稿）
    if (editForm.value.editingGatewayId === entry.id) {
        const active = configStore.activeGateway
        if (active) selectGatewayForEdit(active.id)
        else startNewGatewayDraft()
    }
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

const localStateText = () => {
    switch (localServer.state) {
        case 'running': return `${t('settings.localServerRunning')} · ${localServer.url ?? ''}`
        case 'starting': return t('settings.localServerStarting')
        case 'restarting': return t('settings.localServerRestarting')
        case 'failed': return `${t('settings.localServerFailed')}${localServer.lastError ? `：${localServer.lastError}` : ''}`
        default: return t('settings.localServerUnavailable')
    }
}

const onRestartServer = () => { restartLocalServer() }

const onCopyLogPath = () => {
    const dir = localServer.dataDir ? `${localServer.dataDir}\\logs` : '~/.seedagent/logs'
    navigator.clipboard.writeText(dir)
}

const saveSilenceDuration = (event: Event) => {
    const ms = Math.max(0, Math.floor(Number((event.target as HTMLInputElement).value) || 0))
    configStore.save({ silenceDuration: ms })
}

const saveBusySendBehavior = (event: Event) => {
    configStore.save({
        busySendBehavior: (event.target as HTMLSelectElement).value as BusySendBehavior,
    })
}

const saveExternalUrl = (event: Event) => {
    configStore.save({ externalUrl: (event.target as HTMLInputElement).value.trim() })
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
                                        <span class="font-medium">{{ $t('settings.gatewaySettings') }}</span>
                                        <p class="text-xs text-base-content/50 truncate max-w-48">{{
                                            configStore.apiBaseUrl
                                        }}</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>

                            <li class="flex items-center justify-between gap-4 p-4">
                                <div class="flex items-center gap-3">
                                    <ChatBubbleLeftRightIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.busySendBehavior') }}</span>
                                        <p class="text-xs text-base-content/50">{{
                                            $t('settings.busySendBehaviorDesc') }}</p>
                                    </div>
                                </div>
                                <select class="select select-bordered select-sm max-w-44"
                                    :value="configStore.busySendBehavior" @change="saveBusySendBehavior">
                                    <option value="steer">{{ $t('settings.busySendBehaviorSteer') }}</option>
                                    <option value="follow">{{ $t('settings.busySendBehaviorFollow') }}</option>
                                </select>
                            </li>

                            <li class="flex items-center justify-between gap-4 p-4">
                                <div class="flex items-center gap-3">
                                    <LinkIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.externalUrl') }}</span>
                                        <p class="text-xs text-base-content/50">{{ $t('settings.externalUrlDesc') }}</p>
                                    </div>
                                </div>
                                <input type="text" class="input input-bordered input-sm w-40"
                                    :value="configStore.externalUrl" :placeholder="$t('settings.externalUrlPlaceholder')"
                                    @change="saveExternalUrl" />
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

                            <li class="flex items-center justify-between gap-4 p-4">
                                <div class="flex items-center gap-3">
                                    <ClockIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">{{ $t('settings.silenceDuration') }}</span>
                                        <p class="text-xs text-base-content/50">{{
                                            $t('settings.silenceDurationDesc') }}</p>
                                    </div>
                                </div>
                                <input type="number" class="input input-bordered input-sm w-28"
                                    :value="configStore.silenceDuration" @change="saveSilenceDuration" />
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

                            <li>
                                <a href="https://github.com/zhezzma/seedclaw" target="_blank" rel="noopener noreferrer"
                                    class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                    <div class="flex items-center gap-3">
                                        <QuestionMarkCircleIcon class="h-5 w-5 text-base-content/60" />
                                        <span class="font-medium">{{ $t('settings.usageHelp') }}</span>
                                    </div>
                                    <ArrowTopRightOnSquareIcon class="h-5 w-5 text-base-content/40" />
                                </a>
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
            <h3 class="font-bold text-lg mb-4">{{ $t('settings.gatewaySettings') }}</h3>

            <!-- 服务器账号列表：单选即激活（切换会重载），local 托管条目置顶且不可删除 -->
            <ul class="space-y-1 mb-3">
                <li v-for="entry in configStore.gateways" :key="entry.id"
                    class="flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors"
                    :class="entry.id === configStore.activeGatewayId ? 'border-primary/40 bg-primary/10' : 'border-base-300'">
                    <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                        :title="$t('gateway.switchAccount')" @click="activateGateway(entry)">
                        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            :class="entry.type === 'local' ? 'bg-primary/15 text-primary' : 'bg-base-300 text-base-content/70'">
                            {{ Array.from(entry.name)[0]?.toUpperCase() ?? '?' }}
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-semibold">{{ entry.name }}</span>
                            <span class="block truncate text-xs text-base-content/50">{{ entry.type === 'local' ? $t('gateway.localManaged') : entry.apiBaseUrl }}</span>
                        </span>
                        <span v-if="entry.id === configStore.activeGatewayId" class="badge badge-primary badge-sm shrink-0">{{ $t('gateway.current') }}</span>
                    </button>
                    <button type="button" class="btn btn-ghost btn-xs shrink-0" @click="selectGatewayForEdit(entry.id)">
                        {{ $t('common.edit') }}
                    </button>
                    <button v-if="entry.type === 'remote'" type="button" class="btn btn-ghost btn-xs shrink-0 text-error"
                        @click="removeGatewayEntry(entry)">
                        {{ $t('common.delete') }}
                    </button>
                </li>
            </ul>
            <button type="button" class="btn btn-outline btn-sm btn-block gap-2 mb-4" @click="startNewGatewayDraft">
                <PlusIcon class="h-4 w-4" />
                {{ $t('gateway.addServer') }}
            </button>

            <div class="divider my-0 mb-4">{{ editingIsLocal ? $t('settings.gatewayModeLocal') : (editForm.editingGatewayId === '__new__' ? $t('gateway.addServer') : $t('common.edit')) }}</div>

            <div class="form-control w-full space-y-4">
                <!-- local 托管条目：地址/令牌只读，展示服务端状态与重启入口 -->
                <template v-if="editingIsLocal">
                    <div class="text-sm space-y-2">
                        <p class="text-base-content/70">
                            {{ localStateText() }}
                            <span v-if="localServer.bundled" class="block text-xs text-base-content/50 mt-1">
                                {{ $t('settings.localServerManagedHint') }}
                            </span>
                        </p>
                        <p class="text-xs text-base-content/50 flex items-center gap-2">
                            <span>{{ $t('settings.localServerLogHint') }}: {{ localServer.dataDir ? localServer.dataDir + '\\logs' : '~/.seedagent/logs' }}</span>
                            <button class="btn btn-ghost btn-xs" @click="onCopyLogPath">{{ $t('settings.copyLogPath') }}</button>
                        </p>
                        <button v-if="localServer.state === 'failed' || localServer.state === 'running'"
                            class="btn btn-outline btn-sm" @click="onRestartServer">
                            {{ $t('settings.restartServer') }}
                        </button>
                    </div>
                </template>
                <!-- remote 条目/新增草稿：名称 + 地址 + 令牌 -->
                <template v-else>
                    <div>
                        <label class="label">
                            <span class="label-text">{{ $t('gateway.serverName') }}</span>
                        </label>
                        <input type="text" v-model="editForm.name" :placeholder="$t('gateway.serverNamePlaceholder')"
                            class="input input-bordered w-full" />
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
                </template>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">{{ $t('common.cancel') }}</button>
                    <button v-if="!editingIsLocal" class="btn btn-primary" @click="saveConnection">{{ $t('gateway.saveAndConnect') }}</button>
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
</template>
