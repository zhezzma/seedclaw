/**
 * 扩展面板类型注册表：extension.json panel.type → 客户端内置面板（组件 + 入口图标）。
 * 新增面板类型：在此注册并在 i18n 补充文案；未知类型回退 PuzzlePieceIcon + 弹层内提示。
 */
import type { Component } from 'vue'
import { PuzzlePieceIcon, QrCodeIcon } from '@heroicons/vue/24/outline'
import QrLoginPanel from './panels/QrLoginPanel.vue'

export interface ExtensionPanelEntry {
    component: Component
    icon: Component
    /** 面板入口按钮的 i18n 标题键；缺省回退 extensions.panel */
    labelKey?: string
}

const panelRegistry: Record<string, ExtensionPanelEntry> = {
    'qr-login': { component: QrLoginPanel, icon: QrCodeIcon, labelKey: 'extensions.qrLogin.label' },
}

/** 按 panelType 查注册表；未知类型返回 undefined（弹层内显示提示文案）。 */
export function getExtensionPanel(type: string): ExtensionPanelEntry | undefined {
    return panelRegistry[type]
}

/** 入口按钮图标：注册表优先，未知类型回退通用拼图图标。 */
export function getExtensionPanelIcon(type: string): Component {
    return panelRegistry[type]?.icon ?? PuzzlePieceIcon
}

/** 入口按钮标题的 i18n 键：注册表优先，缺省回退通用「面板」。 */
export function getExtensionPanelTitleKey(type: string): string {
    return panelRegistry[type]?.labelKey ?? 'extensions.panel'
}
