<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MagnifyingGlassIcon, TrashIcon } from '@heroicons/vue/24/outline'
import ViewHeader from '../ViewHeader.vue'

import { useConfirm } from '../../composables/useConfirm'
import { useSessionsState } from '../../composables/useSessionsState'


const props = defineProps<{
    title?: string
    selectedKey?: string
    sessions: any[]
}>()

const emit = defineEmits<{
    (e: 'select', key: string): void
    (e: 'delete', key: string): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()
const { deleteSessions } = useSessionsState()

const handleDeleteAll = async () => {
    if (props.sessions.length === 0) return
    if (await confirm(t('chat.clearAllConfirm'))) {
        const keys = props.sessions.map(s => s.key)
        await deleteSessions(keys)
    }
}


const handleDelete = async (key: string, event: Event) => {
    event.stopPropagation()
    if (await confirm(t('chat.deleteConfirm'))) {
        emit('delete', key)
    }
}

const searchQuery = ref('')

const filteredSessions = computed(() => {
    const list = props.sessions
    if (!searchQuery.value) return list
    const query = searchQuery.value.toLowerCase()
    return list.filter((s: any) =>
        (s.displayLabel || s.label || '').toLowerCase().includes(query)
    )
}) as any // ComputedRef<any> or just use any inside template


const formatLabel = (s: any) => {
    const label = s.displayLabel || s.displayName || s.label || s.key || 'Session'
    return label.startsWith('Cron: ') ? label.slice(6) : label
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
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
            <div v-if="filteredSessions.length === 0" class="text-center p-4 text-base-content/50 text-sm">
                {{ $t('chat.noSessions') }}
            </div>
            <div v-for="(s, index) in filteredSessions" :key="s.key" @click="$emit('select', s.key)"
                class="group flex items-center gap-2 p-3 rounded-lg lg:rounded-lg cursor-pointer hover:bg-base-200 transition-colors border-b border-base-300 last:border-b-0 lg:border-b-0"
                :class="{ 'bg-primary/10 text-primary': selectedKey === s.key }">
                <div class="flex-1 min-w-0">
                    <div class="font-medium truncate">{{ formatLabel(s) }}</div>
                    <div class="text-xs opacity-60 mt-1">{{ new Date(s.lastActiveAt ||
                        s.updatedAt).toLocaleString() }}
                    </div>
                </div>
                <button @click="handleDelete(s.key, $event)"
                    class="btn btn-ghost btn-circle btn-xs opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-error/20 hover:text-error shrink-0">
                    <TrashIcon class="h-4 w-4" />
                </button>
            </div>
        </div>
    </div>
</template>
