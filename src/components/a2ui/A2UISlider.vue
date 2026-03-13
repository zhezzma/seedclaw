<script setup lang="ts">
/**
 * A2UI Slider 组件
 */
import { computed, inject, ref, watch } from 'vue'
import type { A2UIComponent, DynamicString, DynamicNumber, DynamicBoolean } from './types'
import { getWritePath } from '../../composables/useA2UIState'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!
const resolveNumber = inject<(v: DynamicNumber) => number>('a2ui-resolve-number')!
const resolveBoolean = inject<(v: DynamicBoolean) => boolean>('a2ui-resolve-boolean')!
const handleDataUpdate = inject<(path: string, value: any) => void>('a2ui-handle-data-update')!

const label = computed(() => resolveString(props.comp.label))
const min = computed(() => props.comp.min ?? 0)
const max = computed(() => props.comp.max ?? 100)
const resolvedValue = computed(() => resolveNumber(props.comp.value))

const localValue = ref(resolvedValue.value)

watch(resolvedValue, (v) => {
  if (v !== localValue.value) localValue.value = v
})

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  const numVal = Number(target.value)
  localValue.value = numVal
  const path = getWritePath(props.comp.value)
  if (path) {
    handleDataUpdate(path, numVal)
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
  <div class="a2ui-slider form-control w-full" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <label v-if="label" class="label">
      <span class="label-text text-sm">{{ label }}</span>
      <span class="label-text-alt text-xs text-base-content/60">{{ localValue }}</span>
    </label>
    <input
      type="range"
      :min="min"
      :max="max"
      :value="localValue"
      @input="onInput"
      class="range range-sm range-primary"
    />
    <div class="flex justify-between text-xs text-base-content/40 px-1 mt-0.5" :class="{ 'text-error': errorMessage }">
      <span>{{ min }}</span>
      <span>{{ max }}</span>
    </div>
    <label v-if="errorMessage" class="label pb-0">
      <span class="label-text-alt text-error font-medium">{{ errorMessage }}</span>
    </label>
  </div>
</template>
