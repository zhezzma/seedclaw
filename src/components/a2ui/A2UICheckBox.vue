<script setup lang="ts">
/**
 * A2UI CheckBox 组件
 */
import { computed, inject, ref, watch } from 'vue'
import type { A2UIComponent, DynamicString, DynamicBoolean } from './types'
import { getWritePath } from '../../composables/useA2UIState'

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

const errorMessage = computed(() => {
  if (!props.comp.checks || props.comp.checks.length === 0) return ''
  for (const check of props.comp.checks) {
    if (!resolveBoolean(check.condition)) return check.message
  }
  return ''
})
</script>

<template>
  <div class="a2ui-checkbox form-control" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <label class="flex items-center gap-2 cursor-pointer w-fit">
      <input
        type="checkbox"
        :checked="localChecked"
        @change="onChange"
        class="checkbox checkbox-sm checkbox-primary"
        :class="{ 'checkbox-error': errorMessage }"
      />
      <span class="label-text text-sm">{{ label }}</span>
    </label>
    <label v-if="errorMessage" class="label pb-0">
      <span class="label-text-alt text-error font-medium">{{ errorMessage }}</span>
    </label>
  </div>
</template>
