<script setup lang="ts">
/**
 * A2UI Image 组件
 * 渲染图片，支持多种尺寸变体和 object-fit
 */
import { computed, inject } from 'vue'
import type { A2UIComponent, DynamicString } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!

const url = computed(() => resolveString(props.comp.url))
const fit = computed(() => props.comp.fit || 'fill')
const variant = computed(() => props.comp.variant || 'mediumFeature')

const fitMap: Record<string, string> = {
  contain: 'object-contain',
  cover: 'object-cover',
  fill: 'object-fill',
  none: 'object-none',
  scaleDown: 'object-scale-down',
}

const variantClass = computed(() => {
  const map: Record<string, string> = {
    icon: 'w-6 h-6 rounded',
    avatar: 'w-10 h-10 rounded-full',
    smallFeature: 'w-20 h-20 rounded-lg',
    mediumFeature: 'w-40 h-40 rounded-lg',
    largeFeature: 'w-80 rounded-lg',
    header: 'w-full rounded-lg max-h-48',
  }
  return map[variant.value] || 'w-40 h-40 rounded-lg'
})
</script>

<template>
  <img
    v-if="url"
    :src="url"
    :class="[variantClass, fitMap[fit] || 'object-fill']"
    :style="comp.weight != null ? { flex: comp.weight } : undefined"
    class="a2ui-image"
    loading="lazy"
    :alt="comp.accessibility?.label || ''"
  />
</template>
