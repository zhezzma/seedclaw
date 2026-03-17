export interface BranchInfo {
    siblings: string[]
    currentIndex: number
}

export interface BranchMessageLike {
    role: 'user' | 'assistant'
    entryId?: string
    parentEntryId?: string | null
}

export interface SessionTreeEntry {
    id: string
    parentId: string | null
    type: string
    message?: {
        role?: string
        deleted?: boolean
        isDeleted?: boolean
        hidden?: boolean
        visible?: boolean
        deletedAt?: string | number | null
        removedAt?: string | number | null
        [key: string]: any
    } | null
    deleted?: boolean
    isDeleted?: boolean
    hidden?: boolean
    visible?: boolean
    [key: string]: any
}

export interface BranchIndexes {
    childrenMap: Map<string, string[]>
    allChildrenMap: Map<string, string[]>
    entryMap: Map<string, SessionTreeEntry>
}

const isDeletedEntry = (entry: SessionTreeEntry | null | undefined): boolean => {
    if (!entry) return true
    if (entry.deleted || entry.isDeleted || entry.hidden === true || entry.visible === false) {
        return true
    }

    const message = entry.message
    if (!message) return false

    return Boolean(
        message.deleted ||
        message.isDeleted ||
        message.hidden === true ||
        message.visible === false ||
        message.deletedAt ||
        message.removedAt,
    )
}

const getOrderedChildren = (parentId: string, indexes: BranchIndexes): string[] => {
    const childIds = indexes.allChildrenMap.get(parentId) ?? []
    if (childIds.length <= 1) return childIds

    const liveChildren: string[] = []
    const deletedChildren: string[] = []

    for (const childId of childIds) {
        if (isDeletedEntry(indexes.entryMap.get(childId))) {
            deletedChildren.push(childId)
        } else {
            liveChildren.push(childId)
        }
    }

    return liveChildren.length > 0 ? [...liveChildren, ...deletedChildren] : childIds
}

const findFirstDescendantMessageId = (startId: string, indexes: BranchIndexes): string | null => {
    for (const childId of getOrderedChildren(startId, indexes)) {
        const entry = indexes.entryMap.get(childId)
        if (!entry || isDeletedEntry(entry)) {
            continue
        }

        if (entry.type === 'message') {
            return childId
        }

        const descendant = findFirstDescendantMessageId(childId, indexes)
        if (descendant) {
            return descendant
        }
    }

    return null
}

const pickNextChild = (parentId: string, indexes: BranchIndexes): string | null => {
    const childIds = getOrderedChildren(parentId, indexes)
    if (childIds.length === 0) return null

    let fallback: string | null = null

    for (const childId of childIds) {
        const entry = indexes.entryMap.get(childId)
        if (!entry) continue

        if (!fallback && !isDeletedEntry(entry)) {
            fallback = childId
        }

        if (isDeletedEntry(entry)) {
            continue
        }

        if (entry.type === 'message') {
            return childId
        }

        if (findFirstDescendantMessageId(childId, indexes)) {
            return childId
        }
    }

    return fallback ?? childIds[0] ?? null
}

const findNearestMessageAncestor = (entryId: string | null | undefined, indexes: BranchIndexes): SessionTreeEntry | null => {
    let current = entryId ? indexes.entryMap.get(entryId) ?? null : null

    while (current && current.type !== 'message' && current.parentId) {
        current = indexes.entryMap.get(current.parentId) ?? null
    }

    return current?.type === 'message' ? current : null
}

const getLiveMessageSiblings = (parentId: string | null | undefined, role: 'user' | 'assistant', indexes: BranchIndexes): string[] => {
    if (!parentId) return []

    return (indexes.childrenMap.get(parentId) ?? []).filter(id => {
        const entry = indexes.entryMap.get(id)
        if (!entry || entry.type !== 'message' || isDeletedEntry(entry)) {
            return false
        }

        const entryRole = entry.message?.role
        return !entryRole || entryRole === role
    })
}

export const buildBranchIndexes = (tree: SessionTreeEntry[] | null | undefined): BranchIndexes => {
    const childrenMap = new Map<string, string[]>()
    const allChildrenMap = new Map<string, string[]>()
    const entryMap = new Map<string, SessionTreeEntry>()

    for (const entry of tree ?? []) {
        entryMap.set(entry.id, entry)
        if (!entry.parentId) continue

        const allChildren = allChildrenMap.get(entry.parentId)
        if (allChildren) allChildren.push(entry.id)
        else allChildrenMap.set(entry.parentId, [entry.id])

        if (entry.type === 'message') {
            const children = childrenMap.get(entry.parentId)
            if (children) children.push(entry.id)
            else childrenMap.set(entry.parentId, [entry.id])
        }
    }

    return {
        childrenMap,
        allChildrenMap,
        entryMap,
    }
}

export const findLeafId = (startId: string, indexes: BranchIndexes): string => {
    let leafId = startId

    while (true) {
        const nextId = pickNextChild(leafId, indexes)
        if (!nextId) return leafId
        leafId = nextId
    }
}

export const getBranchInfo = (msg: BranchMessageLike, indexes: BranchIndexes): BranchInfo | null => {
    if (!msg.entryId || !msg.parentEntryId) return null

    const ownSiblings = getLiveMessageSiblings(msg.parentEntryId, msg.role, indexes)
    if (ownSiblings.length > 1) {
        const currentIndex = ownSiblings.indexOf(msg.entryId)
        if (currentIndex >= 0) {
            return { siblings: ownSiblings, currentIndex }
        }
    }

    if (msg.role !== 'assistant') return null

    const parentMessage = findNearestMessageAncestor(msg.parentEntryId, indexes)
    if (!parentMessage?.parentId || isDeletedEntry(parentMessage)) {
        return null
    }

    const parentSiblings = getLiveMessageSiblings(parentMessage.parentId, 'user', indexes)
        .filter(id => id === parentMessage.id || findFirstDescendantMessageId(id, indexes) !== null)

    if (parentSiblings.length <= 1) {
        return null
    }

    const parentIndex = parentSiblings.indexOf(parentMessage.id)
    if (parentIndex < 0) {
        return null
    }

    return {
        siblings: parentSiblings,
        currentIndex: parentIndex,
    }
}
