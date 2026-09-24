<script setup lang="ts">
import AppSidebar from '../components/AppSidebar.vue'
</script>

<template>
    <div class="h-full bg-base-100 flex flex-col">
        <!-- Sidebar drawer (Mobile)：全局唯一抽屉节点，所有移动端视图共享。
             ChatHeader（主页）用 label for="sidebar-drawer" 开，
             AppSidebar 的 closeSidebarDrawer 用 getElementById 关 —— label/元素均按 id
             文档级寻址，不要求同组件树。 -->
        <div class="drawer lg:hidden absolute inset-0 pointer-events-none z-100">
            <input id="sidebar-drawer" type="checkbox" class="drawer-toggle pointer-events-auto" />
            <div class="drawer-side pointer-events-auto h-full">
                <label for="sidebar-drawer" :aria-label="$t('common.closeSidebar')" class="drawer-overlay app-backdrop"></label>
                <div class="w-80 h-full bg-base-200">
                    <AppSidebar />
                </div>
            </div>
        </div>

        <!-- Main content -->
        <div class="flex-1 min-h-0">
            <router-view />
        </div>
    </div>
</template>
