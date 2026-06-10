import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
