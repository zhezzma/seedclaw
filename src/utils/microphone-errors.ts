export function getMicrophoneErrorMessage(error: unknown): string {
    const name = String((error as any)?.name || '')
    const message = String((error as any)?.message || '')

    if (name === 'NotFoundError' || message.includes('Requested device not found')) {
        return '未找到可用的麦克风设备'
    }

    // 移动端/旧浏览器常见权限错误名：
    // - NotAllowedError
    // - PermissionDeniedError (legacy)
    // 统一提示用户检查浏览器/系统麦克风权限。
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return '麦克风权限未开启，请检查浏览器或系统设置'
    }

    // 某些移动端浏览器在设备被系统占用、硬件异常或录音链路被中断时会抛这些错误。
    if (name === 'NotReadableError' || name === 'AbortError') {
        return '麦克风当前不可用，请稍后重试'
    }

    return message || '启动录音失败'
}
