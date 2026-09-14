// 输入框上方 dock 区的 widget 注册表：轻量、按 order 排序渲染。
// widget 组件必须自含数据源（从全局 store 取数），容器不传 props —— 这是
// "扩展自包含" 约定，未来 cron/审批等扩展按同一约定填槽。
import { markRaw, type Component } from 'vue'

export interface ChatDockWidget {
    /** 稳定 id，重复注册幂等跳过 */
    id: string
    /** 越小越靠上 */
    order: number
    component: Component
}

const registry: ChatDockWidget[] = []

export function registerChatDockWidget(def: ChatDockWidget): void {
    if (registry.some((w) => w.id === def.id)) return
    registry.push({ ...def, component: markRaw(def.component) })
    registry.sort((a, b) => a.order - b.order)
}

export function getChatDockWidgets(): readonly ChatDockWidget[] {
    return registry
}
