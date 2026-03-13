<script setup lang="ts">
/**
 * A2UI Divider 组件
 */
import { computed } from 'vue'
import type { A2UIComponent } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const axis = computed(() => props.comp.axis || 'horizontal')
</script>

<template>
  <div
    class="a2ui-divider divider"
    :class="axis === 'vertical' ? 'divider-horizontal' : ''"
    :style="comp.weight != null ? { flex: comp.weight } : undefined"
  ></div>
</template>
