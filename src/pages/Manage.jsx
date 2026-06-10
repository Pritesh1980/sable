import Logo from '../components/Logo'
import AddArtistForm from '../components/AddArtistForm'
import ArtistTable from '../components/ArtistTable'
import BackupPanel from '../components/BackupPanel'
import { createArtist } from '../data/artists'

export default function Manage({ artists, setArtists, ideas, setIdeas, boards, setBoards, concepts, setConcepts, conventionOverrides, setConventionOverrides }) {
  function addArtist({ handle, name }) {
    const artist = createArtist({ handle, name }, artists)
    if (!artist) return
    setArtists((prev) => [...prev, artist])
  }

  function saveImages(id, images) {
    setArtists((prev) => prev.map((a) => (a.id === id ? { ...a, images } : a)))
  }

  function updateArtist(id, patch) {
    setArtists((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function removeArtist(id) {
    setArtists((prev) => prev.filter((a) => a.id !== id))
  }

  const totalImages = artists.reduce((n, a) => n + (a.images?.length || 0), 0)
  const withImages = artists.filter((a) => a.images?.length > 0).length

  return (
    <div className="min-h-screen bg-ink-black max-w-5xl mx-auto px-4 md:px-8 pt-safe-top pb-24">
      {/* Header */}
      <div className="pt-10 pb-6">
        <Logo size={28} className="mb-3" />
        <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Manage</h1>
        <p className="font-mono text-xs text-cream-muted/90 mt-3 tracking-widest">
          {artists.length} artists · {withImages} with photos · {totalImages} total images
        </p>
      </div>

      <AddArtistForm onAdd={addArtist} />

      <BackupPanel
        artists={artists}
        setArtists={setArtists}
        ideas={ideas}
        setIdeas={setIdeas}
        boards={boards}
        setBoards={setBoards}
        concepts={concepts}
        setConcepts={setConcepts}
        conventionOverrides={conventionOverrides}
        setConventionOverrides={setConventionOverrides}
      />

      <ArtistTable
        artists={artists}
        onSaveImages={saveImages}
        onUpdate={updateArtist}
        onRemove={removeArtist}
      />
    </div>
  )
}
