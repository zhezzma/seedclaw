export interface SessionSearchCandidate {
    id: string
    name?: string
    agentId?: string
    agentName?: string
    sessionCategory?: 'default' | 'task'
    modified?: string
}

const toComparable = (value?: string) => (value || '').toLowerCase()

const rankCandidate = (candidate: SessionSearchCandidate, q: string) => {
    if (!q) return 0
    const id = toComparable(candidate.id)
    const name = toComparable(candidate.name)
    if (id.startsWith(q)) return 1
    if (name.startsWith(q)) return 2
    if (id.includes(q)) return 3
    if (name.includes(q)) return 4
    return Number.POSITIVE_INFINITY
}

export function mergeExecutionTargetCandidates(
    cached: SessionSearchCandidate[],
    remote: SessionSearchCandidate[] = [],
    query = '',
    limit = 10,
): SessionSearchCandidate[] {
    const normalizedQuery = query.trim().toLowerCase()
    const byId = new Map<string, SessionSearchCandidate>()

    for (const candidate of [...cached, ...remote]) {
        const existing = byId.get(candidate.id)
        if (!existing) {
            byId.set(candidate.id, candidate)
            continue
        }

        const existingModified = new Date(existing.modified || 0).getTime()
        const candidateModified = new Date(candidate.modified || 0).getTime()
        byId.set(candidate.id, {
            ...existing,
            ...candidate,
            sessionCategory: existing.sessionCategory === 'task' || candidate.sessionCategory === 'task' ? 'task' : 'default',
            modified: new Date(Math.max(existingModified, candidateModified)).toISOString(),
            name: candidate.name || existing.name,
            agentId: candidateModified >= existingModified ? candidate.agentId : existing.agentId,
            agentName: candidateModified >= existingModified ? candidate.agentName : existing.agentName,
        })
    }

    return Array.from(byId.values())
        .filter(candidate => !normalizedQuery || Number.isFinite(rankCandidate(candidate, normalizedQuery)))
        .sort((a, b) => {
            const rankDiff = rankCandidate(a, normalizedQuery) - rankCandidate(b, normalizedQuery)
            if (rankDiff !== 0) return rankDiff
            const timeDiff = new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime()
            if (timeDiff !== 0) return timeDiff
            return a.id.localeCompare(b.id)
        })
        .slice(0, limit)
}
