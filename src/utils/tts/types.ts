export interface TTSEngine {
    readonly streamFormat: 'pcm' | 'compressed'

    stream(text: string, callbacks: {
        onChunk: (data: Uint8Array) => void,
        onEnd: () => void,
        onError: (err: any) => void
    }): Promise<void>

    ttsPromise(text: string): Promise<Blob>
}
