<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline'

const activeMenuId = ref<string | null>(null)

interface SessionActionMenuItem {
    key: string
    label: string
    tone?: 'default' | 'danger'
}

const props = defineProps<{
    actions: SessionActionMenuItem[]
    menuId: string
    title?: string
}>()

const emit = defineEmits<{
    select: [key: string]
}>()

const menuRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const closeMenu = () => {
    if (activeMenuId.value === props.menuId) {
        activeMenuId.value = null
    }
    isOpen.value = false
}

const toggleMenu = (event: MouseEvent) => {
    event.stopPropagation()

    if (isOpen.value) {
        closeMenu()
        return
    }

    activeMenuId.value = props.menuId
    isOpen.value = true
}

const handleSelect = (key: string, event: MouseEvent) => {
    event.stopPropagation()
    closeMenu()
    emit('select', key)
}

const handleClickOutside = (event: MouseEvent) => {
    if (!menuRef.value?.contains(event.target as Node)) {
        closeMenu()
    }
}

watch(activeMenuId, (currentMenuId) => {
    if (currentMenuId !== props.menuId && isOpen.value) {
        isOpen.value = false
    }
})

watch(isOpen, (open) => {
    if (open) {
        activeMenuId.value = props.menuId
        document.addEventListener('click', handleClickOutside)
        return
    }

    if (activeMenuId.value === props.menuId) {
        activeMenuId.value = null
    }

    document.removeEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
    if (activeMenuId.value === props.menuId) {
        activeMenuId.value = null
    }

    document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
    <div ref="menuRef" class="dropdown dropdown-end" :class="{ 'dropdown-open': isOpen }">
        <button
            class="btn btn-ghost btn-sm h-8 min-h-0 px-2 rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-base-300"
            :title="title || $t('sidebar.more')"
            :aria-label="title || $t('sidebar.more')"
            @click="toggleMenu"
        >
            <EllipsisVerticalIcon class="h-4 w-4" />
        </button>
        <ul
            v-if="isOpen"
            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-36 border border-base-300 z-[60]"
            @click.stop
        >
            <li v-for="action in props.actions" :key="action.key">
                <button
                    class="rounded-lg"
                    :class="{
                        'text-error hover:bg-error/10': action.tone === 'danger',
                    }"
                    @click="handleSelect(action.key, $event)"
                >
                    {{ action.label }}
                </button>
            </li>
        </ul>
    </div>
</template>
