export type TaskExecutionTarget =
    | { type: 'newSession'; agentId: string }
    | { type: 'existingSession'; sessionId: string; sessionName?: string; sessionCategory?: 'default' | 'task' };

export interface ExecutionTargetSummary {
    mode: 'newSession' | 'existingSession'
    primaryText: string
    fallbackId?: string
}

export function summarizeExecutionTarget(target: TaskExecutionTarget, agentName?: string): ExecutionTargetSummary {
    if (target.type === 'newSession') {
        return {
            mode: 'newSession',
            primaryText: agentName || target.agentId,
        }
    }

    return {
        mode: 'existingSession',
        primaryText: target.sessionName || target.sessionId,
        fallbackId: target.sessionId,
    }
}
