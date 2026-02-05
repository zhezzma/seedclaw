<script setup lang="ts">
// Props
defineProps<{
    agent: any
}>()
</script>

<template>
    <div class="space-y-4">
        <div class="flex justify-between items-center">
            <h3 class="font-bold">Enabled Tools</h3>
            <button class="btn btn-sm">Manage Tools</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div v-for="i in 5" :key="i" class="card bg-base-100 border border-base-200 card-sm">
                <div class="card-body">
                    <div class="flex items-center gap-2 mb-2">
                        <div class="badge badge-success badge-xs"></div>
                        <span class="font-mono text-xs font-bold">tool_name_{{ i }}</span>
                    </div>
                    <p class="text-xs text-base-content/60">Allows the agent to perform specific action {{ i }}</p>
                </div>
            </div>
        </div>
    </div>
</template>
