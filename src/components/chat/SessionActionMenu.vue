<script lang="ts">
import { defineComponent, onBeforeUnmount, ref, watch, type PropType } from 'vue'
import { EllipsisVerticalIcon } from '@heroicons/vue/24/outline'

const sharedActiveMenuId = ref<string | null>(null)

interface SessionActionMenuItem {
    key: string
    label: string
    tone?: 'default' | 'danger'
}

export default defineComponent({
    name: 'SessionActionMenu',
    components: {
        EllipsisVerticalIcon,
    },
    props: {
        actions: {
            type: Array as PropType<SessionActionMenuItem[]>,
            required: true,
        },
        menuId: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: false,
        },
    },
    emits: ['select'],
    setup(props, { emit }) {
        const menuRef = ref<HTMLElement | null>(null)
        const isOpen = ref(false)

        const closeMenu = () => {
            if (sharedActiveMenuId.value === props.menuId) {
                sharedActiveMenuId.value = null
            }
            isOpen.value = false
        }

        const toggleMenu = (event: MouseEvent) => {
            event.stopPropagation()

            if (isOpen.value) {
                closeMenu()
                return
            }

            sharedActiveMenuId.value = props.menuId
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

        watch(sharedActiveMenuId, (currentMenuId) => {
            if (currentMenuId !== props.menuId && isOpen.value) {
                isOpen.value = false
            }
        })

        watch(isOpen, (open) => {
            if (open) {
                sharedActiveMenuId.value = props.menuId
                document.addEventListener('click', handleClickOutside)
                return
            }

            if (sharedActiveMenuId.value === props.menuId) {
                sharedActiveMenuId.value = null
            }

            document.removeEventListener('click', handleClickOutside)
        })

        onBeforeUnmount(() => {
            if (sharedActiveMenuId.value === props.menuId) {
                sharedActiveMenuId.value = null
            }

            document.removeEventListener('click', handleClickOutside)
        })

        return {
            menuRef,
            isOpen,
            toggleMenu,
            handleSelect,
        }
    },
})
</script>

<template>
    <div ref="menuRef" class="dropdown dropdown-end" :class="{ 'dropdown-open': isOpen }">
        <button
            class="btn btn-ghost btn-sm  min-h-0 px-2 rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-base-300"
            :title="title || $t('sidebar.more')" :aria-label="title || $t('sidebar.more')" @click="toggleMenu">
            <EllipsisVerticalIcon class="h-4 w-4" />
        </button>
        <ul v-if="isOpen"
            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-36 border border-base-300 z-[60]"
            @click.stop>
            <li v-for="action in actions" :key="action.key">
                <button class="rounded-lg" :class="{
                    'text-error hover:bg-error/10': action.tone === 'danger',
                }" @click="handleSelect(action.key, $event)">
                    {{ action.label }}
                </button>
            </li>
        </ul>
    </div>
</template>
