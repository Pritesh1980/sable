# Browser Tests

`npm run test:e2e` builds the normal offline public demo at ports 4179 and 4180
(`/sable/`). The suite uses fictional artwork, Chromium phone/desktop contexts,
fake camera input and blocked service workers except in explicit offline-shell tests.
It excludes refinement specs so no fake auth can leak into the default demo run.

## Refinement

Run `npm run test:e2e:refinement` separately. It builds fictional private-owner
copies at ports 4181 and 4182 (`/sable/`), plus a normal offline demo at 4183.
`vite.refinement.config.js` alone aliases auth; normal production config never
imports the fixture or its fake token. The fixture uses local storage and
intercepted relay responses. OpenAI and Supabase requests are aborted. No paid
provider or real account is contacted.

Coverage includes reload/lost-response recovery, exact replay bytes and ID,
canonical image/record evidence before ack, failed saves, disabled payment,
expiry/uncertain outcomes, deleted destinations, sign-out during download, two tabs,
orientation/alpha, focus/overflow, manual clipboard/download/import and a downloaded
backup restored after closing the source context. Downloads are reported as
requested, never verified off-device. Chromium phone emulation is not a real iPhone
Safari or installed home-screen persistence test; that remains an activation gate.
