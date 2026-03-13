<script setup lang="ts">
/**
 * A2UI Modal 组件
 * trigger 组件点击后打开 content 组件
 */
import { computed, inject, ref, type Component as VueComponent } from 'vue'
import type { A2UIComponent } from './types'

const props = defineProps<{ comp: A2UIComponent }>()

const getComponentById = inject<(id: string) => A2UIComponent | undefined>('a2ui-get-component')!
const getVueComponent = inject<(name: string) => VueComponent | null>('a2ui-get-vue-component')!

const isOpen = ref(false)

// Trigger 组件
const triggerComp = computed(() => {
  if (!props.comp.trigger) return null
  return getComponentById(props.comp.trigger)
})
const triggerVueComp = computed(() => {
  if (!triggerComp.value) return null
  return getVueComponent(triggerComp.value.component)
})

// Content 组件
const contentComp = computed(() => {
  if (!props.comp.content) return null
  return getComponentById(props.comp.content)
})
const contentVueComp = computed(() => {
  if (!contentComp.value) return null
  return getVueComponent(contentComp.value.component)
})

function openModal() {
  isOpen.value = true
}

function closeModal() {
  isOpen.value = false
}
</script>

<template>
  <div class="a2ui-modal inline" :style="comp.weight != null ? { flex: comp.weight } : undefined">
    <!-- Trigger -->
    <div @click="openModal" class="cursor-pointer inline">
      <component
        v-if="triggerComp && triggerVueComp"
        :is="triggerVueComp"
        :comp="triggerComp"
      />
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="isOpen"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          @click.self="closeModal"
        >
          <div class="bg-base-100 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto border border-base-300 p-5 relative">
            <!-- 关闭按钮 -->
            <button
              @click="closeModal"
              class="btn btn-ghost btn-sm btn-circle absolute top-2 right-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <!-- 内容 -->
            <div class="mt-2">
              <component
                v-if="contentComp && contentVueComp"
                :is="contentVueComp"
                :comp="contentComp"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
