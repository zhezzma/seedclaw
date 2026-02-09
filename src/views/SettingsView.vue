<script setup lang="ts">
import { ref } from 'vue'
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
    ViewColumnsIcon
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'

import { useConfirm } from '../composables/useConfirm'

const router = useRouter()
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
    homePageBehavior: 'last_active_session' as 'last_active_session' | 'new_session' | 'default_session'
})

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
    if (await confirm('确定要清空所有数据并退出吗？这将清除本地缓存。', '确认退出')) {
        configStore.clear()
        router.push('/setup')
    }
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header - fixed -->
        <ViewHeader title="设置" :is-main-page="true">
        </ViewHeader>

        <!-- Content - scrollable -->
        <div class="flex-1 overflow-y-auto ">
            <div class="max-w-2xl mx-auto p-4 space-y-6">


                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">基本设置</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="openConnectionModal">
                                <div class="flex items-center gap-3">
                                    <ServerIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">基本设置</span>
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
                                    <span class="font-medium">主题设置</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="text-sm text-base-content/60">{{ configStore.isDark ? '深色' : '浅色'
                                        }}</span>
                                    <input type="checkbox" class="toggle toggle-primary" :checked="configStore.isDark"
                                        @change="configStore.toggleTheme()" />
                                </div>
                            </li>



                            <li class="flex items-center justify-between p-4 lg:hidden">
                                <div class="flex items-center gap-3">
                                    <ViewColumnsIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium">显示底部导航</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <input type="checkbox" class="toggle toggle-primary"
                                        v-model="configStore.showBottomNav" @change="configStore.persist()" />
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Voice Settings -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">语音设置</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors"
                                @click="openAsrModal">
                                <div class="flex items-center gap-3">
                                    <MicrophoneIcon class="h-5 w-5 text-base-content/60" />
                                    <div>
                                        <span class="font-medium">语音识别 (ASR)</span>
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
                                        <span class="font-medium">语音合成 (TTS)</span>
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
                                        <span class="font-medium">配置管理</span>
                                        <p class="text-xs text-base-content/50">查看与编辑网关配置</p>
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
                                        <span class="font-medium">设备与节点</span>
                                        <p class="text-xs text-base-content/50">管理已配对的客户端设备</p>
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
                                        <span class="font-medium">系统日志</span>
                                        <p class="text-xs text-base-content/50">查看网关运行日志</p>
                                    </div>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Help & Feedback -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">帮助与反馈</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li @click="openHelpDocs"
                                class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                <div class="flex items-center gap-3">
                                    <QuestionMarkCircleIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium">使用帮助</span>
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
                        清空数据
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
            <h3 class="font-bold text-lg mb-4">基本设置</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">设备名称</span>
                    </label>
                    <input type="text" :value="configStore.deviceName" disabled
                        class="input input-bordered w-full opacity-70 cursor-not-allowed" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">设备名称在首次配置时设定，暂不支持修改</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">网关地址</span>
                    </label>
                    <input type="text" v-model="editForm.gatewayUrl" placeholder="例如: http://localhost:3000"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">访问令牌 (Token)</span>
                    </label>
                    <input type="text" v-model="editForm.token" placeholder="请输入您的 Token"
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">会话活跃天数</span>
                    </label>
                    <input type="number" v-model="editForm.sessionsActiveDays" class="input input-bordered w-full"
                        placeholder="3" min="1" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">超过此天数的会话将不会被读取</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">语音发送等待 (毫秒)</span>
                    </label>
                    <input type="number" v-model="editForm.silenceDuration" class="input input-bordered w-full"
                        placeholder="1500" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">说话停顿多少毫秒后自动发送</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">首页默认行为</span>
                    </label>
                    <select v-model="editForm.homePageBehavior" class="select select-bordered w-full">
                        <option value="last_active_session">加载上次会话</option>
                        <option value="default_session">加载默认会话</option>
                        <option value="new_session">新建会话</option>
                    </select>
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">取消</button>
                    <button class="btn btn-primary" @click="saveConnection">保存</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>

    <dialog id="asr_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">语音识别 (ASR)</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">ASR 引擎</span>
                    </label>
                    <select v-model="editForm.asrEngine" class="select select-bordered w-full">
                        <option value="fun-asr">FunASR (Aliyun Realtime)</option>
                    </select>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">API Key</span>
                    </label>
                    <input type="password" v-model="editForm.asrToken" placeholder="sk-..."
                        class="input input-bordered w-full" />
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">模型 ID</span>
                    </label>
                    <input type="text" v-model="editForm.asrModel" placeholder="默认: fun-asr-realtime-2025-11-07"
                        class="input input-bordered w-full" />
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">取消</button>
                    <button class="btn btn-primary" @click="saveAsr">保存</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>

    <dialog id="tts_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">语音合成 (TTS)</h3>
            <div class="form-control w-full space-y-4">
                <div>
                    <label class="label">
                        <span class="label-text">TTS 引擎</span>
                    </label>
                    <select v-model="editForm.ttsEngine" class="select select-bordered w-full">
                        <option value="qwen">Qwen TTS (实时PCM/低延迟)</option>
                        <option value="edge">Edge TTS (流式MSE/免费)</option>
                    </select>
                </div>
                <div v-if="editForm.ttsEngine === 'qwen'">
                    <label class="label">
                        <span class="label-text">API Key</span>
                    </label>
                    <input type="password" v-model="editForm.ttsToken" placeholder="sk-..."
                        class="input input-bordered w-full" />
                </div>
                <div v-if="editForm.ttsEngine === 'qwen'">
                    <label class="label">
                        <span class="label-text">模型 ID</span>
                    </label>
                    <input type="text" v-model="editForm.ttsModel" placeholder="默认: qwen3-tts-flash-realtime-2025-11-27"
                        class="input input-bordered w-full" />
                </div>
            </div>
            <div class="modal-action">
                <form method="dialog">
                    <button class="btn btn-ghost mr-2">取消</button>
                    <button class="btn btn-primary" @click="saveTts">保存</button>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>