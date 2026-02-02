<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
    SparklesIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()

// Sample agents list
const agents = ref([
    { id: 1, name: 'Hunyuan', icon: '🤖', description: '腾讯混元大模型' },
    { id: 2, name: 'GPT-4', icon: '🧠', description: 'OpenAI 旗舰模型' },
    { id: 3, name: 'Claude', icon: '💬', description: 'Anthropic 智能助手' },
    { id: 4, name: 'Gemini', icon: '✨', description: 'Google AI 模型' },
    { id: 5, name: 'Llama', icon: '🦙', description: 'Meta 开源模型' },
    { id: 6, name: 'Mistral', icon: '🌪️', description: '高效开源模型' },
    { id: 7, name: 'Qwen', icon: '🔮', description: '阿里通义千问' },
    { id: 8, name: 'DeepSeek', icon: '🔍', description: '深度求索 AI' },
])

const selectAgent = (agentName: string) => {
    // Navigate to home with selected agent
    router.push({ name: 'home', query: { agent: agentName } })
}
</script>

<template>
    <div class="flex flex-col h-screen bg-base-200">
        <!-- Header - fixed -->
        <div class="shrink-0 navbar bg-base-100 border-b border-base-300">
            <div class="flex-1">
                <span class="text-lg font-semibold px-4">智能体</span>
            </div>
        </div>

        <!-- Content - scrollable -->
        <div class="flex-1 overflow-y-auto p-4 pb-20">
            <!-- Agents Grid -->
            <div class="grid grid-cols-1 gap-3">
                <div v-for="agent in agents" :key="agent.id" @click="selectAgent(agent.name)"
                    class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]">
                    <div class="card-body p-4 flex-row items-center gap-4">
                        <div class="text-3xl">{{ agent.icon }}</div>
                        <div class="flex-1">
                            <h3 class="font-semibold">{{ agent.name }}</h3>
                            <p class="text-sm text-base-content/60">{{ agent.description }}</p>
                        </div>
                        <SparklesIcon class="h-5 w-5 text-primary opacity-50" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
