# On-body renders with Blender (desktop)

Desktop tooling for the Mac ([#192](https://github.com/Pritesh1980/sable/issues/192), a
spike). Sable never calls Blender: you run a script on the Mac, then import the PNGs
into the concept like any other result.

`scripts/blender/render-on-body.py` wraps a saved concept image round a 3D forearm at a
true printed size, lights it against Sable's near-black and renders three angles. It
shows what a flat **Try on skin** overlay can't: how far a 12 cm design wraps round the
arm, and how 12 cm compares with 18 cm. By default the ink looks **healed**, the way the
tattoo will look once it has settled, rather than freshly inked.

## Install Blender

Download Blender from blender.org (or `brew install --cask blender`). The script runs
headless, with no window, through the app's own binary:

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --version
```

It has been run headless with Blender 4.0.2 (Ubuntu's package) and 5.2.3 LTS (the
official `bpy` build). Any 4.x or 5.x should work.

## Render a concept

1. **Get the image out of Sable.** On the concept (or a saved result), choose **Refine
   this → Export source image**, which saves it as a full-size PNG. This works in every
   build, the demo included, and needs a connection only if the image isn't stored on
   this device. Move the file to the Mac (AirDrop is fine). Black linework on white paper works best: white
   means bare skin, and colour multiplies over the skin like ink. Transparent PNGs work too.
2. **Measure your forearm** in cm: round the wrist just above the wrist bone, round
   the widest point just below the elbow, and the length from wrist crease to elbow crease.
3. **Run it** from the repo root. Everything after `--` belongs to the script.

```sh
"$BLENDER" -b -P scripts/blender/render-on-body.py -- \
  --image ~/Downloads/concept.png --width-cm 12 \
  --wrist-cm 17 --elbow-cm 26 --length-cm 25 \
  --out ~/Pictures/sable-renders/concept-12cm
```

Keep `--out` outside the repo. Renders of your own concepts are personal, so never
commit them.

| Argument | Default | Meaning |
|---|---|---|
| `--image` | required | The design (PNG, JPEG or WebP). |
| `--width-cm` | required | Printed width on the skin, measured round the curve as a stencil lies. Height follows the image's aspect ratio. |
| `--out` | required | Output folder (created if missing). |
| `--wrist-cm` / `--elbow-cm` / `--length-cm` | 17 / 26 / 25 | Your arm. |
| `--centre-cm` | mid-forearm | Where the design's centre sits, measured from the wrist. |
| `--design-up` | `elbow` | Which end the top of the image points to (`elbow` or `wrist`). |
| `--skin` | `#c99d80` | Skin tone as `#rrggbb`. |
| `--ink` | `healed` | `healed` (settled under the skin) or `fresh` (crisp, just inked). See below. |
| `--ink-spread-mm` | 0.15 | Healed only: how far lines have spread into the skin, in mm (a Gaussian sigma). |
| `--ink-strength` | 0.92 | How dark solid black is: 1 is pure black; lower lets a little skin through. |
| `--white-point` | 0.9 | Paper at or above this sRGB level counts as bare skin, so off-white scans don't tint the arm. |
| `--samples` / `--size` | 64 / 1024 | Render quality; `--size` is the long edge. |
| `--views` | all three | Any of `top,three-quarter,side`. |
| `--placement` | `forearm` | The only body part so far. |

## Healed or fresh ink

A fresh tattoo is crisp, and its black is the skin's own colour, darkened: a warm brown
on light skin. Once healed, the pigment sits under a layer of skin, and the render
models four changes:

- **Spread.** Lines soften by `--ink-spread-mm` (0.15 mm by default) of skin. The blur is
  applied to the design in pixels, converted from millimetres at the printed size, so
  it stays the same size on the skin: the same image at 18 cm gets fewer pixels of blur
  than at 12 cm.
- **A cool black.** The skin above the pigment scatters some light back, so solid black
  reads as a slightly blue-green black at the same darkness, not warm brown. Coloured
  ink fades a quarter of the way towards grey.
- **A little density loss.** Ink lets 2% more skin through, plus some sub-millimetre
  unevenness where pigment settled patchily. Most of this shows in the darkest areas.
- **Skin over the ink.** The skin's sheen and pores carry on across the ink, so it
  looks under the surface rather than painted on it.

`--ink fresh` is the spike's look, unchanged: it renders pixel-identical to the spike.

Healed ink takes a few extra seconds before rendering (about 3 s for a 1040 px image
with bpy 5.2, 5 s with Blender 4.0) because the blur runs in plain Python. That way it
also works in Blender builds without numpy. Larger images are prepared at 2048 px on the
long edge, which takes about 20 s. That is more than a render can show, and it saves
gigabytes of memory.

## What comes out

- `top.png`, `three-quarter.png` and `side.png`, in 2:3 portrait like Sable's cards.
- `params.json` records the inputs, the arm's circumference under the design, how far
  round the arm the design wraps (in degrees), the ink settings, render settings and
  times, and warnings. A warning means the design is wider than the arm somewhere and is
  clipped at the underside, or that it runs past the wrist or elbow, or that it measured
  more than 2% off its width on the rendered arm.
- `params.json` → `measured_cm` is the design **measured on the arm as rendered** (after
  subdivision). The width round the arm is measured across the arm near the design's
  wrist end, middle and elbow end, and the length along the arm's top line. The mesh is
  sliced with a plane, and the skin is measured where the design's texture coordinates
  fall inside the image.

The camera framing depends only on the arm, not the design, so two widths on the same
arm compare like for like. For `--width-cm 12` on the default arm, `measured_cm` reports
11.98 cm round the arm at all three heights and 12.0 cm along it. Subdivision rounds the
mesh slightly, which costs the 0.2 mm.

On 4 Linux CPU cores at the defaults, each view takes 35–45 s with the denoiser. The
official builds include OpenImageDenoise, and an Apple Silicon Mac should be quicker.
For quick drafts, use `--samples 16 --size 512`.

## Bring the renders into Sable

Open the concept, show its details (`I`), and under **AI Results** choose **Add Result**:

- **Provider:** Other
- **Title:** for example *Forearm 12 cm · top*
- **Image file:** the PNG
- **Notes:** the measurements and width from `params.json`

Add one result per angle. They are then ordinary variants: rate them, mark the best,
compare 12 cm with 18 cm. Add them on the device that holds your library (AirDrop the
PNGs to the iPhone first), because device-local builds don't sync.

## Interactive option: a Blender MCP

To tweak a scene by chat instead of re-running the script, connect an MCP client
(Claude Code or Claude Desktop) to Blender:

- **Official:** the Blender Foundation's Blender Lab MCP server
  (`projects.blender.org/lab/blender_mcp`, documented at `blender.org/lab/mcp-server`).
  It is reported to need Blender 5.1 or newer plus its add-on.
- **Community:** `blender-mcp` by Siddharth Ahuja (`github.com/ahujasid/blender-mcp`),
  renamed *MCP for Blender* in September 2026. It is a Blender add-on plus an MCP server
  that the client launches.

These details come from secondary sources: blender.org could not be reached when this
was written (Nov 2026). Check both projects before installing, and follow each one's
README for current install steps; they change often.

**Both can run arbitrary Python inside Blender**, so they can reach anything Blender can:
your files and the network. Keep them local (never expose their port beyond
`localhost`) and connect only clients you trust. Don't open `.blend` files from
untrusted sources: a `.blend` can carry scripts. Keep **Auto Run Python Scripts** off
(Preferences → Save & Load).

## A real arm: MakeHuman (not built yet)

The parametric arm should give way to MakeHuman's base mesh, with the hand, cut and
scaled to your measurements. That step is blocked on getting the data from a trusted
source, which isn't possible from a cloud session, so there is no `--body` option yet.

**Don't use the PyPI package `makehuman`.** It looked like the way in, but it isn't the
MakeHuman project's release. Checked in Nov 2026 (version 1.3.2, wheel SHA-256
`384f0553…6fa85e`), reading its files as data without installing it:

