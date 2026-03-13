<script setup lang="ts">
/**
 * A2UI Card 组件 - 卡片容器
 */
import { computed, inject, type Component as VueComponent } from 'vue'
import type { A2UIComponent } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const getComponentById = inject<(id: string) => A2UIComponent | undefined>('a2ui-get-component')!
const getVueComponent = inject<(name: string) => VueComponent | null>('a2ui-get-vue-component')!

const childComp = computed(() => {
  if (!props.comp.child) return null
  return getComponentById(props.comp.child)
})

const childVueComp = computed(() => {
  if (!childComp.value) return null
  return getVueComponent(childComp.value.component)
})
</script>

<template>
  <div
    class="a2ui-card card bg-base-100 shadow-sm border border-base-300 rounded-xl"
    :style="comp.weight != null ? { flex: comp.weight } : undefined"
  >
    <div class="card-body p-4">
      <component
        v-if="childComp && childVueComp"
        :is="childVueComp"
        :comp="childComp"
      />
    </div>
  </div>
</template>
