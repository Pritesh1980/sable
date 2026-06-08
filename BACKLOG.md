# Backlog

Items waiting on something before they can move.

## Accounts & sync — follow-ups

User accounts and cross-device sync are now built (auth gate, per-user data,
last-write-wins sync of artists/ideas/concepts/boards/conventions, and artist
images via blob storage). The adapter boundary lives in `src/backend/`. Remaining:

- **Provision Supabase** — create the project, the `collections` table with RLS
  (`using (auth.uid() = user_id)` — must be enabled before real data lands), the
  private `tattoo-images` bucket, and the owner + artist accounts. Set
  `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_OWNER_EMAIL`. Then verify the live `supabase/*` adapter end-to-end.
- **Move idea & concept images to blobs** — currently they still sync inline
  (base64 in their synced docs). The blob foundation (`uploadImages`, resolver
  cache, `getImageUrl` key branch) is in place; the remaining work is routing
  Brief/Concepts uploads through `uploadImages` and resolving keys at render
  (concept `imageUrl` is also consumed by STL export, so verify that path).
- **AWS adapter** — add `src/backend/aws/{cognitoAuth,apiStore,s3Blobs}.js` and the
  `'aws'` branch in `src/backend/index.js`; migrate data (Postgres rows → DynamoDB,
  Storage objects → S3 with identical keys). No app/page/component changes needed.

## Blocked on deployment infrastructure

Pritesh doesn't yet have the AWS deployment set up. Once S3 + CloudFront is
live, the items below unblock.

- **Deploy to S3 + CloudFront** — per CLAUDE.md hosting plan. Includes bucket,
  distribution, cache config, and build/deploy script.
- **Read-only share link** — a public URL the tattoo artist can open without
  auth. Requires the app to be publicly hosted first. Design questions to
  resolve when we pick this up:
  - Does the share link expose only a subset of pages (Gallery, Boards) or
    everything?
  - Secret URL vs no auth at all (the app holds no sensitive data)?
  - How does shared state reach the artist — published snapshot, or live
    read from the same localStorage source (which won't work cross-device
    and would need a backend)?
