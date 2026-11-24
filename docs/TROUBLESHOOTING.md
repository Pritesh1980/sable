# Troubleshooting the dev machine

Symptom → cause → fix, for errors that look like a broken repo but aren't. **A contributor
note, not part of the user guide.** Written for every agent working here (Claude, codex,
antigravity) and for the owner. Most entries are specific to the owner's Mac: an **Intel**
(x86_64) machine, so advice written for Apple Silicon often doesn't apply. CI runs on Linux
and sees none of these.

Found a new one? Add it here, not to one tool's private memory, where the other agents
can't read it.

## `npm ci` fails: "sharp: Attempting to build from source via node-gyp"

The install is fine. `sharp` (pulled in by `@huggingface/transformers`, the Taste Engine)
runs a probe that throws on darwin-x64, so npm falls back to a source build it can't do. The
prebuilt `@img/sharp-darwin-x64` binary is already downloaded and works.

- **Fix:** `npm ci --ignore-scripts`.
- **Trap:** plain `npm ci` rolls back completely when a script fails, leaving `node_modules`
  empty. It looks catastrophic; just rerun with `--ignore-scripts`.

## "Invalid hook call" or "more than one copy of React" in the dev server

Usually right after adding a new source file and restarting `npm run dev` on the same port a
few times, and pointing at a hook in code you didn't touch. Vite's pre-bundled dependency
cache (`node_modules/.vite`) has gone stale; it isn't a real duplicate React.

- **Fix:** `rm -rf node_modules/.vite`, restart the dev server, check again before debugging.

## A callback runs twice in dev, once in tests

`src/main.jsx` wraps the app in `<StrictMode>`, which deliberately calls `setState` updaters
twice. A side effect inside an updater (`setX(cur => { onChange(cur); return null })`) fires
twice.

- **Fix:** keep updaters pure; mirror the value in a ref and do the side effect in the event
  handler. Don't assign refs during render either (lint flags it); do it in a `useEffect`.
- **Test it:** `renderHook(..., { wrapper: StrictMode })` and assert call counts. A plain
  `renderHook` passes either way.

## codex says its GitHub token is invalid or expired

The token is fine. codex's sandbox (`sandbox_mode = "workspace-write"`) has no network by
default, so `git ls-remote` fails with "Could not resolve host: github.com", and `gh auth
status` reports the failed connection as a bad token. `npm run agents:status` prints a
warning there instead of the PR list.

- **Fix:** none needed for read-only reviews. To push from codex for one session:
  `codex -c 'sandbox_workspace_write.network_access=true'`. The owner keeps it off.

## `brew install` / `brew reinstall` "succeeds" but the tool is still broken

Homebrew dropped Intel x86_64 in Sept 2026. Any formula that needs compiling fails on
purpose, and `brew reinstall` still exits 0 (piping it through `tail` hides the error).

- **Fix:** use the vendor's own installer, which bundles its dependencies. Diagnose a
  dynamic-loader error with `otool -L <binary>` and check each listed path exists.
- **Node** is a checksum-verified nodejs.org tarball in `~/.local/node-v<version>`, symlinked
  into `~/.local/bin` ahead of the broken Homebrew node. If `node -v` shows a dyld error,
  check `which node` resolves to `~/.local/bin`. A Node major bump (`.nvmrc`) means
  installing the new tarball the same way.
- **codex** from the Homebrew cask can hang before printing anything; see "Cross-model
  reviews" in `CLAUDE.md`.

## "No space left on device", or every command is refused

The disk fills up mostly from outside this repo, but every worktree adds its own
`node_modules`, `dist/` and `test-results/` (each e2e run rebuilds). A full disk also stops
`git fetch` (it can't write `FETCH_HEAD`).

- **Fix:** run `df -h /` first. Remove worktrees whose PR has merged (`npm run agents:status`
  marks them "can be removed"), but only your own; ask the owner before deleting anything
  else. A new worktree under `.worktrees/` can share the root's packages when the lockfile
  matches main: `ln -s ../../node_modules node_modules`.

## The phone doesn't show data added in the Mac's browser

The phone over Tailscale (`https://<machine>.<tailnet>.ts.net`) is a different browser
origin from the Mac's `http://localhost:5173`. localStorage, IndexedDB and blob storage are
per origin and per device, so nothing seeded on the Mac reaches the phone, and there is no
way to push it there from the dev machine.

- **Fix:** hand the files over and add them on the phone itself. Direct IP
  (`http://100.x.x.x:5173`) doesn't work either: Vite binds IPv6 only and the macOS firewall
  resets inbound connections to `node`. `tailscale serve` does work.
