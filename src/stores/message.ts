import { defineStore } from 'pinia'

// ==================== Types ====================
export interface Message {
    id: number
    type: 'success' | 'info' | 'warning' | 'error'
    title: string
    content: string
    time: string
    read: boolean
}

// ==================== Constants ====================
const DEFAULT_MESSAGES: Message[] = [
    { id: 1, type: 'success', title: '连接成功', content: '已成功连接到 OpenClaw 网关', time: '刚刚', read: false },
    { id: 2, type: 'info', title: '系统通知', content: '新版本 v0.2.0 已发布，请及时更新', time: '5分钟前', read: false },
    { id: 3, type: 'warning', title: '令牌即将过期', content: '您的访问令牌将在 7 天后过期，请及时更换', time: '1小时前', read: true },
    { id: 4, type: 'info', title: '欢迎使用', content: '感谢使用 Seedclaw，有问题请联系我们', time: '昨天', read: true },
]

// ==================== Store ====================
export const useMessageStore = defineStore('message', {
    state: () => {
        return {
            messages: [...DEFAULT_MESSAGES] as Message[]
        }
    },

    getters: {
        unreadCount: (state) => state.messages.filter(m => !m.read).length
    },

    actions: {
        markAsRead(messageId: number) {
            const msg = this.messages.find(m => m.id === messageId)
            if (msg) msg.read = true
        },

        markAllAsRead() {
            this.messages.forEach(m => m.read = true)
        },

        addMessage(message: Omit<Message, 'id'>) {
            const newId = Math.max(...this.messages.map(m => m.id), 0) + 1
            this.messages.unshift({ ...message, id: newId })
        },

        deleteMessage(messageId: number) {
            const index = this.messages.findIndex(m => m.id === messageId)
            if (index > -1) this.messages.splice(index, 1)
        },

        clearAll() {
            this.messages = []
        }
    }
})
