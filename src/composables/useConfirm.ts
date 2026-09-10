import { reactive } from 'vue'

interface ConfirmState {
    show: boolean
    title: string
    message: string
    resolve: ((value: boolean) => void) | null
}

// Module-level singleton state
const state = reactive<ConfirmState>({
    show: false,
    title: '确认',
    message: '',
    resolve: null
})

const confirm = (message: string, title = '确认操作'): Promise<boolean> => {
    return new Promise((resolve) => {
        // 单槽：已有确认在等待时，旧确认被新确认顶替。按「取消」语义结清旧
        // promise（resolve(false)），而不是 reject：旧 promise 的调用方 catch 的是
        // 无参 rejection，会 toast 出「删除: undefined」之类的噪声（用户注意力
        // 已被新弹窗接管，旧流程按取消静默收尾才是对的）。
        if (state.show && state.resolve) {
            state.resolve(false)
        }

        state.message = message
        state.title = title
        state.show = true
        state.resolve = resolve
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
}


const _confirmState = Object.assign(state, {
    confirm,
    cancel,
    ok
})

export const useConfirm = () => _confirmState

