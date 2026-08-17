<script setup lang="ts">
/**
 * 扩展说明弹层：点击「说明」按钮时拉取扩展使用说明并渲染。
 * 说明内容来自服务端 GET /api/extensions/:id/usage：
 * 优先 extension.json 的 usage 字段，缺失/为空时回退该扩展目录下的 readme.md。
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet } from '../../composables/api-client'
import { useToast } from '../../composables/useToast'
import MarkdownRenderer from '../chat/MarkdownRenderer.vue'

const props = defineProps<{
    extensionId: string
    extensionName: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const toast = useToast()

const usage = ref('')
const loading = ref(false)

watch(
    () => props.extensionId,
    async (id) => {
        if (!id) return
        loading.value = true
        usage.value = ''
        try {
            const res = await apiGet<{ usage: string }>(`/api/extensions/${encodeURIComponent(id)}/usage`)
            usage.value = res.usage ?? ''
        } catch (e: any) {
            // 404 静默（无说明文档）：补本地提示
            if (e?.code === 404) toast.error(t('extensions.usageNotFound'))
            emit('close')
        } finally {
            loading.value = false
        }
    },
    { immediate: true },
)
</script>

<template>
    <div class="modal modal-open">
        <div class="modal-box max-w-3xl">
            <h3 class="font-bold text-lg mb-4">{{ t('extensions.usageTitle', { name: extensionName }) }}</h3>

            <div v-if="loading" class="flex justify-center p-8">
                <span class="loading loading-spinner"></span>
            </div>
            <div v-else class="max-h-[60vh] overflow-y-auto">
                <MarkdownRenderer :content="usage" />
            </div>

            <div class="modal-action">
                <button class="btn btn-ghost" @click="emit('close')">
                    {{ t('common.close') }}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" @click="emit('close')"></div>
    </div>
</template>