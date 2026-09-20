<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CheckIcon, Cog6ToothIcon, PlusIcon, ServerStackIcon, CloudIcon, ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline'
import { useUiSettingsStore, type GatewayProfile } from '../stores/setting'
import { localServer, switchGateway, gatewaySwitchBlockReason } from '../composables/local-server'
import { useToast } from '../composables/useToast'
import { gatewayHostLabel } from '../utils/gateway-url'
import { openExternalLink } from '../utils/external-link'

defineProps<{ collapsed: boolean }>()

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const configStore = useUiSettingsStore()

const isOpen = ref(false)
const openUpward = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

// 账号菜单项：local 托管条目（仅 bundled 构建）置顶 + 用户维护的 remote 条目
const menuEntries = computed<GatewayProfile[]>(() => {
    const local = configStore.gateways.filter((g) => g.type === 'local')
    const remote = configStore.gateways.filter((g) => g.type === 'remote')
    return localServer.bundled ? [...local, ...remote] : remote
})

const activeEntry = computed(() => configStore.activeGateway)

const activeName = computed(() => activeEntry.value?.name || t('gateway.noGateway'))
const activeIsLocal = computed(() => activeEntry.value?.type === 'local')

const entryHost = (entry: GatewayProfile): string => {
    if (entry.type === 'local') {
        return localServer.url ? gatewayHostLabel(localServer.url) : t('gateway.localManaged')
    }
    return gatewayHostLabel(entry.apiBaseUrl) || entry.apiBaseUrl
}

// 头像：名称首字母 + 按名称 hash 轮换色板（同 GatewayProfile 稳定同色）
const AVATAR_COLORS = ['bg-primary text-primary-content', 'bg-secondary text-secondary-content', 'bg-accent text-accent-content', 'bg-info text-info-content', 'bg-success text-success-content', 'bg-warning text-warning-content'] as const
const avatarClass = computed(() => {
    const name = activeName.value
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
})
const avatarLetter = computed(() => Array.from(activeName.value)[0]?.toUpperCase() ?? '?')

// 底部触发区与菜单头共用同一 host 展示逻辑
const activeHost = computed(() => activeEntry.value ? entryHost(activeEntry.value) : '')

// 菜单默认向下弹出；空间不足时翻向上（与 SessionActionMenu 同策略：以下方空间
// 不足且上方更宽裕为准，避免底部 footer 菜单被视口裁剪）
const determinePlacement = () => {
    const root = rootRef.value
    const trigger = triggerRef.value
    if (!root || !trigger) return
    const content = root.querySelector<HTMLElement>('.gateway-menu')
    if (!content) return
    const triggerRect = trigger.getBoundingClientRect()
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    openUpward.value = spaceBelow < content.offsetHeight && spaceAbove >= spaceBelow
}

const openMenu = async () => {
    isOpen.value = true
    await nextTick()
    determinePlacement()
}

const closeMenu = () => {
    isOpen.value = false
}

const toggleMenu = () => {
    if (isOpen.value) closeMenu()
    else void openMenu()
}

// 点击菜单外/按 Esc 关闭（浏览器在触屏设备上合成 mousedown，监听它即可同时覆盖鼠标/触摸）
const onDocumentMouseDown = (e: MouseEvent) => {
    if (!isOpen.value) return
    const target = e.target as Node | null
    if (target && rootRef.value?.contains(target)) return
    closeMenu()
}
const onDocumentKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen.value) closeMenu()
}

watch(isOpen, (open) => {
    if (open) {
        document.addEventListener('mousedown', onDocumentMouseDown, true)
        document.addEventListener('keydown', onDocumentKeydown)
    } else {
        document.removeEventListener('mousedown', onDocumentMouseDown, true)
        document.removeEventListener('keydown', onDocumentKeydown)
    }
})

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown, true)
    document.removeEventListener('keydown', onDocumentKeydown)
})

/** 切换账号：共享守卫（local 未就绪/remote 未填地址）拦截，通过则激活并 reload。 */
const switchTo = (entry: GatewayProfile) => {
    if (entry.id === configStore.activeGatewayId) {
        closeMenu()
        return
    }
    const blocked = gatewaySwitchBlockReason(entry)
    if (blocked) {
        toast.warning(t(blocked))
        return
    }
    closeMenu()
    switchGateway(entry.id)
}

const addServer = () => {
    closeMenu()
    // 深链：设置页连接弹窗读取 query 直接落入新增草稿态（与打开时聚焦激活条目区分）
    void router.push({ path: '/settings', query: { gateway: 'new' } })
}

const openSettings = () => {
    closeMenu()
    void router.push('/settings')
}

/** 外部链接：JS 触发一次性 <a target="_blank">（utils/external-link），不用 opener 插件、
 *  不用 window.open——后者在 Tauri WebView 内不可靠。菜单项做成 button 而非 <a>：先关菜单
 *  再触发，关菜单不拦锚点导航，纯 Web 下同样是新标签页。 */
const handleExternalLink = () => {
    const url = configStore.externalUrl
    closeMenu()
    if (url) openExternalLink(url)
}
</script>

