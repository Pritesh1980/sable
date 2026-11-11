import { randomId } from './randomId'

// A router history entry must never carry private draft contents into a new
// owner session. This bounded, runtime-only mailbox is spent only after commit.
let pending = null

export function createConceptIdeaHandoff(idea, { userId, ownerScope }) {
  const snapshot = ownerScope.capture()
  if (!userId || snapshot.ownerId !== userId) throw new Error('owner_changed')
  const requestId = randomId()
  pending = { requestId, idea: structuredClone(idea), userId, ownerScope, snapshot }
  return requestId
}

export function takeConceptIdeaHandoff(requestId, { userId, ownerScope }) {
  if (!pending || pending.requestId !== requestId) return null
  const request = pending
  pending = null
  try {
    if (userId !== request.userId || ownerScope !== request.ownerScope) return null
    ownerScope.assertCurrent(request.snapshot)
    return request.idea
  } catch { return null }
}
