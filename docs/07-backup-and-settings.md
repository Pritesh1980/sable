# Settings, backup & restore

*A device-local library stays on that device. Export a portable snapshot whenever you want a restore point you control.*

← [Back to contents](README.md)

---

With device-local storage, everything you create stays in this browser even if you
use a real login. Signing out clears displayed caches, not the owner-namespaced
library; signing back in as the same owner on the same device restores it. That is
**not** a cloud copy. Cloud-storage builds sync separately across devices. The
**Backup** panel in **⋯ → Settings** requests a full snapshot you control.

![The Settings page with the backup panel](../public/guide/settings.png)

## Share to Sable on iPhone

Settings offers **Install Share to Sable** only when a real iCloud Shortcut link is
configured. Otherwise it links to the [manual setup guide](02-managing-artists.md#share-from-instagram).
The Shortcut copies a selected screenshot or profile link and opens Sable; you
still paste in capture. Real-phone acceptance and Safari versus installed-app
session behaviour remain pending. Photo selection and manual profile-link paste
are available when clipboard reading is denied or unsupported.

## Export a backup

Tap **Export Backup**. A JSON download is requested — named with the date, e.g.
`tattoo-backup-2026-05-30.json`. It contains the current document snapshot:

- artists, their tags, status, studio, notes and ranks
- canonical local saved images embedded as image bytes, including paid concept results
- ideas, boards and AI concepts
- any convention attendance you've recorded

In private builds, Sable reports **“Download requested—check the file was saved”** only after it has
read every required local image and initiated the download. A browser click cannot
verify that a file actually landed or was copied off this device. If an image is
missing or unreadable, the export stops rather than offering a partial file.
External portfolio links and bundled artwork remain references in the JSON; Sable
does not fetch those third-party images. Historical unclassified artist-cache bytes
that are not part of the canonical library are not included. Keep any such photos
separately until recovered into the library.

In the public demo and ordinary offline builds, Settings keeps the standard v2
export: embedded photos restore on another account or device, while unreadable
photos are counted in the export message. Reconnect and export again to include
them. This partial-export path does not mark a private paid-result backup complete.
Both paths request a download; check that the file was actually saved.
Images already kept on this device are included even when their upload is still
pending. A private export still stops if neither a device copy nor the backend
can supply every required image.

On **Concepts**, the paid-image backup indicator says **“No export requested”** or
shows the last download request and **“Paid results saved since last export request.”**
Export again after saving paid results, then confirm and store the file safely.
Browser storage persistence is only an eviction hint, not an off-device backup.
The refinement drawer offers the same **Export full library backup** action, not a
concept-only file. Export after **Variation saved**, confirm the download, and keep a
copy away from this device. A pending job is not a saved result or part of this backup.
After export, import the file in a fresh browser context and check that embedded paid
images and their provenance survive. Do not rely on the source browser's existing cache
as proof that a backup contains the bytes. Relay results are only recoverable for 24 hours.

## Restore a backup

Tap **Import Backup** and choose a previously exported file. This **replaces** the current
data with the backup's contents — useful for recovering an earlier snapshot, or for pulling
your data into an account that doesn't have it yet. If your library already holds anything,
Sable asks first and names both sides, e.g. *“Replace your library (12 artists, 4 ideas)
with this backup from 1 Oct 2026 (8 artists, 2 ideas)? This can't be undone.”* Cancel and
nothing changes. There is no undo after you agree, so export a backup of the current
library first if you might want it back. Embedded photos are saved to the
account you're signed in to as they come back in. Backups made by earlier versions of Sable
still import; a backup from a *newer* version is refused with a message to update first.

## Appearance

Theme (**◑ / ◐**) and text size (**A+ / A−**) sit at the right-hand end of the bottom
bar on every page except the home Wall, on phone and desktop alike. The Wall has no
bottom bar: open its menu (**⋯**) and pick any page to reach them. Both are per-device
and don't sync.

## When to back up

- **Before clearing your browser data** or its site storage.
- **Before any big change** you might want to undo.
- **Before switching devices** with device-local storage; import the file on the other
  device. Cloud-storage builds can sync separately, but this is a copy you hold yourself.
- Periodically, just in case — it's one tap.

> **Check the downloaded file:** Sable can request a download, not confirm that your
> browser saved it. Store a copy away from this device if you need protection against
> device loss.

---

← [Back to contents](README.md)
