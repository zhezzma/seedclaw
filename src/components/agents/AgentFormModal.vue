<script setup lang="ts">
import { ref, watch, computed } from 'vue'
// import { useConfigState } from '../../composables/useConfigState'
import { useAgentsState } from '../../composables/useAgentsState'
import { useToast } from '../../composables/useToast'
import { useI18n } from 'vue-i18n'
import { ArrowPathIcon } from '@heroicons/vue/24/outline'

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

// const configStore = useConfigState()
const agentsState = useAgentsState()
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

const isBusy = ref(false)

// Random emoji list
const AGENT_EMOJIS = ['🤖', '🦥', '🦊', '🐱', '🐶', '🦉', '🐼', '🚀', '🎯', '💡', '🔥', '🌈', '🎨', '🎭']

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

const isFormValid = computed(() => {
    if (props.mode === 'add' && !formData.value.id.trim()) return false
    return true
})

const submitLabel = computed(() => {
    return isBusy.value ? t('common.saving') : (props.mode === 'add' ? t('common.create') : t('common.save'))
})

const handleClose = () => {
    emit('close')
}

const submitForm = async () => {
    if (!isFormValid.value) return
    isBusy.value = true
    try {
        const identity = {
            name: formData.value.identityName,
            theme: formData.value.identityTheme,
            emoji: formData.value.identityEmoji
        }

        if (props.mode === 'add') {
            await agentsState.createAgent({
                id: formData.value.id,
                name: formData.value.agentName,
                // Cast to any to pass extra fields if backend supports it
                // @ts-ignore
                identity: identity
            })
        } else {
            await agentsState.updateAgent({
                agentId: formData.value.id,
                name: formData.value.agentName,
                // @ts-ignore
                identity: identity
            })
        }

        emit('saved', formData.value.id)
        emit('close')
    } catch (e: any) {
        toast.error(e.message || String(e))
    } finally {
        isBusy.value = false
    }
}
</script>

<template>
    <div :class="{ 'modal': true, 'modal-open': show }">
        <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">{{ mode === 'add' ? $t('agent.addTitle') : $t('agent.editTitle') }}</h3>

            <div class="form-control w-full mb-4">
                <label class="label">
                    <span class="label-text">{{ $t('agent.id') }}</span>
                </label>
                <input v-model="formData.id" type="text" :placeholder="$t('agent.idPlaceholder')"
                    class="input input-bordered w-full" :disabled="mode === 'edit'" />
                <label class="label" v-if="mode === 'add'">
                    <span class="label-text-alt opacity-70">{{ $t('agent.idHelp') }}</span>
                </label>
            </div>

            <div class="form-control w-full mb-4">
                <label class="label">
                    <span class="label-text">{{ $t('agent.name') }}</span>
                </label>
                <input v-model="formData.agentName" type="text" :placeholder="$t('agent.namePlaceholder')"
                    class="input input-bordered w-full" />
            </div>

            <div class="divider">{{ $t('agent.identity') }}</div>

            <div class="form-control w-full mb-4">
                <label class="label">
                    <span class="label-text">{{ $t('agent.identityName') }}</span>
                </label>
                <input v-model="formData.identityName" type="text" :placeholder="$t('agent.identityNamePlaceholder')"
                    class="input input-bordered w-full" />
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text">{{ $t('agent.emoji') }}</span>
                    </label>
                    <div class="join w-full">
                        <input v-model="formData.identityEmoji" type="text"
                            class="input input-bordered w-full join-item text-center text-xl" />
                        <button class="btn join-item" @click="randomizeEmoji" :title="$t('common.random')">
                            <ArrowPathIcon class="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div class="form-control w-full">
                    <label class="label">
                        <span class="label-text">{{ $t('agent.theme') }}</span>
                    </label>
                    <input v-model="formData.identityTheme" type="text" placeholder="e.g. dark"
                        class="input input-bordered w-full" />
                </div>
            </div>

            <div class="modal-action">
                <button class="btn" @click="handleClose">{{ $t('common.cancel') }}</button>
                <button class="btn btn-primary" @click="submitForm" :disabled="!isFormValid || isBusy">
                    <span v-if="isBusy" class="loading loading-spinner"></span>
                    {{ submitLabel }}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" @click="handleClose">
            <button class="cursor-default">close</button>
        </div>
    </div>
</template>
