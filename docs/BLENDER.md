# On-body renders with Blender (desktop)

Desktop tooling for the Mac ([#192](https://github.com/Pritesh1980/sable/issues/192), a
spike). Sable never calls Blender: you run a script on the Mac, then import the PNGs
into the concept like any other result.

`scripts/blender/render-on-body.py` wraps a saved concept image round a 3D forearm at a
true printed size, lights it against Sable's near-black and renders three angles. It
shows what a flat **Try on skin** overlay can't: how far a 12 cm design wraps round the
arm, and how 12 cm compares with 18 cm. By default the ink looks **healed**, the way the
tattoo will look once it has settled, rather than freshly inked.

The arm is either a smooth parametric tube (the default) or, with `--body makehuman`, a
real forearm with its wrist and hand from MakeHuman's CC0 data, fitted to your
measurements. The MakeHuman arm needs a copy of MakeHuman's repository on the Mac: see
[A real arm: MakeHuman](#a-real-arm-makehuman).

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
2. **Measure your forearm** in cm: round the wrist at its narrowest, just above the
   wrist bone; round the widest point just below the elbow; and the length from wrist
   crease to elbow crease.
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
| `--body` | `parametric` | `parametric` (a smooth tapered tube) or `makehuman` (a real forearm, wrist and hand). |
| `--makehuman-data` | none | MakeHuman checkout (its root or its `makehuman/data` folder). Required with `--body makehuman`. |
| `--side` | `inner` | MakeHuman arm only: `inner` (palm up, design on the inner forearm) or `outer` (turned over, back of the hand up). |
| `--mh-sex` / `--mh-muscle` / `--mh-weight` | 0.5 / 0.5 / 0.5 | MakeHuman arm only: MakeHuman's build sliders, 0 to 1 (sex: 0 female, 1 male). The fit to your measurements still sets the size; these change the shape. |

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

## A real arm: MakeHuman

`--body makehuman` swaps the tube for MakeHuman's base mesh: a real left forearm, with
the forearm's muscle shape, the wrist and the hand, fitted to your measurements.

### Get the data on the Mac

Clone MakeHuman's own repository, anywhere outside Sable (about 160 MB):

```sh
git clone --depth 1 https://github.com/makehumancommunity/makehuman ~/src/makehuman
```

Then pass the checkout to the script. Either its root or its `makehuman/data` folder
works:

```sh
"$BLENDER" -b -P scripts/blender/render-on-body.py -- \
  --image ~/Downloads/concept.png --width-cm 12 \
  --wrist-cm 17 --elbow-cm 26 --length-cm 25 \
  --body makehuman --makehuman-data ~/src/makehuman \
  --out ~/Pictures/sable-renders/concept-12cm-mh
```

The script reads four kinds of file from `makehuman/data`, with its own parsers:
`3dobjs/base.obj` (the `hm08` base mesh), `targets/macrodetails/*.target` (MakeHuman's
build sliders), and the default skeleton's joints and weights in
`rigs/default.mhskel` and `rigs/default_weights.mhw`. **Never commit MakeHuman's files,
or meshes made from them, to Sable.** The script builds the arm afresh on every run,
and nothing it writes contains the mesh.

### The licence

Checked in Nov 2026 against MakeHuman's repository (`makehumancommunity/makehuman`,
commit `a8bc2d5`, June 2024):

- `LICENSE.md` §C says the bundled assets are released under **CC0 1.0 Universal**. It
  defines assets as "any data contributing to the graphical output of MakeHuman",
  naming the base mesh and proxies, targets and modifiers, textures, clothes, and poses
  and expressions. §B puts the source code (Python, scripts, shaders) under the
  **AGPL**. §D says MakeHuman's output carries no program logic, so the AGPL doesn't
  reach it.
- `LICENSE.ASSETS.md` is the full text of CC0 1.0.
- The files say so themselves. `base.obj` and the targets carry a header saying "This
  asset was explicitly released as CC0 in september 2020", with the copyright holders
  at release. All 1,280 `.target` files have a CC0 header: 1,258 from September 2020,
  and the 22 `bodyshapes-elvs-*` targets from October 2021 (by another author; the
  script doesn't use them). The skeleton and its weights aren't named in §C, but both
  files declare `"license": "CC0"`.

So the data is CC0, and the code is AGPL. The script uses only the data. It imports,
runs and copies none of MakeHuman's Python. The blend of macro targets is worked out
from the target files' names and the slider descriptions in
`modifiers/modeling_modifiers_desc.json`, not from MakeHuman's code.

**Don't use the PyPI package `makehuman`.** It isn't the MakeHuman project's release.
Checked in Nov 2026 (version 1.3.2, wheel SHA-256 `384f0553…6fa85e`): it has a single
personal-account owner who isn't among the team members named in its own credits. It has
no author, homepage, licence field or upload attestations. All six of its releases came
out within two days in April 2025. It has **no base mesh** (no `3dobjs/` or `base.obj`,
only a compiled `targets.npz`), and its only CC0 statements are claims inside its own
data.

### How the arm is built

1. **Build.** The base mesh plus MakeHuman's macro targets for a 25-year-old with
   MakeHuman's defaults (sex, muscle and weight all 0.5; an even mix of its three
   ethnicities). `--mh-sex`, `--mh-muscle` and `--mh-weight` move the blend. Height and
   proportions stay at their centre, where no target applies. Only the `body` group is
   used: helper geometry (clothes helpers, joint markers) is left out.
2. **Pose.** In MakeHuman's rest pose the elbow is bent about 42° and the hand is thumb
   forward. Each vertex turns about the elbow joint by its share of the forearm and hand
   bones' weights, which straightens the elbow. The forearm is then turned palm up
   (about a quarter turn, supination), spread evenly from the elbow to the wrist. This
   is the classic pose for an inner-forearm tattoo, and it leaves the inner forearm flat
   and untwisted.
3. **Lay it out like the parametric arm.** The wrist joint is at the origin and the
   elbow joint lies along +Y at `--length-cm` (the arm is scaled evenly to get there).
   The inner forearm faces +Z, so the top view looks straight at it. The thumb is on the
   right, as on a real left arm palm up: the arm is rotated, never mirrored.
   `--side outer` turns it over to show the outer forearm and the back of the hand. The
   upper arm is kept up to 8 cm past the elbow joint, out of frame.
4. **Smooth.** Two levels of Catmull-Clark subdivision, applied to the mesh. Everything
   after this is done on the subdivided mesh, which is what's rendered.
5. **Fit to your measurements.** The arm is sliced across every 2.5 mm. The wrist
   measurement goes at its narrowest section in the first fifth of the forearm (about
   0.5 cm above the wrist joint), and the elbow measurement at its widest section
   between 55% and 85% of the way up (about 20 cm from the wrist on the default arm).
   Each section is scaled about its own centre, by a factor that changes linearly
   between those two. So both circumferences come out as measured, and the forearm
   keeps MakeHuman's muscle shape between them. The hand is scaled as a whole with the
   wrist, so it keeps its proportions. The default MakeHuman forearm is slender (13.8 cm
   round the wrist), so the defaults scale it up by 23% at the wrist and 9% at the
   forearm's widest.

### How the design is mapped

The design is placed **per vertex in skin centimetres**, then turned into texture
coordinates:

- **Along the arm:** the vertex's position projected onto the forearm's axis, in cm from
  the wrist joint.
- **Round the arm:** its arc length round that cross-section, from the top centre line.
  The top line is where the ray from the section's centre towards the camera meets the
  skin. Each slice through the arm is a closed loop, and the arc to any angle round it
  is measured along the loop. A vertex between two slices takes the value interpolated
  from both. The underside seam is half the circumference round from the top line on
  either side, so a design as wide as the arm fits even where the section is lopsided.

That is how a stencil is measured: so many cm round the curve, so many cm along. A
projected decal would be simpler, but it shrinks the design as the arm curves away
from the projector, which is exactly the effect this tool exists to show. Mapping
per vertex keeps true size round the arm everywhere, and it needs no unwrapping of
MakeHuman's mesh. The wrap warning works as before, against the fitted arm's own
circumferences.

Measured triangle by triangle on the subdivided mesh, a 12 cm design keeps its width
round the arm to within 0.4% everywhere (1st to 99th percentile). Along the arm, the
skin is 1.3% longer than the axial distance on average, and up to 2.5%, because the
surface slopes as the arm tapers. Towards the design's sides, its horizontal and
vertical lines are off square by up to about 12°, where the forearm tapers fastest
(16° at the far sides of an 18 cm design). The parametric arm does the same, by up to
about 7°. Both come from the arc-and-axis coordinates on a tapered limb, not from
MakeHuman.

### What comes out

`params.json` gains a `makehuman` block: the build (slider values and the targets
blended), the pose (degrees straightened and supinated, MakeHuman's own wrist-to-elbow
length and the scale applied), and the fit. For the wrist and the forearm's widest point,
the fit records where it measured, your measurement, MakeHuman's circumference before
fitting, the scale and the circumference **measured on the rendered arm**.

With the defaults (17 / 26 / 25 cm), the fitted arm measures **17.0 cm** round the wrist
and **26.02 cm** at its widest. A 12 cm design measures 12.0, 12.0 and 12.01 cm round the
arm at its wrist end, middle and elbow end, and 12.0 cm along it. An 18 cm design
measures 18.0 cm at all three heights and 18.0 cm along.

The MakeHuman arm is framed from 12 cm past the wrist (the palm and the thumb) to just
past the elbow, so it appears smaller in the frame than the parametric arm. Each body
compares like for like with itself. To compare the two bodies at the same scale,
shrink the parametric render (by 28/38.5 for a 25 cm forearm) and line up the elbow
ends. Building and fitting the arm takes about
a second, and each view then renders in 27–34 s on 4 Linux CPU cores at the defaults.

## Limits and next steps

- **A stencil-true mapping.** A tapered forearm is close to a cone, and a paper
  stencil lies flat on a cone, so its horizontal lines follow the unrolled cone and dip
  slightly towards the wrist at the sides. The arc-and-axis mapping keeps them level
  round the arm instead. Unrolling locally (by each section's slant, from the
  circumference profile) would remove the shear at the design's sides. It would move
  the edges of a wide design by a few millimetres.
- **The elbow is straightened by a weighted rotation**, not a full skinning solve. It
  looks right in the three views, but the elbow itself is approximate. The hand keeps
  MakeHuman's relaxed rest pose (slightly cupped, the thumb along the palm), with no
  finger posing.
- **Skin.** The mesh has real forearm and hand shape, but no veins, tendons, hair or
  creases beyond the mesh's own, and the skin is the procedural material.
  MakeHuman's CC0 skin textures aren't used.
- The ethnicity mix is fixed at even thirds and the age at 25. Height and proportions
  aren't used, because the fit sets the size.
- Only the left arm. MakeHuman's mesh is symmetric, so a right arm is a mirrored copy
  of the same data.
- Not run on macOS yet: run in Linux with Blender 4.0.2 and the bpy 5.2.3 build.
- At the default 1024 px a millimetre of skin is about 3.7 px on the parametric arm and
  2.7 px on the MakeHuman arm, so the 0.15 mm healed spread is barely visible. It shows
  at `--size 2048`.
- Other placements (shoulder, calf) need their own cut of the mesh. `--placement`
  accepts only `forearm` so far.

## Tests

The maths runs in plain Python, without Blender: the taper, ellipse and cm → UV; the
healed-ink blur and colour; measuring a design on a sliced mesh; and for the MakeHuman
arm, reading OBJ and target files, blending macro targets, the pose, arc length round
a cross-section (against polygons, circles and ellipses of known length), and the
per-vertex fit and mapping on synthetic tubes:

```sh
python3 -m unittest discover -s scripts/blender
```
