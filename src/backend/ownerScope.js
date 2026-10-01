// An identity value alone cannot detect A→B→A. Every transition also advances
// an epoch, so work from an earlier session can never become current again.
export function createOwnerScope({ privateMode, getOwnerId }) {
  let epoch = 0
  return {
    capture() {
      const ownerId = getOwnerId()
      if (privateMode && !ownerId) {
        throw Object.assign(new Error('Owner unavailable'), { code: 'owner_changed' })
      }
      return { ownerId: ownerId || 'anon', epoch }
    },
    assertCurrent(snapshot) {
      if (snapshot.epoch !== epoch || snapshot.ownerId !== (getOwnerId() || 'anon')) {
        throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
      }
    },
    invalidate() { epoch += 1 },
  }
}
