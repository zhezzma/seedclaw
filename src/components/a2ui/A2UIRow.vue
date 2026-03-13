<script setup lang="ts">
/**
 * A2UI Row 组件 - 水平布局
 */
import { computed, inject, type Component as VueComponent } from 'vue'
import type { A2UIComponent, ChildList } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveChildren = inject<(v: ChildList) => string[]>('a2ui-resolve-children')!
const getComponentById = inject<(id: string) => A2UIComponent | undefined>('a2ui-get-component')!
const getVueComponent = inject<(name: string) => VueComponent | null>('a2ui-get-vue-component')!

const childIds = computed(() => resolveChildren(props.comp.children))

const justifyClass = computed(() => {
  const map: Record<string, string> = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    spaceAround: 'justify-around',
    spaceBetween: 'justify-between',
    spaceEvenly: 'justify-evenly',
    stretch: 'justify-stretch',
  }
  return map[props.comp.justify || 'start'] || 'justify-start'
})

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
    class="a2ui-row flex flex-row gap-2 flex-wrap"
    :class="[justifyClass, alignClass]"
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
