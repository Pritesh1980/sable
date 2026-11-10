"""Lift a tattoo off a photo of skin, as a flat design on white paper (#195).

    blender -b -P scripts/blender/extract-design.py -- \
        --image public/images/demo/vesper_noctis/hourglass-v4.webp \
        --crop 280,205,730,1215 --out public/models/designs/hourglass.webp

Sable's demo artwork is generated tattoo photography: the ink is already on
an arm. The 3D placement view needs the design alone. Ink multiplies the light
coming off skin, so dividing the photo by the bare skin under it leaves the
ink's transmittance: 1 where the skin is bare (white paper), lower where it is
inked. Multiplying that onto another arm puts the same tattoo there, shading
and colour included, and the first arm's own lighting is divided out with its
skin.

The bare skin under the ink can't be seen, so it is fitted: a smooth quadratic
surface per colour channel through the parts of the crop that are bare skin.
``--crop`` is ``x0,y0,x1,y1`` in pixels from the top left, drawn by eye just
outside the tattoo and inside the limb where possible.

For Sable's own fictional demo images only. Don't run it on an artist's
photo: the result is their design.

Blender is used only to read and write the image (it bundles numpy; macOS's
Python doesn't). The maths is plain numpy: see test_extract_design.py.
"""

import argparse
import os
import sys

import numpy as np

GRID = 12  # cells per side the skin surface is fitted through
SKIN_PERCENTILE = 85
#: A cell is inked, and left out of the fit, when it is darker than this share
#: of the fitted skin.
INKED_BELOW = 0.9
#: Skin this close to the fitted surface is taken as bare when levelling.
BARE_ABOVE = 0.8
#: Ink lighter than the first is dropped; darker than the second is kept whole.
FAINT = (0.04, 0.16)
FEATHER = 0.05  # share of the crop's short side faded to blank at each edge


def to_linear(srgb):
    srgb = np.asarray(srgb, dtype=np.float64)
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def to_srgb(linear):
    linear = np.clip(np.asarray(linear, dtype=np.float64), 0.0, 1.0)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055)


def _design(x, y):
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], axis=-1)


def _skin_like(linear):
    """Pixels with skin's colour: red over green over blue, clearly not grey.
    A wall, a sofa, black fabric and black ink are all near-neutral."""
    r, g, b = linear[..., 0], linear[..., 1], linear[..., 2]
    return (r > g) & (g > b) & (r > 1.35 * b) & (r > 0.02)


