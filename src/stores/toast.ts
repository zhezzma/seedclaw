import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
    id: string
    type: ToastType
    message: string
    duration?: number
}

export const useToastStore = defineStore('toast', () => {
    const toasts = ref<Toast[]>([])
    let idCounter = 0

    const remove = (id: string) => {
        const index = toasts.value.findIndex(t => t.id === id)
        if (index > -1) {
            toasts.value.splice(index, 1)
        }
    }

    const add = (message: string, type: ToastType = 'info', duration = 3000) => {
        const id = `toast-${Date.now()}-${idCounter++}`
        toasts.value.push({ id, type, message, duration })

        if (duration > 0) {
            setTimeout(() => {
                remove(id)
            }, duration)
        }
        return id
    }

    const success = (message: string, duration?: number) => add(message, 'success', duration)
    const error = (message: string, duration?: number) => add(message, 'error', duration)
    const info = (message: string, duration?: number) => add(message, 'info', duration)
    const warning = (message: string, duration?: number) => add(message, 'warning', duration)
    const clear = () => (toasts.value = [])

    return {
        toasts,
        add,
        remove,
        success,
        error,
        info,
        warning,
        clear
    }
})
