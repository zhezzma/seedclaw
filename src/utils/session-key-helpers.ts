import { parseAgentSessionKey } from "~openclaw/src/sessions/session-key-utils";
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

