import {
    buildDeliveryValidationPayload,
    type DeliveryTarget,
} from '../../utils/delivery-targets.ts'

export function parseEmailRecipients(text: string): string[] {
    const seen = new Set<string>()
    const recipients: string[] = []

    for (const part of text.split(/[\n,]/)) {
        const recipient = part.trim()
        if (!recipient || seen.has(recipient)) {
            continue
        }
        seen.add(recipient)
        recipients.push(recipient)
    }

    return recipients
}

export function stringifyEmailRecipients(input: string[]): string {
    return input.map(recipient => recipient.trim()).filter(Boolean).join('\n')
}

export function buildEditorEmission(input: DeliveryTarget[]): {
    modelValue: DeliveryTarget[]
    validation: { valid: boolean; errors: string[] }
} {
    const payload = buildDeliveryValidationPayload(input)

    return {
        modelValue: payload.value,
        validation: {
            valid: payload.valid,
            errors: payload.errors,
        },
    }
}
