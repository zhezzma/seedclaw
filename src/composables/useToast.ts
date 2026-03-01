import { reactive, computed } from 'vue'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface Toast {
    id: string
    type: ToastType
    message: string
    duration?: number
    onClick?: () => void
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

const add = (message: string, type: ToastType = 'info', optionsOrDuration: number | ToastOptions | undefined = 3000) => {
    const id = `toast-${Date.now()}-${idCounter++}`

    let duration = 3000
    let onClick: undefined | (() => void)

    if (typeof optionsOrDuration === 'number') {
        duration = optionsOrDuration
    } else if (typeof optionsOrDuration === 'object') {
        duration = optionsOrDuration.duration ?? 3000
        onClick = optionsOrDuration.onClick
    }

    toasts.push({ id, type, message, duration, onClick })

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

export interface ToastOptions {
    duration?: number
    onClick?: () => void
}


const _toastState = {
    toasts: computed(() => toasts),
    add,
    remove,
    success: (message: string, options?: number | ToastOptions) => add(message, 'success', options),
    error: (message: string, options?: number | ToastOptions) => add(message, 'error', options),
    info: (message: string, options?: number | ToastOptions) => add(message, 'info', options),
    warning: (message: string, options?: number | ToastOptions) => add(message, 'warning', options),
    clear
}

export const useToast = () => _toastState

