<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
    show: boolean
    mode: 'add' | 'edit'
}>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'saved', providerId: string): void
}>()

// Placeholder
</script>

<template>
    <!-- Placeholder -->
</template>
