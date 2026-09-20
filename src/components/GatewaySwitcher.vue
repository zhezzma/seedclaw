<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CheckIcon, Cog6ToothIcon, PlusIcon, ServerStackIcon, CloudIcon } from '@heroicons/vue/24/outline'
import { useUiSettingsStore, LOCAL_GATEWAY_ID, type GatewayProfile } from '../stores/setting'
import { localServer, switchGateway } from '../composables/local-server'
import { useToast } from '../composables/useToast'
import { gatewayHostLabel } from '../utils/gateway-url'

const props = defineProps<{ collapsed: boolean }>()

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
const activeHost = computed(() => {
    const entry = activeEntry.value
    if (!entry) return ''
    if (entry.type === 'local') {
        // local 条目：优先展示托管地址（就绪前回落固定标签）
        return localServer.url ? gatewayHostLabel(localServer.url) : t('gateway.localManaged')
    }
    return gatewayHostLabel(entry.apiBaseUrl) || entry.apiBaseUrl
})
const activeIsLocal = computed(() => activeEntry.value?.type === 'local')

// 头像：名称首字母 + 按名称 hash 轮换色板（同 GatewayProfile 稳定同色）
const AVATAR_COLORS = ['bg-primary text-primary-content', 'bg-secondary text-secondary-content', 'bg-accent text-accent-content', 'bg-info text-info-content', 'bg-success text-success-content', 'bg-warning text-warning-content'] as const
const avatarClass = computed(() => {
    const name = activeName.value
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
})
const avatarLetter = computed(() => Array.from(activeName.value)[0]?.toUpperCase() ?? '?')

const entryHost = (entry: GatewayProfile): string => {
    if (entry.type === 'local') {
        return localServer.url ? gatewayHostLabel(localServer.url) : t('gateway.localManaged')
    }
    return gatewayHostLabel(entry.apiBaseUrl) || entry.apiBaseUrl
}

// 菜单默认向下弹出；空间不足时翻向上（与 SessionActionMenu 同策略：以下方空间
// 不足且上方更宽裕为准，避免底部 footer 菜单被视口裁剪）
const determinePlacement = () => {
    const root = rootRef.value
    const trigger = triggerRef.value
    if (!root || !trigger) return
    const content = root.querySelector<HTMLElement>('.dropdown-content')
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

// 点击菜单外/按 Esc 关闭
const onDocumentPointerDown = (e: MouseEvent) => {
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
        document.addEventListener('mousedown', onDocumentPointerDown, true)
        document.addEventListener('keydown', onDocumentKeydown)
    } else {
        document.removeEventListener('mousedown', onDocumentPointerDown, true)
        document.removeEventListener('keydown', onDocumentKeydown)
    }
})

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocumentPointerDown, true)
    document.removeEventListener('keydown', onDocumentKeydown)
})

/** 切换账号：守卫不可用目标（local 服务端未就绪 / remote 条目未填地址），通过则激活并 reload。 */
const switchTo = (entry: GatewayProfile) => {
    if (entry.id === configStore.activeGatewayId) {
        closeMenu()
        return
    }
    if (entry.type === 'local') {
        // failed 时即使残留 url/token 也不放行，否则 reload 后直接落到启动失败页
        if (localServer.state === 'failed' || !localServer.url || !localServer.token) {
            toast.warning(t('sidebar.localServerNotReady'))
            return
        }
    } else if (!entry.apiBaseUrl.trim()) {
        toast.warning(t('sidebar.remoteNotConfigured'))
        return
    }
    closeMenu()
    switchGateway(entry.id)
}

const addServer = () => {
    closeMenu()
    void router.push('/settings')
}

const openSettings = () => {
    closeMenu()
    void router.push('/settings')
}
</script>

<template>
    <div ref="rootRef" class="relative shrink-0 border-t border-base-300 px-3 py-2">
        <!-- 触发区：当前网关头像 + 名称 + 地址（collapsed 时只留头像） -->
        <button ref="triggerRef" type="button" class="flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-base-300/90 cursor-pointer"
            :class="collapsed && 'lg:justify-center lg:px-0'"
            :title="activeName" :aria-label="t('gateway.switchAccount')" :aria-expanded="isOpen"
            @click.stop="toggleMenu">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" :class="avatarClass">
                {{ avatarLetter }}
            </span>
            <span v-if="!collapsed" class="min-w-0 flex-1 lg:block hidden">
                <span class="block truncate text-sm font-semibold text-base-content">{{ activeName }}</span>
                <span class="block truncate text-xs text-base-content/50">{{ activeHost }}</span>
            </span>
            <ServerStackIcon v-if="!collapsed && activeIsLocal" class="hidden lg:block h-4 w-4 shrink-0 text-primary" />
            <CloudIcon v-else-if="!collapsed" class="hidden lg:block h-4 w-4 shrink-0 text-base-content/40" />
        </button>

        <!-- 账号菜单（弹出层） -->
        <div v-if="isOpen" class="dropdown-content absolute z-50 w-64 rounded-2xl border border-base-300 bg-base-100 p-1 shadow-lg"
            :class="openUpward ? 'bottom-full mb-1 left-3' : 'top-full mt-1 left-3'"
            @click.stop>
            <!-- 当前网关详情头 -->
            <div class="flex items-center gap-2 px-3 py-2">
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" :class="avatarClass">
                    {{ avatarLetter }}
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold">{{ activeName }}</span>
                    <span class="block truncate text-xs text-base-content/50">{{ activeHost }}</span>
                </span>
            </div>
            <div class="mx-2 my-1 border-t border-base-300"></div>

            <!-- 账号列表：当前条目 ✓，点击切换 -->
            <ul class="menu menu-compact w-full p-0">
                <li v-for="entry in menuEntries" :key="entry.id">
                    <button type="button" class="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
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
            <ul class="menu menu-compact w-full p-0">
                <li>
                    <button type="button" class="rounded-xl px-3 py-2 text-sm" @click="addServer">
                        <PlusIcon class="h-4 w-4" />
                        {{ t('gateway.addServer') }}
                    </button>
                </li>
                <li>
                    <button type="button" class="rounded-xl px-3 py-2 text-sm" @click="openSettings">
                        <Cog6ToothIcon class="h-4 w-4" />
                        {{ t('gateway.settings') }}
                    </button>
                </li>
            </ul>
        </div>
    </div>
</template>
