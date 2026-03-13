<script setup lang="ts">
/**
 * A2UI Tabs 组件
 * 使用 DaisyUI tabs
 */
import { computed, inject, ref, type Component as VueComponent } from 'vue'
import type { A2UIComponent, DynamicString } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const resolveString = inject<(v: DynamicString) => string>('a2ui-resolve-string')!
const getComponentById = inject<(id: string) => A2UIComponent | undefined>('a2ui-get-component')!
const getVueComponent = inject<(name: string) => VueComponent | null>('a2ui-get-vue-component')!

const tabs = computed(() => {
  return (props.comp.tabs || []).map((tab: any, index: number) => ({
    title: resolveString(tab.title),
    child: tab.child,
    index,
  }))
})

const activeIndex = ref(0)

const activeChild = computed(() => {
  const tab = tabs.value[activeIndex.value]
  if (!tab) return null
  return getComponentById(tab.child)
})

const activeChildVueComp = computed(() => {
  if (!activeChild.value) return null
  return getVueComponent(activeChild.value.component)
})
</script>

<template>
  <div class="a2ui-tabs w-full" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <!-- Tab 头部 -->
    <div role="tablist" class="tabs tabs-bordered tabs-sm">
      <a
        v-for="tab in tabs"
        :key="tab.index"
        role="tab"
        class="tab transition-colors"
        :class="{ 'tab-active': activeIndex === tab.index }"
        @click="activeIndex = tab.index"
      >
        {{ tab.title }}
      </a>
    </div>
    <!-- Tab 内容 -->
    <div class="pt-3">
      <component
        v-if="activeChild && activeChildVueComp"
        :is="activeChildVueComp"
        :comp="activeChild"
      />
    </div>
  </div>
</template>
