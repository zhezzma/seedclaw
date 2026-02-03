<script setup lang="ts">
import {
    CameraIcon,
    MicrophoneIcon,
    CheckIcon,
    PaperAirplaneIcon,
    StopIcon,
    ChevronUpIcon,
    CommandLineIcon,
    CpuChipIcon,
    SparklesIcon
} from '@heroicons/vue/24/outline'
import { useChatInput, COMMANDS, MODELS } from '../../composables/useChatInput'

const props = defineProps<{
    isBusy: boolean
    disabled: boolean
}>()

const emit = defineEmits<{
    (e: 'send'): void
}>()

const {
    inputText,
    isRecording,
    isThinking,
    selectedModel,
    commandDropdownOpen,
    modelDropdownOpen,
    selectCommand,
    selectModel,
    handleMicClick,
    handleKeydown,
    closeDropdowns
} = useChatInput()

const onSend = () => {
    emit('send')
}

const handleInputKeydown = (e: KeyboardEvent) => {
    handleKeydown(e, onSend)
}

// Close dropdowns when clicking outside toolbar
const handleToolbarClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.closest('.dropdown-top')) {
        closeDropdowns()
    }
}

defineExpose({
    inputText,
    isThinking,
    selectedModel,
    handleToolbarClickOutside
})
</script>

<template>
    <div class="p-4 border-t border-base-300 bg-base-100">
        <div
            class="bg-base-200/50 rounded-[2rem] p-2 pr-2 shadow-sm border border-base-300/50 flex flex-col gap-1 relative focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-300">
            <!-- Input Top -->
            <textarea v-model="inputText" rows="1" placeholder="发消息或输入'/'选择技能"
                class="textarea textarea-ghost w-full resize-none focus:outline-none focus:bg-transparent text-base min-h-[44px] max-h-[200px] px-3 py-3 leading-6 placeholder:text-base-content/40 hide-scrollbar"
                @keydown="handleInputKeydown"
                @input="(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = target.scrollHeight + 'px' }"
                :disabled="disabled"></textarea>

            <!-- Toolbar Bottom -->
            <div class="flex items-center justify-between pb-1">
                <!-- Left Actions -->
                <div class="flex items-center gap-1 text-base-content/70">
                    <!-- Attach -->
                    <button
                        class="btn btn-ghost btn-circle btn-sm hover:bg-base-300 hover:text-primary transition-colors"
                        title="上传附件">
                        <CameraIcon class="h-5 w-5" />
                    </button>

                    <!-- Command -->
                    <div class="dropdown dropdown-top" :class="{ 'dropdown-open': commandDropdownOpen }">
                        <button @click.stop="commandDropdownOpen = !commandDropdownOpen; modelDropdownOpen = false"
                            class="btn btn-ghost btn-sm  gap-1 font-normal rounded-full border border-base-content/20 hover:border-base-content/40 hover:bg-base-300  transition-all"
                            title="命令">
                            <CommandLineIcon class="h-4 w-4 hidden sm:inline" />
                            <span class="sm:inline">命令</span>
                            <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                        </button>
                        <ul
                            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-56 border border-base-300 mb-2 z-[100]">
                            <li class="menu-title px-4 py-2 text-xs opacity-50">常用指令</li>
                            <li v-for="cmd in COMMANDS" :key="cmd.value">
                                <a @click="selectCommand(cmd.value)" class="rounded-lg">{{ cmd.label }}</a>
                            </li>
                        </ul>
                    </div>

                    <!-- Model -->
                    <!-- <div class="dropdown dropdown-top" :class="{ 'dropdown-open': modelDropdownOpen }">
                        <button @click.stop="modelDropdownOpen = !modelDropdownOpen; commandDropdownOpen = false"
                            class="btn btn-ghost btn-sm gap-1 font-normal rounded-full border border-base-content/20 hover:border-base-content/40 hover:bg-base-300  transition-all"
                            title="模型">
                            <CpuChipIcon class="h-4 w-4  hidden sm:inline" />
                            <span class=" sm:inline">模型</span>
                            <ChevronUpIcon class="h-3 w-3 ml-0.5 opacity-50" />
                        </button>
                        <ul
                            class="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-48 border border-base-300 mb-2 z-[100]">
                            <li class="menu-title px-4 py-2 text-xs opacity-50">选择模型</li>
                            <li v-for="m in MODELS" :key="m.value">
                                <a @click="selectModel(m.value)" class="rounded-lg justify-between"
                                    :class="{ 'active': selectedModel === m.value }">
                                    {{ m.label }}
                                    <CheckIcon v-if="selectedModel === m.value" class="h-4 w-4" />
                                </a>
                            </li>
                        </ul>
                    </div> -->

                    <!-- Think -->
                    <!-- <button @click="isThinking = !isThinking"
                        class="btn btn-sm gap-1 font-normal rounded-full transition-all duration-300 "
                        :class="isThinking ? 'bg-primary/10 text-primary hover:bg-primary/20 border-primary/20' : 'btn-ghost hover:bg-base-300'"
                        title="深度思考">
                        <SparklesIcon class="h-4 w-4" />
                        <span class=" sm:inline">思考</span>
                    </button> -->
                </div>

                <!-- Right Actions -->
                <div class="flex items-center gap-2">
                    <!-- Mic -->
                    <button @click="handleMicClick"
                        class="btn btn-circle btn-sm transition-all duration-300 relative overflow-hidden"
                        :class="isRecording ? 'btn-success text-success-content scale-110 shadow-[0_0_15px_rgba(var(--sc),0.5)] border-success' : 'btn-ghost bg-base-300/50 hover:bg-base-300'"
                        title="语音输入">
                        <MicrophoneIcon class="h-5 w-5 relative z-10" />
                        <span v-if="isRecording" class="absolute inset-0 bg-white/20 animate-ping rounded-full"></span>
                    </button>

                    <!-- Send -->
                    <button @click="onSend"
                        class="btn btn-circle btn-sm btn-primary shadow-md hover:shadow-lg transition-all hover:scale-105 active:scale-95"
                        :disabled="disabled || (!inputText.trim() && !isBusy)">
                        <StopIcon v-if="isBusy" class="h-5 w-5" />
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
