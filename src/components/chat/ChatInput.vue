<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import {
    CameraIcon,
    MicrophoneIcon,
    CheckIcon,
    PaperAirplaneIcon,
    StopIcon,
    ChevronUpIcon,
    CommandLineIcon,
    CpuChipIcon,
    SparklesIcon,
    LightBulbIcon,
    XMarkIcon
} from '@heroicons/vue/24/outline'
import { useChatInput, COMMANDS, type CommandItem } from '../../composables/useChatInput'
import { useModelsState } from '../../composables/useModelsState'
import { useChatState } from '../../composables/useChatState'
import { useUiSettingsStore } from '../../stores/setting'
import { computed } from 'vue'
import { useToast } from '~/src/composables/useToast'
import { useMediaPreview } from '../../composables/useMediaPreview'
import ModelSelectMenuContent from '../models/ModelSelectMenuContent.vue'

const props = defineProps<{
    isBusy: boolean
    disabled: boolean
}>()

const chatState = useChatState()
const settingsStore = useUiSettingsStore()
const { availableModels } = useModelsState()
const { t } = useI18n()
const isBusy = computed(() => chatState.chatSending || Boolean(chatState.chatRunId))
const emit = defineEmits<{
    (e: 'send'): void
}>()

const {
    inputText,
    isRecording,
    selectedModel,
    commandDropdownOpen,
    modelDropdownOpen,
    attachments,
    selectCommand,
    selectModel,
    handleMicClick,
    handleInputFocus,
    stopRecording,
    handleKeydown,
    closeDropdowns,
    addAttachment,
    removeAttachment,
    commandSuggestionsVisible,
    commandSuggestions,
    commandSuggestionIndex,
    confirmCommandSuggestion,
    closeSuggestions,
} = useChatInput()

const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const commandSuggestionsPanelRef = ref<HTMLDivElement | null>(null)

const { openLightbox } = useMediaPreview()

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
type ThinkingLevel = typeof THINKING_LEVELS[number]


const thinkingDropdownOpen = ref(false)

// 当前模型：优先从 session 获取，否则从 agent 默认值获取
// 使用 computed 而非 ref + watch，确保 session 属性变更时能正确响应
const currentModel = computed(() => {
    const session = chatState.currentSession
    if (session && session.modelProvider && session.model) {
        return `${session.modelProvider}/${session.model}`
    }
    const agent = chatState.currentAgent
    if (agent) {
        return `${agent.defaultProvider}/${agent.defaultModel}`
    }
    return ''
})

const currentModelLabel = computed(() => {
    const value = currentModel.value
    if (!value) return ''

    for (const group of availableModels.value) {
        const matched = group.models.find((model) => `${group.provider}/${model.id}` === value)
        if (matched) {
            return `${group.name}/${matched.name}`
        }
    }

    return value
})

// 思考级别：优先从 session 获取，否则从 agent 默认值获取
// 使用 computed 确保 /thinking 命令修改 session.thinkingLevel 后能正确响应
const thinkingLevel = computed<ThinkingLevel>(() => {
    const session = chatState.currentSession
    const sessionLevel = session?.thinkingLevel
    if (sessionLevel && (THINKING_LEVELS as readonly string[]).includes(sessionLevel)) {
        return sessionLevel as ThinkingLevel
    }

    const agent = chatState.currentAgent
    const agentLevel = agent?.defaultThinkingLevel || 'off'
    return (THINKING_LEVELS as readonly string[]).includes(agentLevel) ? (agentLevel as ThinkingLevel) : 'off'
})



const selectThinkingLevel = (level: ThinkingLevel) => {
    thinkingDropdownOpen.value = false
    if (isBusy.value) {
        useToast().warning(t('chat.waitMessage'))
        return
    }
    inputText.value = `/thinking ${level}`

    // 更新本地 session 缓存
    const session = chatState.currentSession
    if (session) {
        session.thinkingLevel = level
    }

    nextTick(() => {
        onSend()
    })
}

const getThinkingLabel = () => t(`chat.thinkingLevels.${thinkingLevel.value}`)

const adjustHeight = () => {
    if (textareaRef.value) {
        textareaRef.value.style.height = 'auto'
        textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
    }
}

// Watch input text changes to adjust height (handles clearing)
watch(inputText, () => {
    nextTick(() => {
        adjustHeight()
    })
})

