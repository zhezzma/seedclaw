<script setup lang="ts">
/**
 * Workspace 上下文菜单的可视组件。
 *
 * - 单例：通过 useContextMenu 全局状态控制显示（PC 右键 / 移动端 kebab 都走同一个实例）
 * - 视口固定定位；显示后用 BoundingClientRect 自适应防溢出（向上 / 向左翻转）
 * - 点击 overlay / Esc / 选中条目都会关闭
 * - a11y：role=menu / role=menuitem / aria-disabled；ArrowDown/Up/Home/End 焦点循环；
 *   打开后 autofocus 第一项；关闭时焦点由 useContextMenu.close() 返回触发元素
 *
 * 必须挂载在能覆盖整个 panel + drawer 的层级（HomeView 根）。
 */
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useContextMenu, type ContextMenuItem } from '../../composables/useContextMenu'

const menu = useContextMenu()
const menuRef = ref<HTMLUListElement | null>(null)
const finalX = ref(0)
const finalY = ref(0)

const items = computed<ContextMenuItem[]>(() => menu.items)
const visible = computed(() => menu.visible)

/** 当前可聚焦的菜单项按钮，按 DOM 顺序。每次打开 / arrow key 时重新查询。 */
function focusableButtons(): HTMLButtonElement[] {
    if (!menuRef.value) return []
    return Array.from(
        menuRef.value.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])'),
    )
}

// 显示后测量真实尺寸，按视口防溢出 + 自动 focus 首项。menu.x/y 是「期望左上角」，
// 当菜单超出右边/下边时回退；超左/上时仍贴 8px 边距。
watch(visible, async (v) => {
    if (!v) return
    await nextTick()
    const el = menuRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const PAD = 8
    let x = menu.x
    let y = menu.y
    if (x + rect.width > vw - PAD) x = Math.max(PAD, vw - rect.width - PAD)
    if (y + rect.height > vh - PAD) {
        // 向上翻转：让菜单底部贴近原点
        y = Math.max(PAD, menu.y - rect.height)
    }
    finalX.value = x
    finalY.value = y
    // a11y：autofocus 第一个可用项，方便键盘用户立刻 ArrowDown 浏览
    focusableButtons()[0]?.focus()
}, { flush: 'post' })

async function onClickItem(item: ContextMenuItem) {
    if (item.disabled) return
    // 先关再执行：避免 action 内做异步工作时菜单悬停
    menu.close()
    try {
        await item.action()
    } catch (err) {
        console.error('Context menu action failed:', err)
    }
}

function onKeyDown(e: KeyboardEvent) {
    if (!menu.visible) return
    if (e.key === 'Escape') {
        e.preventDefault()
        menu.close()
        return
    }
    // ARIA Menu pattern：Tab 关菜单并把焦点交还触发元素（否则会跳到 body 末端隔壁元素，很诡异）。
    if (e.key === 'Tab') {
        e.preventDefault()
        menu.close()
        return
    }
    // ArrowUp/Down/Home/End 在菜单按钮间循环切换焦点（ARIA Menu pattern）
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const buttons = focusableButtons()
    if (buttons.length === 0) return
    e.preventDefault()
    const active = document.activeElement as HTMLElement | null
    const idx = active ? buttons.indexOf(active as HTMLButtonElement) : -1
    let next = 0
    if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = buttons.length - 1
    else if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % buttons.length
    else next = idx <= 0 ? buttons.length - 1 : idx - 1
    buttons[next]?.focus()
}

onMounted(() => document.addEventListener('keydown', onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
</script>

<template>
    <Teleport to="body">
        <Transition name="ctxmenu">
            <div v-if="visible" class="fixed inset-0 z-[200]" @click="menu.close()" @contextmenu.prevent="menu.close()">
                <!-- 透明 overlay 捕获点击，但不画背景（VSCode 风格菜单不带遮罩） -->
                <ul ref="menuRef" role="menu"
                    class="fixed bg-base-100 border border-base-300 rounded-md shadow-lg py-1 min-w-[180px] max-w-[280px] text-sm focus:outline-none"
                    :style="{ left: finalX + 'px', top: finalY + 'px' }" @click.stop>
                    <template v-for="(item, idx) in items" :key="idx">
                        <li v-if="item.separator" role="separator" class="my-1 border-t border-base-200" />
                        <li role="none">
                            <button type="button" role="menuitem"
                                class="w-full text-left px-3 py-1.5 hover:bg-base-200 focus:bg-base-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                :class="{ 'text-error': item.danger }" :disabled="item.disabled"
                                :aria-disabled="item.disabled || undefined" @click="onClickItem(item)">
                                <component :is="item.icon" v-if="item.icon" class="h-4 w-4 shrink-0" />
                                <span class="truncate">{{ item.label }}</span>
                            </button>
                        </li>
                    </template>
                </ul>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.ctxmenu-enter-active,
.ctxmenu-leave-active {
    transition: opacity 0.12s ease, transform 0.12s ease;
}

.ctxmenu-enter-from,
.ctxmenu-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
