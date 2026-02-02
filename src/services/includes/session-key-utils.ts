export type ParsedAgentSessionKey = {
    agentId: string;
    rest: string;
};

export function parseAgentSessionKey(
    sessionKey: string | undefined | null,
): ParsedAgentSessionKey | null {
    const raw = (sessionKey ?? "").trim();
    if (!raw) {
        return null;
    }
    const parts = raw.split(":").filter(Boolean);
    if (parts.length < 3) {
        return null;
    }
    if (parts[0] !== "agent") {
        return null;
    }
    const agentId = parts[1]?.trim();
    const rest = parts.slice(2).join(":");
    if (!agentId || !rest) {
        return null;
    }
    return { agentId, rest };
}

/**
 * Check if sessionKey is an agent's main session (agent:xxx:main format)
 * Returns true for: agent:coder:main, agent:main:main
 * Returns false for: agent:main:session:xxx, session:xxx, main
 */
export function isAgentMainSession(sessionKey: string | undefined | null): boolean {
    const parsed = parseAgentSessionKey(sessionKey);
    if (!parsed) {
        return false;
    }
    // Only return true if rest is a simple key like 'main', not 'session:xxx'
    return !parsed.rest.includes(':');
}

/**
 * Create a main session key for an agent
 * Format: agent:{agentId}:main
 */
export function createAgentMainSessionKey(agentId: string): string {
    return `agent:${agentId}:main`;
}

export function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
    const raw = (sessionKey ?? "").trim();
    if (!raw) {
        return false;
    }
    if (raw.toLowerCase().startsWith("subagent:")) {
        return true;
    }
    const parsed = parseAgentSessionKey(raw);
    return Boolean((parsed?.rest ?? "").toLowerCase().startsWith("subagent:"));
}

export function isAcpSessionKey(sessionKey: string | undefined | null): boolean {
    const raw = (sessionKey ?? "").trim();
    if (!raw) {
        return false;
    }
    const normalized = raw.toLowerCase();
    if (normalized.startsWith("acp:")) {
        return true;
    }
    const parsed = parseAgentSessionKey(raw);
    return Boolean((parsed?.rest ?? "").toLowerCase().startsWith("acp:"));
}

const THREAD_SESSION_MARKERS = [":thread:", ":topic:"];

export function resolveThreadParentSessionKey(
    sessionKey: string | undefined | null,
): string | null {
    const raw = (sessionKey ?? "").trim();
    if (!raw) {
        return null;
    }
    const normalized = raw.toLowerCase();
    let idx = -1;
    for (const marker of THREAD_SESSION_MARKERS) {
        const candidate = normalized.lastIndexOf(marker);
        if (candidate > idx) {
            idx = candidate;
        }
    }
    if (idx <= 0) {
        return null;
    }
    const parent = raw.slice(0, idx).trim();
    return parent ? parent : null;
}