import { useToastStore } from '../../stores/toast'

class MarkdownWorkerWrapper {
    private worker: Worker;
    private pendingRequests: Map<string, { resolve: (value: string) => void, reject: (reason: any) => void }>;
    private isWorkerReady: boolean = false;

    constructor() {
        this.pendingRequests = new Map();

        // Create the worker
        this.worker = new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' });

        // Set up message handler
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = this.handleWorkerError.bind(this);

        this.isWorkerReady = true;
    }

    /**
     * Render markdown text to HTML using the worker
     * @param text Markdown text to render
     * @returns Promise that resolves to the rendered HTML
     */
    render(text: string): Promise<string> {
        // If the worker isn't ready, render synchronously as fallback
        if (!this.isWorkerReady) {
            console.warn('Markdown worker not ready, rendering synchronously');
            // This would need a synchronous implementation as fallback
            return Promise.resolve(`<p>${text}</p>`);
        }

        return new Promise((resolve, reject) => {
            // Generate a unique ID for this request
            const requestId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

            // Store the promise callbacks
            this.pendingRequests.set(requestId, { resolve, reject });

            // Send the request to the worker
            this.worker.postMessage({
                id: requestId,
                text
            });
        });
    }

    /**
     * Handle messages from the worker
     */
    private handleWorkerMessage(event: MessageEvent) {
        const { id, html, error } = event.data;

        // Find the pending request
        const request = this.pendingRequests.get(id);
        if (!request) {
            console.warn(`No pending request found for ID: ${id}`);
            return;
        }

        // Resolve or reject the promise
        if (error) {
            request.reject(new Error(error));
        } else {
            request.resolve(html);
        }

        // Clean up
        this.pendingRequests.delete(id);
    }

    /**
     * Handle worker errors
     */
    private handleWorkerError(error: ErrorEvent) {
        console.error('Markdown worker error:', error);

        // Reject all pending requests
        for (const [id, request] of this.pendingRequests.entries()) {
            request.reject(new Error('Worker error: ' + error.message));
            this.pendingRequests.delete(id);
        }

        // Mark the worker as not ready
        this.isWorkerReady = false;

        // Try to restart the worker
        this.restartWorker();
    }

    /**
     * Restart the worker if it crashes
     */
    private restartWorker() {
        try {
            // Terminate the existing worker
            if (this.worker) {
                this.worker.terminate();
            }

            // Create a new worker
            this.worker = new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' });

            // Set up message handler
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = this.handleWorkerError.bind(this);

            this.isWorkerReady = true;
        } catch (error) {
            console.error('Failed to restart markdown worker:', error);
            useToastStore().error('Markdown rendering engine failed to restart');
        }
    }
}

// Create a singleton instance
const markdownWorker = new MarkdownWorkerWrapper();

export default markdownWorker;
