import { defineConfig } from '@playwright/test'

// Smoke tests against the deployed demo on GitHub Pages — no local build or
// server. Run by .github/workflows/live-smoke.yml after each deploy and weekly;
// locally: npx playwright test --config playwright.live.config.js
// LIVE_URL points it at another deployment (keep the trailing slash).
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  // Distinct from the offline suite's '**/*.e2e.js', so neither runs the other.
  testMatch: '**/*.live.js',
  forbidOnly: CI,
  // The network and Pages' CDN are in the loop here, unlike the local suite.
  retries: CI ? 2 : 0,
  workers: 1,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.LIVE_URL || 'https://pritesh1980.github.io/sable/',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    // The real worker is part of what's being checked.
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
