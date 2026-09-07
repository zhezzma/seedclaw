<script setup lang="ts">
/**
 * tunnel 面板：移动端访问（两种模式）+ 手机扫码引导。
 * 端点契约：POST /api/extensions/:extensionId/start | stop、GET /state。
 *
 * - mode=lan（局域网直连）：无隧道，展示本机局域网地址二维码（手机与 PC 同网络）
 * - mode=tunnel（远程隧道）：「连接」一键完成 VPS 幂等预热 + 建立隧道
 *  （管理凭据来自扩展设置；VPS 侧配置在连接时自动确保，无需单独初始化）
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { apiGet, apiPost } from '../../../composables/api-client'
import { useUiSettingsStore } from '../../../stores/setting'

interface TunnelState {
    status: 'idle' | 'connecting' | 'ready' | 'failed'
    url: string | null
    error: string | null
    lastReadyAt: number | null
    pendingReconnect: number
    configured: boolean
    /** 公网可达性探测：true 可达 / false 不可达 / null 未探测 */
    urlVerified: boolean | null
    mode: 'tunnel' | 'lan'
    serverPort: number
    lanIps: string[]
}

const props = defineProps<{
    extensionId: string
}>()

const { t } = useI18n()
const settings = useUiSettingsStore()

const state = ref<TunnelState | null>(null)
const starting = ref(false)
const stopping = ref(false)
/** 多网卡时选中的局域网 IP */
const selectedLanIp = ref('')

const qrDataUrl = ref('')

const POLL_INTERVAL_MS = 3000
let pollTimer: ReturnType<typeof globalThis.setTimeout> | null = null

const isLanMode = computed(() => state.value?.mode === 'lan')

const statusKey = computed(() => {
    if (isLanMode.value) return 'extensions.tunnel.lanReady'
    if (starting.value) return 'extensions.tunnel.starting'
    if (stopping.value) return 'extensions.tunnel.stopping'
    switch (state.value?.status) {
        case 'ready': return 'extensions.tunnel.ready'
        case 'connecting': return 'extensions.tunnel.connecting'
        case 'failed': return 'extensions.tunnel.failed'
        default: return 'extensions.tunnel.idle'
    }
})

/** 二维码/分享链接目标：局域网用本机 IP，隧道用 VPS 地址 */
const shareUrl = computed(() => {
    const token = settings.token?.trim()
    if (!token) return null
    if (isLanMode.value) {
        const ip = selectedLanIp.value || state.value?.lanIps?.[0]
        if (!ip || !state.value?.serverPort) return null
        return `http://${ip}:${state.value.serverPort}/#token=${encodeURIComponent(token)}`
    }
    const url = state.value?.url
    if (!url) return null
    return `${url}/#token=${encodeURIComponent(token)}`
})

/** App 远程模式要填的裸地址（无 hash） */
const appConnectUrl = computed(() => {
    if (isLanMode.value) {
        const ip = selectedLanIp.value || state.value?.lanIps?.[0]
        return ip && state.value?.serverPort ? `http://${ip}:${state.value.serverPort}` : ''
    }
    return state.value?.url ?? ''
})

const tokenMissing = computed(() => !settings.token?.trim())

async function refreshState(silent = true) {
    try {
        const next = await apiGet<TunnelState>(`/api/extensions/${encodeURIComponent(props.extensionId)}/state`, silent)
        state.value = next
        if (next.lanIps?.length && !next.lanIps.includes(selectedLanIp.value)) {
            selectedLanIp.value = next.lanIps[0]
        }
    } catch {
        // 面板打开期间服务端暂不可达：保留上一次状态，下一轮轮询重试
    }
}

/** 一键连接：服务端自动完成 VPS 幂等预热（已就绪则秒过）+ 建立隧道 */
async function start() {
    if (starting.value) return
    starting.value = true
    try {
        state.value = await apiPost<TunnelState>(`/api/extensions/${encodeURIComponent(props.extensionId)}/start`)
    } catch {
        // 502（凭据缺失/预热失败）等错误提示由 api-client 统一 toast
    } finally {
        starting.value = false
    }
}

