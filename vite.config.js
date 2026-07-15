import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import precachePlugin from './scripts/precachePlugin.js'

export default defineConfig({
  // Root ('/') for local dev, tests, and a future root host; the GitHub Pages
  // workflow builds with VITE_BASE=/sable/ so assets resolve under the project
  // sub-path. Threads through the router basename and the SW precache manifest.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), precachePlugin()],
  server: {
    // Dev-only: allow Cloudflare quick tunnels (`cloudflared tunnel --url ...`)
    // so the dev server can be previewed from a phone. No production impact.
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // Specs assume the offline local backend; don't let a developer's
    // .env.local (e.g. VITE_BACKEND=supabase) leak into the suite.
    env: {
      VITE_BACKEND: 'local',
      VITE_OWNER_EMAIL: '',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    },
  },
})
