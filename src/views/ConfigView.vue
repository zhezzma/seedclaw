<script setup lang="ts">
import ViewHeader from '@/components/ViewHeader.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
    <div class="flex flex-col h-full bg-base-200">
        <ViewHeader :title="$t('config.title')" />
        <div class="flex-1 p-4 flex items-center justify-center">
            <p class="text-base-content/60">Configuration editing is currently disabled.</p>
        </div>
    </div>
</template>
