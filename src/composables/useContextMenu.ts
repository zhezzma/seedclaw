/**
 * Workspace 通用上下文菜单状态。模块级单例：同一时刻只允许一个菜单打开。
 *
 * - PC：行 `@contextmenu.prevent` → openAt({x,y})
 * - 移动端：行尾 kebab 按钮 @click → openAtElement(buttonEl)
 *
 * 菜单内 action 自己负责调 close()；点击 overlay / Esc 也会触发 close。
 *
 * 不设折叠 / 嵌套子菜单 —— spec 里这一轮只做扁平的复制 + 发到 chat。
 */
import { reactive, markRaw, type Component } from 'vue'

export interface ContextMenuItem {
    /** 显示文案 */
    label: string
    /** 可选 heroicon */
    icon?: Component
    /** 点击执行；执行后菜单自动关 */
    action: () => void | Promise<void>
    /** 渲染前置分隔线（视觉分组） */
    separator?: boolean
    /** 禁用态（如目录上禁用「引用内容」） */
    disabled?: boolean
    /** 危险操作（红色文字），第一阶段用不到，预留 */
    danger?: boolean
}

interface MenuState {
    visible: boolean
    items: ContextMenuItem[]
    /** 视口坐标；左上角对齐这个点（菜单内自适应防溢出） */
    x: number
    y: number
    /** 触发元素（如 kebab）：用于菜单关闭后返回焦点，满足 a11y。 */
    triggerEl: HTMLElement | null
}

const state = reactive<MenuState>({
    visible: false,
    items: [],
    x: 0,
    y: 0,
    triggerEl: null,
})

const _methods = {
    /** 鼠标右键场景：用 clientX/clientY。triggerEl 设为当前 activeElement，
     *  菜单关闭后焦点返回。 */
    openAt(items: ContextMenuItem[], pos: { x: number; y: number }) {
        state.items = items
        state.x = pos.x
        state.y = pos.y
        // 仅当 HTMLElement 全局可用且当前 activeElement 是元素时记录。
        // markRaw 避免 Vue 把 DOM 节点包成响应式 proxy。
        const ae = (typeof document !== 'undefined') ? document.activeElement : null
        state.triggerEl = (
            typeof HTMLElement !== 'undefined'
            && ae instanceof HTMLElement
        ) ? markRaw(ae) : null
        state.visible = true
    },
    /** 移动端 kebab 按钮场景：菜单左边对齐按钮右边，顶部对齐按钮下方。
     *  kebab 永远在行尾，这个 anchor 几乎总会被 ContextMenu 内的 viewport-flip
     *  继续微调到“菜单右下角贴近视口右下”，这是预期行为。 */
    openAtElement(items: ContextMenuItem[], el: HTMLElement) {
        const rect = el.getBoundingClientRect()
        state.items = items
        state.x = rect.right
        state.y = rect.bottom + 4
        // markRaw：避免 DOM 元素被转成响应式 proxy，使调用方能拿到原始引用
        state.triggerEl = markRaw(el)
        state.visible = true
    },
    close() {
        const trigger = state.triggerEl
        state.visible = false
        state.items = []
        state.triggerEl = null
        // a11y：菜单关闭后焦点返回触发元素（如 kebab），避免焦点丢给 body。
        // 仅在元素仍在 DOM 中且可聚焦时返回。
        if (
            trigger
            && typeof document !== 'undefined'
            && document.contains(trigger)
            && typeof trigger.focus === 'function'
        ) {
            try { trigger.focus() } catch { /* ignore */ }
        }
    },
}

const _ctxMenuState = Object.assign(state, _methods)

export const useContextMenu = () => _ctxMenuState