- PyPI lists a single owner: a personal account, not one of the team members named in
  the package's own credits, and no organisation. The package has no author, homepage,
  project links, licence field or upload attestations.
- Its release history is five versions (0.0.0 to 1.3.1) on one day in April 2025, then
  1.3.2 the next day. The code calls itself a "1.3.0 alpha" nightly. Its launcher runs
  `python.exe`, and it has a "Hello, world!" stub.
- It has **no base mesh**: no `3dobjs/` and no `base.obj`, only a compiled
  `targets.npz`. Targets are per-vertex offsets *from* the base mesh, useless without it.
- Its licence folder covers only third-party libraries (PyQt5, Qt, numpy, PyOpenGL and
  others). CC0 appears only as claims inside the data, in a record embedded in
  `targets.npz` ("MakeHuman Team, CC0") and in the program's copyright message. Claims
  made inside a repackage by an unrelated uploader don't establish the licence.

**Getting the data on the Mac**, for the next step: download MakeHuman from the
project's own site (makehumancommunity.org) or its GitHub organisation
(`makehumancommunity`, the `makehuman` repository). The step needs the base mesh
(`base.obj`, the `hm08` mesh) and the `.target` files under its `targets/` folder.
MakeHuman documents its code as AGPL and its assets as CC0. Before using the files,
read the licence that ships with them and check it says so. Neither site could be
reached from the cloud session where this was written. Keep the files outside the repo;
the script will take their folder as an argument.

## Limits and next steps

- The arm is still a smooth parametric tube with no wrist bones, tendons, muscle, hair
  or hand. It is right for size and wrap, not photoreal.
- **Next, the real arm:** MakeHuman's base mesh (see above), with forearm and hand
  targets if useful, cut at the elbow and scaled until its circumferences match your
  measurements. A real mesh has no neat rings, so the cm mapping must come from
  per-vertex coordinates: position along the arm by projecting onto its axis, and
  position round the arm by arc length along that cross-section from the top centre
  line. The measuring half already works on any triangle mesh (`measure_slice`), so the
  result can be checked in cm the same way.
- At the default 1024 px a millimetre of skin is about 3.7 px, so the 0.15 mm spread is
  barely visible. It shows clearly at `--size 2048`.
- Other placements (shoulder, calf) need their own meshes. `--placement` accepts only
  `forearm` so far.

## Tests

The maths (taper, ellipse, cm → UV, the healed-ink blur and colour, and measuring a
design on a sliced mesh) runs in plain Python, without Blender:

```sh
python3 -m unittest discover -s scripts/blender
```
