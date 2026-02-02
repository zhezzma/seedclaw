<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import {
    Bars3Icon,
    SpeakerXMarkIcon,
    PhoneIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ChevronDownIcon,
    CameraIcon,
    MicrophoneIcon,
    PlusIcon,
    CheckIcon,
    SunIcon,
    MoonIcon
} from '@heroicons/vue/24/outline'
import { useThemeStore } from '../stores/theme'
import { useAgentStore } from '../stores/agent'

const inputText = ref('')
const dropdownRef = ref<HTMLDetailsElement | null>(null)
const themeStore = useThemeStore()
const agentStore = useAgentStore()

// Chat messages
interface Message {
    id: number
    role: 'user' | 'assistant'
    content: string
    avatar?: string
    time?: string
}

const messages = ref<Message[]>([
    { id: 1, role: 'user', content: '你好，请帮我介绍一下你自己', time: '10:30' },
    { id: 2, role: 'assistant', content: '你好！我是 Seedclaw，一个智能助手。我可以帮你聊天、写作、搜索信息等。有什么我可以帮助你的吗？', time: '10:30' },
    { id: 3, role: 'user', content: '你能做什么？', time: '10:31' },
    { id: 4, role: 'assistant', content: '我可以帮你完成很多任务：\n\n1. **聊天交流** - 陪你聊天，回答问题\n2. **写作辅助** - 帮你写文章、邮件、代码等\n3. **信息搜索** - 帮你查找和整理信息\n4. **创意生成** - 帮你生成图片、头脑风暴\n5. **翻译润色** - 多语言翻译和文本优化\n\n还有更多功能等你发现！', time: '10:31' },
    { id: 5, role: 'user', content: '你好，请帮我介绍一下你自己', time: '10:30' },
    { id: 6, role: 'assistant', content: '你好！我是 Seedclaw，一个智能助手。我可以帮你聊天、写作、搜索信息等。有什么我可以帮助你的吗？', time: '10:30' },
    { id: 7, role: 'user', content: '你能做什么？', time: '10:31' },
    { id: 8, role: 'assistant', content: '我可以帮你完成很多任务：\n\n1. **聊天交流** - 陪你聊天，回答问题\n2. **写作辅助** - 帮你写文章、邮件、代码等\n3. **信息搜索** - 帮你查找和整理信息\n4. **创意生成** - 帮你生成图片、头脑风暴\n5. **翻译润色** - 多语言翻译和文本优化\n\n还有更多功能等你发现！', time: '10:31' },
])

const selectAgent = (agentId: string) => {
    agentStore.selectAgent(agentId)
    if (dropdownRef.value) {
        dropdownRef.value.open = false
    }
}

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
        dropdownRef.value.open = false
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
    <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="navbar bg-base-100 border-b border-base-300">
            <!-- Hamburger menu (mobile only) -->
            <div class="flex-none lg:hidden">
                <label for="sidebar-drawer" class="btn btn-square btn-ghost drawer-button">
                    <Bars3Icon class="h-5 w-5" />
                </label>
            </div>
            <div class="flex-1">
                <!-- Agent dropdown -->
                <details class="dropdown" ref="dropdownRef">
                    <summary class="btn btn-ghost btn-sm gap-1 list-none">
                        <span class="font-semibold">{{ agentStore.currentAgent.name }}</span>
                        <ChevronDownIcon class="h-4 w-4" />
                    </summary>
                    <ul class="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg">
                        <li v-for="agent in agentStore.agents" :key="agent.id">
                            <a @click="selectAgent(agent.id)" class="flex justify-between items-center"
                                :class="{ 'active': agentStore.isSelected(agent.id) }">
                                <span>{{ agent.name }}</span>
                                <CheckIcon v-if="agentStore.isSelected(agent.id)" class="h-4 w-4" />
                            </a>
                        </li>
                    </ul>
                </details>
            </div>
            <!-- Mobile buttons -->
            <div class="flex-none flex gap-1 lg:hidden">
                <button class="btn btn-ghost btn-circle btn-sm">
                    <SpeakerXMarkIcon class="h-5 w-5" />
                </button>
                <button class="btn btn-ghost btn-circle btn-sm">
                    <PhoneIcon class="h-5 w-5" />
                </button>
                <button class="btn btn-ghost btn-circle btn-sm">
                    <ChatBubbleOvalLeftEllipsisIcon class="h-5 w-5" />
                </button>
            </div>
            <!-- PC theme toggle button -->
            <div class="flex-none hidden lg:flex gap-2">
                <button @click="themeStore.toggleTheme()" class="btn btn-ghost btn-circle btn-sm">
                    <SunIcon v-if="themeStore.isDark" class="h-5 w-5" />
                    <MoonIcon v-else class="h-5 w-5" />
                </button>
            </div>
        </div>

        <!-- Main content area -->
        <div class="flex-1 flex flex-col min-h-0">
            <!-- Welcome message when no messages -->
            <div v-if="messages.length === 0" class="flex-1 flex flex-col items-center justify-center p-4">
                <div class="text-center">
                    <h1 class="text-3xl font-bold mb-2">Hi, 欢迎使用 Seedclaw</h1>
                    <p class="text-base-content/60">我是 Seedclaw，聊天、写作、搜索都在行，助你灵感无限</p>
                </div>
            </div>

            <!-- Chat messages - only this area scrolls -->
            <div v-else class="flex-1 overflow-y-auto p-4">
                <div class="space-y-4 max-w-3xl mx-auto w-full">
                    <div v-for="msg in messages" :key="msg.id" class="chat"
                        :class="msg.role === 'user' ? 'chat-end' : 'chat-start'">
                        <!-- Avatar -->
                        <div class="chat-image avatar">
                            <div class="w-10 rounded-full bg-base-300 flex items-center justify-center">
                                <span v-if="msg.role === 'user'" class="text-lg">👤</span>
                                <span v-else class="text-lg">🤖</span>
                            </div>
                        </div>
                        <!-- Header -->
                        <div class="chat-header opacity-70 text-xs mb-1">
                            {{ msg.role === 'user' ? '你' : agentStore.currentAgent.name }}
                            <time v-if="msg.time" class="ml-1">{{ msg.time }}</time>
                        </div>
                        <!-- Bubble -->
                        <div class="chat-bubble whitespace-pre-wrap"
                            :class="msg.role === 'user' ? 'chat-bubble-primary' : ''">
                            {{ msg.content }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Input area -->
        <div class="p-4 border-t border-base-300 mb-16 lg:mb-0">
            <div class="flex items-center gap-2 bg-base-200 rounded-full px-4 py-2">
                <button class="btn btn-ghost btn-circle btn-sm">
                    <CameraIcon class="h-5 w-5" />
                </button>
                <input v-model="inputText" type="text" placeholder="发消息或按住说话..."
                    class="flex-1 bg-transparent border-none outline-none text-sm" />
                <button class="btn btn-ghost btn-circle btn-sm">
                    <MicrophoneIcon class="h-5 w-5" />
                </button>
                <button class="btn btn-ghost btn-circle btn-sm">
                    <PlusIcon class="h-5 w-5" />
                </button>
            </div>
        </div>
    </div>
</template>