<template>
    <div ref="rootRef" class="relative shrink-0 border-t border-base-300 px-3 py-1.5">
        <!-- 触发区：当前网关头像 + 名称 + 地址（collapsed 时只留头像）；
             名称/地址与菜单头保持一致，不随视口宽度隐藏（移动端抽屉同样展示）。
             高度预算：以头像 h-8(32px) 为基准。两行文字必须压进 32px——默认行高
             text-sm(20px)+text-xs(16px)=36px 会反超头像成为高度元凶，故两行都挂
             leading-4(16px)；配按钮 p-1 与容器 py-1.5，整块含上边框约 53px
             （原约 65px）。改头像尺寸时同步改这里的两行行高，否则文字会重新撑高 -->
        <button ref="triggerRef" type="button" class="flex w-full items-center gap-2 rounded-xl p-1 text-left transition-colors hover:bg-base-300/90 cursor-pointer"
            :class="collapsed && 'lg:justify-center lg:px-0'"
            :title="activeEntry ? `${activeName} · ${activeHost}` : activeName"
            :aria-label="t('gateway.switchAccount')" :aria-expanded="isOpen" aria-haspopup="menu"
            @click.stop="toggleMenu">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" :class="avatarClass">
                {{ avatarLetter }}
            </span>
            <span v-if="!collapsed" class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold leading-4 text-base-content">{{ activeName }}</span>
                <span class="block truncate text-xs leading-4 text-base-content/50">{{ activeHost }}</span>
            </span>
            <ServerStackIcon v-if="!collapsed && activeIsLocal" class="h-4 w-4 shrink-0 text-primary" />
            <CloudIcon v-else-if="!collapsed" class="h-4 w-4 shrink-0 text-base-content/40" />
        </button>

        <!-- 账号菜单（弹出层） -->
        <!-- 自定义 hook 类名 gateway-menu：不用 daisyUI 的 dropdown-content，
             避免无 .dropdown 祖先时依赖其对 closed 态样式的实现细节 -->
        <div v-if="isOpen" class="gateway-menu absolute z-50 w-64 rounded-2xl border border-base-300 bg-base-100 p-1 shadow-lg"
            :class="openUpward ? 'bottom-full mb-1 left-3' : 'top-full mt-1 left-3'"
            @click.stop>
            <!-- 当前网关详情头 -->
            <div class="flex items-center gap-2 px-3 py-2">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" :class="avatarClass">
                    {{ avatarLetter }}
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold leading-4">{{ activeName }}</span>
                    <span class="block truncate text-xs leading-4 text-base-content/50">{{ activeHost }}</span>
                </span>
            </div>
            <div class="mx-2 my-1 border-t border-base-300"></div>

            <!-- 账号列表：当前条目 ✓，点击切换；max-h 封顶内部滚动，条目多时不溢出视口 -->
            <ul class="menu menu-compact w-full p-0 max-h-64 overflow-y-auto" role="menu">
                <li v-for="entry in menuEntries" :key="entry.id" role="none">
                    <button type="button" role="menuitem" class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                        :class="entry.id === configStore.activeGatewayId ? 'bg-base-300/60 font-semibold' : ''"
                        @click="switchTo(entry)">
                        <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            :class="entry.type === 'local' ? 'bg-primary/15 text-primary' : 'bg-base-300 text-base-content/70'">
                            {{ Array.from(entry.name)[0]?.toUpperCase() ?? '?' }}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-left">{{ entry.name }}</span>
                        <span class="shrink-0 text-xs text-base-content/40 truncate max-w-[8rem]">{{ entryHost(entry) }}</span>
                        <CheckIcon v-if="entry.id === configStore.activeGatewayId" class="h-4 w-4 shrink-0 text-primary" />
                    </button>
                </li>
            </ul>

            <div class="mx-2 my-1 border-t border-base-300"></div>

            <!-- 添加服务器 / 设置（原侧栏 Header 两按钮的归宿） -->
            <ul class="menu menu-compact w-full p-0" role="menu">
                <li role="none">
                    <button type="button" role="menuitem" class="rounded-xl px-3 py-2 text-sm" @click="addServer">
                        <PlusIcon class="h-4 w-4" />
                        {{ t('gateway.addServer') }}
                    </button>
                </li>
                <li role="none">
                    <button type="button" role="menuitem" class="rounded-xl px-3 py-2 text-sm" @click="openSettings">
                        <Cog6ToothIcon class="h-4 w-4" />
                        {{ t('gateway.settings') }}
                    </button>
                </li>
                <!-- 外部链接（原侧栏 Header 跳转按钮的归宿）：设置里配了地址才显示。
                     button + JS 触发锚点（handleExternalLink），导航本身仍是原生 <a target="_blank"> -->
                <li v-if="configStore.externalUrl" role="none">
                    <button type="button" role="menuitem" class="rounded-xl px-3 py-2 text-sm" @click="handleExternalLink">
                        <ArrowTopRightOnSquareIcon class="h-4 w-4" />
                        {{ t('gateway.externalLink') }}
                    </button>
                </li>
            </ul>
        </div>
    </div>
</template>
