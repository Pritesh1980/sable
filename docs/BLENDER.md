# On-body renders with Blender (desktop)

Desktop tooling for the Mac ([#192](https://github.com/Pritesh1980/sable/issues/192), a
spike). Sable never calls Blender: you run a script on the Mac, then import the PNGs
into the concept like any other result.

`scripts/blender/render-on-body.py` wraps a saved concept image round a 3D arm at a
true printed size, lights it against Sable's near-black and renders three angles. It
shows what a flat **Try on skin** overlay can't: how far a 12 cm design wraps round the
arm, and how 12 cm compares with 18 cm. By default the design goes on the **outer upper
arm**, between shoulder and elbow, and the ink looks **healed**, the way the tattoo
will look once it has settled, rather than freshly inked. `--placement forearm` puts it
on the forearm instead.

The arm is either a smooth parametric tube (the default) or, with `--body makehuman`, a
real body from MakeHuman's CC0 data, fitted to your measurements: the upper arm with
its shoulder and torso, or the forearm with its wrist and hand. The MakeHuman body is
female or male, drawn at random on each run unless you choose (see [Body sex](#body-sex)),
and needs a copy of MakeHuman's repository on the Mac: see
[A real arm: MakeHuman](#a-real-arm-makehuman). The skin is one of a few tone presets or
an exact colour: see [Skin tone](#skin-tone).

## Install Blender

Download Blender from blender.org (or `brew install --cask blender`). On an Intel Mac
that gives **4.5 LTS**, the last release for Intel: Blender 5 is Apple silicon only.
The script runs
headless, with no window, through the app's own binary:

```sh
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
"$BLENDER" --version
```

It has been run headless with Blender 4.0.2 (Ubuntu's package), 4.5.15 LTS (macOS,
Intel) and 5.2.3 LTS (the official `bpy` build). Any 4.x or 5.x should work.

## Render a concept

1. **Get the image out of Sable.** On the concept (or a saved result), choose **Refine
   this → Export source image**, which saves it as a full-size PNG. This works in every
   build, the demo included, and needs a connection only if the image isn't stored on
   this device. Move the file to the Mac (AirDrop is fine). Dark linework on white paper is
   what the script inks: white means bare skin, and colour multiplies over the skin like
   ink. Transparent PNGs work too. Sable's own concept cards are the other way round,
   light lines on near-black; the script spots a dark background from the image's border
   and flips its lightness (keeping colours' hue) before inking, so they work as they
   are. `--background light|dark` overrides the guess.
2. **Measure your upper arm** in cm, arm relaxed at your side: from the top of the
   shoulder (the bony point at its outer edge) down to the elbow crease; round the arm
   half-way between the two, over the biceps; and round the arm just above the elbow,
   an eighth of the way up (4 cm on a 32 cm arm). For the forearm, see the
   [arguments](#arguments).
3. **Run it** from the repo root. Everything after `--` belongs to the script.

```sh
"$BLENDER" -b -P scripts/blender/render-on-body.py -- \
  --image ~/Downloads/concept.png --width-cm 12 \
  --upper-arm-length-cm 32 --biceps-cm 30 --above-elbow-cm 26 \
  --out ~/Pictures/sable-renders/concept-12cm
```

Keep `--out` outside the repo. Renders of your own concepts are personal, so never
commit them.

### Arguments

| Argument | Default | Meaning |
|---|---|---|
| `--image` | required | The design (PNG, JPEG or WebP). |
| `--width-cm` | required | Printed width on the skin, measured round the curve as a stencil lies. Height follows the image's aspect ratio. |
| `--out` | required | Output folder (created if missing). |
| `--placement` | `upper-arm` | `upper-arm` or `forearm`. |
| `--side` | `outer` (upper arm), `inner` (forearm) | Which side carries the design. Upper arm: `outer` (the outside of the arm, the classic spot) or `inner` (the front of the arm, over the biceps). Forearm, MakeHuman only: `inner` (palm side) or `outer` (back of the arm). |
| `--upper-arm-length-cm` / `--biceps-cm` / `--above-elbow-cm` | 32 / 30 / 26 | Upper arm: top of the shoulder to the elbow crease; round the biceps half-way between them; round the arm just above the elbow. Adult averages, roughly. |
| `--wrist-cm` / `--elbow-cm` / `--length-cm` | 17 / 26 / 25 | Forearm: round the wrist at its narrowest; round the widest point just below the elbow; wrist crease to elbow crease. |
| `--centre-cm` | half-way | Where the design's centre sits: cm above the elbow crease (upper arm) or from the wrist (forearm). |
| `--design-up` | `shoulder` (upper arm), `elbow` (forearm) | Which end the top of the image points to: the upper arm's `shoulder` or `elbow`, the forearm's `elbow` or `wrist`. |
| `--skin-tone` | `warm-brown` | A [skin tone preset](#skin-tone). |
| `--skin-rgb` | none | An exact skin colour instead, as sRGB `R,G,B` (0–255), e.g. `154,118,84`. `--skin '#9a7654'` (hex) also works. |
| `--ink` | `healed` | `healed` (settled under the skin) or `fresh` (crisp, just inked). See below. |
| `--ink-spread-mm` | 0.15 | Healed only: how far lines have spread into the skin, in mm (a Gaussian sigma). |
| `--ink-strength` | 0.92 | How dark solid black is: 1 is pure black; lower lets a little skin through. |
| `--background` | `auto` | The image's paper: `light` (dark ink on white), `dark` (light lines on black, like Sable's concept cards, flipped before inking) or `auto` (read from the border). |
| `--white-point` | 0.9 | Paper at or above this sRGB level counts as bare skin, so off-white scans don't tint the arm. |
| `--samples` / `--size` | 64 / 1024 | Render quality; `--size` is the long edge. |
| `--views` | see below | Upper arm: any of `outer,front-three-quarter,back-three-quarter,front`. Forearm: any of `top,three-quarter,side`. Either: `close-up`. |
| `--label` | none | A prefix for the view files and `params.json`: `--label koi-12cm` writes `koi-12cm-outer.png`, …, `koi-12cm-params.json`, so several runs can share a folder and the files stay apart once they leave it. |
| `--body` | `parametric` | `parametric` (a smooth tapered tube) or `makehuman` (a real body). |
| `--makehuman-data` | none | MakeHuman checkout (its root or its `makehuman/data` folder). Required with `--body makehuman`. |
| `--mh-sex` | `random` | MakeHuman only: `random` draws a fully female or a fully male body, with even odds, from `--seed`. A number from 0 (female) to 1 (male) sets it instead; MakeHuman's own default is 0.5. See [Body sex](#body-sex). |
| `--seed` | a fresh one | MakeHuman only: the seed for `--mh-sex random`. Without it a fresh seed is drawn, printed and recorded in `params.json`, so `--seed` with that number renders the same body again. |
| `--mh-muscle` / `--mh-weight` | 0.5 / 0.5 | MakeHuman only: MakeHuman's build sliders, 0 to 1. Never random. |

The fit to your measurements sets the arm's size whatever the build; sex, muscle and
weight change its shape.

A measurement for the other placement (say `--wrist-cm` on the upper arm) is an error,
not silently ignored.

The upper arm's views are named for where the camera stands round the body, whichever
side carries the design: `outer` looks straight at the outside of the arm, the two
three-quarter views are 45° towards the front or the back (and a little from above),
and `front` looks straight at the front of the arm. The defaults are `outer` and both
three-quarter views; with `--side inner`, `front` and `front-three-quarter`. With the
arm hanging at the side, the chest hides the inside of the arm, so no view looks from
there. The forearm keeps `top` (straight at the design), `three-quarter` and `side`.

Every default also ends with `close-up`: square on to the design and framed on it, with
30% to spare. The arm views frame the whole limb (about 45 cm of it on the MakeHuman
upper arm, so a pixel is about 0.44 mm of skin), and fine linework is thinner than a
pixel there: it renders faint, as it would in a photo from that far. The close-up is
about 2.5 times nearer for a 12 cm design, so the lines read at their weight. Its frame
height is in `params.json` (`render.close_up_frame_cm`). The arm views stay framed by
the arm alone, so two designs on one arm still compare like for like.

## Skin tone

`--skin-tone` picks one of these presets, from light to deep:

| Preset | sRGB | Notes |
|---|---|---|
| `light-peach` | 201, 157, 128 | The default until Nov 2026 (`#c99d80`). |
| `light-warm-tan` | 184, 143, 104 | |
| `light-warm-brown` | 170, 132, 95 | Light, slightly brown, warm. |
| `warm-brown` | 154, 118, 84 | **The default** (`#9a7654`). Warm, a step deeper. |
| `medium-brown` | 128, 95, 66 | |
| `deep-brown` | 80, 58, 42 | |

They are base colours picked by eye under this script's lights and colour transform
(AgX, which lightens mid-tones), named for how they render. They are not a calibrated
skin-tone scale, so pick by eye: render the same design in two or three neighbouring
tones and compare. For an exact match, `--skin-rgb R,G,B` takes any sRGB colour.

The subsurface scattering follows the tone. In browner skin more melanin absorbs light
before it travels far under the surface, the short wavelengths most, so each channel's
scattering distance shrinks with the skin's lightness, blue fastest: the glow is warmer
and shallower, not the pink translucency of the earlier material. Melanin also masks
blood, so the faint blotchy redness in the base colour is milder. `light-peach` gets
exactly the earlier settings. `params.json` → `skin` records the tone, its sRGB and the
subsurface settings used.

**Earlier renders stay reproducible** if you name the earlier defaults. `--placement
forearm --skin-tone light-peach` renders pixel-identical to the versions before the
presets; on the MakeHuman forearm add `--mh-sex 0.5`, now that the sex is random by
default. The upper arm's previous defaults are `--skin-tone light-warm-brown --mh-sex
0.5`. Checked in Nov 2026: the parametric forearm on Blender 4.0.2 and bpy 5.2.3,
healed and fresh, and both MakeHuman placements on bpy 5.2.3.

Skin detail is still the procedural pores and mottling. MakeHuman's repository has no
skin textures to borrow: its `data/skins` holds only the default material, which points
at MakeHuman's own viewport shader, and `data/litspheres` holds lighting spheres for that
shader, not normal or bump maps. MakeHuman's skin texture packs are separate downloads,
not checked here.

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

- One PNG per view (`outer.png`, `front-three-quarter.png`, `back-three-quarter.png` and
  `close-up.png` by default; `top.png`, `three-quarter.png`, `side.png` and
  `close-up.png` on the forearm), in 2:3
  portrait like Sable's cards.
- `params.json` records the inputs, the arm's circumference under the design, how far
  round the arm the design wraps (in degrees), the skin, the ink settings, render
  settings and times, and warnings. A warning means the design wraps more than half way
  round (no single view shows all of it), or is wider than the arm somewhere and is
  clipped at the underside, or runs past the ends of the limb, or measured more than 2%
  off its size on the rendered arm (for instance where it runs off the upper arm's skin
  into the armpit and is cut off).
- `params.json` → `measured_cm` is the design **measured on the arm as rendered** (after
  subdivision). The width round the arm is measured across the arm near the design's
  two ends and middle (`elbow_end`, `middle` and `shoulder_end` on the upper arm), and
  the length along the arm's top line. The mesh is sliced with a plane, and the skin is
  measured where the design's texture coordinates fall inside the image.

The camera framing depends only on the arm, not the design, so two widths on the same
arm compare like for like. On the default parametric forearm, a 12 cm design measures
11.98 cm round the arm at all three heights and 12.0 cm along it. Subdivision rounds the
mesh slightly, which costs the 0.2 mm.

On 4 Linux CPU cores at the defaults, each view takes 35–45 s on the parametric arm and
45–60 s on the MakeHuman upper arm, with the denoiser. The official builds include
OpenImageDenoise, and an Apple Silicon Mac should be quicker. For quick drafts, use
`--samples 16 --size 512`.

## Several sizes at once

To compare sizes, render them all on the same body with one command from the repo root:

```sh
npm run render:body -- ~/Downloads/concept.png 12,15,18
```

It runs `render-on-body.py` once per size. All the sizes go in one folder per concept
and spot under `~/Pictures/sable-renders`, with the size in every file name:

```text
concept-upper-outer/
  concept-12cm-upper-outer-outer.png      concept-18cm-upper-outer-outer.png
  concept-12cm-upper-outer-close-up.png   concept-18cm-upper-outer-close-up.png
  concept-12cm-upper-outer-params.json    concept-18cm-upper-outer-params.json
  summary.txt
```

So you can Quick Look from one size to the next in Finder, and AirDrop the PNGs in one
go. The names still say which is which once they're on the phone. Running the same
concept again overwrites those files.

It draws one `--seed` for the whole batch, so with the MakeHuman body every size lands
on the same body, and it prints the seed so you can render that body again. Before the
first render starts, it checks every run's arguments, so a typo doesn't cost you a
15-minute wait. When it finishes it prints one line per size, read from its
`params.json`: how tall the design is, how far round the arm it wraps, how it measured
on the rendered arm, and how many warnings it has. It saves the same lines to
`summary.txt` for the notes when you add the renders to Sable.

Your measurements and settings go in `~/.config/sable/render-body.json`, outside the
repo, so they are never committed. Every key is optional:

```json
{
  "blender": "/Applications/Blender.app/Contents/MacOS/Blender",
  "out": "~/Pictures/sable-renders",
  "render": { "body": "makehuman", "makehuman-data": "~/src/makehuman" },
  "upper-arm": { "upper-arm-length-cm": 32, "biceps-cm": 30, "above-elbow-cm": 26 },
  "forearm": { "length-cm": 25, "wrist-cm": 17, "elbow-cm": 26 }
}
```

- `render` holds any `render-on-body.py` option (without the `--`), applied to every run.
- `upper-arm` and `forearm` apply only on that placement, so both sets of measurements
  can live in one file.
- With no `blender` key, it uses `$BLENDER`, then the Mac app, then `blender` on the
  `PATH`.
- A `"seed"` key renders every batch on the same body. Leave it out to get a fresh body
  each time, and pass `--seed` to repeat one.
- With no file at all, it renders the default arm.

The script sets `--image`, `--width-cm`, `--out`, `--label` and `--seed` itself. Any
other option on the command line goes through to `render-on-body.py` and overrides the
config. Its own options are:

- `--seed N`: the body to use (overrides the config).
- `--out DIR`: where the folders go.
- `--config FILE`: a different config file.
- `--dry-run`: print the Blender commands and render nothing.
- `--help`: show this summary.

To compare sizes, look at the arm views, not the close-up. The camera for `outer` (and
the other arm views) is set by the arm alone, so a bigger design really does look
bigger. The close-up is framed on the design, so every size fills about the same part
of its picture. Use it to check how fine lines hold up at one size. For a quicker batch:

```sh
npm run render:body -- ~/Downloads/concept.png 12,15,18 --views outer,close-up
```

That takes about 3 minutes a size on the Intel Mac. All four default views take about
5 minutes a size. It refuses to write inside the repo, and a relative image path is
read from the folder you ran `npm` in.

## Bring the renders into Sable

Open the concept, show its details (`I`), and under **AI Results** choose **Add Result**:

- **Provider:** Other
- **Title:** for example *Upper arm 12 cm · outer*
- **Image file:** the PNG
- **Notes:** the measurements and width from `params.json`, or that size's line from
  `summary.txt` if you used `npm run render:body`

Add one result per angle. They are then ordinary variants: rate them, mark the best,
compare 12 cm with 18 cm. Add them on the device that holds your library (AirDrop the
PNGs to the iPhone first), because device-local builds don't sync.

## Interactive option: a Blender MCP

To tweak a scene by chat instead of re-running the script, connect an MCP client
(Claude Code or Claude Desktop) to Blender:

- **Official:** the Blender Lab MCP server (`blender.org/lab/mcp-server`, source at
  `projects.blender.org/lab/blender_mcp`). It needs **Blender 5.1 or newer** and its
  add-on, installed from the Blender Lab extensions repository (dragging the link into
  Blender twice: once for the repository, once for the add-on). The server comes as an
  `.mcpb` bundle for clients that take one, or from source. **Not usable on an Intel
  Mac:** Blender 5 runs on Apple silicon only, and 4.5 LTS is the last Intel build.
- **Community:** *MCP for Blender* by Siddharth Ahuja (`github.com/ahujasid/mcp-for-blender`,
  formerly `blender-mcp`; MIT; not affiliated with the Blender Foundation). It needs
  Blender 3.0 or newer, so it runs on 4.5 LTS. With [uv](https://docs.astral.sh/uv/)
  installed: `claude mcp add blender uvx mcp-for-blender`, then
  `uvx mcp-for-blender install-addon` and enable **Interface: MCP for Blender** in
  Edit → Preferences → Add-ons. The add-on listens on `localhost:9876`. Its README calls
  telemetry opt-in, but an anonymous usage record (tool names, timings, versions, OS) is
  sent by default; set `DISABLE_TELEMETRY=true` in the server's environment to stop it.
  The README also offers a `curl … | sh` installer: prefer the steps above.

Checked against both projects' pages in Nov 2026; follow each README for current
install steps, as they change often.

**Both run arbitrary Python inside Blender**, so they can reach anything Blender can:
your files and the network. Blender Lab's own page warns that its server runs
LLM-generated code "without any guards" and suggests a virtual machine. Keep them local
(never expose the port beyond `localhost`) and connect only clients you trust. Don't
open `.blend` files from untrusted sources: a `.blend` can carry scripts. Keep **Auto
Run Python Scripts** off (Preferences → Save & Load).

## A real arm: MakeHuman

`--body makehuman` swaps the tube for MakeHuman's base mesh: on the upper arm, the whole
body with its shoulder and torso; on the forearm, the forearm's muscle shape, the wrist
and the hand. Either is fitted to your measurements.

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
  --upper-arm-length-cm 32 --biceps-cm 30 --above-elbow-cm 26 \
  --body makehuman --makehuman-data ~/src/makehuman \
  --out ~/Pictures/sable-renders/concept-12cm-mh
```

The script reads four kinds of file from `makehuman/data`, with its own parsers:
`3dobjs/base.obj` (the `hm08` base mesh), `targets/macrodetails/*.target` (MakeHuman's
build sliders), and the default skeleton's joints and weights in
`rigs/default.mhskel` and `rigs/default_weights.mhw`. **Never commit MakeHuman's files,
or meshes made from them, to Sable.** The script builds the body afresh on every run,
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

### The build

Both placements start from the base mesh plus MakeHuman's macro targets for a 25-year-old,
female or male (see below), with muscle and weight at MakeHuman's defaults (0.5) and an
even mix of its three ethnicities. `--mh-sex`, `--mh-muscle` and `--mh-weight` move the
blend. Height and proportions stay at their centre, where no target applies. Only the
`body` group is used: helper geometry (clothes helpers, joint markers) is left out. Two
levels of Catmull-Clark subdivision are applied to the mesh, and everything after that
(fit, mapping, measuring) is done on the subdivided mesh, which is what's rendered.

### Body sex

MakeHuman's gender slider runs from 0 to 1. Its own description, in
`modifiers/modeling_modifiers_desc.json` (`macrodetails/Gender`), says "min is female,
max is male", and the targets are named the same way: at 0 only the `*-female-young`
targets apply, at 1 only the `*-male-young` ones. MakeHuman's default, 0.5, is an even
blend of the two.

By default (`--mh-sex random`) each run draws a fully female (0) or a fully male (1) body,
with even odds, from a seed. Pass `--seed N` to choose the seed. Without it, a fresh one
is drawn and printed, for example:

```text
[render-on-body] body: male (drawn at random with --seed 42; pass it to render this body again)
```

`params.json` → `makehuman.build` records `sex` (the value used), `sex_random` and `seed`,
so any render can be repeated. Every view of a run shows the same body: it's built once.
The draw is `random.Random(seed).random()`, the one sequence Python promises to keep across
versions, so a seed draws the same body in Blender 4.0 and in bpy 5.2. For example,
`--seed 42` draws a male body and `--seed 192` a female one.

A number instead (`--mh-sex 0.5`, say) sets the slider directly, and the seed isn't used.
Only sex is drawn at random: muscle and weight stay as given. The parametric arm has no
sex and ignores both arguments.

### How the upper arm is built

1. **Keep the whole body.** The shoulder joins the torso as it really does, and the
   camera's crop is the only edge: nothing is cut. The camera frames the left upper arm
   from 9 cm below the elbow crease to 4 cm over the top of the shoulder.
2. **Lower the arms.** MakeHuman's rest pose is an A-pose: the arms are 42° out from
   the sides, with the elbows bent 43°. Each arm is lowered to hang 12° out from the
   side. Each vertex turns about the shoulder joint by its share of the arm's bone
   weights (upper arm, forearm and hand), so the turn fades out across the shoulder and
   the torso stays put. First the elbow is relaxed to a 20° bend the same way, about the
   elbow joint, by the forearm and hand bones' share. The right arm, never in view, is
   lowered the same way with a straighter elbow, so its hand stays behind the hips.
3. **Lay it out.** The left elbow joint is at the origin, and +y runs up the upper arm to
   the shoulder joint. +z points out of the side that carries the design: the outside of
   the arm (`outer`), or its front (`inner`). The body is rotated into this frame, never
   mirrored, so in the outer view the front of the body is on the left.
4. **Size it.** The top of the shoulder is where the outline, coming up the outside of
   the arm and over the shoulder, faces 45° up and out (only the upper arm and shoulder
   bones' skin counts, so the neck and head don't). The body is scaled evenly so that
   point is `--upper-arm-length-cm` above the elbow crease (the elbow joint's level).
   The female body measures 28.84 cm, so 32 cm scales it by 1.11; the male body 32.44 cm
   (by 0.99); the in-between body (`--mh-sex 0.5`) 30.75 cm (by 1.04).
5. **Fit.** The arm is sliced across every 2.5 mm, using the arm's own skin (where its
   bone weights are at least half), so a slice beside the torso doesn't count the
   torso. The above-elbow measurement goes an eighth of the way up from the elbow crease
   and the biceps measurement half-way: fixed places, not the narrowest and widest,
   because MakeHuman's upper arm narrows all the way down into the elbow and widens all
   the way up into the armpit. Each section is scaled about its centre by a factor
   linear between the two, as on the forearm; below the elbow station the elbow and
   forearm are scaled as a whole. The arm's bone weights fade the fit out into the
   shoulder, so the torso keeps its shape. With the default measurements (26 / 30 cm),
   the fitted arm measures **26.0 cm** above the elbow and **29.94 cm** round the biceps
   on the female body, **26.0** and **30.0 cm** on the male body, and 26.0 and 29.97 cm
   on the in-between one. Before fitting, MakeHuman's female arm is 24.9 / 28.68 cm round
   and its male arm 26.97 / 30.19 cm.

**Why lower the arm rather than aim the camera along it.** With the A-pose kept, a
camera square on to the outside of the arm looks down from 42° above the horizontal, and
the torso and head lean across the frame, or the arm runs diagonally through it. Neither
looks like an upper-arm photo. The weighted turn has no visible artefacts in any of the
views, because the skin it bends most (the armpit) faces away from them.

### How the forearm is built

1. **Cut and pose.** The left forearm and hand are cut out by bone weight, with the
   upper arm kept up to 8 cm past the elbow joint, out of frame. In MakeHuman's rest
   pose the elbow is bent about 42° and the hand is thumb forward. Each vertex turns
   about the elbow joint by its share of the forearm and hand bones' weights, which
   straightens the elbow. The forearm is then turned palm up (about a quarter turn,
   supination), spread evenly from the elbow to the wrist. This is the classic pose for
   an inner-forearm tattoo, and it leaves the inner forearm flat and untwisted.
2. **Lay it out like the parametric arm.** The wrist joint is at the origin and the
   elbow joint lies along +y at `--length-cm` (the arm is scaled evenly to get there).
   The inner forearm faces +z, so the top view looks straight at it. The thumb is on the
   right, as on a real left arm palm up: the arm is rotated, never mirrored.
   `--side outer` turns it over to show the outer forearm and the back of the hand.
3. **Fit to your measurements.** The wrist measurement goes at its narrowest section in
   the first fifth of the forearm (about 0.5 cm above the wrist joint), and the elbow
   measurement at its widest section between 55% and 85% of the way up (about 20 cm from
   the wrist on the default arm). Each section is scaled about its own centre, by a
   factor that changes linearly between those two. So both circumferences come out as
   measured, and the forearm keeps MakeHuman's muscle shape between them. The hand is
   scaled as a whole with the wrist, so it keeps its proportions. The in-between
   MakeHuman forearm (`--mh-sex 0.5`) is slender (13.8 cm round the wrist), so the
   default measurements scale it up by 23% at the wrist and 9% at the forearm's widest.
   The fitted arm measures **17.0 cm** round the wrist and **26.02 cm** at its widest.

The forearm is framed from 12 cm past the wrist (the palm and the thumb) to just past
the elbow, so it appears smaller in the frame than the parametric forearm. To compare
the two bodies at the same scale, shrink the parametric render (by 28/38.5 for a 25 cm
forearm) and line up the elbow ends.

### How the design is mapped

The design is placed **per vertex in skin centimetres**, then turned into texture
coordinates:

- **Along the arm:** the vertex's position projected onto the limb's axis, in cm from
  the wrist (forearm) or the elbow crease (upper arm).
- **Round the arm:** its arc length round that cross-section, from the top centre line.
  The top line is where the ray from the section's centre towards the camera meets the
  skin. Each slice through the arm is a closed loop, and the arc to any angle round it
  is measured along the loop. A vertex between two slices takes the value interpolated
  from both. The underside seam is half the circumference round from the top line on
  either side, so a design as wide as the arm fits even where the section is lopsided.
  Where the outline folds back on itself (beside the armpit), the angle round the loop
  holds until the fold is passed, so the arcs beyond it stay true.

That is how a stencil is measured: so many cm round the curve, so many cm along. A
projected decal would be simpler, but it shrinks the design as the arm curves away
from the projector, which is exactly the effect this tool exists to show. Mapping
per vertex keeps true size round the arm everywhere, and it needs no unwrapping of
MakeHuman's mesh. The wrap warning works as before, against the fitted arm's own
circumferences.

The upper arm needs two more rules:

- **Only the upper arm's skin.** The design goes only on faces where the upper arm's
  bones carry at least half the weight. Elsewhere (the shoulder cap, the armpit, the
  torso, the forearm) the skin stays bare, and a design that reaches there is cut off,
  with a warning.
- **Above the armpit.** About 19.5 cm above the elbow crease (on the in-between body)
  the arm's own skin stops going all the way round: it joins the torso. There the arc
  is measured along the arm's skin that is there, its open section closed with a
  straight chord across the armpit, far from the top line. The sections' centres would
  be pulled aside by the armpit, so on the upper arm they all lie on one straight axis,
  fitted to the centres of the sections between 15% and 55% of the way up, and the top
  line is straight.

**Measured.** On the default upper arm, a 12 cm design measures **12.0, 12.01 and 12.03
cm** round the arm at its elbow end, middle and shoulder end on the female body, **12.0
cm** at all three on the male body, and **12.0 cm** along it on both (Nov 2026, bpy
5.2.3 and Blender 4.0.2 alike). The rest of this paragraph was measured on the
in-between body (`--mh-sex 0.5`), where a 12 cm design measures 12.0, 12.0 and 12.01 cm
round and 12.0 cm along, and an 18 cm design measures **18.0, 18.0 and 18.06 cm** round
and **18.0 cm** along (and wraps 216°, so it carries a warning). Triangle by triangle, a
12 cm design keeps its width round the arm to within −0.3% and +0.8% (1st to 99th
percentile), an 18 cm design to within −0.6% and +1.4%. Along the arm the skin is about
1.3% longer than the axial distance on average, and up to 5–7%, where the arm swells
into the armpit. A 12 cm design's horizontal and vertical lines are off square by up to
about 12° (19° for 18 cm) where the arm widens fastest, just below the armpit.

On the in-between MakeHuman forearm (`--mh-sex 0.5`), a 12 cm design measures 12.0, 12.0
and 12.01 cm round the arm and 12.0 cm along; an 18 cm design 18.0 cm at all three
heights and along. Its width round the arm holds to within 0.4% everywhere, and its
lines are off square by up to about 12° (16° for 18 cm) where the forearm tapers
fastest. The parametric arm does the same, by up to about 7°. All of this comes from the
arc-and-axis coordinates on a tapered limb, not from MakeHuman.

### What comes out

`params.json` gains a `makehuman` block: the build (the sex used, whether it was drawn at
random and from which seed, the other slider values and the targets blended), the pose
and the fit. On the upper arm, the pose records the rest pose's and
the rendered arm's angles, and the block records the scale, the height of the shoulder
joint and of the rest pose's shoulder top, and how far up the arm the upper arm's skin
reaches. On the forearm, it records the degrees straightened and supinated, MakeHuman's
own wrist-to-elbow length and the scale. For each tape measurement, the fit records where
it measured, your measurement, MakeHuman's circumference before fitting, the scale and
the circumference **measured on the rendered arm**.

Building and fitting takes about a second for the forearm and 1.5 s for the whole body
(with bpy 5.2; 2.6 s with Blender 4.0).

## Limits and next steps

- **A stencil-true mapping.** A tapered limb is close to a cone, and a paper stencil
  lies flat on a cone, so its horizontal lines follow the unrolled cone and dip slightly
  towards the narrow end at the sides. The arc-and-axis mapping keeps them level round
  the arm instead. Unrolling locally (by each section's slant, from the circumference
  profile) would remove the shear at the design's sides. It would move the edges of a
  wide design by a few millimetres.
- **Poses are weighted rotations**, not a full skinning solve. They look right in the
  views, but the armpit and the elbow themselves are approximate. The hand keeps
  MakeHuman's relaxed rest pose. The upper arm hangs with the palm towards the thigh, and
  the shoulder doesn't drop as the arm comes down.
- **The inside of the upper arm.** With the arm down, the chest hides it, so `--side
  inner` puts the design on the front of the arm, over the biceps. A design tall enough
  to reach the front of the armpit is cut off there, with a warning. Showing the inside
  of the arm needs it raised.
- **The top of the upper arm.** The design may go only where the upper arm's bones carry
  at least half the weight. Above the armpit that skin narrows: on the in-between body,
  about 24 cm above the elbow crease it reaches only about 7 cm round towards the back
  of the arm. A wide design with ink in its upper back corner meets that edge: a few
  triangles along it are stretched, and beyond it the design is cut off. (The demo
  mandala's corners are blank.)
- **Skin.** The mesh has real shape, but no veins, tendons, hair or creases beyond the
  mesh's own. The skin is the procedural material in a preset or exact tone, with no
  texture detail.
- The ethnicity mix is fixed at even thirds and the age at 25. Height and proportions
  aren't used, because the fit sets the size. A random body is fully female or fully
  male; an in-between body needs a number for `--mh-sex`.
- Only the left arm. MakeHuman's mesh is symmetric, so a right arm is a mirrored copy
  of the same data.
- At the default 1024 px a millimetre of skin is about 2.3 px on the upper arm, so the
  0.15 mm healed spread is barely visible. It shows at `--size 2048`.
- Other placements (shoulder blade, calf) need their own cut of the mesh.

## Tests

The maths runs in plain Python, without Blender: the taper, ellipse and cm → UV; the
healed-ink blur and colour; skin tone presets, exact sRGB and the subsurface settings;
measuring a design on a sliced mesh; and for the MakeHuman body, reading OBJ and target
files, drawing the body's sex from a seed, blending macro targets, posing the forearm
and lowering the arms, the upper arm's frame and the top of the shoulder, arc length
round a cross-section (against polygons, circles, ellipses and a folded outline), open
sections above the armpit, and the per-vertex fit and mapping on synthetic tubes, with
the fit fading into a torso. The size wrapper's planning is tested the same way: the
config, the shared seed, the labels, and checking every run's arguments before Blender
starts:

```sh
python3 -m unittest discover -s scripts/blender
```

## The arm inside Sable: 3D placement

[#195](https://github.com/Pritesh1980/sable/issues/195) asks whether the same arm can
live in the app, turned with a finger and resized with a pinch. It began as a spike at
**`/lab/placement`** (not linked from the nav; demo designs only), which is still there.

Since November 2026 it also opens from a real concept: a saved image result on the
Concepts page has **View on arm in 3D** beside **Try on skin** and **Make STL**, which
shows that result's own image on the arm in a full-screen drawer with the lab's controls,
and **Save as variant** keeps a picture of it on the concept (user guide:
[Concepts](06-concepts.md#see-a-concept-on-the-arm-in-3d)).

- The stored image is a ref (a blob key or a static path). WebGL cannot read the pixels of
  a cross-origin signed URL, so the drawer resolves it to a same-origin copy with
  `useImageBytes`, as `GlCrossfade` does, and says so if the image is not on the device.
- The renderer keeps no drawing buffer between frames (`preserveDrawingBuffer` is off), so
  the engine's `snapshot()` draws a frame and reads the canvas as PNG in the same task.
- The saved picture is framed on the design whatever the view was showing
  (`snapshotPose`): close up even from **Whole arm**, and turned at most 0.6 rad from
  square-on, so a design dragged round the back is brought to face the camera.
- The ink is the same healed model as `render-on-body.py` (see
  [Healed or fresh ink](#healed-or-fresh-ink)), ported to `src/data/placement3d.js`:
  `healInkPixels` fades colour and lets 2% of the skin back through, once at load, and the
  shader lays `healedInkFloor` (a cool black at fresh black's darkness) under solid ink.
- It is saved through the page's one add path (`Concepts.addVariant`): downsized like a
  try-on result, staged first, and only the key reaches state. The variant is titled
  "On the arm, 12 cm", with provider **Other** like a live try-on, and its notes carry the
  size and position.

Blender's part is one export, run again only when the arm itself should change:

```sh
"$BLENDER" -b -P scripts/blender/export-arm-gltf.py -- \
  --makehuman-data ~/src/makehuman --out public/models
```

It writes `public/models/arm-upper.glb` and `arm-upper.json`. The mesh is the body the
renders use (same loader, same fit to 32 / 30 / 26 cm), cut down to the left arm, with a
per-vertex fade so the cut edges dissolve into the backdrop. MakeHuman's data is CC0, so
the model can ship in the repo.

The view is framed on the tattoo, not the limb: it opens close enough that the design
fills about 70% of the height, follows the design as it is resized or moved, and turns
the arm so a design moved round it stays facing you. **Whole arm** steps back to judge
scale. Framing the whole arm by default left a 12 cm design as a few faint marks on a
lot of skin, which is the wrong subject for this app.

The lab's designs are Sable's own demo tattoos (the hourglass, the tiger, the koi). Those
are generated *photographs*, with the ink already on an arm, so each was lifted off its
photo first:

```sh
"$BLENDER" -b -P scripts/blender/extract-design.py -- \
  --image public/images/demo/vesper_noctis/hourglass-v4.webp \
  --crop 280,205,730,1215 --out public/models/designs/hourglass.webp
```

Ink multiplies the light coming off skin, so dividing the photo by the bare skin under it
leaves the design on white paper, shading and colour included, with the first arm's
lighting divided out. The bare skin is a smooth surface fitted through the un-inked parts
of the crop. Crops used: hourglass `280,205,730,1215`, tiger `190,190,830,1280`
(`ashgrove.tattoo/tiger`), koi `300,215,740,1320` (`hexen_atlas/koi`). This is for Sable's
own fictional demo images: run on an artist's photo, the result is their design. Two of
the simple line cards (serpent, fern) are in the list too, to show flat blackwork and how
thin lines hold up.

The export does the hard part so the phone doesn't have to. Each vertex stores where it is
on the skin: its distance round the arm in cm, and the arm's circumference there. The
browser then needs no decal geometry and no projection. A design is a texture read in a
fragment shader, placed by four numbers (width, height, height above the elbow, distance
round the arm), so resizing never rebuilds anything and the width is true centimetres of
skin, measured round the curve, the same definition `--width-cm` uses.

| File | Role |
|---|---|
| `scripts/blender/export-arm-gltf.py` | The export. Its helpers are unit tested without Blender (`test_export_arm.py`). |
| `scripts/blender/extract-design.py` | Lifts a tattoo off a demo photo as a flat design (`test_extract_design.py`, which needs numpy: run it under Blender's Python). |
| `src/data/placement3d.js` | Pure maths: clamping, pinch, what the camera frames, the dark-card flip. |
| `src/lib/armPlacement.js` | The three.js scene: shader, camera, gestures. three.js is passed in, so it is unit tested against a mock (`armPlacement.spec.js`). |
| `src/components/ArmPlacement3D.jsx` | The lazy chunk that imports three.js and drives the scene. |
| `src/components/ArmPlacementPanel.jsx` | The view with its controls (readout, sliders, Whole arm), shared by the lab and the drawer. |
| `src/components/ArmPlacementDrawer.jsx` | The dialog a concept result opens: resolves the image, saves the snapshot as a variant. |
| `src/pages/PlacementLab.jsx` | The lab page. |
| `e2e/placement3d.e2e.js` | Load, one-finger turn, pinch, close up and whole arm, and that the chunk stays out of other pages. |
| `e2e/placementConcept.e2e.js` | From a saved result: open, pinch, save as a variant, that the saved picture is of the tattoo, Escape and Back, and that three.js loads only when the drawer opens. |

### What was measured (Nov 2026)

| | Raw | Gzip |
|---|---|---|
| `arm-upper.glb` (2,091 vertices, 4,061 triangles) | 116 kB | 78 kB |
| `ArmPlacement3D` chunk (view + glTF loader) | 54 kB | 17 kB |
| `ArmPlacementPanel` chunk (controls and placement maths, no three.js) | 6 kB | 3 kB |
| `PlacementLab` chunk | 2 kB | 1 kB |
| `three.module` (already shipped for the Home coverflow) | 747 kB | 188 kB |

The main bundle is unchanged: nothing 3D loads until the lab page or the drawer opens.
The small `ArmPlacementPanel` chunk loads with the Concepts page; three.js and the glTF
loader arrive only when **View on arm in 3D** is tapped (`e2e/placementConcept.e2e.js`
checks this).

**Draco was tried and dropped.** It shrinks the model to 17 kB, but three's Draco decoder
is about 250 kB of extra files, so it costs more than it saves at this size. Two levels of
subdivision (8,120 vertices, 436 kB) look no better on a phone than one.

**Frame rate:** a steady 60 fps (16.7 ms median and 95th percentile) in Chromium emulating
an iPhone 390 × 844 viewport, on this Mac's Intel UHD 630, including with the CPU
throttled six times. That is an emulated phone on a laptop GPU, not an iPhone: the shader
is one texture read and a few dot products per pixel, so a real phone should manage, but
nobody has held one yet.

### Not built yet

- The forearm, and the inner side of the upper arm (the export is `side='outer'`).
- Your own measurements: the model is fitted to the default averages.
- Skin near the elbow and over the shoulder: a design can sit between 1.7 and 25 cm above
  the elbow, the range the export reports as cleanly mapped, so a tall piece is narrowed
  to fit (the hourglass opens at 10.4 cm wide, not 12).
- Extracted designs keep a faint tint along some crop edges.
- Healed ink has the renders' cool black floor, colour fade and density loss, but not their
  0.15 mm spread or patchiness. Framed on the design, the spread is about one screen pixel
  wide, and it cost either every frame (a GPU blur: the settle test timed out under
  software WebGL) or 150–700 ms of main thread after each resize (a CPU blur, measured on
  a Mac). Side by side on the phone, the two looked the same.
