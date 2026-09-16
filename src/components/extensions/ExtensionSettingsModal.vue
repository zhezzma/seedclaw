<script setup lang="ts">
/**
 * 扩展设置弹层：A2UIFormDialog 的固定端点包装。
 * （v1.0 版本校验 / ChoicePicker 级联 RPC 等通用能力统一由 A2UIFormDialog 承载。）
 */
import { useI18n } from 'vue-i18n'
import A2UIFormDialog from './A2UIFormDialog.vue'

const props = defineProps<{
    extensionId: string
    extensionName: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
</script>

<template>
    <A2UIFormDialog
        :title="t('extensions.settingsTitle', { name: extensionName })"
        :load-url="`/api/extensions/${encodeURIComponent(extensionId)}/settings`"
        :save-url="`/api/extensions/${encodeURIComponent(extensionId)}/settings`"
        @close="emit('close')"
    />
</template>
