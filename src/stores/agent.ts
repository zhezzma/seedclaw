import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export interface Agent {
    id: string
    name: string
    icon: string
    description: string
}

// Default agents list
const defaultAgents: Agent[] = [
    { id: 'hunyuan', name: 'Hunyuan', icon: '🤖', description: '腾讯混元大模型' },
    { id: 'gpt4', name: 'GPT-4', icon: '🧠', description: 'OpenAI 旗舰模型' },
    { id: 'claude', name: 'Claude', icon: '💬', description: 'Anthropic 智能助手' },
    { id: 'gemini', name: 'Gemini', icon: '✨', description: 'Google AI 模型' },
    { id: 'llama', name: 'Llama', icon: '🦙', description: 'Meta 开源模型' },
    { id: 'mistral', name: 'Mistral', icon: '🌪️', description: '高效开源模型' },
    { id: 'qwen', name: 'Qwen', icon: '🔮', description: '阿里通义千问' },
    { id: 'deepseek', name: 'DeepSeek', icon: '🔍', description: '深度求索 AI' },
    { id: 'gemini2', name: 'Gemini', icon: '✨', description: 'Google AI 模型' },
    { id: 'llama3', name: 'Llama', icon: '🦙', description: 'Meta 开源模型' },
    { id: 'mistral4', name: 'Mistral', icon: '🌪️', description: '高效开源模型' },
    { id: 'qwen5', name: 'Qwen', icon: '🔮', description: '阿里通义千问' },
    { id: 'deepseek6', name: 'DeepSeek', icon: '🔍', description: '深度求索 AI' },
]

export const useAgentStore = defineStore('agent', () => {
    const route = useRoute()
    const router = useRouter()

    // All available agents
    const agents = ref<Agent[]>(defaultAgents)

    // Current selected agent ID (from route query)
    const currentAgentId = computed(() => {
        return (route.query.agent as string) || defaultAgents[0].id
    })

    // Current selected agent object
    const currentAgent = computed(() => {
        return agents.value.find(a => a.id === currentAgentId.value) || agents.value[0]
    })

    // Select an agent (navigate with query param)
    const selectAgent = (agentId: string) => {
        router.push({ name: 'home', query: { agent: agentId } })
    }

    // Check if an agent is selected
    const isSelected = (agentId: string) => {
        return currentAgentId.value === agentId
    }

    return {
        agents,
        currentAgentId,
        currentAgent,
        selectAgent,
        isSelected
    }
})
