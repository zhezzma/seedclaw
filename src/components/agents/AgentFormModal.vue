<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useGateway } from '../../composables/useGateway'
import { useConfigState } from '../../composables/useConfigState'
import { useToast } from '../../composables/useToast'
import { useI18n } from 'vue-i18n'

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

const gatewayStore = useGateway()
const configStore = useConfigState()
const toast = useToast()
const { t } = useI18n()

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

const modalTitle = computed(() => props.mode === 'add' ? t('agent.addTitle') : t('agent.editTitle'))
const submitLabel = computed(() => props.mode === 'add' ? t('agent.form.random') : t('common.save'))

const isFormValid = computed(() => {
    return formData.value.id.trim() && formData.value.agentName.trim()
})

const handleSubmit = async () => {
    if (!isFormValid.value) return

    const agentId = formData.value.id.trim()

    // Validate ID format (only for add mode)
    if (props.mode === 'add') {
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(agentId)) {
            toast.error(t('agent.form.idError'))
            return
        }
    }

    // Get current agents list from configState
    const currentList = ((configStore.configForm?.agents as any)?.list as any[]) || []

    if (props.mode === 'add') {
        // Check for duplicate ID
        if (currentList.some((a: any) => a.id === agentId)) {
            toast.error(t('agent.form.idExists'))
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
        configStore.updateConfigFormValue(['agents', 'list'], updatedList)
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
        configStore.updateConfigFormValue(['agents', 'list'], updatedList)
    }

    await configStore.saveConfig()
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
                        <span class="label-text">{{ $t('agent.form.id') }} <span class="text-error">*</span></span>
                    </label>
                    <input v-model="formData.id" type="text" :placeholder="$t('agent.form.idPlaceholder')"
                        class="input input-bordered w-full font-mono" :disabled="mode === 'edit'" />
                </div>

                <div class="form-control">
                    <label class="label"><span class="label-text">{{ $t('agent.form.name') }} <span
                                class="text-error">*</span></span></label>
                    <input v-model="formData.agentName" type="text" :placeholder="$t('agent.form.namePlaceholder')"
                        class="input input-bordered w-full" />
                </div>

                <div class="divider text-xs">{{ $t('agent.form.identitySection') }}</div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text">{{ $t('agent.form.identityName') }}</span>
                        <span class="label-text-alt text-base-content/50">{{ $t('common.optional') }}</span>
                    </label>
                    <input v-model="formData.identityName" type="text"
                        :placeholder="$t('agent.form.identityNamePlaceholder')" class="input input-bordered w-full" />
                </div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text">{{ $t('agent.form.identityTheme') }}</span>
                        <span class="label-text-alt text-base-content/50">{{ $t('common.optional') }}</span>
                    </label>
                    <input v-model="formData.identityTheme" type="text" :placeholder="$t('agent.form.themePlaceholder')"
                        class="input input-bordered w-full" />
                </div>

                <div class="form-control">
                    <label class="label">
                        <span class="label-text">{{ $t('agent.form.emoji') }}</span>
                    </label>
                    <div class="join w-full">
                        <input v-model="formData.identityEmoji" type="text"
                            class="input input-bordered join-item flex-1 text-2xl text-center" maxlength="2" />
                        <button type="button" @click="randomizeEmoji" class="btn join-item">🎲 {{
                            $t('agent.form.random') }}</button>
                    </div>
                </div>
            </div>

            <div class="modal-action">
                <button @click="handleClose" class="btn">{{ $t('common.cancel') }}</button>
                <button @click="handleSubmit" class="btn btn-primary" :disabled="!isFormValid">{{ submitLabel
                }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="handleClose">close</button>
        </form>
    </dialog>
</template>
