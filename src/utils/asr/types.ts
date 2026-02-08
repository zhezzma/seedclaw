export interface ASREngine {
    start(onResult: (text: string, isFinal: boolean) => void): Promise<void>;
    sendAudio(pcmData: Int16Array): void | Promise<void>;
    stop(): Promise<void>;
}
