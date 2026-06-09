import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Dashboard from './pages/Dashboard'
import Gallery from './pages/Gallery'
import Brief from './pages/Brief'
import Conventions from './pages/Conventions'
import Studios from './pages/Studios'
import Concepts from './pages/Concepts'
import Boards from './pages/Boards'
import Manage from './pages/Manage'
import Help from './pages/Help'
import ProtectedRoute from './components/ProtectedRoute'
import { useStorage } from './hooks/useStorage'
import { useArtistStorage } from './hooks/useArtistStorage'
import { ideasCodec, conceptsCodec } from './data/imageCodec'
import { mergeConventionOverrides } from './data/conventions'

// Gate first so the data hooks (which sync per-user once wired) only mount for a
// signed-in user.
export default function App() {
  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  )
}

function AppShell() {
  const [artists, setArtists] = useArtistStorage()
  const [ideas, setIdeas] = useStorage('tattoo_ideas', [], ideasCodec)
  const [concepts, setConcepts] = useStorage('tattoo_concepts', [], conceptsCodec)
  const [boards, setBoards] = useStorage('tattoo_boards', [])
  const [conventionOverrides, setConventionOverrides] = useStorage('tattoo_convention_attending', {})
  const mergedConventions = mergeConventionOverrides(conventionOverrides)

  return (
    <div className="bg-ink-black min-h-screen pb-20">
      <Routes>
        <Route path="/" element={<Dashboard artists={artists} ideas={ideas} boards={boards} mergedConventions={mergedConventions} />} />
        <Route path="/gallery" element={<Gallery artists={artists} setArtists={setArtists} mergedConventions={mergedConventions} />} />
        <Route path="/brief" element={<Brief ideas={ideas} setIdeas={setIdeas} artists={artists} mergedConventions={mergedConventions} />} />
        <Route path="/conventions" element={<Conventions />} />
        <Route path="/studios" element={<Studios artists={artists} />} />
        <Route path="/concepts" element={<Concepts concepts={concepts} setConcepts={setConcepts} artists={artists} ideas={ideas} />} />
        <Route path="/boards" element={<Boards boards={boards} setBoards={setBoards} ideas={ideas} artists={artists} />} />
        <Route path="/help" element={<Help />} />
        <Route
          path="/manage"
          element={(
            <Manage
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
          )}
        />
      </Routes>
      <Nav />
    </div>
  )
}
