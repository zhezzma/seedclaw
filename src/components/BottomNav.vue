<script setup lang="ts">
import { ref } from 'vue'
import {
    ChatBubbleLeftRightIcon,
    SparklesIcon,
    CalendarDaysIcon,
    PencilSquareIcon,
    UserCircleIcon
} from '@heroicons/vue/24/outline'
import {
    ChatBubbleLeftRightIcon as ChatBubbleLeftRightIconSolid,
    SparklesIcon as SparklesIconSolid,
    CalendarDaysIcon as CalendarDaysIconSolid,
    PencilSquareIcon as PencilSquareIconSolid,
    UserCircleIcon as UserCircleIconSolid
} from '@heroicons/vue/24/solid'

const activeTab = ref('chat')

const tabs = [
    { id: 'chat', label: '问AI', icon: ChatBubbleLeftRightIcon, iconActive: ChatBubbleLeftRightIconSolid },
    { id: 'discover', label: '发现', icon: SparklesIcon, iconActive: SparklesIconSolid },
    { id: 'event', label: '活动', icon: CalendarDaysIcon, iconActive: CalendarDaysIconSolid },
    { id: 'create', label: '创作', icon: PencilSquareIcon, iconActive: PencilSquareIconSolid },
    { id: 'profile', label: '我的', icon: UserCircleIcon, iconActive: UserCircleIconSolid },
]
</script>

<template>
    <!-- Bottom navigation (mobile only) -->
    <nav class="fixed bottom-0 left-0 right-0 lg:hidden z-50">
        <!-- Glassmorphism background -->
        <div class="bg-base-100/80 backdrop-blur-xl border-t border-base-300/50 shadow-lg">
            <div class="flex items-center justify-around px-2 py-2 safe-area-bottom">
                <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
                    class="flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-2xl transition-all duration-200"
                    :class="activeTab === tab.id
                        ? 'text-primary bg-primary/10'
                        : 'text-base-content/60 hover:text-base-content hover:bg-base-200'">
                    <component :is="activeTab === tab.id ? tab.iconActive : tab.icon"
                        class="w-6 h-6 transition-transform duration-200"
                        :class="activeTab === tab.id ? 'scale-110' : ''" />
                    <span class="text-xs font-medium">{{ tab.label }}</span>
                </button>
            </div>
        </div>
    </nav>
</template>

<style scoped>
/* Safe area for iOS devices */
.safe-area-bottom {
    padding-bottom: env(safe-area-inset-bottom, 0.5rem);
}

/* Active tab indicator animation */
button {
    position: relative;
}

button::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) scaleX(0);
    width: 20px;
    height: 3px;
    background: oklch(var(--p));
    border-radius: 2px;
    transition: transform 0.2s ease;
}

button.text-primary::after {
    transform: translateX(-50%) scaleX(1);
}
</style>
