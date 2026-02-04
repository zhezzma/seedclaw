<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUiSettingsStore } from '../stores/setting'
import {
    XMarkIcon,
    ChevronRightIcon,
    ServerIcon,
    SunIcon,
    MoonIcon,
    QuestionMarkCircleIcon,
    ChatBubbleLeftEllipsisIcon,
    ArrowRightOnRectangleIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()
const configStore = useUiSettingsStore()

const editForm = ref({
    gatewayUrl: '',
    token: '',
    sessionsActiveDays: 3,
    asrToken: '',
    ttsEngine: 'qwen' as 'qwen' | 'edge',
    ttsToken: ''
})

const openConnectionModal = () => {
    editForm.value = {
        gatewayUrl: configStore.gatewayUrl,
        token: configStore.token,
        sessionsActiveDays: configStore.sessionsActiveDays,
        asrToken: configStore.asrToken,
        ttsEngine: configStore.ttsEngine,
        ttsToken: configStore.ttsToken
    }
    const modal = document.getElementById('basic_settings_modal') as HTMLDialogElement
    if (modal) modal.showModal()
}

const saveConnection = () => {
    configStore.save({
        gatewayUrl: editForm.value.gatewayUrl,
        token: editForm.value.token,
        sessionsActiveDays: Number(editForm.value.sessionsActiveDays),
        asrToken: editForm.value.asrToken,
        ttsEngine: editForm.value.ttsEngine,
        ttsToken: editForm.value.ttsToken
    })
    // Force reload to apply changes if needed, or just let store reactivity handle it
    // For gateway URL changes, we might want to reconnect
    if (window.location.protocol !== 'file:') {
        window.location.reload()
    }
}

const goBack = () => {
    router.back()
}

const logout = () => {
    configStore.clear()
    router.push('/setup')
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header - fixed -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <span class="text-lg font-semibold px-4">设置</span>
            </div>
            <!-- Close button - PC only -->
            <!-- <div class="flex-none hidden lg:flex"> -->
            <div class="flex-none  lg:flex">
                <button @click="goBack" class="btn btn-ghost btn-circle">
                    <XMarkIcon class="h-5 w-5" />
                </button>
            </div>
        </div>

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
                        </ul>
                    </div>
                </div>

                <!-- General Settings -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">通用设置</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
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

                        </ul>
                    </div>
                </div>

                <!-- Help & Feedback -->
                <div class="space-y-2">
                    <h4 class="text-sm font-medium text-base-content/60 px-2">帮助与反馈</h4>
                    <div class="card bg-base-100 shadow-sm">
                        <ul class="divide-y divide-base-300">
                            <li
                                class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                <div class="flex items-center gap-3">
                                    <QuestionMarkCircleIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium">使用帮助</span>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
                            </li>
                            <li
                                class="flex items-center justify-between p-4 cursor-pointer hover:bg-base-200 transition-colors">
                                <div class="flex items-center gap-3">
                                    <ChatBubbleLeftEllipsisIcon class="h-5 w-5 text-base-content/60" />
                                    <span class="font-medium">意见反馈</span>
                                </div>
                                <ChevronRightIcon class="h-5 w-5 text-base-content/40" />
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

    <!-- Basic Settings Modal -->
    <dialog id="basic_settings_modal" class="modal">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">基本设置</h3>
            <div class="form-control w-full space-y-4">
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
                    <input type="number" v-model="editForm.sessionsActiveDays" class="input input-bordered w-full" />
                    <label class="label">
                        <span class="label-text-alt">超过此天数的会话将不会被读取</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">ASR API Key</span>
                    </label>
                    <input type="password" v-model="editForm.asrToken" placeholder="sk-..."
                        class="input input-bordered w-full" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">留空则使用默认配置</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">TTS API Key (Qwen)</span>
                    </label>
                    <input type="password" v-model="editForm.ttsToken" placeholder="sk-..."
                        class="input input-bordered w-full" />
                    <label class="label">
                        <span class="label-text-alt opacity-50">留空则尝试使用 ASR Token</span>
                    </label>
                </div>
                <div>
                    <label class="label">
                        <span class="label-text">TTS 引擎</span>
                    </label>
                    <select v-model="editForm.ttsEngine" class="select select-bordered w-full">
                        <option value="qwen">Qwen TTS (实时PCM/低延迟)</option>
                        <option value="edge">Edge TTS (流式MSE/免费)</option>
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
</template>
