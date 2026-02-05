<script setup lang="ts">
// Props
defineProps<{
    agent: any
}>()
</script>

<template>
    <div class="space-y-6">
        <!-- Identity Section -->
        <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body">
                <h3 class="card-title text-base mb-4">Identity & Metadata</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="form-control">
                        <label class="label">
                            <span class="label-text">Display Name</span>
                        </label>
                        <input type="text" :value="agent.name" readonly class="input input-bordered w-full" />
                    </div>
                    <div class="form-control">
                        <label class="label">
                            <span class="label-text">Agent ID</span>
                        </label>
                        <input type="text" :value="agent.id" readonly
                            class="input input-bordered w-full font-mono text-sm" />
                    </div>
                    <div class="form-control">
                        <label class="label">
                            <span class="label-text">Description</span>
                        </label>
                        <textarea :value="agent.description" readonly
                            class="textarea textarea-bordered h-24"></textarea>
                    </div>
                </div>
            </div>
        </div>

        <!-- Configuration Placeholders -->
        <div class="card bg-base-100 shadow-sm border border-base-200">
            <div class="card-body">
                <h3 class="card-title text-base mb-4">Core Model</h3>
                <div class="alert alert-info bg-info/10 text-info-content border-info/20">
                    <span class="text-sm">Model configuration is managed via the configuration file.</span>
                </div>
            </div>
        </div>
    </div>
</template>
