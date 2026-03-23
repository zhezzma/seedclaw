<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DeliveryTarget } from '../../utils/delivery-targets.ts'
import {
    buildEditorEmission,
    parseEmailRecipients,
    stringifyEmailRecipients,
} from './delivery-targets-editor-state.ts'

type DeliveryTargetType = DeliveryTarget['type']

interface EditorRow {
    key: string
    type: DeliveryTargetType
    recipientsText: string
}

const props = defineProps<{
    modelValue: DeliveryTarget[]
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: DeliveryTarget[]): void
    (e: 'validation-change', payload: { valid: boolean; errors: string[] }): void
}>()

const { t } = useI18n()

function createRow(type: DeliveryTargetType, recipientsText = ''): EditorRow {
    return {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        recipientsText,
    }
}

function toEditorRows(input: DeliveryTarget[]): EditorRow[] {
    const normalizedInput = input?.length === 1 && input[0]?.type === 'none'
        ? []
        : (input || [])

    return normalizedInput.map(target => {
        if (target.type === 'email') {
            return createRow('email', stringifyEmailRecipients(target.to))
        }
        return createRow(target.type)
    })
}

function toRawTargets(rows: EditorRow[]): DeliveryTarget[] {
    return rows.map(row => {
        if (row.type === 'email') {
            return {
                type: 'email',
                to: parseEmailRecipients(row.recipientsText),
            }
        }
        return { type: row.type }
    })
}

const rows = ref<EditorRow[]>(toEditorRows(props.modelValue))
const validationErrors = ref<string[]>([])

function emitChanges() {
    const { modelValue, validation } = buildEditorEmission(toRawTargets(rows.value))
    rows.value = toEditorRows(modelValue)
    validationErrors.value = validation.errors
    emit('update:modelValue', modelValue)
    emit('validation-change', validation)
}

function addTarget(type: DeliveryTargetType) {
    rows.value.push(createRow(type))
    emitChanges()
}

function removeTarget(key: string) {
    rows.value = rows.value.filter(row => row.key !== key)
    emitChanges()
}

function handleTypeChange(row: EditorRow, type: DeliveryTargetType) {
    row.type = type
    if (type !== 'email') {
        row.recipientsText = ''
    }
    emitChanges()
}

onMounted(() => {
    emitChanges()
})
</script>

<template>
    <div class="space-y-3 rounded-box border border-base-300 bg-base-100/60 p-4">
        <div class="flex items-start justify-between gap-3">
            <div>
                <h4 class="font-medium">{{ t('delivery.targets') }}</h4>
                <p class="text-xs text-base-content/60 mt-1">{{ t('delivery.description') }}</p>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
                <button type="button" class="btn btn-xs btn-outline" @click="addTarget('notification')">
                    {{ t('delivery.addNotification') }}
                </button>
                <button type="button" class="btn btn-xs btn-outline" @click="addTarget('email')">
                    {{ t('delivery.addEmail') }}
                </button>
            </div>
        </div>

        <div v-if="rows.length === 0" class="rounded-box border border-dashed border-base-300 px-3 py-4 text-sm text-base-content/50">
            {{ t('delivery.emptyState') }}
        </div>

        <div v-for="row in rows" :key="row.key" class="rounded-box border border-base-300 p-3 space-y-3">
            <div class="flex items-center gap-2">
                <div class="flex-1">
                    <label class="label py-1">
                        <span class="label-text text-xs">{{ t('delivery.type') }}</span>
                    </label>
                    <select
                        class="select select-bordered select-sm w-full"
                        :value="row.type"
                        @change="handleTypeChange(row, ($event.target as HTMLSelectElement).value as DeliveryTargetType)"
                    >
                        <option value="notification">{{ t('delivery.notification') }}</option>
                        <option value="email">{{ t('delivery.email') }}</option>
                        <option value="none">{{ t('delivery.none') }}</option>
                    </select>
                </div>
                <button type="button" class="btn btn-sm btn-ghost text-error mt-6" @click="removeTarget(row.key)">
                    {{ t('common.delete') }}
                </button>
            </div>

            <div v-if="row.type === 'email'" class="form-control w-full">
                <label class="label py-1">
                    <span class="label-text text-xs">{{ t('delivery.recipients') }}</span>
                </label>
                <textarea
                    v-model="row.recipientsText"
                    class="textarea textarea-bordered min-h-24 w-full"
                    :placeholder="t('delivery.recipientsPlaceholder')"
                    @input="emitChanges"
                />
            </div>
        </div>

        <div v-if="validationErrors.length > 0" class="alert alert-warning py-2 text-sm">
            <div>
                <div class="font-medium">{{ t('delivery.validationTitle') }}</div>
                <ul class="mt-1 list-disc pl-5">
                    <li v-for="error in validationErrors" :key="error">{{ error }}</li>
                </ul>
            </div>
        </div>
    </div>
</template>
