import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
    // Sidebar drawer state (for mobile)
    const isSidebarOpen = ref(false)

    function toggleSidebar() {
        isSidebarOpen.value = !isSidebarOpen.value
    }

    function openSidebar() {
        isSidebarOpen.value = true
    }

    function closeSidebar() {
        isSidebarOpen.value = false
    }

    return {
        isSidebarOpen,
        toggleSidebar,
        openSidebar,
        closeSidebar
    }
})
