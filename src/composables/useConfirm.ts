import { reactive, toRefs } from 'vue'

interface ConfirmState {
    show: boolean
    title: string
    message: string
    resolve: ((value: boolean) => void) | null
    reject: (() => void) | null
}

// Module-level singleton state
const state = reactive<ConfirmState>({
    show: false,
    title: '确认',
    message: '',
    resolve: null,
    reject: null
})

const confirm = (message: string, title = '确认操作'): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        // If there's already a confirmation pending, reject it or handle it?
        // Simple approach: Overwrite it (or could reject previous)
        if (state.show && state.reject) {
            state.reject()
        }

        state.message = message
        state.title = title
        state.show = true
        state.resolve = resolve
        state.reject = reject
    })
}

const cancel = () => {
    if (state.resolve) {
        state.resolve(false)
    }
    reset()
}

const ok = () => {
    if (state.resolve) {
        state.resolve(true)
    }
    reset()
}

const reset = () => {
    state.show = false
    state.message = ''
    state.title = ''
    state.resolve = null
    state.reject = null
}

export const useConfirm = () => {
    return {
        ...toRefs(state),
        confirm,
        cancel,
        ok
    }
}
