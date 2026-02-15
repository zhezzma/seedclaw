import { reactive } from 'vue'
import { createStateProxy } from './utils/stateProxy'
import { apiGet, apiPost, apiPatch, apiDelete } from './api-client'

// ==================== Types ====================


// ==================== Types ====================


export interface ConvexSkill {
    latestVersion: {
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

export interface SkillsState {
    skillsBusyKey: string | null
    skillMessages: Record<string, string>
    skillEdits: Record<string, string>
    publicSkills: ConvexSkill[]
    publicSkillsLoading: boolean
    connectionStatus: 'disconnected' | 'connecting' | 'connected'
    globalSkills: any[]
}

// ==================== State ====================
const state = reactive<SkillsState>({
    skillsBusyKey: null,
    skillMessages: {},
    skillEdits: {},
    publicSkills: [],
    publicSkillsLoading: false,
    connectionStatus: 'disconnected',
    globalSkills: [],
})

// Keep WebSocket instance outside reactive state to avoid proxy issues
let convexWs: WebSocket | null = null
let nextQueryId = 0
let querySetVersion = 0
// We need to track active subscriptions to avoid duplicates or to update them
// Simple map: modification type -> queryId
const activeQueries = new Map<string, number>()


// ==================== Export ====================

export function useSkillsState() {

    const initConvexConnection = () => {
        if (state.connectionStatus === 'connected' || state.connectionStatus === 'connecting') return

        state.connectionStatus = 'connecting'
        const ws = new WebSocket("wss://wry-manatee-359.convex.cloud/api/1.31.7/sync")
        convexWs = ws
        // Reset protocol state on new connection
        querySetVersion = 0
        activeQueries.clear()

        ws.onopen = () => {
            state.connectionStatus = 'connected'
            // 1. Send Connect
            ws.send(JSON.stringify({
                connectionCount: 0,
                lastCloseReason: "InitialConnect",
                clientTs: Date.now(),
                type: "Connect",
                sessionId: crypto.randomUUID()
            }))
        }

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)

                if (data.type === 'Transition') {
                    const modifications = data.modifications || []

                    // Handle Public Skills List (queryId matching our list request)
                    // We need to map back to what we requested.
                    // We can check if any modified queryId matches our active 'publicSkillsList' queryId

                    const activeListQueryId = activeQueries.get('publicSkillsList')

                    for (const mod of modifications) {
                        // Check if this modification is for our active list query
                        if (mod.type === 'QueryUpdated' && mod.queryId === activeListQueryId && mod.value?.page) {
                            // Directly use the page items as they match our new interface
                            state.publicSkills = mod.value.page
                            state.publicSkillsLoading = false
                        }
                    }
                } else if (data.type === 'ActionResponse') {
                    // Handle Action Response (for search)
                    if (data.requestId === 0 && data.result) {
                        // Search results might be an array directly or a page object
                        const results = Array.isArray(data.result) ? data.result : (data.result.page || [])
                        state.publicSkills = results
                        state.publicSkillsLoading = false
                    } else if (data.requestId === 1 && data.success) {
                        // Handle README response
                        if (data.result && data.result.text) {
                            state.skillMessages[state.skillsBusyKey as string] = data.result.text
                        }
                        state.skillsBusyKey = null
                    }
                }
            } catch (e) {
                console.error("Failed to parse Convex message", e)
            }
        }

        ws.onclose = () => {
            state.connectionStatus = 'disconnected'
            convexWs = null
        }

