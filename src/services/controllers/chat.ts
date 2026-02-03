import type { GatewayBrowserClient } from "../gateway";
import type { ChatAttachment } from "../ui-types";
import { extractText } from "../chat/message-extract";
import { generateUUID } from "../uuid";

export type ChatState = {
    client: GatewayBrowserClient | null;
    connected: boolean;
    sessionKey: string;
    chatLoading: boolean;
    chatMessages: unknown[];
    chatThinkingLevel: string | null;
    chatSending: boolean;
    chatMessage: string;
    chatAttachments: ChatAttachment[];
    chatRunId: string | null;
    chatStream: string | null;
    chatStreamStartedAt: number | null;
    lastError: string | null;
};

export type ChatEventPayload = {
    runId: string;
    sessionKey: string;
    state: "delta" | "final" | "aborted" | "error";
    message?: unknown;
    errorMessage?: string;
};

export async function loadChatHistory(state: ChatState) {
    if (!state.client || !state.connected) {
        return;
    }
    state.chatLoading = true;
    state.lastError = null;
    try {
        const res: any = await state.client.request("chat.history", {
            sessionKey: state.sessionKey,
            limit: 200,
        });
        state.chatMessages = Array.isArray(res.messages) ? res.messages : [];
        state.chatThinkingLevel = res.thinkingLevel ?? null;
    } catch (err) {
        state.lastError = String(err);
    } finally {
        state.chatLoading = false;
    }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
    // Match data:MIMETYPE;base64,DATA. MIMETYPE can contain ; characters (e.g. charset).
    // We look for the ";base64," marker.
    const marker = ";base64,";
    const markerIndex = dataUrl.indexOf(marker);
    if (markerIndex === -1 || !dataUrl.startsWith("data:")) {
        return null;
    }

    const mimeType = dataUrl.substring(5, markerIndex);
    const content = dataUrl.substring(markerIndex + marker.length);

    return { mimeType, content };
}

export async function sendChatMessage(
    state: ChatState,
    message: string,
    attachments?: ChatAttachment[],
): Promise<string | null> {
    if (!state.client || !state.connected) {
        return null;
    }
    const msg = message.trim();
    const hasAttachments = attachments && attachments.length > 0;
    if (!msg && !hasAttachments) {
        return null;
    }

    const now = Date.now();

    // Build user message content blocks
    const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
    if (msg) {
        contentBlocks.push({ type: "text", text: msg });
    }
    // Add image/file previews to the message for display
    if (hasAttachments) {
        for (const att of attachments) {
            if (att.mimeType.startsWith("image/")) {
                contentBlocks.push({
                    type: "image",
                    source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
                });
            } else {
                contentBlocks.push({
                    type: "file",
                    text: `[File: ${att.name || "attachment"}]`, // Fallback text representation
                    source: { type: "base64", media_type: att.mimeType, data: att.dataUrl, name: att.name },
                });
            }
        }
    }

    state.chatMessages = [
        ...state.chatMessages,
        {
            role: "user",
            content: contentBlocks,
            timestamp: now,
        },
    ];

    state.chatSending = true;
    state.lastError = null;
    const runId = generateUUID();
    state.chatRunId = runId;
    state.chatStream = "";
    state.chatStreamStartedAt = now;

    // Convert attachments to API format
    const apiAttachments = hasAttachments
        ? attachments
            .map((att) => {
                const parsed = dataUrlToBase64(att.dataUrl);
                if (!parsed) {
                    return null;
                }
                const isImage = att.mimeType.startsWith("image/");
                return {
                    type: isImage ? "image" : "file",
                    mimeType: parsed.mimeType,
                    content: parsed.content,
                    name: att.name
                };
            })
            .filter((a): a is NonNullable<typeof a> => a !== null)
        : undefined;

    try {
        await state.client.request("chat.send", {
            sessionKey: state.sessionKey,
            message: msg,
            deliver: false,
            idempotencyKey: runId,
            attachments: apiAttachments,
        });
        return runId;
    } catch (err) {
        const error = String(err);
        state.chatRunId = null;
        state.chatStream = null;
        state.chatStreamStartedAt = null;
        state.lastError = error;
        state.chatMessages = [
            ...state.chatMessages,
            {
                role: "assistant",
                content: [{ type: "text", text: "Error: " + error }],
                timestamp: Date.now(),
            },
        ];
        return null;
    } finally {
        state.chatSending = false;
    }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
    if (!state.client || !state.connected) {
        return false;
    }
    const runId = state.chatRunId;
    try {
        await state.client.request(
            "chat.abort",
            runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
        );
        return true;
    } catch (err) {
        state.lastError = String(err);
        return false;
    }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
    if (!payload) {
        return null;
    }
    if (payload.sessionKey !== state.sessionKey) {
        return null;
    }

    // Final from another run (e.g. sub-agent announce): refresh history to show new message.
    // See https://github.com/openclaw/openclaw/issues/1909
    if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
        if (payload.state === "final") {
            return "final";
        }
        return null;
    }

    if (payload.state === "delta") {
        const next = extractText(payload.message);
        if (typeof next === "string") {
            const current = state.chatStream ?? "";
            if (!current || next.length >= current.length) {
                state.chatStream = next;
            }
        }
    } else if (payload.state === "final") {
        if (payload.message) {
            state.chatMessages = [...state.chatMessages, payload.message];
        }
        state.chatStream = null;
        state.chatRunId = null;
        state.chatStreamStartedAt = null;
    } else if (payload.state === "aborted") {
        state.chatStream = null;
        state.chatRunId = null;
        state.chatStreamStartedAt = null;
    } else if (payload.state === "error") {
        state.chatStream = null;
        state.chatRunId = null;
        state.chatStreamStartedAt = null;
        state.lastError = payload.errorMessage ?? "chat error";
    }
    return payload.state;
}