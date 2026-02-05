<script setup lang="ts">
// Props
defineProps<{
    agent: any
}>()
</script>

<template>
    <div class="space-y-4">
        <div class="alert bg-base-100 border border-base-200">
            <div>
                <h3 class="font-bold">Core Files</h3>
                <div class="text-xs text-base-content/60">Core bootstrap and identity files</div>
            </div>
        </div>

        <div class="grid gap-3">
            <div v-for="file in ['AGENTS.md', 'SOUL.md', 'TOOLS.md', 'IDENTITY.md']" :key="file"
                class="flex items-center justify-between p-3 bg-base-100 rounded-lg border border-base-200 hover:border-primary/50 cursor-pointer transition-colors">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded bg-base-200 flex items-center justify-center">
                        <span class="i-heroicons-document text-base-content/70">📄</span>
                    </div>
                    <div>
                        <div class="font-medium text-sm">{{ file }}</div>
                        <div class="text-xs text-base-content/50">Last modified: Today</div>
                    </div>
                </div>
                <button class="btn btn-ghost btn-sm btn-square">
                    <span class="i-heroicons-pencil-square"></span>
                </button>
            </div>
        </div>
    </div>
</template>
