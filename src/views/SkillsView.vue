<script setup lang="ts">
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useGateway } from '../composables/useGateway'
import { useUiSettingsStore } from '../stores/setting'
import { useSkillsState } from '../composables/useSkillsState'
import {
    ArrowLeftIcon,
    MagnifyingGlassIcon,
    MagnifyingGlassCircleIcon,
    ArrowPathIcon,
    CommandLineIcon,
    CpuChipIcon,
    PuzzlePieceIcon,
    WrenchScrewdriverIcon,
    CubeIcon,
    KeyIcon
} from '@heroicons/vue/24/outline'
import ViewHeader from '@/components/ViewHeader.vue'

import type { SkillStatusEntry, SkillInstallOption } from '~openclaw/ui/src/ui/types'


const router = useRouter()
const gatewayStore = useGateway()
const settingsStore = useUiSettingsStore()

const skillsState = useSkillsState()

const filter = ref('')
const isRefreshing = ref(false)
const apiKeyModal = ref<HTMLDialogElement | null>(null)
const editingSkill = ref<SkillStatusEntry | null>(null)
const apiKeyInput = ref('')

const goBack = () => {
    router.back()
}

const loadData = () => {
    if (gatewayStore.connected) {
        skillsState.loadSkills()
    }
}

onMounted(() => {
    loadData()
})

// Watch connection
watch(() => gatewayStore.connected, (connected) => {
    if (connected) {
        loadData()
    }
})

const refreshSkills = async () => {
    isRefreshing.value = true
    await skillsState.loadSkills()
    isRefreshing.value = false
}

const handleEditApiKey = (skill: SkillStatusEntry) => {
    editingSkill.value = skill
    apiKeyInput.value = '' // Security: don't show existing status or value by default
    apiKeyModal.value?.showModal()
}

const saveApiKeyFromModal = async () => {
    if (!editingSkill.value) return
    const key = editingSkill.value.skillKey
    const value = apiKeyInput.value.trim()

    skillsState.updateSkillEdit(key, value)
    await skillsState.saveSkillApiKey(key)
    apiKeyModal.value?.close()
}

const handleToggleSkill = async (skill: SkillStatusEntry) => {
    // If currently disabled (true), we want to enable it (true).
    // If currently enabled (disabled=false), we want to disable it (false).
    await skillsState.updateSkillEnabled(skill.skillKey, skill.disabled)
}

const handleInstallSkill = async (skill: SkillStatusEntry, opt: SkillInstallOption) => {
    // Cast to any to avoid type errors with unknown gatewayStore signature
    await skillsState.installSkill({ skillName: skill.name, optionId: opt.id, skillKey: skill.skillKey } as any)
}

const getSkillMessage = (skillKey: string) => {
    return (skillsState.skillMessages as any)?.[skillKey]
}


// Filter skills
const filteredSkills = computed(() => {
    const rawSkills = (skillsState.skillsReport as any)?.skills || []
    if (!filter.value.trim()) return rawSkills

    const lowerFilter = filter.value.toLowerCase()
    return rawSkills.filter((skill: any) =>
        skill.name.toLowerCase().includes(lowerFilter) ||
        skill.description.toLowerCase().includes(lowerFilter) ||
        skill.source.toLowerCase().includes(lowerFilter)
    )
})

const skillGroups = computed(() => {
    const groups: Record<string, typeof filteredSkills.value> = {
        'bundled': [],
        'workspace': []
    }

    filteredSkills.value.forEach((skill: any) => {
        if (skill.bundled === true) {
            groups['bundled'].push(skill)
        } else {
            groups['workspace'].push(skill)
        }
    })

    return groups
})

const hasSkills = computed(() => filteredSkills.value.length > 0)

const getGroupTitle = (group: string) => {
    switch (group) {
        case 'bundled': return '内置技能 (Bundled)'
        case 'workspace': return '工作区技能 (Workspace)'
        default: return '其他技能'
    }
}

const getGroupIcon = (group: string) => {
    switch (group) {
        case 'bundled': return CubeIcon
        case 'workspace': return WrenchScrewdriverIcon
        default: return PuzzlePieceIcon
    }
}

