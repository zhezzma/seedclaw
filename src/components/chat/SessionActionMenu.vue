<script lang="ts">
import { defineComponent, nextTick, onBeforeUnmount, ref, watch, type PropType } from 'vue'
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
        const triggerRef = ref<HTMLElement | null>(null)
        const isOpen = ref(false)
        const openUpward = ref(false)

        // 菜单默认向下弹出；当下方空间不足且上方更宽裕时改为向上弹出，
        // 避免被外层 overflow 滚动容器裁剪（根因：dropdown-content 为绝对定位）
        const determinePlacement = () => {
            const root = menuRef.value
            const trigger = triggerRef.value
            if (!root || !trigger) return
            const content = root.querySelector<HTMLElement>('.dropdown-content')
            if (!content) return

            // 以最近一个会产生裁剪的滚动祖先的边界作为可用区域
            let clipTop = 0
            let clipBottom = window.innerHeight
            let parent = root.parentElement
            while (parent) {
                const overflowY = getComputedStyle(parent).overflowY
                if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden' || overflowY === 'clip') {
                    const parentRect = parent.getBoundingClientRect()
                    clipTop = parentRect.top
                    clipBottom = parentRect.bottom
                    break
                }
                parent = parent.parentElement
            }

            const triggerRect = trigger.getBoundingClientRect()
            const spaceBelow = clipBottom - triggerRect.bottom
            const spaceAbove = triggerRect.top - clipTop
            // 仅当下方放不下、且上方不比下方差时才翻向上，避免短容器下把裁剪从底部挪到顶部
            openUpward.value = spaceBelow < content.offsetHeight && spaceAbove >= spaceBelow
        }

        const closeMenu = () => {
            if (sharedActiveMenuId.value === props.menuId) {
                sharedActiveMenuId.value = null
            }
            isOpen.value = false
            openUpward.value = false
        }

        const openMenu = () => {
            sharedActiveMenuId.value = props.menuId
            isOpen.value = true
            nextTick(determinePlacement)
        }

        const toggleMenu = (event: MouseEvent) => {
            event.stopPropagation()

            if (isOpen.value) {
                closeMenu()
                return
            }

            openMenu()
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

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                closeMenu()
            }
        }

        watch(sharedActiveMenuId, (currentMenuId) => {
            if (currentMenuId !== props.menuId && isOpen.value) {
                isOpen.value = false
                openUpward.value = false
            }
        })

        watch(isOpen, (open) => {
            if (open) {
                sharedActiveMenuId.value = props.menuId
                document.addEventListener('click', handleClickOutside)
                document.addEventListener('keydown', handleKeyDown)
                return
            }

            if (sharedActiveMenuId.value === props.menuId) {
                sharedActiveMenuId.value = null
            }

            document.removeEventListener('click', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        })

        onBeforeUnmount(() => {
            if (sharedActiveMenuId.value === props.menuId) {
                sharedActiveMenuId.value = null
            }

            document.removeEventListener('click', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        })

        return {
            menuRef,
            triggerRef,
            isOpen,
            openUpward,
            openMenu,
            toggleMenu,
            handleSelect,
        }
    },
})
</script>

<template>
    <div ref="menuRef" class="dropdown dropdown-end"
        :class="{ 'dropdown-open': isOpen, 'dropdown-top': openUpward }">
        <button
            ref="triggerRef"
            :aria-expanded="isOpen"
            aria-haspopup="menu"
            class="btn btn-ghost btn-sm  min-h-0 px-2 rounded-full opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity hover:bg-base-300"
            :title="title || $t('sidebar.more')" :aria-label="title || $t('sidebar.more')" @click="toggleMenu">
            <EllipsisVerticalIcon class="h-4 w-4" />
        </button>
        <ul v-if="isOpen" role="menu"
            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-36 border border-base-300 z-[60]"
            @click.stop>
            <li v-for="action in actions" :key="action.key" role="none">
                <button class="rounded-lg" role="menuitem" :class="{
                    'text-error hover:bg-error/10': action.tone === 'danger',
                }" @click="handleSelect(action.key, $event)">
                    {{ action.label }}
                </button>
            </li>
        </ul>
    </div>
</template>
