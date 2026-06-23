<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    MagnifyingGlassIcon,
    Cog6ToothIcon,
    PlusIcon,
    ChatBubbleLeftRightIcon,
    TrashIcon,
    ArrowTopRightOnSquareIcon,
    QrCodeIcon,
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
import { useWeixinLogin } from '../composables/useWeixinLogin'

type SessionMenuItem = {
    key: string
    label: string
    tone?: 'default' | 'danger'
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
const weixinLogin = useWeixinLogin()

const isCollapsed = computed(() => configStore.isSidebarCollapsed)

const toggleCollapsed = () => {
    configStore.toggleSidebarCollapsed()
}

// Active session key: prefer chatState (reactive), fallback to route param
const activeSessionKey = computed(() => {
    return chatState.sessionKey || (route.params.sessionkey as string) || ''
})

const weixinButtonLabel = computed(() => {
    if (weixinLogin.status.value === 'connected') return t('sidebar.weixinLoginConnectedButton')
    return t('sidebar.weixinLoginButton')
})


// Filter sessions for display (exclude agent main sessions if needed, logic copied)
const displaySessions = computed(() => {
    return sessionsState.sessionsResult?.sessions
        .map((s: SessionRow) => ({
            key: s.id,
            label: s?.name || truncateText(s.firstMessage, 9)
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

const handleArchiveSession = async (session: { key: string, label: string }) => {
    await sessionsState.archiveSession(session.key)

    if (chatState.sessionKey === session.key) {
        router.push({ name: 'home' })
    }
}

const sessionMenuItems = computed<SessionMenuItem[]>(() => [
    {
        key: 'rename',
        label: t('sidebar.rename'),
    },
    {
        key: 'info',
        label: t('sidebar.viewInfo'),
    },
    {
        key: 'archive',
        label: t('sidebar.archive'),
    },
    {
        key: 'delete',
        label: t('common.delete'),
        tone: 'danger',
    },
])

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
        const detail = await sessionsState.getSessionById(session.key, undefined, { forceRefresh: true })
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

    if (action === 'info') {
        await openSessionInfo(session)
        return
    }

    if (action === 'archive') {
        await handleArchiveSession(session)
        return
    }

    if (action === 'delete') {
        await handleDeleteSession(session)
    }
}

const handleDeleteAllSessions = async () => {
    const sessions = displaySessions.value
    if (!sessions || sessions.length === 0) return

    if (!await confirm(t('sidebar.deleteAllChatsConfirm', { n: sessions.length }))) {
        return
    }

    const keys = sessions.map(s => s.key)
    await sessionsState.deleteSessions(keys)
    if (chatState.sessionKey && keys.includes(chatState.sessionKey)) {
        router.push({ name: 'home' })
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

const openWeixinLoginModal = () => {
    closeSidebarDrawer()
    weixinLogin.openModal()
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
                <button @click="openWeixinLoginModal" class="btn btn-ghost btn-circle btn-sm hover:bg-base-300"
                    :title="$t('sidebar.weixinLoginButton')">
                    <QrCodeIcon class="h-5 w-5" />
                </button>
                <button @click="router.push('/settings')" class="btn btn-ghost btn-circle btn-sm hover:bg-base-300">
                    <Cog6ToothIcon class="h-5 w-5" />
                </button>
            </div>
        </div>

        <!-- New Chat Button -->
        <div class="shrink-0 px-4" :class="isCollapsed && 'lg:px-2'">
            <button @click="createNewSession"
                class="btn btn-primary btn-block gap-2 shadow-md hover:shadow-lg transition-shadow rounded-xl h-11"
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

        <!-- Conversations Header -->
        <div class="shrink-0 px-4 pt-2 pb-2 flex items-center justify-between"
            :class="isCollapsed && 'lg:hidden'">
            <span class="text-sm font-medium text-base-content/70 uppercase tracking-wider">{{ $t('sidebar.recentChats')
            }}</span>
            <div class="flex gap-1">
                <button v-if="displaySessions && displaySessions.length > 0"
                    class="btn btn-ghost btn-circle btn-xs hover:bg-error/20 hover:text-error"
                    :title="$t('sidebar.clearAll')" @click="handleDeleteAllSessions">
                    <TrashIcon class="h-4 w-4" />
                </button>
                <button class="btn btn-ghost btn-circle btn-xs hover:bg-base-300">
                    <MagnifyingGlassIcon class="h-4 w-4" />
                </button>
            </div>
        </div>

        <!-- Conversations List - scrollable -->
        <div class="flex-1 overflow-y-auto px-3 pb-4 min-h-0" :class="isCollapsed && 'lg:hidden'">
            <!-- Loading state -->
            <!-- <div v-if="sessionsState.sessionsLoading" class="flex items-center justify-center py-4">
                <span class="loading loading-spinner loading-sm"></span>
            </div> -->
            <!-- Empty state -->
            <div v-if="!displaySessions || displaySessions.length === 0"
                class="text-center py-4 text-base-content/50 text-sm">
                {{ $t('sidebar.noChats') }}
            </div>
            <!-- Sessions list -->
            <div v-else class="space-y-1">
                <a v-for="session in displaySessions" :key="session.key" @click="selectSession(session.key)"
                    class="flex items-center gap-3 px-3 py-1.5 rounded-xl cursor-pointer transition-colors group"
                    :class="activeSessionKey === session.key
                        ? 'bg-primary/10 dark:bg-primary/15 hover:bg-primary/15 dark:hover:bg-primary/20'
                        : 'hover:bg-base-300'">
                    <ChatBubbleLeftRightIcon class="h-5 w-5 shrink-0"
                        :class="activeSessionKey === session.key ? 'text-primary opacity-80' : 'opacity-50'" />
                    <input v-if="renamingKey === session.key" :ref="setRenameInput" v-model="renameText"
                        type="text"
                        class="input input-xs input-bordered flex-1 min-w-0 h-7 rounded-lg"
                        @click.stop @keydown.enter.prevent="confirmRename" @keydown.esc.prevent="cancelRename"
                        @blur="confirmRename" />
                    <template v-else>
                        <span class="text-sm truncate flex-1"
                            :class="activeSessionKey === session.key ? 'font-semibold text-primary' : ''">{{ session.label }}</span>
                        <SessionActionMenu :actions="sessionMenuItems" :menu-id="`recent:${session.key}`"
                            :title="$t('sidebar.more')" @select="handleSessionMenuSelect(session, $event)" />
                    </template>
                </a>
            </div>
        </div>

        <!-- Collapse toggle (Desktop only) -->
        <div class="shrink-0 mt-auto hidden lg:block border-t border-base-300 p-2">
            <button @click="toggleCollapsed"
                class="btn btn-ghost btn-sm w-full gap-2 hover:bg-base-300"
                :class="isCollapsed && 'px-0'"
                :title="isCollapsed ? $t('sidebar.expand') : $t('sidebar.collapse')">
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
