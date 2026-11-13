import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { maybeSeedDemo, watchForDemoReseed } from './data/demoSeed'
import { setupServiceWorker } from './sw/register'

// Demo mode: visiting any route with ?demo=1 on the local backend seeds a
// fictional dataset + session before the app boots (no-op when signed in).
maybeSeedDemo()
// If a sibling tab re-seeds to a newer demo dataset while this tab is open,
// reload rather than let this tab's stale in-memory copy flush over it (#34).
watchForDemoReseed()

// Register the service worker in built copies only; under `vite dev` it would
// cache-first serve stale source modules, so any leftover one is removed.
void setupServiceWorker({ dev: import.meta.env.DEV, base: import.meta.env.BASE_URL })

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
