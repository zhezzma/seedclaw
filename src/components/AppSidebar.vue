<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    Cog6ToothIcon,
    PlusIcon,
    ChatBubbleLeftRightIcon,
    ArrowTopRightOnSquareIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
} from '@heroicons/vue/24/outline'
import { SIDEBAR_ITEMS } from '../config/navigation'
import SessionActionMenu from './chat/SessionActionMenu.vue'
import SessionInfoModal from './chat/SessionInfoModal.vue'

import { useConfirm } from '../composables/useConfirm'
import { NEW_SESSION_ROUTE_NAME } from '../utils/route-helpers'


import { SessionRow, useSessionsState } from '../composables/useSessionsState'
import { useChatState } from '../composables/useChatState'
import { useNavActive } from '../composables/useNavActive'
import { useUiSettingsStore } from '../stores/setting'
import { useI18n } from 'vue-i18n'
import { truncateText } from '../utils/format'

type SessionMenuItem = {
    key: string
    label: string
    tone?: 'default' | 'danger'
}

// 侧栏会话列表 tab：对话 / 计划 / 归档
export type SidebarSessionTab = 'chats' | 'plans' | 'archived'

const sessionTab = ref<SidebarSessionTab>('chats')

// 需懒加载的 tab 与对应 loader（loader 失败返回 null，据此移除标记下次重试）；
// chats 不在此列：数据由启动链 useAppInit.loadSessions 加载，无需懒加载
const TAB_LOADERS: Partial<Record<SidebarSessionTab, () => Promise<unknown>>> = {
    plans: () => sessionsState.loadTaskSessions(),
    archived: () => sessionsState.loadArchivedSessions(),
}
// 已懒加载过的 tab；失败不标记，下次切换重试
const loadedTabs = new Set<SidebarSessionTab>()
// 在途懒加载的 tab 集合：spinner 跟随当前显示 tab 的在途状态，
// 避免并发切换时先完成的 loader 把仍在途 tab 的 spinner 提前关掉
const loadingTabs = reactive(new Set<SidebarSessionTab>())
// 当前 tab 是否首次加载在途
const tabLoading = computed(() => loadingTabs.has(sessionTab.value))

const switchSessionTab = async (tab: SidebarSessionTab) => {
    sessionTab.value = tab
    const loader = TAB_LOADERS[tab]
    if (!loader || loadedTabs.has(tab)) return
    loadedTabs.add(tab)
    loadingTabs.add(tab)
    try {
        // loader 失败返回 null（桶保持旧值）；成功返回结果（含空列表）
        if (await loader() == null) {
            loadedTabs.delete(tab)
        }
    } catch {
        // loader 违约 reject 时同样释放标记，允许下次重试
        loadedTabs.delete(tab)
    } finally {
        loadingTabs.delete(tab)
    }
}

const route = useRoute()
const router = useRouter()
const { confirm } = useConfirm()

const sessionsState = useSessionsState()
const chatState = useChatState()

// 行内重命名状态
const renamingKey = ref<string | null>(null)
const renameText = ref('')
const renameOriginal = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const setRenameInput = (el: unknown) => {
    renameInputRef.value = (el as HTMLInputElement) || null
}

// 会话信息弹窗状态
const infoModalOpen = ref(false)
const infoLoading = ref(false)
const infoSession = ref<SessionRow | null>(null)
const { t } = useI18n()
const configStore = useUiSettingsStore()

const isCollapsed = computed(() => configStore.isSidebarCollapsed)

const toggleCollapsed = () => {
    configStore.toggleSidebarCollapsed()
}

// Active session key: prefer chatState (reactive), fallback to route param
const activeSessionKey = computed(() => {
    return chatState.sessionKey || (route.params.sessionkey as string) || ''
})

// ---------- 侧栏 tab 跟随当前会话 ----------
// 通知点击/路由跳转 /chat/:id 后，tab 自动切到该会话所属桶。
// key 所属桶（桶间互斥由 moveSessionToRouteState 保证）；
// 桶未加载或无此会话时返回 null，不盲切
const sessionTabOfKey = (key: string): SidebarSessionTab | null => {
    if (sessionsState.sessionsResult?.sessions?.some(s => s.id === key)) return 'chats'
    if (sessionsState.taskSessionsResult?.sessions?.some(s => s.id === key)) return 'plans'
    if (sessionsState.archivedSessionsResult?.sessions?.some(s => s.id === key)) return 'archived'
    return null
}

