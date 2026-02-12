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

import { useGateway } from '../composables/useGateway'
import { useI18n } from 'vue-i18n'


const router = useRouter()
const state = useConfigState()
const configStore = useUiSettingsStore()
const store = useGateway()
const { t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const preRef = ref<HTMLPreElement | null>(null)





const handleScroll = () => {
    if (textareaRef.value && preRef.value) {
        preRef.value.scrollTop = textareaRef.value.scrollTop
        preRef.value.scrollLeft = textareaRef.value.scrollLeft
    }
}


const handleSave = async () => {
    await state.saveConfig()
}
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">

        <!-- Header -->
        <ViewHeader :title="$t('config.title')">
            <template #actions>
                <button @click="handleSave" class="btn btn-primary btn-sm" :disabled="state.configSaving">
                    <span v-if="state.configSaving" class="loading loading-spinner loading-xs"></span>
                    {{ $t('common.save') }}
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
                    <CheckCircleIcon class="w-4 h-4" /> {{ $t('config.valid') }}
                </span>
                <span v-else-if="state.configSnapshot.valid === false" class="text-error flex items-center gap-1">
                    <ExclamationTriangleIcon class="w-4 h-4" /> {{ $t('config.invalid') }}
                </span>
            </div>

            <div class="flex-1 relative rounded-lg border border-base-300 overflow-hidden code-editor-container"
                :class="configStore.isDark ? 'bg-[#282c34]' : 'bg-[#fafafa]'">

                <!-- Input Layer -->
                <textarea ref="textareaRef" v-model="state.configRaw" @scroll="handleScroll"
                    class="code-editor-textarea" :class="configStore.isDark ? ' caret-white' : 'caret-black'"
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
.code-editor-textarea {
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
    background: transparent;
    /* caret-color handled by class binding */
    resize: none;
    outline: none;
}


/* Fix selection visibility */
::selection {
    background-color: rgba(150, 150, 150, 0.3);
    /* color: transparent;*/
}
</style>
