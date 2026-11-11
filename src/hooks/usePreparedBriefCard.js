import { useCallback, useEffect, useMemo, useState } from 'react'
import { prepareBriefCardImage } from '../data/briefCard'
import { normalizeReferenceImages } from '../data/referenceImages'

// Compare content, not object identity: the editor recreates draft arrays on
// every render. All canvas-visible fields participate, including artist labels.
export default function usePreparedBriefCard(idea, artists = []) {
  const snapshot = JSON.stringify({
    idea: {
      title: idea.title, description: idea.description, placement: idea.placement,
      tags: idea.tags, linkedArtists: idea.linkedArtists, artistLine: idea.artistLine,
      images: normalizeReferenceImages(idea.images),
    },
    artists: artists.map(({ id, name, handle }) => ({ id, name, handle })),
  })
  const [revision, setRevision] = useState(0)
  const sources = JSON.stringify(normalizeReferenceImages(idea.images).map(({ key, url }) => ({ key, url })))
  const [settled, setSettled] = useState(null)
  const token = useMemo(() => ({ snapshot, revision }), [snapshot, revision])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    let live = true
    let url = ''
    const input = JSON.parse(snapshot)
    void prepareBriefCardImage(input.idea, { artists: input.artists, onlyReadyKeys: false })
      .then((prepared) => {
        if (!live) return
        url = URL.createObjectURL(prepared.blob)
        setSettled({ token, prepared, url, sources })
      })
      .catch(() => {
        if (live) setSettled({ token, error: 'Could not prepare the card. Try refreshing.' })
      })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [snapshot, token, sources])

  const current = settled?.token === token ? settled : null
  return {
    prepared: current?.prepared || null,
    previewUrl: current?.url || '',
    controlsPhotos: settled?.sources === sources ? settled.prepared?.photos || [] : [],
    error: current?.error || '',
    preparing: !current,
    refresh,
  }
}
