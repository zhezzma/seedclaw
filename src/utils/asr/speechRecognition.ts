import { AudioProcessor } from './audioProcessor';
import { useUiSettingsStore } from '../../stores/setting';
import { ASREngine } from './types';
import { FunASRService } from './fun-asr';

export class SpeechRecognitionService {
    private audioProcessor: AudioProcessor;
    private currentEngine: ASREngine | null = null;
    private isRunning: boolean = false;

    constructor() {
        this.audioProcessor = new AudioProcessor();
    }

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
    }
}
