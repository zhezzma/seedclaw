<script setup lang="ts">
import { useConfirm } from '../composables/useConfirm'

const confirmState = useConfirm()
const { cancel, ok } = confirmState

</script>

<template>
    <Teleport to="body">
        <dialog class="modal z-[9999]" :class="{ 'modal-open': confirmState.show }">
            <div class="modal-box">
                <h3 class="font-bold text-lg">{{ confirmState.title }}</h3>
                <p class="py-4 whitespace-pre-wrap">{{ confirmState.message }}</p>
                <div class="modal-action">
                    <button class="btn" @click="cancel">{{ $t('common.cancel') }}</button>
                    <button class="btn btn-primary" @click="ok">{{ $t('common.ok') }}</button>
                </div>
            </div>
            <div class="modal-backdrop" @click="cancel">
                <button class="sr-only">{{ $t('common.close') }}</button>
            </div>
        </dialog>
    </Teleport>
</template>
