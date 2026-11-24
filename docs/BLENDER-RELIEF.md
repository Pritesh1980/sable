# Preparing relief STLs with Blender (desktop)

Mac desktop tooling for Sable's rectangular upright relief exports (`src/data/reliefStl.js` — Relief, Line art, Lithophane, or raised merged single-extruder STLs) ([#193](https://github.com/Pritesh1980/sable/issues/193)). The in-app export in `src/data/reliefStl.js` stays unchanged; [`scripts/blender/relief-prep.py`](../scripts/blender/relief-prep.py) checks and repairs exported STLs, decimates dense meshes, optionally adds a thicker base plate or border frame, writes a cleaned binary STL, and renders a raking-light preview PNG or WebP before you commit filament.

> **Scope note (`Print this tattoo` / `tattooPrint.js`):** `--base-mm` and `--frame-mm` assume a rectangular footprint aligned to the bounding box. They are **not** intended for die-cut silhouette STLs (a rectangular base turns the cutout into a slab, and a rectangular frame can export as a disconnected ring) or face-down **Inlay** split STLs (a base at `z = 0` covers the visible front face). If you add `--base-mm B` to a single-extruder merged plaque, add `B mm` to the *Pause at height* layer height shown in Sable (printed in the report).

## Quick start

Run headless from the repo root using macOS Blender (`4.5 LTS` or newer):

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
  -P scripts/blender/relief-prep.py -- \
  --input ~/Downloads/concept-relief.stl \
  --out-stl /tmp/concept-relief-clean.stl \
  --preview /tmp/concept-relief-preview.png
```

Add `--max-triangles`, `--base-mm`, and/or `--frame-mm` when you want lighter meshes or extra plaque rigidity:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
  -P scripts/blender/relief-prep.py -- \
  --input ~/Downloads/concept-relief.stl \
  --out-stl /tmp/concept-relief-framed.stl \
  --preview /tmp/concept-relief-preview.png \
  --report /tmp/concept-relief-report.json \
  --max-triangles 25000 \
  --base-mm 1.5 \
  --frame-mm 3
```

## What it does

1. **Weld and repair:** Imports the STL (refusing colliding input/output paths, symlinks, or hard links), welds coincident vertices (`--merge-distance`, default `0.001 mm`), dissolves degenerate triangles, deletes wire edges and loose vertices, fills open boundary holes, triangulates, verifies edge and vertex manifoldness plus connected shell count, recalculates outward normals when holes were filled or volume/manifoldness requires it (preserving closed positive-volume multi-shell cavities), and shifts the print flat onto `z = 0`.
2. **Safe decimation:** If triangle count exceeds `--max-triangles` (default `50,000`; `0` disables), collapses edges and re-cleans the mesh. If collapse would break an already-manifold mesh, it tries a gentler ratio and falls back to the repaired mesh with a warning rather than exporting broken geometry; it also warns when Blender's 1% collapse floor leaves triangles above `--max-triangles`.
3. **Optional base & frame:** `--base-mm B` raises the relief by `B mm` and unions a solid `B mm` rectangular base plate underneath (noting the `+B mm` pause-at-height shift). `--frame-mm F` unions a watertight perimeter border (`F mm` wide; height set by `--frame-height-mm`, defaulting to the relief peak height) using Blender's `EXACT` boolean solver and warns if the frame leaves a disconnected shell. If repair still leaves non-manifold geometry, STL export is skipped and the script exits `1` unless `--allow-non-manifold` is passed.
4. **Lit filament preview:** `--preview PATH` renders a three-point raking-light Cycles + OpenImageDenoise studio preview on Sable's `#131110` backdrop in `--material` (`pla-ivory`, `pla-slate`, or `resin-grey`).

## Options

| Option | Default | Meaning |
|---|---|---|
| `--input PATH` | required | Source STL exported from Sable (or any STL). |
| `--out-stl PATH` | required | Destination path for cleaned STL (distinct from `--input`, outside the repo). |
| `--preview PATH` | none | Optional studio preview image (`.png` or `.webp`). |
| `--report PATH` | none | Optional JSON metrics (`before`, `after`, `steps`, `warnings`). |
| `--max-triangles N` | `50000` | Target ceiling for edge-collapse decimation (`0` disables). |
| `--base-mm MM` | `0` | Extra rectangular base thickness added underneath in mm. |
| `--frame-mm MM` | `0` | Perimeter border frame width in mm around rectangular plates. |
| `--frame-height-mm MM` | relief peak | Frame height in mm when `--frame-mm > 0`. |
| `--merge-distance MM` | `0.001` | Coincident vertex weld tolerance in mm. |
| `--material PRESET` | `pla-ivory` | `pla-ivory`, `pla-slate`, or `resin-grey`. |
| `--samples N` | `48` | Cycles samples for `--preview`. |
| `--size PX` | `1024` | Square preview resolution in pixels. |
| `--ascii` | off | Write ASCII STL instead of compact binary STL. |
| `--allow-non-manifold` | off | Export `--out-stl` and exit `0` even if non-manifold geometry remains. |

## Interactive option & guardrails

- **By chat (Blender MCP):** You can open the same repaired mesh or preview scene interactively in Blender using the local MCP setup described in [the main Blender guide](BLENDER.md#interactive-option-a-blender-mcp). Keep MCP bound to `localhost`.
- **Never commit test meshes or previews:** Write all `.stl` files and preview renders outside the repo (for example `/tmp` or `~/Downloads`), and test with fictional demo artwork only (such as `public/models/designs/hourglass.webp`) — never real artists' work.
- **Unit tests (no Blender needed):** Pure topology, decimation ratio, camera framing, and CLI checks run with `python3 -m unittest discover -s scripts/blender`.