/** 断开：SSH 连接关闭，VPS 侧 18799 监听随之自动释放（SSH 协议行为） */
async function stop() {
    if (stopping.value) return
    stopping.value = true
    try {
        state.value = await apiPost<TunnelState>(`/api/extensions/${encodeURIComponent(props.extensionId)}/stop`)
    } catch {
        // ignore（toast 已弹出）
    } finally {
        stopping.value = false
    }
}

async function copyUrl() {
    if (!shareUrl.value) return
    try {
        await navigator.clipboard.writeText(shareUrl.value)
    } catch {
        // 剪贴板权限失败时退化选中文本，由用户手动复制
        const el = document.getElementById('tunnel-share-url')
        if (el) globalThis.getSelection()?.selectAllChildren(el)
    }
}

function schedulePoll() {
    pollTimer = globalThis.setTimeout(async () => {
        await refreshState()
        if (pollTimer !== null) schedulePoll()
    }, POLL_INTERVAL_MS)
}

onMounted(() => {
    void refreshState(false)
    schedulePoll()
})

onUnmounted(() => {
    if (pollTimer !== null) {
        globalThis.clearTimeout(pollTimer)
        pollTimer = null
    }
})

async function renderQr(text: string) {
    qrDataUrl.value = await QRCode.toDataURL(text, { margin: 1, width: 320 })
}

// shareUrl 变化（模式切换 / ready / token 就绪）时重渲染二维码
watch(shareUrl, (url) => {
    if (url) {
        renderQr(url).catch((e) => console.error('[tunnel] qr render failed', e))
    } else {
        qrDataUrl.value = ''
    }
}, { immediate: true })
</script>

