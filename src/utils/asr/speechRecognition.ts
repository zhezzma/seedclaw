import { AudioProcessor, AudioProcessorCallbacks } from './audioProcessor';
import { useUiSettingsStore } from '../../stores/setting';
import { ASREngine } from './types';
import { FunASRService } from './fun-asr';

export interface SpeechRecognitionCallbacks {
    onResult: (text: string, isFinal: boolean) => void;
    onVoiceStart?: () => void;
    onVoiceEnd?: () => void;
}

export class SpeechRecognitionService {
    private audioProcessor: AudioProcessor;
    private currentEngine: ASREngine | null = null;
    private isRunning: boolean = false;
    private isASRConnected: boolean = false;
    private resultCallback: ((text: string, isFinal: boolean) => void) | null = null;
    private audioBuffer: Int16Array[] = [];

    constructor() {
        this.audioProcessor = new AudioProcessor();
    }

    /**
     * Start microphone only with VAD (no ASR connection yet)
     * Use this for "always listening" mode where ASR connects on voice detect
     */
    async startMicrophoneOnly(callbacks: SpeechRecognitionCallbacks): Promise<void> {
        if (this.isRunning) {
            console.warn('Speech recognition is already running.');
            return;
        }

        this.resultCallback = callbacks.onResult;

        try {
            const audioCallbacks: AudioProcessorCallbacks = {
                onData: (pcmData) => {
                    // Buffer audio data when ASR is not connected
                    if (!this.isASRConnected) {
                        // Keep small buffer for context when voice starts
                        this.audioBuffer.push(pcmData);
                        // Only keep last ~500ms of audio (about 4 frames at 128ms each)
                        if (this.audioBuffer.length > 4) {
                            this.audioBuffer.shift();
                        }
                    } else if (this.currentEngine) {
                        this.currentEngine.sendAudio(pcmData);
                    }
                },
                onVoiceStart: () => {
                    console.log('[SpeechRecognition] VAD: Voice start');
                    callbacks.onVoiceStart?.();
                },
                onVoiceEnd: () => {
                    console.log('[SpeechRecognition] VAD: Voice end');
                    callbacks.onVoiceEnd?.();
                }
            };

            await this.audioProcessor.start(audioCallbacks);
            this.isRunning = true;

        } catch (error) {
            console.error('Failed to start microphone:', error);
            this.stop();
            throw error;
        }
    }

    /**
     * Connect to ASR engine (call this when voice is detected)
     */
    async connectASR(): Promise<void> {
        if (!this.isRunning) {
            console.warn('Microphone not running, cannot connect ASR');
            return;
        }

        if (this.isASRConnected) {
            console.warn('ASR already connected');
            return;
        }

        const store = useUiSettingsStore();
        const engineType = store.asrEngine || 'fun-asr';

        try {
            // Select Engine
            if (engineType === 'fun-asr') {
                this.currentEngine = new FunASRService();
            } else {
                console.warn(`Unknown ASR engine: ${engineType}, defaulting to FunASR`);
                this.currentEngine = new FunASRService();
            }

            // Start Engine with result callback
            await this.currentEngine.start((text, isFinal) => {
                this.resultCallback?.(text, isFinal);
            });

            this.isASRConnected = true;
            console.log('[SpeechRecognition] ASR connected');

            // Send buffered audio to ASR for context
            if (this.audioBuffer.length > 0) {
                console.log(`[SpeechRecognition] Sending ${this.audioBuffer.length} buffered frames to ASR`);
                for (const buffer of this.audioBuffer) {
                    this.currentEngine.sendAudio(buffer);
                }
                this.audioBuffer = [];
            }

        } catch (error) {
            console.error('Failed to connect ASR:', error);
            this.isASRConnected = false;
            throw error;
        }
    }

    /**
     * Disconnect ASR engine (call this after voice ends to save resources)
     */
    async disconnectASR(): Promise<void> {
        if (!this.isASRConnected || !this.currentEngine) {
            return;
        }

        try {
            await this.currentEngine.stop();
        } catch (e) {
            console.error('Error stopping ASR engine:', e);
        }

        this.currentEngine = null;
        this.isASRConnected = false;
        this.audioBuffer = [];
        console.log('[SpeechRecognition] ASR disconnected');
    }

    /**
     * Legacy method: Start full speech recognition (mic + ASR together)
     * Kept for backward compatibility
     */
    async start(onResult: (text: string, isFinal: boolean) => void): Promise<void> {
        if (this.isRunning) {
            console.warn('Speech recognition is already running.');
            return;
        }

        const store = useUiSettingsStore();
        const engineType = store.asrEngine || 'fun-asr';

        try {
            // Select Engine
            if (engineType === 'fun-asr') {
                this.currentEngine = new FunASRService();
            } else {
                // Fallback or other engines
                console.warn(`Unknown ASR engine: ${engineType}, defaulting to FunASR`);
                this.currentEngine = new FunASRService();
            }

            // Start Engine
            await this.currentEngine.start(onResult);
            this.isRunning = true;
            this.isASRConnected = true;

            // Start Audio capture and feed to engine
            await this.audioProcessor.start((pcmData) => {
                if (this.currentEngine && this.isRunning) {
                    this.currentEngine.sendAudio(pcmData);
                }
            });

        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            this.stop();
            throw error;
        }
    }

    async stop(): Promise<void> {
        if (!this.isRunning) return;

        this.isRunning = false;

        // Stop Audio first
        this.audioProcessor.stop();

        // Stop Engine
        if (this.currentEngine) {
            await this.currentEngine.stop();
            this.currentEngine = null;
        }

        this.isASRConnected = false;
        this.audioBuffer = [];
        this.resultCallback = null;
    }

    /**
     * Check if ASR is currently connected
     */
    get isASRActive(): boolean {
        return this.isASRConnected;
    }

    /**
     * Check if microphone is running
     */
    get isMicrophoneActive(): boolean {
        return this.isRunning;
    }
}
