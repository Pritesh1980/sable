import { recordConceptEdits, readConceptEdits, resolveConceptEdits, confirmConceptEdits } from '../backend/local/localStore'
import { stampChangedRows, writeRowGenerations, dropRowGenerations, confirmRowGenerations } from '../backend/dirty'

export function requireConceptReceipt(rows, { conceptId, variantId, imageKey }) {
  const variant = rows.find((row) => row.id === conceptId)?.variants?.find((row) => row.id === variantId)
  if (!variant || variant.imageUrl !== imageKey) {
    throw Object.assign(new Error('Import unconfirmed'), { code: 'commit_conflict' })
  }
}

// Private local concepts preserve field-level intent under the backend's Web
// Lock. The collection engine still owns lifecycle, subscriptions and queuing.
export function createPrivateConceptPersistence({ backend, key, codec, getValue, publish, assertCurrent, isStopped }) {
  let pending = []
  let sequence = 0
  let lastEditAt = 0

  function capture() {
    assertCurrent()
    return backend.ownerScope.capture()
  }

  function assertLive(snapshot) {
    assertCurrent()
    backend.ownerScope.assertCurrent(snapshot)
    if (isStopped()) throw Object.assign(new Error('Import interrupted'), { code: 'commit_conflict' })
  }

  const canonicalEdits = () => pending.map((edit) => ({
    ...edit,
    base: edit.base && codec.toCanonical([edit.base])[0],
    draft: edit.draft && codec.toCanonical([edit.draft])[0],
  }))

  function edit(updater, restore = true) {
    const snapshot = capture()
    const prev = getValue()
    const next = typeof updater === 'function' ? updater(prev) : updater
    lastEditAt = Math.max(Date.now(), lastEditAt + 1)
    const at = new Date(lastEditAt).toISOString()
    const stamped = stampChangedRows(prev, next, at)
    const edits = recordConceptEdits(snapshot.ownerId, codec.toCanonical(prev), codec.toCanonical(stamped), { restore, at })
    pending.push(...edits)
    localStorage.setItem(key, JSON.stringify(codec.toCanonical(stamped)))
    assertLive(snapshot)
    writeRowGenerations(key, stamped.filter((row) => prev.find((old) => old.id === row.id) !== row))
    dropRowGenerations(key, prev.filter((row) => !stamped.some((nextRow) => nextRow.id === row.id)).map((row) => row.id))
    sequence += 1
    publish(stamped)
  }

  function load() {
    const snapshot = capture()
    pending = readConceptEdits(snapshot.ownerId)
  }

  async function uploadPending(snapshot) {
    for (let round = 0; round < 3; round += 1) {
      const seq = sequence
      const current = getValue()
      const edits = [...pending]
      const rows = [...current, ...edits.flatMap((edit) => [edit.base, edit.draft].filter(Boolean))]
      const uploaded = await codec.ensureUploaded(rows, { userId: snapshot.ownerId })
      assertLive(snapshot)
      if (sequence !== seq) continue
      // Current codecs return stored refs, not just an upload count. Persist
      // transformed intent too, so a crash cannot replay inline image bytes.
      if (uploaded?.moved > 0) {
        let index = current.length
        for (const edit of edits) {
          if (edit.base) edit.base = uploaded.value[index++]
          if (edit.draft) edit.draft = uploaded.value[index++]
          localStorage.setItem(edit.key, JSON.stringify(edit))
        }
        publish(uploaded.value.slice(0, current.length))
      }
      return
    }
    throw Object.assign(new Error('Edits still arriving'), { code: 'commit_conflict' })
  }

  async function publishLatest(rows, snapshot) {
    for (let round = 0; round < 3; round += 1) {
      const seq = sequence
      const rebased = resolveConceptEdits({ rows }, canonicalEdits()).rows
      const display = await codec.toDisplay(rebased)
      assertLive(snapshot)
      if (seq !== sequence) continue
      publish(display)
      return
    }
    throw Object.assign(new Error('Edits still arriving'), { code: 'commit_conflict' })
  }

  async function persist(updater, expected) {
    const snapshot = capture()
    await uploadPending(snapshot)
    let submitted = []
    const method = expected ? 'upsertChecked' : 'upsert'
    const rows = await backend.store[method]('concepts', [], {
      ownerId: snapshot.ownerId,
      resolveLatest(state) {
        assertLive(snapshot)
        if (updater) {
          const latest = resolveConceptEdits(state, canonicalEdits())
          if (!latest.rows.some((row) => row.id === expected.conceptId)
            || latest.deletions[JSON.stringify([expected.conceptId, expected.variantId])]?.deleted) {
            throw Object.assign(new Error('Destination deleted'), { code: 'commit_conflict' })
          }
          publish(latest.rows)
          edit(updater, false)
        }
        submitted = [...pending]
        const next = resolveConceptEdits(state, canonicalEdits())
        localStorage.setItem(key, JSON.stringify(next.rows))
        return next
      },
    })
    assertLive(snapshot)
    if (expected) requireConceptReceipt(rows, expected)
    confirmConceptEdits(submitted)
    pending = pending.filter((edit) => !submitted.includes(edit))
    confirmRowGenerations(key, submitted.map((edit) => ({ id: edit.id, editGen: edit.generation })))
    await publishLatest(rows, snapshot)
    return rows
  }

  return { edit, load, persist }
}
