<script setup lang="ts">
// Props
defineProps<{
    agent: any
}>()
</script>

<template>
    <div class="space-y-4">
        <div class="flex justify-between items-center">
            <div class="flex flex-col">
                <h3 class="font-bold">Skills</h3>
                <span class="text-xs text-base-content/60">External capabilities and integrations</span>
            </div>
            <button class="btn btn-sm btn-primary">Add Skill</button>
        </div>

        <div class="overflow-x-auto bg-base-100 rounded-lg border border-base-200">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="i in 3" :key="i">
                        <td class="font-medium">skill-package-{{ i }}</td>
                        <td>
                            <div class="badge badge-ghost badge-sm">npm</div>
                        </td>
                        <td>
                            <div class="badge badge-success badge-outline badge-sm">Active</div>
                        </td>
                        <td><button class="btn btn-ghost btn-xs">Configure</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
