<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useAgentsState } from '../../composables/useAgentsState'
import { useModelsState } from '../../composables/useModelsState'
import { useToast } from '../../composables/useToast'
import { useI18n } from 'vue-i18n'
import {
    ArrowPathIcon,
    PhotoIcon,
    XMarkIcon,
    UserCircleIcon,
    IdentificationIcon,
    SparklesIcon,
    CpuChipIcon,
    FaceSmileIcon,
    TagIcon,
    SwatchIcon
} from '@heroicons/vue/24/outline'
import WorkspacePathField from '../workspace/WorkspacePathField.vue'
import type { WorkspaceResolvePayload } from '../../composables/useWorkspaceBinding'


const props = defineProps<{
    show: boolean
    mode: 'add' | 'edit'
    agentData?: any
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', agentId: string): void
}>()

const agentsState = useAgentsState()
const modelsState = useModelsState()
const toast = useToast()
const { t } = useI18n()



// Available models (already a ComputedRef from useModelsState)
const availableModels = modelsState.availableModels

// Form data
const formData = ref({
    id: '',
    name: '',
    description: '',
    defaultModel: '',
    defaultProvider: '',
    workspaceDir: '',
    identityName: '',
    identityCreature: '',
    identityVibe: '',
    identityEmoji: '🤖',
    avatarFile: null as File | null,
    avatarPreview: ''
})

// Workspace 联动预填（spec §5.1）：校验通过后按 basename 预填 id/name，
// 仅当对应字段为空且未被用户手动改过时生效（touched 脏标记防覆盖）。
const workspaceFieldRef = ref<InstanceType<typeof WorkspacePathField> | null>(null)
const idTouched = ref(false)
const nameTouched = ref(false)

// 新建模式「信任并启用」勾选：路径含 .pi 信任要求配置时展示，
// 勾选则以 workspaceTrust=trust 随创建请求持久化信任决策（免创建后再信任）
const workspaceTrustRequiring = ref(false)
const workspaceTrustChecked = ref(true)

const slugOf = (b: string) => b.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")

const onWorkspaceValidated = ({ basename, result }: { basename: string; result: WorkspaceResolvePayload | null }) => {
    // 校验失败/清空时 result 为 null，需同步复位勾选可见性
    workspaceTrustRequiring.value = !!result?.pi?.trustRequiring
    if (!basename) return
    // 字段联动（spec §5.1）：仅当字段为空且未被手动改过时预填
    if (props.mode === 'add' && !idTouched.value && !formData.value.id) {
        const slug = slugOf(basename)
        if (slug) formData.value.id = slug
    }
    if (!nameTouched.value && !formData.value.name) formData.value.name = basename
}

const isBusy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// Load models if not loaded
onMounted(() => {
    if (modelsState.providers.value.length === 0) {
        modelsState.loadModels()
    }
})

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
        // Reset file input
        if (fileInput.value) fileInput.value.value = ''

        if (props.mode === 'edit' && props.agentData) {
            // Populate form with existing data
            const identity = props.agentData.identity || {}
            formData.value = {
                id: props.agentData.id,
                name: props.agentData.name || '',
                description: props.agentData.description || '',
                defaultModel: props.agentData.defaultModel || '',
                defaultProvider: props.agentData.defaultProvider || '',
                // 必须用 raw 原始值（服务端 GET 详情提供 workspaceDirRaw）；
                // 用解析/规范化值会把默认 agent 一保存就绑到自身 workspace
                workspaceDir: props.agentData?.workspaceDirRaw || '',
                identityName: identity.name || '',
                identityCreature: identity.creature || '',
                // Map theme to vibe if vibe is empty, compatible with old data
                identityVibe: identity.vibe || identity.theme || '',
                identityEmoji: identity.emoji || '🤖',
                avatarFile: null,
                avatarPreview: props.agentData.avatar || ''
            }
            idTouched.value = false
            nameTouched.value = false
            workspaceTrustRequiring.value = false
        } else {
            // Reset form for add mode
            formData.value = {
                id: '',
                name: '',
                description: '',
                defaultModel: '',
                defaultProvider: '',
                workspaceDir: '',
                identityName: '',
                identityCreature: '',
                identityVibe: '',
                identityEmoji: generateRandomEmoji(),
                avatarFile: null,
                avatarPreview: ''
            }
            idTouched.value = false
            nameTouched.value = false
            workspaceTrustRequiring.value = false
            workspaceTrustChecked.value = true
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

const headerTitle = computed(() => {
    return props.mode === 'add' ? t('agent.addTitle') : t('agent.editTitle')
})

const handleClose = () => {
    emit('close')
}

// Model selection helper
const selectedModelValue = computed({
    get: () => {
        if (formData.value.defaultProvider && formData.value.defaultModel) {
            return `${formData.value.defaultProvider}/${formData.value.defaultModel}`
        }
        return formData.value.defaultModel || ''
    },
    set: (val: string) => {
        if (!val) {
            formData.value.defaultProvider = ''
            formData.value.defaultModel = ''
            return
        }
        if (val.includes('/')) {
            const [p, ...m] = val.split('/')
            formData.value.defaultProvider = p
            formData.value.defaultModel = m.join('/')
        } else {
            formData.value.defaultModel = val
        }
    }
})

const triggerFileInput = () => {
    fileInput.value?.click()
}

const handleFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement
    if (input.files && input.files[0]) {
        const file = input.files[0]
        formData.value.avatarFile = file

        const reader = new FileReader()
        reader.onload = (e) => {
            formData.value.avatarPreview = e.target?.result as string
        }
        reader.readAsDataURL(file)
    }
}