        ws.onerror = (e) => {
            console.error("Convex WebSocket error", e)
            state.connectionStatus = 'disconnected'
        }
    }

    const fetchPublicSkills = async (options: { sort?: string } = {}) => {
        if (!convexWs || state.connectionStatus !== 'connected') {
            // Try to init if not connected, but might need to wait
            // For now assume initConvexConnection was called
            if (!convexWs) {
                initConvexConnection()
                // Wait a bit? Or just fail?
                // Let's implement a simple retry or just queue?
                // For simplicity, return if not connected (UI should handle loading state)
                // But wait, init is async (websocket).
                // Ideally we wait for open. 
            }
        }

        state.publicSkillsLoading = true

        // Wait for connection if connecting
        if (state.connectionStatus === 'connecting') {
            await new Promise<void>(resolve => {
                const check = setInterval(() => {
                    if (state.connectionStatus === 'connected') {
                        clearInterval(check)
                        resolve()
                    } else if (state.connectionStatus === 'disconnected') {
                        clearInterval(check)
                        resolve() // Fail gracefully?
                    }
                }, 100)
            })
        }

        if (state.connectionStatus !== 'connected' || !convexWs) {
            state.publicSkillsLoading = false
            return
        }

        const sort = options.sort || 'downloads'

        // Check if we already have an active query for the list
        // Note: Convex protocol says we should remove the old query if we want to change args (like sort).
        // Or we can just add a new one, but we should clean up to avoid memory/bandwidth usage.

        // For simplicity, let's assume we maintain ONE active list query.
        // We need to track the queryId associated with 'publicSkillsList'

        const existingQueryId = activeQueries.get('publicSkillsList')
        const newQueryId = nextQueryId++

        const modifications: any[] = []



        modifications.push({
            type: "Add",
            queryId: newQueryId,
            udfPath: "skills:listPublicPageV2",
            args: [{
                dir: "desc",
                nonSuspiciousOnly: false,
                paginationOpts: { cursor: null, id: newQueryId, numItems: 24 },
                sort: sort
            }]
        })


        const currentVersion = querySetVersion
        const newVersion = querySetVersion + 1

        convexWs.send(JSON.stringify({
            type: "ModifyQuerySet",
            baseVersion: currentVersion,
            newVersion: newVersion,
            modifications: modifications
        }))

        querySetVersion = newVersion
        activeQueries.set('publicSkillsList', newQueryId)
    }

    const getSkillReadme = async (versionId: string) => {
        if (!convexWs || state.connectionStatus !== 'connected') return

        const skillMessageKey = versionId
        state.skillsBusyKey = skillMessageKey
        state.skillMessages[skillMessageKey] = ''

        convexWs.send(JSON.stringify({
            type: "Action",
            requestId: 1, // Using 1 for readme requests
            udfPath: "skills:getReadme",
            args: [
                {
                    versionId: versionId
                }
            ]
        }))
    }
    const searchSkills = async (query: string) => {
        if (!convexWs || state.connectionStatus !== 'connected') return

        state.publicSkillsLoading = true

        // Search is an Action, not a Query
        convexWs.send(JSON.stringify({
            type: "Action",
            requestId: 0, // Simple ID
            udfPath: "search:searchSkills",
            args: [
                {
                    highlightedOnly: false,
                    limit: 24,
                    nonSuspiciousOnly: false,
                    query: query
                }
            ]
        }))
    }

    const installSkill = async (skillName: string, agentId?: string) => {
        try {
            // skillName corresponds to the package name (e.g. skill.slug)
            const body = { name: skillName }
            if (agentId) {
                await apiPost(`/api/skills/${agentId}/install`, body)
            } else {
                await apiPost('/api/skills/global/install', body)
                await fetchGlobalSkills()
            }
            return true
        } catch (err: any) {
            console.error('Failed to install skill:', err)
            throw err
        }
    }

    const fetchGlobalSkills = async () => {
        try {
            const res = await apiGet<{ skills: any[] }>('/api/skills/global')
            state.globalSkills = res?.skills || []
        } catch (err) {
            console.error('Failed to fetch global skills:', err)
        }
    }

    const uninstallGlobalSkill = async (skillId: string) => {
        try {
            await apiDelete(`/api/skills/global/${skillId}`)
            await fetchGlobalSkills()
        } catch (err) {
            console.error('Failed to uninstall global skill:', err)
            throw err
        }
    }

    const loadAgentSkills = async (agentId: string) => {
        try {
            const result = await apiGet<{ skills: any[] }>(`/api/skills/${agentId}`)
            return result?.skills || []
        } catch (err: any) {
            console.error(`Failed to load skills for agent ${agentId}:`, err)
            return []
        }
    }

    const toggleAgentSkill = async (agentId: string, skillId: string, enabled: boolean) => {
        try {
            await apiPost(`/api/skills/${agentId}/${skillId}`, { enabled })
        } catch (err: any) {
            throw err
        }
    }

    const uninstallAgentSkill = async (agentId: string, skillId: string) => {
        try {
            await apiDelete(`/api/skills/${agentId}/${skillId}`)
        } catch (err: any) {
            throw err
        }
    }

    const methods = {
        initConvexConnection,
        fetchPublicSkills,
        searchSkills,
        getSkillReadme,
        installSkill,
        fetchGlobalSkills,
        uninstallGlobalSkill,
        loadAgentSkills,
        toggleAgentSkill,
        uninstallAgentSkill
    }

    return createStateProxy(state, methods)
}
