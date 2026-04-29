
/**
 * Audio Manager
 * Ensures that only one audio source is playing at a time (Mutual Exclusion).
 */

type StopCallback = () => void

let currentStopCallback: StopCallback | null = null
let activeSourceId: string | null = null

/**
 * Request control of the audio output.
 * If another source is playing, it will be stopped.
 * 
 * @param sourceId Debug identifier for the source requesting control
 * @param stopFn Callback to execute when this source needs to be stopped
 */
export function takeAudioControl(sourceId: string, stopFn: StopCallback) {
    if (activeSourceId === sourceId && currentStopCallback === stopFn) {
        return
    }

    if (currentStopCallback) {
        // console.log(`[AudioManager] Stopping ${activeSourceId} for ${sourceId}`)
        try {
            currentStopCallback()
        } catch (e) {
            console.error('[AudioManager] Error stopping previous audio:', e)
        }
    }

    currentStopCallback = stopFn
    activeSourceId = sourceId
    // console.log(`[AudioManager] ${sourceId} took control`)
}

/**
 * Release control of the audio output.
 * Only releases if the caller is the current active source.
 * 
 * @param stopFn The callback that was originally registered (used for validation)
 */
export function releaseAudioControl(stopFn: StopCallback) {
    if (currentStopCallback === stopFn) {
        currentStopCallback = null
        activeSourceId = null
        // console.log(`[AudioManager] Control released`)
    }
}
