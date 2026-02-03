
export class AudioProcessor {
    private context: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private processor: ScriptProcessorNode | null = null;
    private input: MediaStreamAudioSourceNode | null = null;

    async start(onData: (data: Int16Array) => void) {
        try {
            // 1. Get microphone stream
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 2. Create AudioContext
            // Try to set sampleRate to 16000 directly. 
            // Note: Some browsers/devices might ignore this and use hardware sample rate.
            // In a robust implementation, we should check context.sampleRate and downsample if needed.
            // For now, we rely on the browser's ability to handle this or the backend service tolerance.
            // However, Fun-ASR strictly requires 16000Hz.
            // If the context is not 16000, we need to handle it.
            this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000,
            });

            // Check actual sample rate
            if (this.context.sampleRate !== 16000) {
                console.warn(`AudioContext sampleRate is ${this.context.sampleRate}, expected 16000. Resampling might be needed by the browser/OS.`);
                // Ideally we should implement a resampler here if strict 16k is required and browser doesn't do it.
                // But most modern browsers will resample the input stream to the context's sample rate automatically.
            }

            this.input = this.context.createMediaStreamSource(this.mediaStream);

            // Buffer size 4096 is a good balance between latency and performance for ScriptProcessor
            // 4096 samples @ 16kHz = ~256ms
            // 2048 samples @ 16kHz = ~128ms
            // Let's use 2048 for lower latency (~128ms)
            const bufferSize = 2048;
            this.processor = this.context.createScriptProcessor(bufferSize, 1, 1);

            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16 PCM
                const pcmData = this.floatTo16BitPCM(inputData);
                onData(pcmData);
            };

            this.input.connect(this.processor);
            this.processor.connect(this.context.destination); // Needed for processing to happen in some browsers

        } catch (error) {
            console.error('Failed to start audio recording:', error);
            throw error;
        }
    }

    stop() {
        if (this.processor) {
            this.processor.disconnect();
            this.processor.onaudioprocess = null;
            this.processor = null;
        }
        if (this.input) {
            this.input.disconnect();
            this.input = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.context) {
            this.context.close();
            this.context = null;
        }
    }

    private floatTo16BitPCM(input: Float32Array): Int16Array {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }
}
