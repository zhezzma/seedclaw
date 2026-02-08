<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigState } from '@/composables/useConfigState'
import { useUiSettingsStore } from '@/stores/setting'
import {
    ArrowLeftIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon
} from '@heroicons/vue/24/outline'

import ViewHeader from '@/components/ViewHeader.vue'

// Highlight.js
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
// Import styles as strings for dynamic injection
import darkTheme from 'highlight.js/styles/atom-one-dark.css?inline'
import lightTheme from 'highlight.js/styles/atom-one-light.css?inline'


hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)

const router = useRouter()
const state = useConfigState()
const configStore = useUiSettingsStore()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const preRef = ref<HTMLPreElement | null>(null)
const highlightedCode = ref('')
const currentThemeStyle = ref('')

onMounted(() => {
    state.configFormMode = 'raw'
    if (!state.configSnapshot) {
        state.loadConfig()
    }
})

// Watch theme to update style
watch(() => configStore.isDark, (isDark) => {
    currentThemeStyle.value = isDark ? darkTheme : lightTheme
}, { immediate: true })

// Watch configRaw to update highlight
watch(() => state.configRaw, (newVal) => {
    try {
        // Try to auto-detect, defaulting to JSON since that's likely the config format
        const result = hljs.highlightAuto(newVal || '', ['json', 'yaml'])
        highlightedCode.value = result.value
    } catch (e) {
        // Fallback to plain text if highlight fails
        highlightedCode.value = newVal || ''
    }
}, { immediate: true })


const handleScroll = () => {
    if (textareaRef.value && preRef.value) {
        preRef.value.scrollTop = textareaRef.value.scrollTop
        preRef.value.scrollLeft = textareaRef.value.scrollLeft
    }
}

const goBack = () => {
    router.back()
}

const handleSave = async () => {
    await state.saveConfig()
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Inject dynamic highlight.js theme -->
        <component :is="'style'" type="text/css">{{ currentThemeStyle }}</component>

        <!-- Header -->
        <ViewHeader title="配置管理" :show-back="true">
            <template #actions>
                <button @click="handleSave" class="btn btn-primary btn-sm" :disabled="state.configSaving">
                    <span v-if="state.configSaving" class="loading loading-spinner loading-xs"></span>
                    保存
                </button>
            </template>
        </ViewHeader>

        <!-- Content -->
        <div class="flex-1 p-4 overflow-hidden flex flex-col">
            <div v-if="state.lastError" class="alert alert-error mb-4">
                <ExclamationTriangleIcon class="w-6 h-6" />
                <span>{{ state.lastError }}</span>
            </div>

            <div v-if="state.configSnapshot" class="flex items-center gap-2 mb-2 text-sm text-base-content/60">
                <span>Hash: {{ state.configSnapshot.hash?.substring(0, 8) }}</span>
                <span v-if="state.configSnapshot.valid" class="text-success flex items-center gap-1">
                    <CheckCircleIcon class="w-4 h-4" /> Valid
                </span>
                <span v-else-if="state.configSnapshot.valid === false" class="text-error flex items-center gap-1">
                    <ExclamationTriangleIcon class="w-4 h-4" /> Invalid
                </span>
            </div>

            <div class="flex-1 relative rounded-lg border border-base-300 overflow-hidden code-editor-container"
                :class="configStore.isDark ? 'bg-[#282c34]' : 'bg-[#fafafa]'">
                <!-- Highlight Layer -->
                <pre ref="preRef" class="code-editor-pre" aria-hidden="true"><code class="hljs bg-transparent p-0"
                v-html="highlightedCode"></code></pre>

                <!-- Input Layer -->
                <textarea ref="textareaRef" v-model="state.configRaw" @scroll="handleScroll"
                    class="code-editor-textarea"
                    :class="configStore.isDark ? 'text-transparent caret-white' : 'text-transparent caret-black'"
                    spellcheck="false" placeholder="Loading configuration..."></textarea>
            </div>
        </div>
    </div>
</template>

<style scoped>
.code-editor-container {
    position: relative;
    /* Ensure container handles layout properly */
}

/* Shared styles for perfect alignment */
.code-editor-textarea,
.code-editor-pre {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 1rem;
    /* p-4 equivalent */
    border: none;
    overflow: auto;
    white-space: pre;
    /* Use 'pre' to avoid wrapping issues */
    word-wrap: normal;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.875rem;
    /* text-sm equivalent */
    line-height: 1.5;
    box-sizing: border-box;
    /* Crucial for padding */
}

.code-editor-textarea {
    z-index: 1;
    background: transparent;
    /* caret-color handled by class binding */
    resize: none;
    outline: none;
    /* Color: transparent is important to hide the text so hljs shows through */
    color: transparent;
}

.code-editor-pre {
    z-index: 0;
    pointer-events: none;
    /* Let clicks pass through to textarea */
}

.code-editor-pre code {
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    white-space: inherit;
    /* Ensure code block respects pre whitespace */
}

/* Fix selection visibility */
::selection {
    background-color: rgba(150, 150, 150, 0.3);
    color: transparent;
}
</style>
