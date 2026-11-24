import { useEffect, useMemo, useState } from 'react'
import { vectorLookup, indexCoverage } from '../data/embeddings'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'

// Photos saved without an artist are indexed through a stand-in artist, so they
// use the same identity keys and the same one build action as everyone else's.
const SAVED_ID = '__saved__'
// A fresh [] per render would re-read the index on every render.
const NONE = []

// Every mounted reader of the index: a build from one sheet (More like this,
// over Search) must refresh the others, or they keep showing the old index.
const readers = new Set()
const indexChanged = () => readers.forEach((reload) => reload())

// The style index for the artists' photos and saved photos, read on mount,
// with the one "Build / Update style index" action that More like this and
// Search share. `vectors` is null while the index is being read.
export default function useStyleVectors(artists, saved = NONE) {
  const indexSource = useMemo(
    () => [...artists, { id: SAVED_ID, images: saved.map((s) => s.image) }],
    [artists, saved]
  )
  const [vectors, setVectors] = useState(null)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const reload = () => setGeneration((g) => g + 1)
    readers.add(reload)
    return () => readers.delete(reload)
  }, [])

  useEffect(() => {
    let alive = true
    loadVectors(indexSource)
      .then((v) => alive && setVectors(v))
      .catch(() => alive && setVectors(new Map()))
    return () => {
      alive = false
    }
  }, [indexSource, generation])

  async function build() {
    setError('')
    setProgress({ done: 0, total: 0 })
    try {
      await buildStyleIndex(indexSource, { onProgress: setProgress })
      indexChanged() // this sheet and any other reading the index
    } catch (e) {
      console.error('[tattoo] style index build failed:', e)
      setError('Index build failed. Check your connection and try again.')
    }
    setProgress(null)
  }

  const getVec = useMemo(() => (vectors ? vectorLookup(vectors) : null), [vectors])
  const coverage = getVec ? indexCoverage(indexSource, getVec) : null
  return { vectors, getVec, coverage, progress, error, build }
}