// 每次会话跳转只跟随一次：之后用户手动切到其他 tab 浏览不被拉回。
// 冷启动点通知时桶数据由 setSessionKey → getSessionById 单查回填，
// 命中晚于路由跳转，因此同时监听三桶引用变化补切
let followedKey: string | null = null
watch([activeSessionKey, () => sessionsState.sessionsResult, () => sessionsState.taskSessionsResult, () => sessionsState.archivedSessionsResult], () => {
    const key = activeSessionKey.value
    if (!key || followedKey === key) return
    const tab = sessionTabOfKey(key)
    if (!tab) return
    followedKey = key
    if (tab !== sessionTab.value) void switchSessionTab(tab)
})


// 当前 tab 展示的会话列表（行渲染统一结构：key/label/pinned/archived）
const displaySessions = computed(() => {
    const raw = sessionTab.value === 'chats'
        ? sessionsState.sessionsResult?.sessions
        : sessionTab.value === 'plans'
            ? sessionsState.taskSessionsResult?.sessions
            : sessionsState.archivedSessionsResult?.sessions
    return raw?.map((s: SessionRow) => ({
        key: s.id,
        label: s?.name || truncateText(s.firstMessage, 9),
        pinned: Boolean(s.pinned),
        archived: Boolean(s.archived),
    }))
})

const closeSidebarDrawer = () => {
    const drawer = document.getElementById('sidebar-drawer') as HTMLInputElement
    if (drawer) drawer.checked = false
}


const selectSession = (key: string) => {
    router.push({ name: 'chat', params: { sessionkey: key } })
    closeSidebarDrawer()
}

const createNewSession = () => {
    // Navigate to new-session route
    router.push({ name: NEW_SESSION_ROUTE_NAME })
    closeSidebarDrawer()
}

const handleDeleteSession = async (session: { key: string, label: string }) => {
    if (!await confirm(t('sidebar.deleteChatConfirm', { key: session.label }))) {
        return
    }

    const result = await sessionsState.deleteSession(session.key)
    if (result?.deleted && chatState.sessionKey === session.key) {
        router.push({ name: 'home' })
    }
}

// 归档/取消归档后：若归档的是当前会话，回首页；若在归档 tab 取消归档，会话自动搬回对话/计划桶
const handleArchiveSession = async (session: { key: string, label: string }) => {
    await sessionsState.archiveSession(session.key)

    if (chatState.sessionKey === session.key) {
        router.push({ name: 'home' })
    }
}

const handleUnarchiveSession = async (session: { key: string, label: string }) => {
    await sessionsState.unarchiveSession(session.key)
}

// 各 tab 的行菜单配置：
// - 对话：置顶/取消置顶仅普通会话有效（后端 pin 只作用于普通列表）
// - 归档仅对话 tab 的普通会话可用：任务会话（计划 tab）不支持归档
// - 已归档行（归档 tab 全部 + 计划 tab 中已归档项）显示取消归档
const getSessionMenuItems = (session: { pinned?: boolean, archived?: boolean }): SessionMenuItem[] => {
    const items: SessionMenuItem[] = [
        {
            key: 'rename',
            label: t('sidebar.rename'),
        },
    ]

    if (sessionTab.value === 'chats') {
        items.push({
            key: session.pinned ? 'unpin' : 'pin',
            label: session.pinned ? t('sidebar.unpin') : t('sidebar.pin'),
        })
    }

    items.push({
        key: 'info',
        label: t('sidebar.viewInfo'),
    })

    if (session.archived) {
        items.push({
            key: 'unarchive',
            label: t('sidebar.unarchive'),
        })
    } else if (sessionTab.value === 'chats') {
        // 归档仅对话 tab 可用；任务会话（计划 tab）不支持归档
        items.push({
            key: 'archive',
            label: t('sidebar.archive'),
        })
    }

    items.push({
        key: 'delete',
        label: t('common.delete'),
        tone: 'danger',
    })
    return items
}

// 会话行右键菜单：通过 ref 打开对应行的 SessionActionMenu
const sessionMenuRefs = new Map<string, { openMenu: () => void }>()
const setSessionMenuRef = (key: string, el: unknown) => {
    if (el) {
        sessionMenuRefs.set(key, el as { openMenu: () => void })
    } else {
        sessionMenuRefs.delete(key)
    }
}
const openSessionContextMenu = (key: string) => {
    sessionMenuRefs.get(key)?.openMenu()
}

const startRename = async (session: { key: string, label: string }) => {
    renamingKey.value = session.key
    renameText.value = session.label
    renameOriginal.value = session.label
    await nextTick()
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
}

const cancelRename = () => {
    renamingKey.value = null
    renameText.value = ''
    renameOriginal.value = ''
}

const confirmRename = async () => {
    const key = renamingKey.value
    if (!key) return

    const next = renameText.value.trim()
    const original = renameOriginal.value.trim()
    cancelRename()
    // 空值或未变化时不发请求
    if (!next || next === original) return

    try {
        await sessionsState.patchSession(key, { label: next })
    } catch {
        // patchSession 内部已记录错误
    }
}

