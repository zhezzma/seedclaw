import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export const useThemeStore = defineStore('theme', () => {
    // Get initial theme from localStorage or system preference
    const getInitialTheme = (): 'light' | 'dark' => {
        const saved = localStorage.getItem('theme')
        if (saved === 'light' || saved === 'dark') {
            return saved
        }
        // Check system preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark'
        }
        return 'light'
    }

    const theme = ref<'light' | 'dark'>(getInitialTheme())
    const isDark = ref(theme.value === 'dark')

    // Apply theme to document
    const applyTheme = (newTheme: 'light' | 'dark') => {
        document.documentElement.setAttribute('data-theme', newTheme)
        localStorage.setItem('theme', newTheme)
    }

    // Toggle between light and dark
    const toggleTheme = () => {
        theme.value = theme.value === 'dark' ? 'light' : 'dark'
        isDark.value = theme.value === 'dark'
        applyTheme(theme.value)
    }

    // Initialize theme on load
    applyTheme(theme.value)

    // Watch for system preference changes
    watch(theme, (newTheme) => {
        applyTheme(newTheme)
    })

    return {
        theme,
        isDark,
        toggleTheme
    }
})
