import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Session {
    id: number
    title: string
    hasNotification: boolean
    createdAt?: string
    agentId?: string
}

// Default sessions list (sample data)
const defaultSessions: Session[] = [
    { id: 1, title: '秋冬抗炎饮食食材推荐', hasNotification: true },
    { id: 2, title: '打招呼与问候交流', hasNotification: false },
    { id: 3, title: '日常问候与交流', hasNotification: false },
    { id: 4, title: '帮我生成图片:新春贺卡', hasNotification: false },
    { id: 5, title: '帮我生成图片:绿树毛毡小马', hasNotification: false },
    { id: 6, title: '秋冬抗炎饮食食材推荐', hasNotification: true },
    { id: 7, title: '打招呼与问候交流', hasNotification: false },
    { id: 8, title: '日常问候与交流', hasNotification: false },
    { id: 9, title: '帮我生成图片:新春贺卡', hasNotification: false },
    { id: 10, title: '帮我生成图片:绿树毛毡小马', hasNotification: false },
    { id: 11, title: '秋冬抗炎饮食食材推荐', hasNotification: true },
    { id: 12, title: '打招呼与问候交流', hasNotification: false },
    { id: 13, title: '日常问候与交流', hasNotification: false },
    { id: 14, title: '帮我生成图片:新春贺卡', hasNotification: false },
    { id: 15, title: '帮我生成图片:绿树毛毡小马', hasNotification: false },
]

export const useSessionStore = defineStore('session', () => {
    // All sessions
    const sessions = ref<Session[]>(defaultSessions)

    // Current session ID
    const currentSessionId = ref<number | null>(null)

    // Current session object
    const currentSession = computed(() => {
        if (!currentSessionId.value) return null
        return sessions.value.find(s => s.id === currentSessionId.value) || null
    })

    // Sessions with notifications
    const unreadCount = computed(() => {
        return sessions.value.filter(s => s.hasNotification).length
    })

    // Select a session
    const selectSession = (sessionId: number) => {
        currentSessionId.value = sessionId
        // Mark as read
        const session = sessions.value.find(s => s.id === sessionId)
        if (session) {
            session.hasNotification = false
        }
    }

    // Create new session
    const createSession = (title: string, agentId?: string) => {
        const newId = Math.max(...sessions.value.map(s => s.id), 0) + 1
        const newSession: Session = {
            id: newId,
            title,
            hasNotification: false,
            agentId,
            createdAt: new Date().toISOString()
        }
        sessions.value.unshift(newSession)
        currentSessionId.value = newId
        return newSession
    }

    // Delete session
    const deleteSession = (sessionId: number) => {
        const index = sessions.value.findIndex(s => s.id === sessionId)
        if (index > -1) {
            sessions.value.splice(index, 1)
            if (currentSessionId.value === sessionId) {
                currentSessionId.value = null
            }
        }
    }

    return {
        sessions,
        currentSessionId,
        currentSession,
        unreadCount,
        selectSession,
        createSession,
        deleteSession
    }
})