const openSessionInfo = async (session: { key: string, label: string }) => {
    infoModalOpen.value = true
    infoLoading.value = true
    infoSession.value = sessionsState.findSessionLocal(session.key) || null
    try {
        const detail = await sessionsState.getSessionById(session.key, { forceRefresh: true })
        if (detail) infoSession.value = detail
    } finally {
        infoLoading.value = false
    }
}

const handleSessionMenuSelect = async (session: { key: string, label: string }, action: string) => {
    if (action === 'rename') {
        await startRename(session)
        return
    }

    if (action === 'pin') {
        await sessionsState.pinSession(session.key)
        return
    }

    if (action === 'unpin') {
        await sessionsState.unpinSession(session.key)
        return
    }

    if (action === 'info') {
        await openSessionInfo(session)
        return
    }

    if (action === 'archive') {
        await handleArchiveSession(session)
        return
    }

    if (action === 'unarchive') {
        await handleUnarchiveSession(session)
        return
    }

    if (action === 'delete') {
        await handleDeleteSession(session)
    }
}

const navItems = SIDEBAR_ITEMS

const { isItemActive } = useNavActive()

const handleNavClick = (item: any) => {
    if (item.route) {
        router.push({ name: item.route, query: item.query })
        closeSidebarDrawer()
    }
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200/50 pt-[env(safe-area-inset-top)]">
        <!-- Header -->
        <div class="shrink-0 px-5 py-3 flex items-center justify-between"
            :class="isCollapsed && 'lg:px-0 lg:justify-center'">
            <div class="flex items-center gap-2">
                <span class="text-2xl">🦀</span>
                <span class="text-lg font-bold tracking-tight" :class="isCollapsed && 'lg:hidden'">SeedClaw</span>
            </div>
            <div class="flex gap-1" :class="isCollapsed && 'lg:hidden'">
                <a v-if="configStore.externalUrl" :href="configStore.externalUrl" target="_blank"
                    rel="noopener noreferrer" class="btn btn-ghost btn-circle btn-sm hover:bg-base-300">
                    <ArrowTopRightOnSquareIcon class="h-5 w-5" />
                </a>
                <button @click="router.push('/settings')" class="btn btn-ghost btn-circle btn-sm hover:bg-base-300">
                    <Cog6ToothIcon class="h-5 w-5" />
                </button>
            </div>
        </div>

        <!-- New Chat Button -->
        <div class="shrink-0 px-4" :class="isCollapsed && 'lg:px-2'">
            <button @click="createNewSession"
                class="btn btn-primary btn-block btn-sm gap-2 shadow-md hover:shadow-lg transition-shadow rounded-xl h-10"
                :title="$t('sidebar.newChat')">
                <PlusIcon class="h-5 w-5" />
                <span class="font-medium" :class="isCollapsed && 'lg:hidden'">{{ $t('sidebar.newChat') }}</span>
            </button>
        </div>

        <!-- Divider -->
        <div class="shrink-0 px-4 py-3">
            <div class="border-t border-base-300"></div>
        </div>


        <!-- Nav -->
        <div class="shrink-0 px-3 flex flex-col gap-1.5">
            <button v-for="item in navItems" :key="item.label" @click="handleNavClick(item)"
                class="group flex items-center gap-3  p-1 w-full rounded-2xl text-left transition-all duration-200 hover:bg-base-300/90 hover:border-base-300 hover:shadow-sm border border-transparent  active:scale-[0.98] cursor-pointer"
                :class="[
                    { 'bg-base-300 dark:bg-primary/20  shadow-sm': isItemActive(item) },
                    isCollapsed && 'lg:justify-center',
                ]" :title="$t(item.label)">
                <div class="p-1 rounded-xl transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary text-base-content/60"
                    :class="{ 'bg-primary/10 text-primary': isItemActive(item) }">
                    <component :is="item.icon" class="h-5 w-5" />
                </div>
                <span class="font-medium text-sm text-base-content/70 group-hover:text-base-content transition-colors"
                    :class="[
                        { 'text-base-content font-semibold': isItemActive(item) },
                        isCollapsed && 'lg:hidden',
                    ]">
                    {{ $t(item.label) }}
                </span>
            </button>
        </div>



        <!-- Divider -->
        <div class="shrink-0 px-4 py-2">
            <div class="border-t border-base-300"></div>
        </div>

        <!-- Session Tabs: 对话 / 计划 / 归档 -->
        <div class="shrink-0 px-3 pt-2 pb-1" :class="isCollapsed && 'lg:hidden'">
            <div role="tablist" class="tabs tabs-boxed tabs-xs">
                <button role="tab" type="button" class="tab"
                    :class="{ 'tab-active': sessionTab === 'chats' }"
                    :aria-selected="sessionTab === 'chats'"
                    @click="switchSessionTab('chats')">{{ $t('sidebar.tabChats') }}</button>
                <button role="tab" type="button" class="tab"
                    :class="{ 'tab-active': sessionTab === 'plans' }"
                    :aria-selected="sessionTab === 'plans'"
                    @click="switchSessionTab('plans')">{{ $t('sidebar.tabPlans') }}</button>
                <button role="tab" type="button" class="tab"
                    :class="{ 'tab-active': sessionTab === 'archived' }"
                    :aria-selected="sessionTab === 'archived'"
                    @click="switchSessionTab('archived')">{{ $t('sidebar.tabArchived') }}</button>
            </div>
        </div>

        <!-- Conversations List - scrollable -->
        <div class="flex-1 overflow-y-auto px-3 pb-4 min-h-0" :class="isCollapsed && 'lg:hidden'">
            <!-- Loading state: 当前 tab 首次懒加载在途 -->
            <div v-if="tabLoading"
                class="flex items-center justify-center py-4">
                <span class="loading loading-spinner loading-sm"></span>
            </div>
            <!-- Empty state -->
            <div v-else-if="!displaySessions || displaySessions.length === 0"
                class="text-center py-4 text-base-content/50 text-sm">
                {{ $t(sessionTab === 'chats' ? 'sidebar.noChats' : sessionTab === 'plans' ? 'sidebar.noPlans' : 'sidebar.noArchived') }}
            </div>
            <!-- Sessions list -->
            <div v-else class="space-y-1">
                <a v-for="session in displaySessions" :key="session.key" @click="selectSession(session.key)"
                    @contextmenu.prevent="openSessionContextMenu(session.key)"
                    class="flex items-center gap-3 px-3 py-1.5 rounded-xl cursor-pointer transition-colors group"
                    :class="activeSessionKey === session.key
                        ? 'bg-primary/10 dark:bg-primary/15 hover:bg-primary/15 dark:hover:bg-primary/20'
                        : 'hover:bg-base-300'">
                    <template v-if="session.pinned">
                        <span class="h-5 w-5 shrink-0 inline-flex items-center justify-center" :title="$t('sidebar.pin')" aria-hidden="true">📌</span>
                        <span class="sr-only">{{ $t('sidebar.pin') }}</span>
                    </template>
                    <ChatBubbleLeftRightIcon v-else class="h-5 w-5 shrink-0"
                        :class="activeSessionKey === session.key ? 'text-primary opacity-80' : 'opacity-50'" />
                    <input v-if="renamingKey === session.key" :ref="setRenameInput" v-model="renameText" type="text"
                        class="input input-xs input-bordered flex-1 min-w-0 h-7 rounded-lg" @click.stop @contextmenu.stop
                        @keydown.enter.prevent="confirmRename" @keydown.esc.prevent="cancelRename"
                        @blur="confirmRename" />
                    <template v-else>
                        <span class="text-sm truncate flex-1"
                            :class="activeSessionKey === session.key ? 'font-semibold text-primary' : ''">{{
                            session.label }}</span>
                        <SessionActionMenu :ref="(el) => setSessionMenuRef(session.key, el)"
                            :actions="getSessionMenuItems(session)" :menu-id="`recent:${session.key}`"
                            :title="$t('sidebar.more')" @select="handleSessionMenuSelect(session, $event)" />
                    </template>
                </a>
            </div>
        </div>

        <!-- Collapse toggle (Desktop only) -->
        <div class="shrink-0 mt-auto hidden lg:block border-t border-base-300 p-2">
            <button @click="toggleCollapsed" class="btn btn-ghost btn-sm w-full gap-2 hover:bg-base-300"
                :class="isCollapsed && 'px-0'" :title="isCollapsed ? $t('sidebar.expand') : $t('sidebar.collapse')">
                <ChevronDoubleRightIcon v-if="isCollapsed" class="h-5 w-5" />
                <ChevronDoubleLeftIcon v-else class="h-5 w-5" />
                <span class="font-medium text-sm" :class="isCollapsed && 'hidden'">{{ $t('sidebar.collapse') }}</span>
            </button>
        </div>
    </div>

    <SessionInfoModal :open="infoModalOpen" :session="infoSession" :loading="infoLoading"
        @close="infoModalOpen = false" />
</template>

<style scoped>
/* Custom scrollbar for dark theme */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: oklch(var(--bc) / 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: oklch(var(--bc) / 0.3);
}
</style>
