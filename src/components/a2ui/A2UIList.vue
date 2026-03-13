<script setup lang="ts">
/**
 * A2UI List 组件 - 列表布局
 */
import { computed, inject, type Component as VueComponent } from 'vue'
import type { A2UIComponent, ChildList } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveChildren = inject<(v: ChildList) => string[]>('a2ui-resolve-children')!
const getComponentById = inject<(id: string) => A2UIComponent | undefined>('a2ui-get-component')!
const getVueComponent = inject<(name: string) => VueComponent | null>('a2ui-get-vue-component')!

const childIds = computed(() => resolveChildren(props.comp.children))
const direction = computed(() => props.comp.direction || 'vertical')

const alignClass = computed(() => {
  const map: Record<string, string> = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  }
  return map[props.comp.align || 'stretch'] || 'items-stretch'
})
</script>

<template>
  <div
    class="a2ui-list flex gap-2"
    :class="[
      direction === 'horizontal' ? 'flex-row flex-wrap' : 'flex-col',
      alignClass
    ]"
    :style="comp.weight != null ? { flex: comp.weight } : undefined"
  >
    <template v-for="childId in childIds" :key="childId">
      <component
        v-if="getComponentById(childId) && getVueComponent(getComponentById(childId)!.component)"
        :is="getVueComponent(getComponentById(childId)!.component)!"
        :comp="getComponentById(childId)!"
      />
    </template>
  </div>
</template>
