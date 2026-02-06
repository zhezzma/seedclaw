<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useGatewayStore } from '../../stores/gateway'

const props = defineProps<{
    show: boolean
    mode: 'add' | 'edit'
    agentData?: {
        id: string
        name?: string
        identity?: {
            name?: string
            theme?: string
            emoji?: string
        }
    }
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', agentId: string): void
}>()

const gatewayStore = useGatewayStore()

// Form data
const formData = ref({
    id: '',
    agentName: '',
    identityName: '',
    identityTheme: '',
    identityEmoji: '🤖'
})

// Random emoji list
const AGENT_EMOJIS = ['🤖', '🦥', '🦊', '🐱', '🐶', '🦉', '🐼', '🦋', '🌟', '⚡', '🚀', '🎯', '💡', '🔥', '✨', '🌈', '🎨', '🎭', '🧠', '💎']

const generateRandomEmoji = () => {
    return AGENT_EMOJIS[Math.floor(Math.random() * AGENT_EMOJIS.length)]
}

const randomizeEmoji = () => {
    formData.value.identityEmoji = generateRandomEmoji()
}

// Watch for show changes to reset/populate form
watch(() => props.show, (newVal) => {
    if (newVal) {
        if (props.mode === 'edit' && props.agentData) {
            // Populate form with existing data
            formData.value = {
                id: props.agentData.id,
                agentName: props.agentData.name || '',
                identityName: props.agentData.identity?.name || '',
                identityTheme: props.agentData.identity?.theme || '',
                identityEmoji: props.agentData.identity?.emoji || '🤖'
            }
        } else {
            // Reset form for add mode
            formData.value = {
                id: '',
                agentName: '',
                identityName: '',
                identityTheme: '',
                identityEmoji: generateRandomEmoji()
            }
        }
    }
})

const modalTitle = computed(() => props.mode === 'add' ? '添加智能体' : '编辑智能体')
const submitLabel = computed(() => props.mode === 'add' ? '添加' : '保存')

const isFormValid = computed(() => {
    return formData.value.id.trim() && formData.value.agentName.trim()
})

const handleSubmit = async () => {
    if (!isFormValid.value) return

    const agentId = formData.value.id.trim()

    // Validate ID format (only for add mode)
    if (props.mode === 'add') {
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(agentId)) {
            alert('智能体 ID 必须以英文字母开头，只能包含英文字母、数字、下划线和连字符')
            return
        }
    }

    // Get current agents list
    const currentList = ((gatewayStore.configForm?.agents as any)?.list as any[]) || []

    if (props.mode === 'add') {
        // Check for duplicate ID
        if (currentList.some((a: any) => a.id === agentId)) {
            alert('智能体 ID 已存在，请使用其他 ID')
            return
        }

        // Create new agent config
        const newAgentConfig = {
            id: agentId,
            name: formData.value.agentName.trim(),
            identity: {
                name: formData.value.identityName.trim() || undefined,
                theme: formData.value.identityTheme.trim() || undefined,
                emoji: formData.value.identityEmoji
            }
        }

        // Add to list
        const updatedList = [...currentList, newAgentConfig]
        gatewayStore.updateConfigFormValue(['agents', 'list'], updatedList)
    } else {
        // Edit mode: update existing agent
        const updatedList = currentList.map((a: any) => {
            if (a.id === agentId) {
                return {
                    ...a,
                    name: formData.value.agentName.trim(),
                    identity: {
                        ...a.identity,
                        name: formData.value.identityName.trim() || undefined,
                        theme: formData.value.identityTheme.trim() || undefined,
                        emoji: formData.value.identityEmoji
                    }
                }
            }
            return a
        })
        gatewayStore.updateConfigFormValue(['agents', 'list'], updatedList)
    }

    await gatewayStore.saveConfig()
    emit('saved', agentId)
    emit('close')
}

const handleClose = () => {
    emit('close')
}
</script>

<template>
    <dialog :class="{ 'modal modal-open': show, 'modal': !show }">
        <div class="modal-box max-w-md">
            <h3 class="font-bold text-lg mb-6">{{ modalTitle }}</h3>

            <div class="space-y-4">
                <div class="form-control">
                    <label class="label">
                        <span class="label-text">智能体 ID <span class="text-error">*</span></span>
                    </label>
                    <input v-model="formData.id" type="text" placeholder="例如: main"
                        class="input input-bordered w-full font-mono" :disabled="mode === 'edit'" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">智能体名称 <span class="text-error">*</span></span></label>
                    <input v-model="formData.agentName" type="text" placeholder="例如: 主助手"
                        class="input input-bordered w-full" />
                </div>

                <div class="divider text-xs">身份设置</div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text">身份名称</span>
                        <span class="label-text-alt text-base-content/50">可选</span>
                    </label>
                    <input v-model="formData.identityName" type="text" placeholder="例如: Samantha"
                        class="input input-bordered w-full" />
                </div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text">主题/身份描述</span>
                        <span class="label-text-alt text-base-content/50">可选</span>
                    </label>
                    <input v-model="formData.identityTheme" type="text" placeholder="例如: helpful sloth"
                        class="input input-bordered w-full" />
                </div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text">Emoji</span>
                    </label>
                    <div class="join w-full">
                        <input v-model="formData.identityEmoji" type="text"
                            class="input input-bordered join-item flex-1 text-2xl text-center" maxlength="2" />
                        <button type="button" @click="randomizeEmoji" class="btn join-item">🎲 随机</button>
                    </div>
                </div>
            </div>

            <div class="modal-action">
                <button @click="handleClose" class="btn">取消</button>
                <button @click="handleSubmit" class="btn btn-primary" :disabled="!isFormValid">{{ submitLabel
                }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="handleClose">close</button>
        </form>
    </dialog>
</template>