// 键盘切换命令建议高亮时，确保对应条目滚动到可视区。
// 否则高亮索引已经变化，但面板滚动位置不动，用户会误以为没有切换到底部/顶部。
watch(commandSuggestionIndex, () => {
    nextTick(() => {
        const panel = commandSuggestionsPanelRef.value
        if (!panel || !commandSuggestionsVisible.value) return

        const activeItem = panel.querySelector<HTMLElement>('[data-command-suggestion-active="true"]')
        activeItem?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
})

const triggerFileInput = () => {
    fileInputRef.value?.click()
}

const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        addAttachment(target.files[0])
        // Reset input so same file can be selected again if needed
        target.value = ''
    }
}

const onSend = () => {
    stopRecording();
    emit('send')
}

const handleCommandSelect = (cmd: CommandItem) => {
    selectCommand(cmd.value)
    if (settingsStore.autoSendCommands && cmd.autoSend !== false) {
        nextTick(() => {
            onSend()
        })
    }
}

const handleModelSelect = (modelId: string) => {
    modelDropdownOpen.value = false
    if (isBusy.value) {
        useToast().warning(t('chat.waitMessage'))
        return
    }
    inputText.value = `/model ${modelId}`

    // 更新本地 session 缓存
    const session = chatState.currentSession
    if (session) {
        const firstSlash = modelId.indexOf('/')
        if (firstSlash !== -1) {
            session.modelProvider = modelId.substring(0, firstSlash)
            session.model = modelId.substring(firstSlash + 1)
        }
    }

    nextTick(() => {
        onSend()
    })
}

// Persist setting when toggled
watch(() => settingsStore.autoSendCommands, () => {
    settingsStore.persist()
})

const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault()
            const blob = item.getAsFile()
            if (blob) {
                // Generate a friendly filename with timestamp
                const ext = item.type.split('/')[1] || 'png'
                const name = `clipboard-${Date.now()}.${ext}`
                const file = new File([blob], name, { type: item.type })
                addAttachment(file)
            }
        }
    }
}

const handleInputKeydown = (e: KeyboardEvent) => {
    handleKeydown(e, onSend)
}

// Close dropdowns when clicking outside toolbar
const handleToolbarClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.closest('.dropdown-top')) {
        closeDropdowns()
        thinkingDropdownOpen.value = false
    }
    // 点击外部时关闭命令补全浮层
    if (!target.closest('.command-suggestions-panel') && !target.closest('textarea')) {
        closeSuggestions()
    }
}

defineExpose({
    inputText,
    selectedModel,
    attachments,
    handleToolbarClickOutside
})
</script>

