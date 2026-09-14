<!-- 输入框上方唯一扩展挂载点：按 registry 顺序渲染各 widget，
     显隐由 widget 组件内部条件决定（无数据时根节点 v-if 不渲染）。 -->
<script setup lang="ts">
import PendingQueueBar from './PendingQueueBar.vue'
import TodoBar from './TodoBar.vue'
import { getChatDockWidgets, registerChatDockWidget } from './chat-dock-registry'

registerChatDockWidget({ id: 'pending-queue', order: 10, component: PendingQueueBar })
registerChatDockWidget({ id: 'todo', order: 20, component: TodoBar })

const widgets = getChatDockWidgets()
</script>

<template>
    <template v-for="w in widgets" :key="w.id">
        <component :is="w.component" />
    </template>
</template>
