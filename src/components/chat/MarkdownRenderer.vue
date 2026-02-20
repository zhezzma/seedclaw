<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import md from '../../utils/markdown/markdown'

const props = defineProps<{
    content: string
    asUser?: boolean
}>()

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
            renderedHtml.value = syncHtml
        }

        // Second pass: async worker render (if needed for complex features or just to be safe)
        // In many cases sync render is enough, but worker might have more features enabled
        const workerHtml = await md.render(text || '')
        if (workerHtml && workerHtml !== syncHtml) {
            renderedHtml.value = workerHtml
        }
    } catch (error) {
        console.error('Markdown render error:', error)
        // Fallback to basic text or sync render
        renderedHtml.value = md.renderSync(text || '')
    } finally {
        isRendering.value = false
    }
}

watch(() => props.content, (newContent) => {
    renderContent(newContent)
}, { immediate: true })

onMounted(() => {
    renderContent(props.content)
})
</script>

<template>
    <div class="markdown-body" :class="{ 'user-message': asUser }" v-html="renderedHtml"></div>
</template>

<style scoped>
/* Force white text for user messages, overriding markdown-body specifics */
.user-message {
    color: white !important;
}

.user-message :deep(*) {
    color: white !important;
}
</style>
