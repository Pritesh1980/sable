import { useLayoutEffect, useRef, useState } from 'react'
import { appendConceptIdeaImage, buildConceptIdeaDraft, conceptIdeaNote, stageConceptIdeaImage } from '../data/conceptIdeas'
import { createConceptIdeaHandoff } from '../data/conceptIdeaHandoff'
import { randomId } from '../data/randomId'

function selectedSource(concepts, selection) {
  if (!selection) return null
  const concept = concepts.find(row => row.id === selection.conceptId)
  if (!concept) return null
  const variant = selection.variantId === null ? null : concept.variants?.find(row => row.id === selection.variantId)
  if (selection.variantId !== null && !variant) return null
  const imageUrl = (variant || concept).imageUrl
  return imageUrl ? { concept, variant, imageUrl } : null
}
const fingerprint = source => source && JSON.stringify([source.imageUrl, source.concept.prompt, source.concept.tags,
  source.variant?.id, (source.variant || source.concept).title, (source.variant || source.concept).response,
  (source.variant || source.concept).notes, (source.variant || source.concept).refinement])

export default function useConceptIdeaTransfer(options) {
  const [state, setState] = useState({ selection: null, busy: false, error: '' })
  const latest = useRef(options)
  const selection = useRef(null)
  const job = useRef(null)
  const mounted = useRef(false)
  const opener = useRef(null)
  useLayoutEffect(() => { latest.current = options })
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; job.current = null }
  }, [options.userId, options.ownerScope])

  function open(value) {
    job.current = null
    selection.current = value
    opener.current = document.activeElement
    setState({ selection: value, busy: false, error: '' })
  }
  function close() {
    job.current = null
    selection.current = null
    setState({ selection: null, busy: false, error: '' })
    const previous = opener.current
    requestAnimationFrame(() => { if (previous?.isConnected) previous.focus() })
  }
  async function submit({ ideaId, note } = {}) {
    if (job.current || !selection.current) return
    const actor = {}
    job.current = actor
    setState(current => ({ ...current, busy: true, error: '' }))
    const captured = latest.current
    const selected = selection.current
    const source = selectedSource(captured.concepts, selected)
    let snapshot
    try {
      snapshot = captured.ownerScope.capture()
      const sourceVersion = fingerprint(source)
      const assertCurrent = () => {
        const current = latest.current
        if (!mounted.current || job.current !== actor || selection.current !== selected
          || current.ownerScope !== captured.ownerScope || current.userId !== captured.userId
          || snapshot.ownerId !== captured.userId) throw new Error('owner_changed')
        current.ownerScope.assertCurrent(snapshot)
        if (!source || fingerprint(selectedSource(current.concepts, selected)) !== sourceVersion
          || (ideaId && !current.ideas.some(row => row.id === ideaId))) throw new Error('source_unavailable')
      }
      assertCurrent()
      const id = ideaId || randomId()
      const image = await stageConceptIdeaImage(source.imageUrl, { userId: captured.userId, ideaId: id, assertCurrent })
      assertCurrent()
      const imageNote = note === undefined ? conceptIdeaNote(source.variant) : note
      if (ideaId) {
        // No callback-side navigation or mutable receipt flags: a React setter
        // can defer this updater. It only appends against the latest collection.
        latest.current.setIdeas(rows => appendConceptIdeaImage(rows, id, { ...image, note: imageNote }))
        captured.navigate(`/brief?idea=${encodeURIComponent(id)}`, { replace: true })
      } else {
        const idea = buildConceptIdeaDraft(source.concept, source.variant, { id, image, note: imageNote })
        const requestId = createConceptIdeaHandoff(idea, { userId: captured.userId, ownerScope: captured.ownerScope })
        captured.navigate('/brief', { replace: true, state: { conceptIdeaRequest: requestId } })
      }
      // Keep the current history layer open until routing unmounts it. Closing
      // first would let useHistoryLayer pop the destination back to Concepts.
    } catch (error) {
      if (!mounted.current || job.current !== actor) return
      job.current = null
      setState(current => ({ ...current, busy: false,
        error: error.message === 'source_unavailable' || !source
          ? 'That image or idea is no longer available. Choose it again.'
          : 'Could not copy this image. Check that it is available and this device has storage, then try again.' }))
    }
  }
  return { ...state, source: selectedSource(options.concepts, state.selection), open, close, submit }
}