<template>
    <div class="text-center">
        <!-- ── 局域网直连模式 ─────────────────────────────── -->
        <div v-if="isLanMode">
            <p class="text-sm text-base-content/60 mb-4">{{ t('extensions.tunnel.lanReady') }}</p>

            <template v-if="state?.lanIps?.length && !tokenMissing">
                <!-- 多网卡：IP 切换 -->
                <div v-if="state.lanIps.length > 1" class="flex flex-wrap justify-center gap-1.5 mb-4">
                    <button v-for="ip in state.lanIps" :key="ip" class="btn btn-xs"
                        :class="ip === selectedLanIp ? 'btn-primary' : 'btn-outline'"
                        @click="selectedLanIp = ip">{{ ip }}</button>
                </div>

                <div class="flex justify-center mb-4">
                    <img :src="qrDataUrl" :alt="t('extensions.tunnel.qrAlt')"
                        class="w-64 h-64 rounded-2xl border border-base-300 bg-white object-contain p-3" />
                </div>
                <p id="tunnel-share-url" class="text-xs text-base-content/60 mb-3 break-all select-all">{{ shareUrl }}</p>
                <button class="btn btn-outline btn-sm mb-2" @click="copyUrl">{{ t('extensions.tunnel.copyUrl') }}</button>
                <p class="text-xs text-base-content/40">{{ t('extensions.tunnel.hint') }}</p>
            </template>

            <div v-else-if="!state?.lanIps?.length" class="text-sm text-warning mb-4">
                {{ t('extensions.tunnel.lanNoIp') }}
            </div>
            <div v-else-if="tokenMissing" class="text-sm text-warning mb-4">
                {{ t('extensions.tunnel.tokenMissing') }}
            </div>

            <!-- App 连接信息 -->
            <div v-if="appConnectUrl" class="mt-4 pt-3 border-t border-base-200 text-left">
                <p class="text-xs font-medium mb-2 text-base-content/70">{{ t('extensions.tunnel.appConnectTitle') }}</p>
                <div class="text-xs font-mono space-y-1">
                    <p class="break-all">URL：<span class="select-all text-primary">{{ appConnectUrl }}</span></p>
                    <p class="break-all">{{ t('extensions.tunnel.tokenLabel') }}：<span class="select-all text-primary">{{ settings.token }}</span></p>
                </div>
                <p class="text-[10px] text-base-content/40 mt-2">{{ t('extensions.tunnel.appConnectHint') }}</p>
            </div>

            <p class="text-xs text-base-content/40 mt-4">{{ t('extensions.tunnel.lanSwitchHint') }}</p>
            <p class="text-[10px] text-base-content/30 mt-1">{{ t('extensions.tunnel.lanFirewallHint') }}</p>
        </div>

        <!-- ── 远程隧道模式 ──────────────────────────────── -->
        <template v-else>
            <p class="text-sm text-base-content/60 mb-4">{{ t(statusKey) }}</p>

            <div v-if="state?.status === 'failed' && state.error" class="alert alert-error text-xs mb-4 break-words">
                {{ state.error }}
            </div>

            <!-- 公网探测失败警告（安全组未放行或 GatewayPorts 未生效）-->
            <div v-if="state?.status === 'ready' && state.urlVerified === false"
                class="alert alert-warning text-xs mb-4 text-left whitespace-pre-line">{{ t('extensions.tunnel.verifyFailed') }}</div>

            <!-- 二维码（Ready 且 token 可用） -->
            <template v-if="state?.status === 'ready' && shareUrl">
                <div class="flex justify-center mb-4">
                    <img :src="qrDataUrl" :alt="t('extensions.tunnel.qrAlt')"
                        class="w-64 h-64 rounded-2xl border border-base-300 bg-white object-contain p-3" />
                </div>
                <p id="tunnel-share-url" class="text-xs text-base-content/60 mb-3 break-all select-all">{{ shareUrl }}</p>
                <button class="btn btn-outline btn-sm mb-2" @click="copyUrl">{{ t('extensions.tunnel.copyUrl') }}</button>
                <p class="text-xs text-base-content/40">{{ t('extensions.tunnel.hint') }}</p>

                <!-- App 远程模式连接信息（手动填入手机 App 设置） -->
                <div class="mt-4 pt-3 border-t border-base-200 text-left">
                    <p class="text-xs font-medium mb-2 text-base-content/70">{{ t('extensions.tunnel.appConnectTitle') }}</p>
                    <div class="text-xs font-mono space-y-1">
                        <p class="break-all">URL：<span class="select-all text-primary">{{ appConnectUrl }}</span></p>
                        <p class="break-all">{{ t('extensions.tunnel.tokenLabel') }}：<span class="select-all text-primary">{{ settings.token }}</span></p>
                    </div>
                    <p class="text-[10px] text-base-content/40 mt-2">{{ t('extensions.tunnel.appConnectHint') }}</p>
                </div>
            </template>

            <!-- Ready 但 token 缺失：提示 -->
            <div v-else-if="state?.status === 'ready' && tokenMissing" class="text-sm text-warning mb-4">
                {{ t('extensions.tunnel.tokenMissing') }}
            </div>

            <!-- 连接中动画 -->
            <div v-else-if="state?.status === 'connecting' || starting" class="py-8">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <p v-if="state?.status === 'failed' && state.pendingReconnect > 0" class="text-xs text-base-content/40 mt-2">
                {{ t('extensions.tunnel.reconnecting', { n: state.pendingReconnect }) }}
            </p>

            <div class="modal-action justify-center mt-6">
                <button v-if="!state || state.status === 'idle' || state.status === 'failed'"
                    class="btn btn-primary btn-sm" :disabled="starting" @click="start">
                    <span v-if="starting" class="loading loading-spinner loading-xs"></span>
                    {{ t('extensions.tunnel.start') }}
                </button>
                <button v-else class="btn btn-ghost btn-sm" :disabled="stopping" @click="stop">
                    <span v-if="stopping" class="loading loading-spinner loading-xs"></span>
                    {{ t('extensions.tunnel.stop') }}
                </button>
            </div>

            <p class="text-[10px] text-base-content/30 mt-2">{{ t('extensions.tunnel.startHint') }}</p>
        </template>
    </div>
</template>
