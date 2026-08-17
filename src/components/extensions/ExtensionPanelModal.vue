<script setup lang="ts">
/**
 * 扩展面板弹层：按 extension.json 声明的 panel.type 分发到客户端内置面板组件（panel-registry）。
 * 未知类型显示提示文案。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { getExtensionPanel } from './panel-registry'

const props = defineProps<{
    extensionId: string
    extensionName: string
    panelType: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()

// 响应式分发：宿主换目标时随 panelType 变化（配合 ExtensionsView 的 :key 重建）
const panel = computed(() => getExtensionPanel(props.panelType))
</script>

<template>
    <div class="modal modal-open">
        <div class="modal-box max-w-md">
            <h3 class="font-bold text-lg mb-4">{{ t('extensions.panelTitle', { name: extensionName }) }}</h3>

            <component :is="panel.component" v-if="panel" :extension-id="extensionId" />
            <p v-else class="text-sm text-base-content/60">
                {{ t('extensions.unknownPanelType', { type: panelType }) }}
            </p>

            <div class="modal-action">
                <button class="btn btn-ghost" @click="emit('close')">
                    {{ t('common.close') }}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" @click="emit('close')"></div>
    </div>
</template>
