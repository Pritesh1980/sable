import { defineConfig } from '@playwright/test'

// Browser tests against the built demo (vite preview), phone-first. They cover
// what unit tests can't see: real layout, stacking, touch gestures, canvas,
// WebGL, camera and downloads. See e2e/README.md.
const PORT = 4179
// The public demo is served from GitHub Pages under /sable/, so a second build
// with that base runs alongside. Unit tests use MemoryRouter and never touch
// BrowserRouter's basename; this is where a base-path regression shows up.
const SUB_PORT = 4180
const CI = Boolean(process.env.CI)
// Reusing a server already on the port is opt-in (E2E_REUSE=1). Anything that
// answers there passes the health check — an old build, another checkout — and
// then the suite tests the wrong code. Rebuilding costs ~20 seconds.
const reuseExistingServer = !CI && Boolean(process.env.E2E_REUSE)

// Never a developer's .env.local Supabase: offline local backend only.
const env = { VITE_BACKEND: 'local', VITE_OWNER_EMAIL: '', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }

const iphone = {
  browserName: 'chromium',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.js',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // A stale service-worker cache would test the wrong build.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // A fake camera, so live try-on runs against a real MediaStream.
    permissions: ['camera'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  projects: [
    { name: 'iphone', use: iphone, testIgnore: ['**/*.desktop.e2e.js', '**/*.subpath.e2e.js'] },
    { name: 'iphone-subpath', use: { ...iphone, baseURL: `http://localhost:${SUB_PORT}/sable/` }, testMatch: '**/*.subpath.e2e.js' },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } }, testMatch: '**/*.desktop.e2e.js' },
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer,
      timeout: 180_000,
      // Pinned: an exported VITE_BASE would otherwise build this one at /sable/ too.
      env: { ...env, VITE_BASE: '/' },
    },
    {
      command: `npm run build -- --outDir dist-sable && npx vite preview --outDir dist-sable --port ${SUB_PORT} --strictPort`,
      url: `http://localhost:${SUB_PORT}/sable/`,
      reuseExistingServer,
      timeout: 180_000,
      env: { ...env, VITE_BASE: '/sable/' },
    },
  ],
})