const submitForm = async () => {
    if (!isFormValid.value) return
    isBusy.value = true
    try {
        const data = new FormData()
        data.append('id', formData.value.id)

        // Append fields if they have value
        if (formData.value.name) data.append('name', formData.value.name)
        if (formData.value.description) data.append('description', formData.value.description)
        if (formData.value.defaultModel) data.append('defaultModel', formData.value.defaultModel)
        if (formData.value.defaultProvider) data.append('defaultProvider', formData.value.defaultProvider)

        // workspaceDirRaw 契约守卫：当前网关的编辑详情必含 workspaceDirRaw，此时始终
        // append（空串 = 明确解除绑定）；仅旧网关载荷缺该字段且表单值为空（未触碰）时
        // 不 append，避免无关编辑（改名/头像）把既有绑定静默清掉。
        if (formData.value.workspaceDir || 'workspaceDirRaw' in (props.agentData ?? {})) {
            data.append('workspaceDir', formData.value.workspaceDir || '')
        }

        // 新建 + 勾选「信任并启用」：随创建请求提交 workspaceTrust=trust，
        // 服务端仅在 workspaceDir 非空且校验通过时接受。
        // 守卫须与勾选框渲染条件同谓词：路径改为非信任要求目录后 requiring 复位、
        // 勾选框隐藏，残留的 checked=true 不得再随请求提交 trust。
        if (props.mode === 'add' && formData.value.workspaceDir && workspaceTrustRequiring.value && workspaceTrustChecked.value) {
            data.append('workspaceTrust', 'trust')
        }

        if (formData.value.identityName) data.append('identityName', formData.value.identityName)
        if (formData.value.identityCreature) data.append('identityCreature', formData.value.identityCreature)
        if (formData.value.identityVibe) data.append('identityVibe', formData.value.identityVibe)
        if (formData.value.identityEmoji) data.append('identityEmoji', formData.value.identityEmoji)

        if (formData.value.avatarFile) {
            data.append('avatar', formData.value.avatarFile)
        }

        if (props.mode === 'add') {
            await agentsState.createAgent(data)
        } else {
            await agentsState.updateAgent(data)
        }

        emit('saved', formData.value.id)
        emit('close')
    } catch (e: any) {
        toast.error(e.message || String(e))
    } finally {
        isBusy.value = false
    }
}

// Mobile check for responsive adjustments if needed
// DaisyUI modal is responsive by default, but we ensure full width on mobile
</script>

