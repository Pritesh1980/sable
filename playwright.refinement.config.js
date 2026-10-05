import { defineConfig } from '@playwright/test'

const offline = { VITE_BACKEND: 'local', VITE_OWNER_EMAIL: '', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }
const privateEnv = { ...offline, VITE_AUTH_BACKEND: 'supabase', VITE_PRIVATE_OWNER_ID: 'fixture-owner', VITE_AI_RELAY_URL: 'http://localhost:4199' }
const phone = { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
export default defineConfig({
  testDir: 'e2e', testMatch: '**/refinement*.e2e.js', fullyParallel: true,
  outputDir: 'test-results/refinement',
  workers: 2, timeout: 45_000, expect: { timeout: 10_000 }, retries: 0,
  use: { baseURL: 'http://localhost:4181', serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'refinement-phone', use: phone, testIgnore: ['**/*.desktop.e2e.js', '**/*.manual.e2e.js'] },
    { name: 'refinement-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } }, testIgnore: '**/*.manual.e2e.js' },
    { name: 'refinement-subpath', use: { ...phone, baseURL: 'http://localhost:4182/sable/' }, testIgnore: ['**/*.desktop.e2e.js', '**/*.manual.e2e.js'] },
    { name: 'refinement-demo', use: { ...phone, baseURL: 'http://localhost:4183' }, testMatch: '**/*.manual.e2e.js' },
  ],
  webServer: [
    { command: 'npm run build -- --config vite.refinement.config.js --outDir dist-refinement && npx vite preview --config vite.refinement.config.js --outDir dist-refinement --port 4181 --strictPort', url: 'http://localhost:4181', env: { ...privateEnv, VITE_BASE: '/' }, timeout: 180_000 },
    { command: 'npm run build -- --config vite.refinement.config.js --outDir dist-refinement-subpath && npx vite preview --config vite.refinement.config.js --outDir dist-refinement-subpath --port 4182 --strictPort', url: 'http://localhost:4182/sable/', env: { ...privateEnv, VITE_BASE: '/sable/' }, timeout: 180_000 },
    { command: 'npm run build -- --outDir dist-refinement-demo && npx vite preview --outDir dist-refinement-demo --port 4183 --strictPort', url: 'http://localhost:4183', env: { ...offline, VITE_AUTH_BACKEND: 'local', VITE_PRIVATE_OWNER_ID: '', VITE_AI_RELAY_URL: '', VITE_BASE: '/' }, timeout: 180_000 },
  ],
})
