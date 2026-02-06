import { reactive, computed } from 'vue'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
    id: string
    type: ToastType
    message: string
    duration?: number
}

// Module-level singleton state
const toasts = reactive<Toast[]>([])
let idCounter = 0

// Actions
const remove = (id: string) => {
    const index = toasts.findIndex(t => t.id === id)
    if (index > -1) {
        toasts.splice(index, 1)
    }
}

const add = (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = `toast-${Date.now()}-${idCounter++}`
    toasts.push({ id, type, message, duration })

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
const clear = () => (toasts.length = 0)

export const useToast = () => {
    return {
        // Return computed for readonly access to array, or just reference to reactive array?
        // To match storeToRefs reference, we might want to expose it as `toasts`.
        // If we conform to previous API: `const { toasts } = storeToRefs(store)`
        // New API: `const { toasts } = useToast()` where toasts is the reactive array.
        // Or should it be a computed?
        // Let's return the reactive array directly.
        toasts: computed(() => toasts), // Readonly view safer? MessagePlugin creates v-for on it.
        add,
        remove,
        success,
        error,
        info,
        warning,
        clear
    }
}
