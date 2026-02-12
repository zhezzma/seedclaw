<script setup lang="ts">
import { useConfirm } from '../composables/useConfirm'

const { show, title, message, cancel, ok } = useConfirm()
</script>

<template>
    <Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': show }">
            <div class="modal-box">
                <h3 class="font-bold text-lg">{{ title }}</h3>
                <p class="py-4 whitespace-pre-wrap">{{ message }}</p>
                <div class="modal-action">
                    <button class="btn" @click="cancel">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="ok">{{ $t('common.ok') }}</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button @click="cancel">close</button>
            </form>
        </dialog>
    </Teleport>
</template>
