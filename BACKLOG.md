# Backlog

Items waiting on something before they can move.

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
