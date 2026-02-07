
// Voice Activity Detection (VAD) constants
const VAD_THRESHOLD = 0.015;        // RMS threshold for voice detection (adjust based on testing)
const VOICE_DETECT_FRAMES = 3;      // Consecutive frames needed to confirm voice start
const VOICE_END_FRAMES = 10;        // Consecutive silent frames needed to confirm voice end

export interface AudioProcessorCallbacks {
    onData: (data: Int16Array) => void;
    onVoiceStart?: () => void;
    onVoiceEnd?: () => void;
}

export class AudioProcessor {
    private context: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private processor: ScriptProcessorNode | null = null;
    private input: MediaStreamAudioSourceNode | null = null;

    // VAD state
    private isSendingData: boolean = true;
    private isVoiceActive: boolean = false;
    private voiceFrameCount: number = 0;
    private silenceFrameCount: number = 0;
    private callbacks: AudioProcessorCallbacks | null = null;

    async start(callbacks: AudioProcessorCallbacks | ((data: Int16Array) => void)) {
        // Support both old simple callback and new callbacks object
        if (typeof callbacks === 'function') {
            this.callbacks = { onData: callbacks };
        } else {
            this.callbacks = callbacks;
        }

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

                // VAD: Always check voice activity
                this.detectVoiceActivity(inputData);

                // Only send data if not paused
                if (this.isSendingData && this.callbacks?.onData) {
                    const pcmData = this.floatTo16BitPCM(inputData);
                    this.callbacks.onData(pcmData);
                }
            };

            this.input.connect(this.processor);
            this.processor.connect(this.context.destination); // Needed for processing to happen in some browsers

            // Reset VAD state
            this.isVoiceActive = false;
            this.voiceFrameCount = 0;
            this.silenceFrameCount = 0;
            this.isSendingData = true;

        } catch (error) {
            console.error('Failed to start audio recording:', error);
            throw error;
        }
    }

    /**
     * Pause sending audio data (mic stays active for VAD)
     */
    pause() {
        this.isSendingData = false;
    }

    /**
     * Resume sending audio data
     */
    resume() {
        this.isSendingData = true;
    }

    /**
     * Check if currently sending audio data
     */
    get isPaused(): boolean {
        return !this.isSendingData;
    }

    /**
     * Check if voice is currently detected
     */
    get isVoiceDetected(): boolean {
        return this.isVoiceActive;
    }

    /**
     * Detect voice activity using RMS (Root Mean Square)
     */
    private detectVoiceActivity(inputData: Float32Array) {
        // Calculate RMS (Root Mean Square) for volume level
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        const isLoud = rms > VAD_THRESHOLD;

        if (isLoud) {
            this.voiceFrameCount++;
            this.silenceFrameCount = 0;

            // Voice started
            if (!this.isVoiceActive && this.voiceFrameCount >= VOICE_DETECT_FRAMES) {
                this.isVoiceActive = true;
                console.log('[VAD] Voice start detected, RMS:', rms.toFixed(4));
                this.callbacks?.onVoiceStart?.();
            }
        } else {
            this.silenceFrameCount++;
            this.voiceFrameCount = 0;

            // Voice ended
            if (this.isVoiceActive && this.silenceFrameCount >= VOICE_END_FRAMES) {
                this.isVoiceActive = false;
                console.log('[VAD] Voice end detected');
                this.callbacks?.onVoiceEnd?.();
            }
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

        // Reset state
        this.isVoiceActive = false;
        this.voiceFrameCount = 0;
        this.silenceFrameCount = 0;
        this.isSendingData = true;
        this.callbacks = null;
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
