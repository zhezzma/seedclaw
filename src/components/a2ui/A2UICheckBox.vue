<script setup lang="ts">
/**
 * A2UI CheckBox 组件
 */
import { computed, inject, ref, watch } from 'vue'
import type { A2UIComponent, DynamicString, DynamicBoolean } from './types'
import { getWritePath, resolveDynamicBoolean } from '../../composables/useA2UIState'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!
const resolveBoolean = inject<(v: DynamicBoolean) => boolean>('a2ui-resolve-boolean')!
const handleDataUpdate = inject<(path: string, value: any) => void>('a2ui-handle-data-update')!

const label = computed(() => resolveString(props.comp.label))
const resolvedValue = computed(() => resolveBoolean(props.comp.value))

const localChecked = ref(resolvedValue.value)

watch(resolvedValue, (v) => {
  if (v !== localChecked.value) localChecked.value = v
})

function onChange(e: Event) {
  const target = e.target as HTMLInputElement
  localChecked.value = target.checked
  const path = getWritePath(props.comp.value)
  if (path) {
    handleDataUpdate(path, target.checked)
  }
}
</script>

<template>
  <label class="a2ui-checkbox flex items-center gap-2 cursor-pointer" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <input
      type="checkbox"
      :checked="localChecked"
      @change="onChange"
      class="checkbox checkbox-sm checkbox-primary"
    />
    <span class="label-text text-sm">{{ label }}</span>
  </label>
</template>
