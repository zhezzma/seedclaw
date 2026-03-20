import { createRuntimeId } from '../utils/runtime-id.ts'

export interface ConvexSkill {
    latestVersion?: {
        _id: string
        _creationTime: number
        changelog: string
        changelogSource: string
        createdAt: number
        version: string
    },
    version?: {
        _id: string
        _creationTime: number
        changelog: string
        changelogSource: string
        createdAt: number
        version: string
    }
    owner: {
        _id: string
        _creationTime: number
        displayName: string
        handle: string
        image: string
        name: string
    }
    ownerHandle: string
    skill: {
        _id: string
        _creationTime: number
        badges: Record<string, any>
        createdAt: number
        displayName: string
        latestVersionId: string
        ownerUserId: string
        slug: string
        stats: {
            comments: number
            downloads: number
            installsAllTime: number
            installsCurrent: number
            stars: number
            versions: number
        }
        summary: string
        tags: Record<string, string>
        updatedAt: number
    }
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface ClawHubClientCallbacks {
    onStatusChange?: (status: ConnectionStatus) => void
    onPublicSkillsUpdated?: (skills: ConvexSkill[]) => void
    onReadmeReceived?: (versionId: string, text: string) => void
    onSearchFinished?: (skills: ConvexSkill[]) => void
    onLoadingState?: (loading: boolean) => void
}

class ClawHubClient {
    private ws: WebSocket | null = null
    private status: ConnectionStatus = 'disconnected'
    private nextQueryId = 0
    private querySetVersion = 0
    private activeQueries = new Map<string, number>()
    private callbacks: ClawHubClientCallbacks = {}
    private sessionId = createRuntimeId('clawhub')

    setCallbacks(callbacks: ClawHubClientCallbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks }
    }

    private setStatus(status: ConnectionStatus) {
        this.status = status
        this.callbacks.onStatusChange?.(status)
    }

    init() {
        if (this.status === 'connected' || this.status === 'connecting') return

        this.setStatus('connecting')
        // Using the same URL as in useSkillsState
        const ws = new WebSocket("wss://wry-manatee-359.convex.cloud/api/1.31.7/sync")
        this.ws = ws
        this.querySetVersion = 0
        this.activeQueries.clear()

        ws.onopen = () => {
            this.setStatus('connected')
            ws.send(JSON.stringify({
                connectionCount: 0,
                lastCloseReason: "InitialConnect",
                clientTs: Date.now(),
                type: "Connect",
                sessionId: this.sessionId
            }))
        }

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

                if (data.type === 'Transition') {
                    const modifications = data.modifications || []
                    const activeListQueryId = this.activeQueries.get('publicSkillsList')

                    for (const mod of modifications) {
                        if (mod.type === 'QueryUpdated' && mod.queryId === activeListQueryId && mod.value?.page) {
                            this.callbacks.onPublicSkillsUpdated?.(mod.value.page)
                            this.callbacks.onLoadingState?.(false)
                        }
                    }
                } else if (data.type === 'ActionResponse') {
                    if (data.requestId === 0 && data.result) {
                        const results = Array.isArray(data.result) ? data.result : (data.result.page || [])
                        this.callbacks.onSearchFinished?.(results)
                        this.callbacks.onLoadingState?.(false)
                    } else if (data.requestId === 1 && data.success) {
                        if (data.result && data.result.text) {
                            // We need to know which versionId this readme belongs to.
                            // The original code used state.skillsBusyKey. 
                            // Since readme is triggered by 1, we can assume it's the latest requested one 
                            // or pass metadata in Action (if supported by server) or just let the caller handle it.
                            // In the original code, Action args had versionId.
                            // ActionResponse doesn't seem to echo args.
                            // However, we can track the pending requestId to versionId mapping.
                        }
                        // Actually, looking at useSkillsState.ts lines 136-141:
                        /*
                        else if (data.requestId === 1 && data.success) {
                            if (data.result && data.result.text) {
                                state.skillMessages[state.skillsBusyKey as string] = data.result.text
                            }
                            state.skillsBusyKey = null
                        }
                        */
                        // It used state.skillsBusyKey. We can keep this "busy key" logic in useSkillsState 
                        // and just provide a general onReadmeReceived callback if we can't tie it back here.
                        // But wait, it's better if we can tie it back.
                        // Let's use a simpler callback that just passes the result and let useSkillsState handle the "busy" logic.
                        if (data.result && data.result.text) {
                            // We'll pass null or generic id if we don't track it here.
                            // Better: pass the response data to the callback.
                            this.callbacks.onReadmeReceived?.('', data.result.text)
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to parse Convex message", e)
            }
        }

        ws.onclose = () => {
            this.setStatus('disconnected')
            this.ws = null
        }

        ws.onerror = (e) => {
            console.error("Convex WebSocket error", e)
            this.setStatus('disconnected')
        }
    }

    async fetchPublicSkills(options: { sort?: string } = {}) {
        if (this.status === 'connecting') {
            await this.waitForConnection()
        }

        if (this.status !== 'connected' || !this.ws) {
            this.init()
            await this.waitForConnection()
        }

        if (this.status !== 'connected' || !this.ws) return

        this.callbacks.onLoadingState?.(true)
        const sort = options.sort || 'downloads'
        const newQueryId = this.nextQueryId++

        const currentVersion = this.querySetVersion
        const newVersion = this.querySetVersion + 1

        this.ws.send(JSON.stringify({
            type: "ModifyQuerySet",
            baseVersion: currentVersion,
            newVersion: newVersion,
            modifications: [{
                type: "Add",
                queryId: newQueryId,
                udfPath: "skills:listPublicPageV2",
                args: [{
                    dir: "desc",
                    nonSuspiciousOnly: false,
                    paginationOpts: { cursor: null, id: newQueryId, numItems: 24 },
                    sort: sort
                }]
            }]
        }))

        this.querySetVersion = newVersion
        this.activeQueries.set('publicSkillsList', newQueryId)
    }

    async getSkillReadme(versionId: string) {
        if (this.status !== 'connected' || !this.ws) return

        this.ws.send(JSON.stringify({
            type: "Action",
            requestId: 1,
            udfPath: "skills:getReadme",
            args: [{ versionId }]
        }))
    }

    async searchSkills(query: string) {
        if (this.status !== 'connected' || !this.ws) return

        this.callbacks.onLoadingState?.(true)
        this.ws.send(JSON.stringify({
            type: "Action",
            requestId: 0,
            udfPath: "search:searchSkills",
            args: [{
                highlightedOnly: false,
                limit: 24,
                nonSuspiciousOnly: false,
                query: query
            }]
        }))
    }

    private waitForConnection(): Promise<void> {
        return new Promise<void>(resolve => {
            const check = setInterval(() => {
                if (this.status === 'connected') {
                    clearInterval(check)
                    resolve()
                } else if (this.status === 'disconnected') {
                    clearInterval(check)
                    resolve()
                }
            }, 100)
        })
    }
}

export const clawHubClient = new ClawHubClient()
