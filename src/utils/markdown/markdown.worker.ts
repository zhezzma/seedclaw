// Markdown rendering worker
import { createMarkdownItInstance } from './markdown-config'

const ctx: Worker = self as any;

// Initialize markdown-it instance
const md = createMarkdownItInstance({
    onCopySuccess: () => { }
})


// Listen for messages from the main thread
ctx.addEventListener('message', (event) => {
    const { id, text } = event.data;

    try {
        // Render the markdown
        const renderedHtml = md.render(text || "");

        // Send the result back to the main thread
        ctx.postMessage({
            id,
            html: renderedHtml,
            error: null
        });
    } catch (error: any) {
        // Send any errors back to the main thread
        ctx.postMessage({
            id,
            html: "",
            error: error.message
        });
    }
});

export { };
