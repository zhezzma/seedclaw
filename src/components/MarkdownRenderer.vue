<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import md from '../utils/markdown'

const props = defineProps<{
    content: string
}>()

const renderedHtml = ref('')
const isRendering = ref(false)

const renderContent = async (text: string) => {
    isRendering.value = true
    try {
        renderedHtml.value = await md.render(text || '')
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
    <div class="markdown-body " v-html="renderedHtml"></div>
</template>

<style></style>
