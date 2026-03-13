<script setup lang="ts">
/**
 * A2UI Button 组件
 * 支持 default/primary/borderless 变体和 Action 触发
 */
import { computed, inject, type Component as VueComponent } from 'vue'
import type { A2UIComponent, Action } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const getComponentById = inject<(id: string) => A2UIComponent | undefined>('a2ui-get-component')!
const getVueComponent = inject<(name: string) => VueComponent | null>('a2ui-get-vue-component')!
const handleAction = inject<(action: Action) => void>('a2ui-handle-action')!

const variant = computed(() => props.comp.variant || 'default')

const btnClass = computed(() => {
  const map: Record<string, string> = {
    default: 'btn',
    primary: 'btn btn-primary',
    borderless: 'btn btn-ghost',
  }
  return map[variant.value] || 'btn'
})

const childComp = computed(() => {
  if (!props.comp.child) return null
  return getComponentById(props.comp.child)
})

const childVueComp = computed(() => {
  if (!childComp.value) return null
  return getVueComponent(childComp.value.component)
})

function onClick() {
  if (props.comp.action) {
    handleAction(props.comp.action)
  }
}
</script>

<template>
  <button
    :class="btnClass"
    class="a2ui-button btn-sm gap-1"
    :style="comp.weight != null ? { flex: comp.weight } : undefined"
    @click="onClick"
  >
    <component
      v-if="childComp && childVueComp"
      :is="childVueComp"
      :comp="childComp"
    />
  </button>
</template>