<template>
    <div :class="{ 'modal': true, 'modal-open': show }">
        <div
            class="modal-box w-full md:w-11/12 max-w-4xl p-0 bg-base-100 overflow-hidden shadow-2xl rounded-2xl md:h-auto h-full max-h-full md:max-h-[90vh] flex flex-col">
            <!-- Header -->
            <div
                class="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-100/50 backdrop-blur-sm sticky top-0 z-20 shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <SparklesIcon class="w-6 h-6" />
                    </div>
                    <div>
                        <h3 class="font-bold text-lg leading-tight">{{ headerTitle }}</h3>
                        <p class="text-xs text-base-content/50 font-medium">{{ mode === 'edit' ? formData.id :
                            t('agent.addTitle') }}</p>
                    </div>
                </div>
                <button class="btn btn-ghost btn-sm btn-circle" @click="handleClose">
                    <XMarkIcon class="w-5 h-5" />
                </button>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">

                <div class="grid grid-cols-1 md:grid-cols-12 gap-8">

                    <!-- Left Column: Avatar & Identity Identity (4 cols) -->
                    <!-- On mobile, this stacks on top and is centered -->
                    <div class="md:col-span-4 flex flex-col items-center gap-6">

                        <!-- Avatar uploader -->
                        <div class="relative group cursor-pointer" @click="triggerFileInput">
                            <div
                                class="avatar placeholder ring-4 ring-base-200 ring-offset-2 ring-offset-base-100 rounded-full transition-all duration-300 group-hover:ring-primary/50 group-hover:shadow-lg">
                                <div
                                    class="bg-neutral text-neutral-content rounded-full w-32 h-32 md:w-35 md:h-35 shadow-inner overflow-hidden flex items-center justify-center">
                                    <img v-if="formData.avatarPreview" :src="formData.avatarPreview"
                                        class="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />
                                    <span v-else class="text-5xl md:text-7xl select-none animate-pulse-slow">{{
                                        formData.identityEmoji || '🤖' }}</span>
                                </div>
                            </div>

                            <!-- Overlay -->
                            <div
                                class="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity duration-300 text-white gap-2">
                                <PhotoIcon class="w-8 h-8" />
                                <span class="text-xs font-bold uppercase tracking-wider">{{ t('agent.form.uploadAvatar')
                                    }}</span>
                            </div>

                            <input ref="fileInput" type="file" accept="image/*" class="hidden"
                                @change="handleFileChange" />
                        </div>

                        <!-- Identity Card (Grouped, Single Column Layout) -->
                        <div class="w-full card bg-base-200/50 border border-base-200 p-4 space-y-4">
                            <div
                                class="flex items-center gap-2 text-xs font-bold text-base-content/40 uppercase tracking-widest pl-1 mb-1">
                                <IdentificationIcon class="w-3 h-3" />
                                {{ t('agent.identity') }}
                            </div>

                            <!-- Identity Name -->
                            <div class="form-control w-full">
                                <label class="label justify-start pb-1 pt-0">
                                    <span class="label-text-alt text-xs opacity-60">{{ t('agent.form.identityName')
                                        }}</span>
                                </label>
                                <input v-model="formData.identityName" type="text"
                                    :placeholder="t('agent.form.identityNamePlaceholder')"
                                    class="input input-bordered input-sm w-full" />
                            </div>



                            <!-- Identity Emoji -->
                            <div class="form-control w-full">
                                <label class="label justify-start pb-1 pt-0">
                                    <span class="label-text-alt text-xs opacity-60">{{ t('agent.form.emoji') }}</span>
                                </label>
                                <div class="join w-full shadow-sm">
                                    <input v-model="formData.identityEmoji" type="text"
                                        class="input input-bordered input-sm w-full join-item text-center text-lg px-0"
                                        :placeholder="t('agent.form.emoji')" />
                                    <button
                                        class="btn btn-sm btn-square join-item bg-base-200 border-base-300 hover:bg-base-300"
                                        @click="randomizeEmoji" :title="t('agent.form.random')">
                                        <ArrowPathIcon class="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <!-- Identity Vibe -->
                            <div class="form-control w-full">
                                <label class="label justify-start pb-1 pt-0">
                                    <span class="label-text-alt text-xs opacity-60">{{ t('agent.form.vibe') }}</span>
                                </label>
                                <div class="relative w-full">
                                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <SwatchIcon class="h-4 w-4 text-base-content/30" />
                                    </div>
                                    <input v-model="formData.identityVibe" type="text"
                                        :placeholder="t('agent.form.vibePlaceholder')"
                                        class="input input-bordered input-sm w-full " />
                                </div>
                            </div>

                            <!-- Identity Creature -->
                            <div class="form-control w-full">
                                <label class="label justify-start pb-1 pt-0">
                                    <span class="label-text-alt text-xs opacity-60">{{ t('agent.form.creature')
                                        }}</span>
                                </label>
                                <input v-model="formData.identityCreature" type="text"
                                    :placeholder="t('agent.form.creaturePlaceholder')"
                                    class="input input-bordered input-sm w-full px-3" />
                            </div>

                        </div>
                    </div>


                    <!-- Right Column: Main Form (8 cols) -->
                    <div class="md:col-span-8 flex flex-col gap-6">

                        <!-- Main Info Section -->
                        <div class="flex flex-col gap-4">
                            <!-- Workspace Directory Field (spec §5.1) -->
                            <div class="form-control">
                                <WorkspacePathField ref="workspaceFieldRef" v-model="formData.workspaceDir"
                                    :agent-id="mode === 'edit' ? agentData?.id : undefined"
                                    @validated="onWorkspaceValidated" />
                            </div>

                            <!-- 信任并启用（仅新建）：路径含 .pi 信任要求配置时展示 -->
                            <div v-if="mode === 'add' && formData.workspaceDir && workspaceTrustRequiring"
                                class="form-control">
                                <label class="label cursor-pointer justify-start gap-2">
                                    <input v-model="workspaceTrustChecked" type="checkbox"
                                        class="checkbox checkbox-sm checkbox-primary" />
                                    <span class="label-text text-xs">{{ t('workspaceBinding.trustOnCreate') }}</span>
                                </label>
                            </div>

                            <!-- ID Field -->
                            <div class="form-control w-full">
                                <label class="label pt-0 pb-1.5">
                                    <span class="label-text font-bold text-sm flex items-center gap-1.5 opacity-80">
                                        <TagIcon class="w-4 h-4" />
                                        {{ t('agent.form.id') }}
                                        <span class="text-error" v-if="mode === 'add'">*</span>
                                    </span>
                                </label>
                                <input v-model="formData.id" type="text" :placeholder="t('agent.form.idPlaceholder')"
                                    class="input input-bordered w-full font-mono text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                                    :disabled="mode === 'edit'" @input="idTouched = true"
                                    :class="{ 'input-error': mode === 'add' && !isFormValid && formData.id.length > 0 }" />

                            </div>

                            <!-- Name Field -->
                            <div class="form-control w-full">
                                <label class="label pt-0 pb-1.5">
                                    <span class="label-text font-bold text-sm flex items-center gap-1.5 opacity-80">
                                        <UserCircleIcon class="w-4 h-4" />
                                        {{ t('agent.form.name') }}
                                    </span>
                                </label>
                                <input v-model="formData.name" type="text"
                                    :placeholder="t('agent.form.namePlaceholder')" @input="nameTouched = true"
                                    class="input input-bordered w-full focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all" />
                            </div>
                        </div>

                        <!-- Description -->
                        <div class="form-control w-full">
                            <label class="label pt-0 pb-1.5">
                                <span class="label-text font-bold text-sm flex items-center gap-1.5 opacity-80">
                                    <FaceSmileIcon class="w-4 h-4" />
                                    {{ t('agent.form.description') }}
                                </span>
                            </label>
                            <textarea v-model="formData.description"
                                class="textarea w-full textarea-bordered h-32 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none text-base leading-relaxed"
                                :placeholder="t('agent.noDescriptionFallback')"></textarea>
                        </div>



                        <!-- Technical Settings -->
                        <div class="bg-base-200/40 rounded-xl p-5 border border-base-200/60">
                            <h4
                                class="text-xs font-bold text-base-content/60 mb-4 uppercase tracking-wider flex items-center gap-2">
                                <CpuChipIcon class="w-4 h-4" />
                                {{ t('common.settings') }}
                            </h4>
                            <div class="form-control w-full">
                                <label class="label pt-0 pb-1.5">
                                    <span class="label-text font-medium">{{ t('agent.form.defaultModel') }}</span>
                                </label>
                                <select v-model="selectedModelValue" class="select select-bordered w-full">
                                    <option value="">{{ t('agent.form.modelPlaceholder') }}</option>
                                    <optgroup v-for="group in availableModels" :key="group.provider"
                                        :label="group.provider">
                                        <option v-for="model in group.models" :key="model.id"
                                            :value="`${group.provider}/${model.id}`">
                                            {{ model.name }}
                                        </option>
                                    </optgroup>
                                </select>
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            <!-- Footer -->
            <div
                class="px-6 py-4 border-t border-base-200 flex justify-end gap-3 bg-base-100 sticky bottom-0 z-20 shrink-0">
                <button class="btn btn-ghost hover:bg-base-200" @click="handleClose">{{ t('common.cancel') }}</button>
                <button class="btn btn-primary min-w-[120px] shadow-lg shadow-primary/20" @click="submitForm"
                    :disabled="!isFormValid || isBusy">
                    <span v-if="isBusy" class="loading loading-spinner text-primary-content"></span>
                    {{ submitLabel }}
                </button>
            </div>
        </div>

        <div class="modal-backdrop bg-base-300/80 backdrop-blur-sm" @click="handleClose">
            <button class="cursor-default">close</button>
        </div>
    </div>
</template>

<style scoped>
.animate-pulse-slow {
    animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: .7;
    }
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: var(--fallback-bc, oklch(var(--bc)/0.2));
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: var(--fallback-bc, oklch(var(--bc)/0.3));
}
</style>