</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <!-- Header -->
        <!-- Header -->
        <ViewHeader title="技能列表" :show-back="!settingsStore.showBottomNav">
            <template #actions>
                <div class="relative">
                    <MagnifyingGlassIcon
                        class="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/40 z-10" />
                    <input v-model="filter" type="text" placeholder="搜索..."
                        class="input input-sm input-bordered pl-9 w-32 focus:w-48 sm:w-48 sm:focus:w-64 transition-all" />
                </div>
            </template>
        </ViewHeader>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4 md:p-6">
            <div class="mx-auto space-y-6 w-full" :class="{ 'max-w-6xl': !settingsStore.isWideMode }">

                <!-- Loading State -->
                <div v-if="skillsState.skillsLoading && !skillsState.skillsReport" class="flex justify-center py-12">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>

                <div v-else-if="!hasSkills" class="text-center py-16 opacity-50">
                    <CommandLineIcon class="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p class="text-lg">未找到相关技能</p>
                    <button @click="filter = ''" class="btn btn-link btn-sm mt-2" v-if="filter">清除搜索</button>
                </div>

                <!-- Skill Lists by Group -->
                <template v-else>
                    <div v-for="(skills, group) in skillGroups" :key="group" v-show="skills.length > 0"
                        class="space-y-4">

                        <!-- Group Header -->
                        <div class="flex items-center gap-2 px-1 border-l-4 border-primary/50 pl-3">
                            <component :is="getGroupIcon(group as string)" class="w-5 h-5 opacity-70" />
                            <h3 class="font-bold text-base opacity-80">{{ getGroupTitle(group as string) }}</h3>
                            <span class="badge badge-sm badge-ghost">{{ skills.length }}</span>
                        </div>

                        <!-- Grid Layout -->
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            <div v-for="skill in skills" :key="skill.name"
                                class="card bg-base-100 shadow-sm border border-base-200 hover:border-primary transition-colors hover:shadow-md group h-full">
                                <div class="card-body p-4 gap-3">
                                    <div class="flex items-start justify-between min-h-[2.5rem]">
                                        <div class="flex items-center gap-3 overflow-hidden">
                                            <div
                                                class="w-10 h-10 rounded-lg bg-base-200 flex items-center justify-center text-xl shrink-0">
                                                {{ skill.emoji || '📦' }}
                                            </div>
                                            <div class="min-w-0">
                                                <h4 class="font-bold truncate" :title="skill.name">{{ skill.name }}</h4>
                                                <div class="flex items-center gap-1 text-xs opacity-60">
                                                    <span class="font-mono truncate">{{ skill.source }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Status Indicators -->
                                        <div class="flex flex-col items-end gap-1">
                                            <div v-if="skill.disabled" class="badge badge-error badge-outline badge-xs">
                                                已禁用</div>
                                            <div v-else-if="skill.blockedByAllowlist"
                                                class="badge badge-warning badge-outline badge-xs">受限</div>
                                            <div v-if="skill.missing.bins.length > 0"
                                                class="badge badge-error badge-soft badge-xs"
                                                :title="'Missing: ' + skill.missing.bins.join(', ')">缺少依赖</div>
                                        </div>
                                    </div>

                                    <p class="text-xs text-base-content/70 line-clamp-2 h-8" :title="skill.description">
                                        {{ skill.description }}
                                    </p>

                                    <div class="card-actions justify-end mt-auto pt-2 items-center">
                                        <!-- Left Side: Message & Env Info -->
                                        <div class="flex items-center gap-2 mr-auto min-w-0 flex-1">

                                            <!-- Env Badge -->
                                            <div v-if="skill.primaryEnv" class="flex items-center gap-1 shrink-0">
                                                <span class="badge badge-xs font-mono"
                                                    :class="skill.missing.env.includes(skill.primaryEnv) ? 'badge-error badge-outline' : 'badge-success badge-outline opacity-70'">
                                                    {{ skill.primaryEnv }}
                                                </span>
                                                <button @click="handleEditApiKey(skill)"
                                                    class="btn btn-xs btn-circle btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="配置 API Key">
                                                    <KeyIcon class="w-3 h-3" />
                                                </button>
                                            </div>

                                            <!-- Message -->
                                            <div v-if="getSkillMessage(skill.skillKey)"
                                                class="truncate px-1.5 py-0.5 rounded text-[10px] font-medium"
                                                :class="getSkillMessage(skill.skillKey)?.kind === 'error' ? 'bg-error/10 text-error' : 'bg-success/10 text-success'"
                                                :title="getSkillMessage(skill.skillKey)?.message">
                                                {{ getSkillMessage(skill.skillKey)?.message }}
                                            </div>

                                        </div>

                                        <div class="flex gap-2">
                                            <div v-if="skill.install && skill.install.length > 0 && skill.eligible === false"
                                                class="dropdown dropdown-end dropdown-top">
                                                <div tabindex="0" role="button" class="btn btn-xs btn-outline"
                                                    :class="{ 'btn-disabled': skillsState.skillsBusyKey === skill.skillKey }">
                                                    安装</div>
                                                <ul tabindex="0"
                                                    class="dropdown-content z-[10] menu p-2 shadow bg-base-100 rounded-box w-52">
                                                    <li v-for="opt in skill.install" :key="opt.id">
                                                        <a class="truncate block max-w-full text-xs" :title="opt.label"
                                                            @click.prevent="handleInstallSkill(skill, opt)">
                                                            {{ opt.label }}
                                                        </a>
                                                    </li>
                                                </ul>
                                            </div>

                                            <button @click="handleToggleSkill(skill)" class="btn btn-xs" :class="[
                                                skill.disabled ? 'btn-neutral' : 'btn-ghost btn-active',
                                                skillsState.skillsBusyKey === skill.skillKey ? 'loading' : ''
                                            ]" :disabled="skillsState.skillsBusyKey === skill.skillKey">
                                                {{ skillsState.skillsBusyKey === skill.skillKey ? '' : (skill.disabled
                                                    ? '启用' : '禁用') }}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>

                <div class="h-8"></div>
            </div>
        </div>

        <!-- API Key Modal -->
        <dialog ref="apiKeyModal" class="modal">
            <div class="modal-box">
                <h3 class="font-bold text-lg">配置 API Key</h3>
                <p class="py-4" v-if="editingSkill">
                    请输入 <code>{{ editingSkill.primaryEnv }}</code> 的值:
                </p>
                <input v-model="apiKeyInput" type="text" placeholder="输入 API Key" class="input input-bordered w-full"
                    @keyup.enter="saveApiKeyFromModal" />
                <div class="modal-action">
                    <form method="dialog">
                        <button class="btn">取消</button>
                        <button class="btn btn-primary ml-2" @click.prevent="saveApiKeyFromModal">保存</button>
                    </form>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    </div>
</template>
