# On-body renders with Blender (desktop)

Desktop tooling for the Mac ([#192](https://github.com/Pritesh1980/sable/issues/192), a
spike). Sable never calls Blender: you run a script on the Mac, then import the PNGs
into the concept like any other result.

`scripts/blender/render-on-body.py` wraps a saved concept image round a 3D forearm at a
true printed size, lights it against Sable's near-black and renders three angles. It
shows what a flat **Try on skin** overlay can't: how far a 12 cm design wraps round the
arm, and how 12 cm compares with 18 cm.

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
| `--ink-strength` | 0.92 | 1 is a pure multiply; lower lets a little skin through solid black. |
| `--white-point` | 0.9 | Paper at or above this sRGB level counts as bare skin, so off-white scans don't tint the arm. |
| `--samples` / `--size` | 64 / 1024 | Render quality; `--size` is the long edge. |
| `--views` | all three | Any of `top,three-quarter,side`. |
| `--placement` | `forearm` | The only body part so far. |

## What comes out

- `top.png`, `three-quarter.png` and `side.png`, in 2:3 portrait like Sable's cards.
- `params.json` records the inputs, the arm's circumference under the design, how far
  round the arm the design wraps (in degrees), render settings and times, and warnings.
  A warning means the design is wider than the arm somewhere and is clipped at the
  underside, or that it runs past the wrist or elbow.

The camera framing depends only on the arm, not the design, so two widths on the same
arm compare like for like. In the spike, the design's width measured 11.98 cm round the
subdivided arm for `--width-cm 12`, the same at the wrist end, middle and elbow end of
the design. Its length in the top render matched to within half a millimetre.

On 4 Linux CPU cores at the defaults, each view takes 30–40 s with the denoiser. The
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

## Limits and next steps

- The arm is a smooth parametric tube with no wrist bones, tendons, muscle, hair or
  hand. It is right for size and wrap, not photoreal.
- **Next:** swap the parametric arm for a real mesh at your measurements, for example a
  MakeHuman export. Check the licence first: MakeHuman describes its stock assets and
  exports as CC0, but confirm that for the version and any community assets used. A
  real mesh needs a UV map (or a projected decal), and the cm scale must be re-derived
  from it.
- Other placements (shoulder, calf) need their own meshes. `--placement` accepts only
  `forearm` so far.

## Tests

The maths (taper, ellipse, cm → UV) runs in plain Python, without Blender:

```sh
python3 -m unittest discover -s scripts/blender
```