def fit_skin(linear):
    """The bare skin under the whole crop, ``(h, w, 3)`` linear: a quadratic
    surface in log space through the bright, skin-coloured cells. Cells that
    turn out darker than the surface are inked, and are dropped and the fit
    repeated, so a tattoo covering most of the crop is bridged from its
    surroundings."""
    h, w, _ = linear.shape
    skin = _skin_like(linear)
    luma = linear @ np.array([0.2126, 0.7152, 0.0722])
    xs, ys, values = [], [], []
    for gy in range(GRID):
        for gx in range(GRID):
            y0, y1 = gy * h // GRID, (gy + 1) * h // GRID
            x0, x1 = gx * w // GRID, (gx + 1) * w // GRID
            mask = skin[y0:y1, x0:x1]
            if mask.sum() < 0.25 * mask.size:
                continue
            cell, cell_luma = linear[y0:y1, x0:x1][mask], luma[y0:y1, x0:x1][mask]
            bright = cell[cell_luma >= np.percentile(cell_luma, SKIN_PERCENTILE)]
            xs.append((x0 + x1) / 2 / w - 0.5)
            ys.append((y0 + y1) / 2 / h - 0.5)
            values.append(np.log(np.maximum(bright.mean(axis=0), 1e-4)))
    if len(values) < 6:
        raise ValueError('not enough bare skin in the crop to fit: widen it')
    xs, ys, values = np.array(xs), np.array(ys), np.array(values)
    keep = np.ones(len(values), dtype=bool)
    for _ in range(4):
        coeffs, *_ = np.linalg.lstsq(_design(xs[keep], ys[keep]), values[keep], rcond=None)
        fitted = _design(xs, ys) @ coeffs
        bare = values.mean(axis=1) >= fitted.mean(axis=1) + np.log(INKED_BELOW)
        if bare.sum() < 6 or (bare == keep).all():
            break
        keep = bare
    y, x = np.mgrid[0:h, 0:w]
    return np.exp(_design((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) @ coeffs)


def _smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def transmittance(linear, feather=FEATHER):
    """The design as ink transmittance, ``(h, w, 3)`` in 0..1 (1 is blank
    paper). ``feather`` fades it to blank at the crop's edges, so a crop that
    catches some background doesn't print a hard-edged rectangle."""
    ratio = linear / fit_skin(linear)
    # The surface runs through the brightest skin of each cell, so ordinary
    # bare skin sits a little under it and would print as a faint tint. Level
    # it: the typical bare pixel becomes exactly blank.
    luma = ratio @ np.array([0.2126, 0.7152, 0.0722])
    bare = _skin_like(linear) & (luma > BARE_ABOVE)
    if bare.sum() > 100:
        ratio = ratio / np.median(ratio[bare], axis=0)
    t = np.clip(ratio, 0.0, 1.0)
    # Skin is never perfectly even: pores, redness and fit error leave a faint,
    # often coloured, haze that prints as speckle. Ink this faint is let go.
    faint = _smoothstep((1.0 - t @ np.array([0.2126, 0.7152, 0.0722]) - FAINT[0]) / (FAINT[1] - FAINT[0]))
    t = 1.0 - (1.0 - t) * faint[..., None]
    if feather > 0:
        h, w, _ = linear.shape
        margin = feather * min(h, w)
        y, x = np.mgrid[0:h, 0:w]
        edge = np.minimum(np.minimum(x, w - 1 - x), np.minimum(y, h - 1 - y))
        t = 1.0 - (1.0 - t) * _smoothstep(edge / margin)[..., None]
    return t


def parse_args(argv):
    p = argparse.ArgumentParser(prog='extract-design.py', description=__doc__.split('\n')[0])
    p.add_argument('--image', required=True)
    p.add_argument('--crop', required=True, help='x0,y0,x1,y1 in pixels from the top left')
    p.add_argument('--out', required=True, help='output .webp or .png')
    p.add_argument('--quality', type=int, default=86)
    args = p.parse_args(argv)
    args.crop = tuple(int(v) for v in args.crop.split(','))
    if len(args.crop) != 4:
        p.error('--crop takes x0,y0,x1,y1')
    return args


def main(argv=None):
    import bpy  # noqa: PLC0415

    if argv is None:
        argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse_args(argv)
    source = bpy.data.images.load(os.path.abspath(os.path.expanduser(args.image)))
    w, h = source.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    source.pixels.foreach_get(pixels)
    rgb = pixels.reshape(h, w, 4)[::-1, :, :3]  # Blender's rows run bottom-up
    x0, y0, x1, y1 = args.crop
    crop = to_linear(rgb[y0:y1, x0:x1])
    paper = to_srgb(transmittance(crop))

    ch, cw, _ = paper.shape
    out = bpy.data.images.new('design', cw, ch, alpha=False)
    rgba = np.concatenate([paper[::-1], np.ones((ch, cw, 1))], axis=-1).astype(np.float32)
    out.pixels.foreach_set(rgba.ravel())
    scene = bpy.context.scene
    scene.view_settings.view_transform = 'Standard'
    settings = scene.render.image_settings
    settings.file_format = 'WEBP' if args.out.lower().endswith('.webp') else 'PNG'
    settings.color_mode = 'RGB'
    settings.quality = args.quality
    path = os.path.abspath(os.path.expanduser(args.out))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save_render(path, scene=scene)
    print(f'[extract-design] {path}: {cw}x{ch}, {os.path.getsize(path)} bytes', flush=True)


if __name__ == '__main__':
    main()
