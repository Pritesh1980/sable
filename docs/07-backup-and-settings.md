# Settings, backup & restore

*Your data syncs to your account across devices, with a local copy on each. Export a backup whenever you want an extra restore point you control.*

← [Back to contents](README.md)

---

Everything you create (artists, photos, ideas, boards, concepts, ranks, tags, notes) is
kept as a local copy in your browser **and** synced to your account, so it follows you
across devices and still works offline. A photo this device hasn't loaded yet can't be
fetched without a connection: offline it shows as an **Available when online** tile in its
usual place (in an artist's photos, on the Concepts wall, or on a variant) and fills in
once you're back online. Nothing is lost. The **Backup** panel in **⋯ → Settings** lets
you export a full snapshot you control — and it's where your account and sign-out live.

![The Settings page with the backup panel](../public/guide/settings.png)

## Share to Sable on iPhone

Settings offers **Install Share to Sable** only when a real iCloud Shortcut link is
configured. Otherwise it links to the [manual setup guide](02-managing-artists.md#share-from-instagram).
The Shortcut copies a selected screenshot or profile link and opens Sable; you
still paste in capture. Real-phone acceptance and Safari versus installed-app
session behaviour remain pending. Photo selection and manual profile-link paste
are available when clipboard reading is denied or unsupported.

## Export a backup

Tap **Export Backup**. A single JSON file downloads — named with the date, e.g.
`tattoo-backup-2026-05-30.json`. It contains the current document snapshot:

- artists, their tags, status, studio, notes and ranks
- your photos themselves, embedded in the file — so the backup restores on any device or
  account, and nothing in it expires
- ideas, boards and AI concepts
- any convention attendance you've recorded

## Restore a backup

Tap **Import Backup** and choose a previously exported file. This **replaces** the current
data with the backup's contents — useful for recovering an earlier snapshot, or for pulling
your data into an account that doesn't have it yet. Embedded photos are saved to the
account you're signed in to as they come back in. Backups made by earlier versions of Sable
still import; a backup from a *newer* version is refused with a message to update first.

## When to back up

- **Before clearing your browser data** or its site storage.
- **Before any big change** you might want to undo.
- **For a portable document snapshot** — switching devices normally just needs sign-in
  (your account syncs everything), but a backup is an export you hold yourself.
- Periodically, just in case — it's one tap.

> **File size and offline:** because the photos are embedded, a backup of a large
> collection can be big (tens of megabytes or more) and takes a moment to build — the panel
> shows its progress. Photos that can't be read right now (for example, not downloaded to
> this device while you're offline) are left out, and the panel tells you how many. Export
> again once you're back online to include them.

---

← [Back to contents](README.md)
