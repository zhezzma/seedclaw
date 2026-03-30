<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MagnifyingGlassIcon, TrashIcon } from '@heroicons/vue/24/outline'
import ViewHeader from '../ViewHeader.vue'
import SessionActionMenu from './SessionActionMenu.vue'

import { useConfirm } from '../../composables/useConfirm'
import { SessionRow } from '../../composables/useSessionsState'

interface SessionSidebarRowAction {
    key: string
    label: string
    tone?: 'default' | 'danger'
}

const props = defineProps<{
    title?: string
    selectedKey?: string
    sessions: SessionRow[]
    rowActions?: SessionSidebarRowAction[]
}>()

const emit = defineEmits<{
    (e: 'select', key: string): void
    (e: 'delete', key: string): void
    (e: 'clear-all', keys: string[]): void
    (e: 'row-action', payload: { key: string, action: string }): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()

const normalizedSessions = computed(() => {
    return props.sessions.map((s: any) => {
        const id = s.id || s.sessionId || s.key
        const label = s.name || s.displayLabel || s.displayName || s.label || s.agentName || id || 'Session'
        const rawDate = s.timestamp || s.lastActiveAt || s.updatedAt || s.created || s.modified

        let displayLabel = label
        if (typeof displayLabel === 'string' && displayLabel.startsWith('Cron: ')) {
            displayLabel = displayLabel.slice(6)
        }

        return {
            ...s,
            _id: id,
            _label: displayLabel,
            _date: rawDate ? new Date(rawDate) : null
        }
    })
})

const handleDeleteAll = async () => {
    if (props.sessions.length === 0) return
    if (await confirm(t('chat.clearAllConfirm'))) {
        const keys = normalizedSessions.value.map(s => s._id).filter((id): id is string => !!id)
        if (keys.length > 0) {
            emit('clear-all', keys)
        }
    }
}


const confirmDelete = async (key: string) => {
    if (await confirm(t('chat.deleteConfirm'))) {
        emit('delete', key)
    }
}

const handleDelete = async (key: string, event: Event) => {
    event.stopPropagation()
    await confirmDelete(key)
}

const searchQuery = ref('')

const filteredSessions = computed(() => {
    const list = normalizedSessions.value
    if (!searchQuery.value) return list
    const query = searchQuery.value.toLowerCase()
    return list.filter((s: any) =>
        (s._label || '').toLowerCase().includes(query)
    )
})

const handleRowAction = async (key: string, action: string) => {
    if (action === 'delete') {
        await confirmDelete(key)
        return
    }

    emit('row-action', { key, action })
}

</script>

<template>
    <div class="h-full flex flex-col bg-base-100 border-r border-base-200">
        <!-- Header -->
        <ViewHeader :title="title || 'Sessions'" :is-main-page="true">
            <template #actions>
                <button v-if="sessions.length > 0" @click="handleDeleteAll"
                    class="btn btn-ghost btn-circle btn-sm text-error/70 hover:text-error hover:bg-error/10"
                    :title="$t('chat.clearAll')">
                    <TrashIcon class="w-5 h-5" />
                </button>
            </template>
        </ViewHeader>

        <!-- Search -->
        <div class="p-2 shrink-0">
            <div class="relative">
                <input v-model="searchQuery" type="text" :placeholder="$t('common.search')"
                    class="input input-sm input-bordered w-full pl-8" />
                <MagnifyingGlassIcon class="w-4 h-4 absolute left-2.5 top-2 opacity-50" />
            </div>
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto space-y-1">
            <div v-if="filteredSessions.length === 0" class="text-center p-4 text-base-content/50 text-sm">
                {{ $t('chat.noSessions') }}
            </div>
            <div v-for="(s, index) in filteredSessions" :key="s._id" @click="$emit('select', s._id)"
                class="group flex items-center gap-2 p-3  cursor-pointer hover:bg-base-300 transition-colors border-b border-base-300 last:border-b-0 lg:border-b-0"
                :class="{ 'bg-primary/20 hover:bg-primary/20': selectedKey === s._id }">
                <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">{{ s._label }}</div>
                    <div v-if="s._date" class="text-xs opacity-60 mt-1">
                        {{ s._date.toLocaleString() }}
                    </div>
                </div>
                <SessionActionMenu
                    v-if="rowActions?.length"
                    :actions="rowActions"
                    @select="handleRowAction(s._id, $event)"
                />
                <button v-else @click="handleDelete(s._id, $event)"
                    class="btn btn-ghost btn-circle btn-xs opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-error/20 hover:text-error shrink-0">
                    <TrashIcon class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
</template>