<template>
    <div class="p-4 border-t border-base-300 bg-base-100">
        <div
            class="bg-base-200/50 rounded-[2rem] p-2 pr-2 shadow-sm border border-base-300/50 flex flex-col gap-1 relative focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-300">
            <!-- Preview Area -->
            <!-- Preview Area -->
            <div v-if="attachments.length > 0"
                class="flex gap-2 px-3 pt-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
                <div v-for="att in attachments" :key="att.id" class="relative group flex-shrink-0">
                    <!-- Image Preview -->
                    <div v-if="att.mimeType.startsWith('image/')" class="relative cursor-pointer"
                        @click="openLightbox(att.dataUrl)">
                        <img :src="att.dataUrl" class="h-16 w-16 object-cover rounded-lg border border-base-300"
                            :title="att.name" />
                    </div>
                    <!-- File Preview -->
                    <div v-else
                        class="h-16 w-16 bg-base-300 rounded-lg flex flex-col items-center justify-center p-1 border border-base-content/10"
                        :title="att.name">
                        <!-- Simple Document Icon using Heroicons path (or generic placeholder) -->
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                            stroke="currentColor" class="w-8 h-8 opacity-50">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span class="text-[9px] w-full truncate text-center opacity-70 leading-tight mt-0.5">{{ att.name
                        }}</span>
                    </div>

                    <!-- Delete Button: Always visible on mobile (using forced opacity or just remove opacity class). 
                         Changed color to bg-base-100 (white/dark) with shadow and border for better visibility without being 'red'. -->
                    <button @click="removeAttachment(att.id)"
                        class="absolute -top-1.5 -right-1.5 btn btn-circle btn-xs bg-base-100 hover:bg-base-200 border-base-300 shadow-sm text-base-content/70 z-10 transition-transform hover:scale-110">
                        <XMarkIcon class="h-3 w-3" />
                    </button>
                </div>
            </div>

            <!-- Input Top -->
            <!-- 命令补全浮层 -->
            <div v-if="commandSuggestionsVisible"
                class="absolute left-3 right-3 bottom-full mb-2 w-auto max-w-[calc(100vw-1.5rem)] sm:right-auto sm:w-96 sm:max-w-none max-h-64 bg-base-100 border border-base-300 rounded-xl shadow-xl z-[200] overflow-hidden flex flex-col">
                <div
                    class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-base-content/40 border-b border-base-200 shrink-0">
                    命令建议
                </div>
                <div ref="commandSuggestionsPanelRef"
                    class="command-suggestions-panel p-1 flex flex-col overflow-y-auto hover:scrollbar-thin scrollbar-thumb-base-300 scrollbar-track-transparent">
                    <button v-for="(cmd, idx) in commandSuggestions" :key="cmd.name"
                        @mousedown.prevent="confirmCommandSuggestion(cmd)" @mouseenter="commandSuggestionIndex = idx"
                        :title="cmd.description" :data-command-suggestion-active="idx === commandSuggestionIndex"
                        class="flex items-center gap-2 w-full overflow-hidden rounded-lg py-2 px-3 text-left transition-colors shrink-0"
                        :class="idx === commandSuggestionIndex ? 'bg-primary/10 text-primary' : 'hover:bg-base-200'">
                        <span
                            class="font-mono font-semibold text-sm whitespace-nowrap shrink-0 max-w-[9rem] overflow-hidden text-ellipsis">/{{
                                cmd.name }}</span>
                        <span v-if="cmd.description"
                            class="text-xs opacity-60 whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0">{{
                                cmd.description }}</span>
                        <span v-if="cmd.source" class="ml-auto badge badge-xs shrink-0"
                            :class="cmd.source === 'builtin'
                                ? 'badge-ghost'
                                : (cmd.source === 'prompt' ? 'badge-secondary badge-outline' : 'badge-primary badge-outline')">
                            {{ cmd.source === 'builtin' ? '内置' : (cmd.source === 'prompt' ? 'Prompt' : '扩展') }}
                        </span>
                    </button>
                </div>
            </div>


            <textarea ref="textareaRef" v-model="inputText" rows="1" :placeholder="$t('chat.inputPlaceholder')"
                class="textarea textarea-ghost w-full resize-none focus:outline-none focus:bg-transparent text-base min-h-[44px] max-h-[200px] px-3 py-3 leading-6 placeholder:text-base-content/40 hide-scrollbar"
                @keydown="handleInputKeydown" @focus="handleInputFocus" @input="adjustHeight" @paste="handlePaste"
                :disabled="disabled"></textarea>

            <!-- Toolbar Bottom -->
            <div class="flex items-center justify-between pb-1">
                <!-- Left Actions -->
                <div class="flex items-center gap-1 text-base-content/70">
                    <!-- Attach -->
                    <input type="file" ref="fileInputRef" class="hidden" @change="handleFileChange" />
                    <button @click="triggerFileInput"
                        class="btn btn-ghost btn-circle btn-sm hover:bg-base-300 hover:text-primary transition-colors"
                        :title="$t('chat.uploadAttachment')">
                        <CameraIcon class="h-5 w-5" />
                    </button>

                    <!-- Command -->
                    <div class="dropdown dropdown-top" :class="{ 'dropdown-open': commandDropdownOpen }">
                        <button
                            @click.stop="commandDropdownOpen = !commandDropdownOpen; modelDropdownOpen = false; thinkingDropdownOpen = false"
                            class="btn btn-ghost btn-sm  gap-1 font-normal rounded-full border border-base-content/20 hover:border-base-content/40 hover:bg-base-300  transition-all"
                            :title="$t('chat.commands')">
                            <CommandLineIcon class="h-4 w-4 hidden sm:inline" />
                            <span class="sm:inline">{{ $t('chat.commands') }}</span>
                            <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                        </button>
                        <ul v-if="commandDropdownOpen"
                            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-56 border border-base-300 mb-2 z-[100]">
                            <li class="menu-title"><span>{{ $t('chat.commonCommands') }}</span></li>
                            <li v-for="cmd in COMMANDS" :key="cmd.value">
                                <a @click="handleCommandSelect(cmd)" class="rounded-lg">{{ cmd.label }}</a>
                            </li>
                            <!-- Divider -->
                            <li class="my-1 border-t border-base-200"></li>
                            <!-- Auto Send Toggle -->
                            <li class="p-0">
                                <label
                                    class="label cursor-pointer justify-between py-2 px-4 hover:bg-base-200 rounded-lg active:bg-base-300 transition-colors">
                                    <span class="text-xs opacity-70 label-text">{{ $t('chat.autoSend') }}</span>
                                    <input type="checkbox" class="toggle toggle-xs toggle-primary"
                                        v-model="settingsStore.autoSendCommands" />
                                </label>
                            </li>
                        </ul>
                    </div>


                    <!-- Model -->
                    <div class="dropdown dropdown-top" :class="{ 'dropdown-open': modelDropdownOpen }">
                        <button
                            @click.stop="() => { modelDropdownOpen = !modelDropdownOpen; commandDropdownOpen = false; thinkingDropdownOpen = false }"
                            class="btn btn-ghost btn-sm gap-1 font-normal rounded-full border border-base-content/20 hover:border-base-content/40 hover:bg-base-300 transition-all"
                            :title="$t('chat.models')">
                            <CpuChipIcon class="h-4 w-4 hidden sm:inline" />
                            <span class="sm:inline">{{ $t('chat.models') }}<span
                                    v-if="currentModelLabel" class="hidden sm:inline">({{ currentModelLabel }})</span></span>
                            <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                        </button>
                        <div v-if="modelDropdownOpen"
                            class="dropdown-content shadow-xl bg-base-100 rounded-box border border-base-300 z-[100] max-h-96 overflow-hidden flex flex-col flex-nowrap fixed left-4 right-4 bottom-24 sm:absolute sm:left-0 sm:right-auto sm:bottom-[100%] sm:mb-2 sm:w-80">
                            <ModelSelectMenuContent :available-models="availableModels" :current-model="currentModel"
                                @select="handleModelSelect" />
                        </div>
                    </div>



                    <!-- Thinking Level -->
                    <div class="dropdown dropdown-top" :class="{ 'dropdown-open': thinkingDropdownOpen }">
                        <button
                            @click.stop="thinkingDropdownOpen = !thinkingDropdownOpen; commandDropdownOpen = false; modelDropdownOpen = false"
                            class="btn btn-sm gap-1 font-normal rounded-full transition-all duration-300 border-primary/20 btn-ghost hover:bg-base-300"
                            :title="$t('chat.thinkingLevel')">
                            <LightBulbIcon class="h-4 w-4 hidden sm:inline" />
                            <span class="sm:inline">{{ $t('chat.thinking') }}<span class="hidden sm:inline">({{
                                getThinkingLabel()
                                    }})</span></span>
                            <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                        </button>
                        <ul v-if="thinkingDropdownOpen"
                            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-36 border border-base-300 mb-2 z-[100]">
                            <li class="menu-title"><span>{{ $t('chat.thinkingLevel') }}</span></li>
                            <li v-for="level in THINKING_LEVELS" :key="level">
                                <a @click="selectThinkingLevel(level)" class="flex items-center gap-2 rounded-lg"
                                    :class="{ 'bg-primary/10 text-primary': thinkingLevel === level }">
                                    <span class="flex-1">{{ $t(`chat.thinkingLevels.${level}`) }}</span>
                                    <CheckIcon v-if="thinkingLevel === level" class="h-4 w-4 shrink-0" />
                                    <span v-else class="w-4 h-4 shrink-0"></span>
                                </a>
                            </li>
                        </ul>
                    </div>

                </div>

                <!-- Right Actions -->
                <div class="flex items-center gap-2">
                    <!-- Mic -->
                    <button v-if="settingsStore.isCurrentAsrConfigured" @click="handleMicClick"
                        class="btn btn-circle btn-sm transition-all duration-300 relative overflow-hidden"
                        :class="isRecording ? 'btn-success text-success-content scale-110 shadow-[0_0_15px_rgba(var(--sc),0.5)] border-success' : 'btn-ghost bg-base-300/50 hover:bg-base-300'"
                        :title="$t('chat.voiceInput')">
                        <MicrophoneIcon class="h-5 w-5 relative z-10" />
                        <span v-if="isRecording" class="absolute inset-0 bg-white/20 animate-ping rounded-full"></span>
                    </button>
                    <!-- Send -->
                    <button @click="onSend"
                        class="btn btn-circle btn-sm btn-primary shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"
                        :disabled="disabled || ((!inputText.trim() && attachments.length === 0) && !isBusy)">
                        <StopIcon v-if="isBusy && !inputText.trim()" class="h-5 w-5" />
                        <PaperAirplaneIcon v-else class="h-5 w-5 -rotate-45 translate-x-0.5 translate-y-px" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
    display: none;
}

.hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
}

textarea:focus,
input:focus {
    box-shadow: none;
}
</style>
