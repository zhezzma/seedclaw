<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import md from '../../utils/markdown/markdown'
import { resolveMarkdownImageUrls } from '../../utils/media-url'
import { useUiSettingsStore } from '../../stores/setting'

const props = defineProps<{
    content: string
}>()

const settings = useUiSettingsStore()
const renderedHtml = ref('')
const isRendering = ref(false)

const renderContent = async (text: string) => {
    isRendering.value = true
    try {
        // First pass: synchronous render to avoid layout shift/flash
        // This ensures content is visible immediately
        const syncHtml = md.renderSync(text || '')

        // Use sync render immediately to feel responsive
        if (syncHtml) {
            renderedHtml.value = resolveMarkdownImageUrls(syncHtml, settings.apiBaseUrl)
        }

        // Second pass: async worker render (if needed for complex features or just to be safe)
        // In many cases sync render is enough, but worker might have more features enabled
        const workerHtml = await md.render(text || '')
        if (workerHtml && workerHtml !== syncHtml) {
            renderedHtml.value = resolveMarkdownImageUrls(workerHtml, settings.apiBaseUrl)
        }
    } catch (error) {
        console.error('Markdown render error:', error)
        // Fallback to basic text or sync render
        renderedHtml.value = resolveMarkdownImageUrls(md.renderSync(text || ''), settings.apiBaseUrl)
    } finally {
        isRendering.value = false
    }
}

watch([() => props.content, () => settings.apiBaseUrl], ([newContent]) => {
    renderContent(newContent)
}, { immediate: true })

onMounted(() => {
    renderContent(props.content)
})
</script>

<template>
    <div class="markdown-body" v-html="renderedHtml"></div>
</template>
