import { lazy, Suspense, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Nav from './components/Nav'
import Drawer from './components/Drawer'
import Wall from './pages/Wall'
import ProtectedRoute from './components/ProtectedRoute'
import { useStorage } from './hooks/useStorage'
import { useArtistStorage } from './hooks/useArtistStorage'
import { ideasCodec, conceptsCodec } from './data/imageCodec'
import { mergeConventionOverrides } from './data/conventions'

// The Wall (home) stays eager — it's the first paint. Every other page is
// route-split so the initial bundle (and the SW precache built from it) stays
// small; each page loads on first navigation and is cached thereafter.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Gallery = lazy(() => import('./pages/Gallery'))
const Brief = lazy(() => import('./pages/Brief'))
const Conventions = lazy(() => import('./pages/Conventions'))
const Studios = lazy(() => import('./pages/Studios'))
const Concepts = lazy(() => import('./pages/Concepts'))
const Settings = lazy(() => import('./pages/Settings'))
const Help = lazy(() => import('./pages/Help'))

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="bg-ink-black min-h-screen pb-20">
      <Suspense fallback={<div className="min-h-screen" aria-hidden="true" />}>
        <Routes>
          <Route
            path="/"
            element={(
              <Wall
                artists={artists}
                setArtists={setArtists}
                ideas={ideas}
                activeView="artists"
                onSwitchView={(view) => view === 'concepts' && navigate('/concepts')}
                onOpenDrawer={() => setDrawerOpen(true)}
              />
            )}
          />
          <Route path="/pipeline" element={<Dashboard artists={artists} setArtists={setArtists} ideas={ideas} boards={boards} mergedConventions={mergedConventions} />} />
          <Route path="/gallery" element={<Gallery artists={artists} setArtists={setArtists} mergedConventions={mergedConventions} />} />
          <Route path="/brief" element={<Brief ideas={ideas} setIdeas={setIdeas} artists={artists} mergedConventions={mergedConventions} boards={boards} setBoards={setBoards} />} />
          <Route path="/conventions" element={<Conventions artists={artists} conventionOverrides={conventionOverrides} setConventionOverrides={setConventionOverrides} />} />
          <Route path="/studios" element={<Studios artists={artists} />} />
          <Route path="/concepts" element={<Concepts concepts={concepts} setConcepts={setConcepts} artists={artists} ideas={ideas} />} />
          <Route path="/boards" element={<Navigate to="/brief?tab=boards" replace />} />
          <Route path="/help" element={<Help />} />
          <Route
            path="/settings"
            element={(
              <Settings
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
          {/* Legacy deep links (old PWA home screens, bookmarks) */}
          <Route path="/manage" element={<Navigate to="/gallery?mode=manage" replace />} />
        </Routes>
      </Suspense>
      {drawerOpen && <Drawer onClose={() => setDrawerOpen(false)} />}
      <Nav />
    </div>
  )
}
