import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Gallery from './pages/Gallery'
import Brief from './pages/Brief'
import Conventions from './pages/Conventions'
import Concepts from './pages/Concepts'
import Boards from './pages/Boards'
import Manage from './pages/Manage'
import { useStorage } from './hooks/useStorage'
import { useArtistStorage } from './hooks/useArtistStorage'

export default function App() {
  const [artists, setArtists] = useArtistStorage()
  const [ideas, setIdeas] = useStorage('tattoo_ideas', [])
  const [concepts, setConcepts] = useStorage('tattoo_concepts', [])
  const [boards, setBoards] = useStorage('tattoo_boards', [])

  return (
    <div className="bg-ink-black min-h-screen pb-20">
      <Routes>
        <Route path="/" element={<Gallery artists={artists} setArtists={setArtists} />} />
        <Route path="/brief" element={<Brief ideas={ideas} setIdeas={setIdeas} artists={artists} />} />
        <Route path="/conventions" element={<Conventions />} />
        <Route path="/concepts" element={<Concepts concepts={concepts} setConcepts={setConcepts} />} />
        <Route path="/boards" element={<Boards boards={boards} setBoards={setBoards} ideas={ideas} />} />
        <Route path="/manage" element={<Manage artists={artists} setArtists={setArtists} />} />
      </Routes>
      <Nav />
    </div>
  )
}
