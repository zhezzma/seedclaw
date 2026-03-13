<script setup lang="ts">
/**
 * A2UI Text 组件
 * 渲染文本内容，支持 h1-h5/caption/body 变体
 */
import { computed, inject } from 'vue'
import type { A2UIComponent, DynamicString } from './types'
import MarkdownRenderer from '../chat/MarkdownRenderer.vue'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!

const text = computed(() => resolveString(props.comp.text))
const variant = computed(() => props.comp.variant || 'body')

const tagMap: Record<string, string> = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5',
  caption: 'span', body: 'div',
}

const tag = computed(() => tagMap[variant.value] || 'div')

const variantClass = computed(() => {
  const map: Record<string, string> = {
    h1: 'text-3xl font-bold',
    h2: 'text-2xl font-bold',
    h3: 'text-xl font-semibold',
    h4: 'text-lg font-semibold',
    h5: 'text-base font-medium',
    caption: 'text-xs text-base-content/60',
    body: 'text-sm',
  }
  return map[variant.value] || 'text-sm'
})

/** 检测是否包含 markdown 语法 */
const hasMarkdown = computed(() => /[*_`#\[\]!|~>-]/.test(text.value))
</script>

<template>
  <component :is="tag" class="a2ui-text" :class="variantClass" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <MarkdownRenderer v-if="hasMarkdown" :content="text" />
    <template v-else>{{ text }}</template>
  </component>
</template>
