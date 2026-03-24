import type { SessionSearchCandidate } from './cron-session-search'

export function formatSessionCandidateDisplay(candidate?: Pick<SessionSearchCandidate, 'id' | 'name'> | null): string {
  if (!candidate?.id) return ''
  const trimmedName = candidate.name?.trim()
  return trimmedName ? `${trimmedName} / ${candidate.id}` : candidate.id
}

export function findExactSessionCandidate(
  candidates: SessionSearchCandidate[],
  rawValue: string,
): SessionSearchCandidate | undefined {
  const sessionId = rawValue.trim()
  if (!sessionId) return undefined
  return candidates.find(candidate => candidate.id === sessionId)
}

export function findSessionCandidateById(
  candidates: SessionSearchCandidate[],
  sessionId: string,
): SessionSearchCandidate | undefined {
  const normalized = sessionId.trim()
  if (!normalized) return undefined
  return candidates.find(candidate => candidate.id === normalized)
}
