import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Message {
    id: number
    type: 'success' | 'info' | 'warning' | 'error'
    title: string
    content: string
    time: string
    read: boolean
}

// Default messages list (sample data)
const defaultMessages: Message[] = [
    {
        id: 1,
        type: 'success',
        title: '连接成功',
        content: '已成功连接到 OpenClaw 网关',
        time: '刚刚',
        read: false
    },
    {
        id: 2,
        type: 'info',
        title: '系统通知',
        content: '新版本 v0.2.0 已发布，请及时更新',
        time: '5分钟前',
        read: false
    },
    {
        id: 3,
        type: 'warning',
        title: '令牌即将过期',
        content: '您的访问令牌将在 7 天后过期，请及时更换',
        time: '1小时前',
        read: true
    },
    {
        id: 4,
        type: 'info',
        title: '欢迎使用',
        content: '感谢使用 Seedclaw，有问题请联系我们',
        time: '昨天',
        read: true
    },
]

export const useMessageStore = defineStore('message', () => {
    // All messages
    const messages = ref<Message[]>(defaultMessages)

    // Unread count
    const unreadCount = computed(() => {
        return messages.value.filter(m => !m.read).length
    })

    // Mark message as read
    const markAsRead = (messageId: number) => {
        const msg = messages.value.find(m => m.id === messageId)
        if (msg) {
            msg.read = true
        }
    }

    // Mark all as read
    const markAllAsRead = () => {
        messages.value.forEach(m => m.read = true)
    }

    // Add new message
    const addMessage = (message: Omit<Message, 'id'>) => {
        const newId = Math.max(...messages.value.map(m => m.id), 0) + 1
        messages.value.unshift({
            ...message,
            id: newId
        })
    }

    // Delete message
    const deleteMessage = (messageId: number) => {
        const index = messages.value.findIndex(m => m.id === messageId)
        if (index > -1) {
            messages.value.splice(index, 1)
        }
    }

    // Clear all messages
    const clearAll = () => {
        messages.value = []
    }

    return {
        messages,
        unreadCount,
        markAsRead,
        markAllAsRead,
        addMessage,
        deleteMessage,
        clearAll
    }
})
