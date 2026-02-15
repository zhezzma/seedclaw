<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useAgentsState } from '../../../composables/useAgentsState'
import { useSkillsState } from '../../../composables/useSkillsState'
import { useToast } from '../../../composables/useToast'
import { useI18n } from 'vue-i18n'
import { TrashIcon, CubeTransparentIcon } from '@heroicons/vue/24/outline'

// Props
const props = defineProps<{
    agent: any
}>()

const agentsState = useAgentsState()
const skillsState = useSkillsState() // Helper to get skill details if possible
const toast = useToast()
const { t } = useI18n()

const loading = ref(false)
const processing = ref<Record<string, boolean>>({})

const globalSkills = computed(() => skillsState.globalSkills || [])
const processingGlobal = ref<Record<string, boolean>>({})

// Agent skills are now full objects, not just strings
const agentSkills = ref<any[]>([])

const fetchSkills = async () => {
    if (!props.agent?.id) return
    loading.value = true
    try {
        agentSkills.value = await skillsState.loadAgentSkills(props.agent.id)
    } finally {
        loading.value = false
    }
}

watch(() => props.agent?.id, fetchSkills, { immediate: true })

const handleUninstall = async (skillId: string) => {
    if (!confirm(t('skills.confirmUninstall', { name: skillId }))) return

    processing.value[skillId] = true
    try {
        await skillsState.uninstallAgentSkill(props.agent.id, skillId)
        toast.success(t('skills.uninstallSuccess', { name: skillId }))
        await fetchSkills()
    } catch (e: any) {
        toast.error(t('skills.uninstallFailed', { error: e.message }))
    } finally {
        processing.value[skillId] = false
    }
}

const toggleSkill = async (skill: any) => {
    const skillId = skill.id
    processing.value[skillId] = true
    try {
        await skillsState.toggleAgentSkill(props.agent.id, skillId, !skill.enabled)
        await fetchSkills()
    } catch (e: any) {
        toast.error(t('skills.updateFailed', { error: e.message }))
    } finally {
        processing.value[skillId] = false
    }
}

// Helper to get display name from public skills (if available)
const getSkillDisplayName = (skillId: string) => {
    const publicSkill = skillsState.publicSkills?.find((s: any) => s.skill.slug === skillId || s.skill._id === skillId)
    return publicSkill?.skill.displayName || skillId
}

const handleUninstallGlobal = async (skillId: string) => {
    if (!confirm(t('skills.confirmUninstall', { name: skillId }))) return

    processingGlobal.value[skillId] = true
    try {
        await skillsState.uninstallGlobalSkill(skillId)
        toast.success(t('skills.uninstallSuccess', { name: skillId }))
        // Refresh global skills
        await skillsState.fetchGlobalSkills()
    } catch (e: any) {
        toast.error(t('skills.uninstallFailed', { error: e.message }))
    } finally {
        processingGlobal.value[skillId] = false
    }
}
</script>

<template>
    <div class="h-full flex flex-col overflow-y-auto p-4 space-y-8">
        <!-- Agent Specific Skills -->
        <div>
            <h3 class="text-sm font-bold text-base-content/70 uppercase tracking-wider mb-4 px-1">
                {{ $t('skills.agentSkills') }}
            </h3>

            <div v-if="loading" class="flex justify-center p-4">
                <span class="loading loading-spinner text-primary"></span>
            </div>

            <div v-else-if="!agentSkills.length"
                class="text-center p-8 border-2 border-dashed border-base-200 rounded-lg">
                <CubeTransparentIcon class="w-10 h-10 mx-auto mb-2 text-base-content/30" />
                <p class="text-base-content/50">{{ $t('skills.noAgentSkills') }}</p>
                <p class="text-xs text-base-content/40 mt-1">{{ $t('skills.installFromStore') }}</p>
            </div>

            <div v-else class="grid grid-cols-1 gap-3">
                <div v-for="skill in agentSkills" :key="skill.id"
                    class="card bg-base-100 border border-base-200 shadow-sm">
                    <div class="card-body p-4 flex-row items-center justify-between gap-4">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div
                                class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <CubeTransparentIcon class="w-6 h-6" />
                            </div>
                            <div class="min-w-0">
                                <h3 class="font-bold truncate" :title="skill.name">
                                    {{ getSkillDisplayName(skill.name) }}
                                </h3>
                                <div class="flex items-center gap-2">
                                    <p class="text-xs text-base-content/60 font-mono truncate">{{ skill.name }}</p>
                                    <span v-if="!skill.enabled" class="badge badge-xs badge-warning">{{
                                        $t('common.disabled') }}</span>
                                </div>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <!-- Helper to toggle -->
                            <input type="checkbox" class="toggle toggle-sm toggle-primary" :checked="skill.enabled"
                                :disabled="processing[skill.id]" @change="toggleSkill(skill)" />

                            <button class="btn btn-ghost btn-square btn-sm text-error hover:bg-error/10"
                                :disabled="processing[skill.id]" @click="handleUninstall(skill.id)"
                                :title="$t('common.uninstall')">
                                <span v-if="processing[skill.id]" class="loading loading-spinner loading-xs"></span>
                                <TrashIcon v-else class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Global Skills -->
        <div>
            <h3
                class="text-sm font-bold text-base-content/70 uppercase tracking-wider mb-4 px-1 flex items-center gap-2">
                {{ $t('skills.globalSkills') }}
                <span class="badge badge-ghost badge-sm font-normal normal-case">{{ globalSkills.length }}</span>
            </h3>

            <div v-if="!globalSkills.length" class="text-center p-8 border-2 border-dashed border-base-200 rounded-lg">
                <p class="text-base-content/50">{{ $t('skills.noGlobalSkills') }}</p>
            </div>

            <div v-else class="grid grid-cols-1 gap-3">
                <div v-for="skill in globalSkills" :key="skill.id"
                    class="card bg-base-100 border border-base-200 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                    <div class="card-body p-4 flex-row items-center justify-between gap-4">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div
                                class="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
                                <CubeTransparentIcon class="w-6 h-6" />
                            </div>
                            <div class="min-w-0">
                                <h3 class="font-bold truncate" :title="skill.name">
                                    {{ getSkillDisplayName(skill.id) }}
                                </h3>
                                <p class="text-xs text-base-content/60 font-mono truncate">{{ skill.path }}</p>
                            </div>
                        </div>

                        <div class="flex items-center gap-2 shrink-0">
                            <div class="badge badge-ghost badge-sm">{{ $t('common.global') }}</div>

                            <button class="btn btn-ghost btn-square btn-sm text-base-content/40 hover:text-error"
                                :disabled="processingGlobal[skill.id]" @click="handleUninstallGlobal(skill.id)"
                                :title="$t('common.uninstall')">
                                <span v-if="processingGlobal[skill.id]"
                                    class="loading loading-spinner loading-xs"></span>
                                <TrashIcon v-else class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
