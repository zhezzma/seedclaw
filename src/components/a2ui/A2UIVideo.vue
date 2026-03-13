<script setup lang="ts">
/**
 * A2UI Video 组件
 */
import { computed, inject } from 'vue'
import type { A2UIComponent, DynamicString } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!

const url = computed(() => resolveString(props.comp.url))
</script>

<template>
  <video
    v-if="url"
    :src="url"
    controls
    class="a2ui-video w-full rounded-lg max-h-80"
    :style="comp.weight != null ? { flex: comp.weight } : undefined"
    preload="metadata"
  ></video>
</template>
