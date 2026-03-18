import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Gallery from './pages/Gallery'
import Brief from './pages/Brief'
import Conventions from './pages/Conventions'
import Concepts from './pages/Concepts'
import Manage from './pages/Manage'
import { useStorage } from './hooks/useStorage'
import { DEFAULT_ARTISTS } from './data/artists'

export default function App() {
  const [artists, setArtists] = useStorage('tattoo_artists', DEFAULT_ARTISTS)
  const [ideas, setIdeas] = useStorage('tattoo_ideas', [])
  const [conventions, setConventions] = useStorage('tattoo_conventions', [])
  const [concepts, setConcepts] = useStorage('tattoo_concepts', [])

  return (
    <div className="bg-ink-black min-h-screen pb-20">
      <Routes>
        <Route path="/" element={<Gallery artists={artists} setArtists={setArtists} />} />
        <Route path="/brief" element={<Brief ideas={ideas} setIdeas={setIdeas} artists={artists} />} />
        <Route path="/conventions" element={<Conventions conventions={conventions} setConventions={setConventions} artists={artists} />} />
        <Route path="/concepts" element={<Concepts concepts={concepts} setConcepts={setConcepts} />} />
        <Route path="/manage" element={<Manage artists={artists} setArtists={setArtists} />} />
      </Routes>
      <Nav />
    </div>
  )
}
