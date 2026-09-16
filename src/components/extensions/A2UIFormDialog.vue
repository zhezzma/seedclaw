<script setup lang="ts">
/**
 * 通用 a2ui 表单弹层：从 loadUrl 拉取服务端声明的 a2ui 组件树并渲染，
 * 保存时把 dataModel 整体 POST 到 saveUrl。
 *
 * 与 ExtensionSettingsModal 同构（纯表单模式：树内不含 event/functionCall 组件，
 * A2UIRenderer 的 @action 不接线），差别仅在端点由调用方传入——用于扩展设置表单
 * 体系之外的其他声明式表单（如子代理的扩展挂载表单）。
 * 错误提示由 api-client 统一 toast（400 不在静默白名单）。
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiGet, apiPost } from '../../composables/api-client'
import { useToast } from '../../composables/useToast'
import { A2UIRenderer } from '../a2ui'

const props = defineProps<{
    title: string
    loadUrl: string
    saveUrl: string
}>()

const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const { t } = useI18n()
const toast = useToast()

const components = ref<any[]>([])
const dataModel = ref<Record<string, any>>({})
const loading = ref(false)
const saving = ref(false)

watch(
    () => props.loadUrl,
    async (url) => {
        if (!url) return
        loading.value = true
        components.value = []
        dataModel.value = {}
        try {
            const form = await apiGet<{ components: any[]; dataModel: Record<string, any> }>(url)
            components.value = form.components ?? []
            dataModel.value = form.dataModel ?? {}
        } catch (e: any) {
            // 加载失败：非静默错误已由 api-client 弹出；404 静默补本地提示后关闭
            if (e?.code === 404) toast.error(t('extensions.settingsLoadFailed'))
            emit('close')
        } finally {
            loading.value = false
        }
    },
    { immediate: true },
)

async function save() {
    saving.value = true
    try {
        await apiPost(props.saveUrl, {
            dataModel: dataModel.value,
        })
        toast.success(t('extensions.saveSuccess'))
        emit('saved')
        emit('close')
    } catch {
        // 保存失败（含服务端校验 message）：toast 已弹出，弹层保持打开供修正
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <div class="modal modal-open">
        <div class="modal-box max-w-2xl">
            <h3 class="font-bold text-lg mb-4">{{ title }}</h3>

            <div v-if="loading" class="flex justify-center p-8">
                <span class="loading loading-spinner"></span>
            </div>
            <div v-else class="max-h-[60vh] overflow-y-auto">
                <A2UIRenderer :components="components" :data-model="dataModel" :root-ids="['root']" />
            </div>

            <div class="modal-action">
                <button class="btn btn-ghost" :disabled="saving" @click="emit('close')">
                    {{ t('extensions.cancel') }}
                </button>
                <button class="btn btn-primary" :disabled="saving || loading" @click="save">
                    <span v-if="saving" class="loading loading-spinner loading-xs"></span>
                    {{ t('extensions.save') }}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" @click="!saving && emit('close')"></div>
    </div>
</template>
