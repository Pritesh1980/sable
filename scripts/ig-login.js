#!/usr/bin/env node
// One-time Instagram login to save a session for fetch-instagram-images.js.
//
// Usage: node scripts/ig-login.js
//
// Opens a real (headed) browser, navigates to Instagram login, waits for you
// to log in manually, then saves cookies + localStorage to .ig-session.json.
// That file is gitignored — never commit it.

import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_FILE = path.join(__dirname, '..', '.ig-session.json')

;(async () => {
  console.log('Opening browser — log in to Instagram, then come back here.')
  console.log('The browser will close automatically once you are logged in.\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' })

  // Wait until IG redirects away from the login page to the home feed
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/accounts/'),
    { timeout: 300_000 }
  )
  // Give IG a moment to finish setting all auth cookies
  await page.waitForTimeout(3000)

  console.log('Logged in — saving session…')
  await context.storageState({ path: SESSION_FILE })
  await browser.close()

  console.log(`Session saved to .ig-session.json`)
  console.log('You can now run: node scripts/fetch-instagram-images.js --count 20 --append --all')
})()
