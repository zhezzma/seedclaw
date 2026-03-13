<script setup lang="ts">
/**
 * A2UI AudioPlayer 组件
 */
import { computed, inject } from 'vue'
import type { A2UIComponent, DynamicString } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!

const url = computed(() => resolveString(props.comp.url))
const description = computed(() => resolveString(props.comp.description))
</script>

<template>
  <div class="a2ui-audio-player flex flex-col gap-1" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <span v-if="description" class="text-sm text-base-content/80">{{ description }}</span>
    <audio
      v-if="url"
      :src="url"
      controls
      class="w-full"
      preload="metadata"
    ></audio>
  </div>
</template>
