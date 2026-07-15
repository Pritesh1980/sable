import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { maybeSeedDemo } from './data/demoSeed'

// Demo mode: visiting any route with ?demo=1 on the local backend seeds a
// fictional dataset + session before the app boots (no-op when signed in).
maybeSeedDemo()

// Register service worker. When a new SW takes control (after a deploy), reload
// once so the page swaps to the fresh assets — but not on the first-ever visit
// (no prior controller), which would be a pointless reload.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    // BASE_URL is the deploy base ('/' or '/sable/'); the SW lives beside
    // index.html and its scope must match, so register it under the base.
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

// Match the router to the deploy base so deep links resolve under a sub-path
// (e.g. /sable/gallery on GitHub Pages). BASE_URL carries a trailing slash;
// react-router wants a leading slash and no trailing one.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter basename={basename}>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
)
