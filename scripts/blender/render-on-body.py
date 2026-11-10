"""Render a Sable concept image onto a 3D arm at true size (#192).

Run headless with Blender (Sable itself never calls Blender):

    blender -b -P scripts/blender/render-on-body.py -- \
        --image concept.png --width-cm 12 --out renders/

Builds an upper arm (``--placement upper-arm``, the default) or a forearm,
wraps the design onto it at a true printed width (``--width-cm`` of skin,
measured around the curve), lights it softly against a near-black backdrop
and renders three angles plus a ``params.json``. The arm is a tapered,
slightly elliptical tube by default (``--body parametric``), or MakeHuman's
CC0 body (``--body makehuman --makehuman-data DIR``): its upper arm, shoulder
and torso with the arm lowered from the rest pose, or its forearm with the
wrist and hand, fitted to the same measurements and mapped per vertex. Its
sex is drawn at random, fully female or fully male, from a seed that
``params.json`` records (``--mh-sex``, ``--seed``). The skin is a preset tone
(``--skin-tone``) or an exact sRGB (``--skin-rgb``). The ink looks healed by
default (``--ink healed``: spread a fraction of a millimetre, a cool settled
black under the skin); ``--ink fresh`` is the crisp just-inked look.
``params.json`` records the design's size as measured on the rendered mesh.
Everything after ``--`` is this script's own arguments; see ``--help``
(``blender -b -P render-on-body.py -- --help``) and docs/BLENDER.md.

The maths at the top of this file is plain Python so it can be unit tested
without Blender: ``python3 -m unittest discover -s scripts/blender``.
"""

import argparse
import atexit
import bisect
import json
import math
import os
import random
import secrets
import sys
import tempfile
import time

# --------------------------------------------------------------------------
# Pure maths (no bpy). Units are centimetres unless a name says otherwise.
# --------------------------------------------------------------------------

#: Width-to-thickness ratio of the arm's cross-section at the wrist and elbow.
#: Wrists are flatter than the muscle belly near the elbow.
WRIST_ASPECT = 1.35
ELBOW_ASPECT = 1.12


def _clamp01(t):
    return min(1.0, max(0.0, t))


def ease_profile(t):
    """0..1 easing for the taper: slow through the tendinous wrist, fuller
    through the muscle belly, levelling off towards the elbow."""
    t = _clamp01(t)
    smooth = t * t * (3 - 2 * t)
    return 0.4 * t + 0.6 * smooth


def circumference_at(t, wrist_cm, elbow_cm):
    """Circumference at fraction ``t`` of the way from wrist (0) to elbow (1).

    Beyond the measured section the arm continues as a straight tube, so the
    renders can crop the ends out of frame."""
    return wrist_cm + (elbow_cm - wrist_cm) * ease_profile(t)


#: Upper-arm tape positions, as fractions of elbow crease → top of shoulder:
#: above the elbow an eighth of the way up, round the biceps half-way.
ABOVE_ELBOW_AT = 0.125
BICEPS_AT = 0.5


def taper_t(y_cm, length_cm, placement='forearm'):
    """Taper fraction (for ``circumference_at``) at ``y_cm`` along the limb.

    The forearm's measurements are taken at its two ends. The upper arm's are
    taken at fixed tape positions, so the profile runs from the above-elbow
    measurement there to the biceps measurement half-way up, then holds."""
    if placement != 'upper-arm':
        return y_cm / length_cm
    lo, hi = ABOVE_ELBOW_AT * length_cm, BICEPS_AT * length_cm
    return (y_cm - lo) / (hi - lo)


def aspect_at(t, narrow=WRIST_ASPECT, wide=ELBOW_ASPECT):
    """Cross-section width/thickness ratio along the arm, from ``narrow`` at
    the narrow end (t = 0) to ``wide`` at the wide end (t = 1)."""
    return narrow + (wide - narrow) * ease_profile(t)


def ellipse_perimeter(a, b):
    """Ramanujan's second approximation (exact for a circle)."""
    h = ((a - b) / (a + b)) ** 2
    return math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h)))


def semi_axes_for(circumference_cm, aspect):
    """Semi-axes (a across the arm, b top-to-bottom) of an ellipse with the
    given perimeter and a/b ratio."""
    b = circumference_cm / ellipse_perimeter(aspect, 1.0)
    return aspect * b, b


def ring_points(a, b, n, fine=4096):
    """``n`` points on the ellipse x²/a² + z²/b² = 1, evenly spaced by arc
    length, starting on the top centreline (0, b) and running towards +X.

    Returns ``(x, z, arc)`` tuples where ``arc`` is the signed skin distance
    from the top centreline: positive on the +X side, up to +perimeter/2 at
    the underside, negative on the -X side. Even arc spacing is what lets a
    fixed number of centimetres of design map onto a fixed length of skin."""
    psis = [2 * math.pi * i / fine for i in range(fine + 1)]
    pts = [(a * math.sin(p), b * math.cos(p)) for p in psis]
    cum = [0.0]
    for i in range(fine):
        cum.append(cum[-1] + math.dist(pts[i], pts[i + 1]))
    perimeter = cum[-1]
    out = []
    j = 0
    for k in range(n):
        s = perimeter * k / n
        while cum[j + 1] < s:
            j += 1
        seg = cum[j + 1] - cum[j]
        f = 0.0 if seg == 0 else (s - cum[j]) / seg
        psi = psis[j] + f * (psis[j + 1] - psis[j])
        arc = s if s <= perimeter / 2 else s - perimeter
        out.append((a * math.sin(psi), b * math.cos(psi), arc))
    return out


def uv_span_for_width(width_cm, circumference_cm):
    """Fraction of the way around the arm (U of the around-the-arm UV map)
    that a design ``width_cm`` wide covers. Above 1 it would overlap itself."""
    if width_cm <= 0 or circumference_cm <= 0:
        raise ValueError('width and circumference must be positive')
    return width_cm / circumference_cm


def design_size_cm(width_cm, px_w, px_h):
    """Printed (width, height) in cm, keeping the image's aspect ratio."""
    return width_cm, width_cm * px_h / px_w


def design_uv(u_main, v_main, *, circumference_cm, length_cm, width_cm, height_cm,
              centre_cm, up='elbow'):
    """Map a point of the arm's main UV map to the design texture's UV.

    ``u_main`` runs around the arm (0.5 = top centreline, 0/1 = underside
    seam) and ``v_main`` along it (0 = wrist, 1 = elbow). The U scale is
    derived from the circumference *at that point*, so every row of the design
    covers exactly ``width_cm`` of skin however much the arm tapers under it.
    ``up`` is which end of the arm the top of the image points to: ``'+y'``
    (the forearm's ``'elbow'``) or ``'-y'`` (``'wrist'``)."""
    du = (u_main - 0.5) * circumference_cm / width_cm
    dv = (v_main * length_cm - centre_cm) / height_cm
    return _oriented(du, dv, up)


#: ``up`` values meaning the top of the image points along +y or -y. The
#: forearm's names are kept: its +y end is the elbow.
UP_PLUS_Y = ('+y', 'elbow')
UP_MINUS_Y = ('-y', 'wrist')


def _oriented(du, dv, up):
    if up in UP_PLUS_Y:
        return 0.5 + du, 0.5 + dv
    if up in UP_MINUS_Y:  # rotate 180°, never mirror
        return 0.5 - du, 0.5 - dv
    raise ValueError(f'unknown design orientation: {up!r}')


def srgb_to_linear(c):
    """One sRGB channel (0..1, what you see on screen) → linear light."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb_hex_to_linear(hex_colour):
    """'#rrggbb' → linear RGB floats (Blender shader colours are linear)."""
    h = hex_colour.lstrip('#')
    if len(h) != 6:
        raise ValueError(f'expected #rrggbb, got {hex_colour!r}')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


def hex_to_srgb8(hex_colour):
    """'#rrggbb' → (r, g, b) whole numbers 0..255."""
    h = hex_colour.lstrip('#')
    if len(h) != 6:
        raise ValueError(f'expected #rrggbb, got {hex_colour!r}')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def srgb8_to_linear(rgb):
    """(r, g, b) sRGB whole numbers 0..255 → linear RGB floats."""
    return tuple(srgb_to_linear(c / 255) for c in rgb)


def frame_distance(half_extent, focal_mm, sensor_mm):
    """Distance at which a lens shows ``half_extent`` either side of centre."""
    return half_extent * focal_mm / (sensor_mm / 2)


#: Room round the design in the close-up, and the render's width / height.
CLOSE_UP_MARGIN = 1.3
FRAME_ASPECT = 2 / 3


def close_up_half_height(width_cm, height_cm, circumference_cm):
    """Half the close-up's frame height, in cm: the design's height, or the
    chord its width spans seen square on (the arm's whole width once it wraps
    past half-way) fitted to the narrower 2:3 frame, whichever needs more,
    with a margin."""
    r = circumference_cm / (2 * math.pi)
    angle = width_cm / r  # radians of arm the design wraps
    chord = 2 * r * math.sin(angle / 2) if angle < math.pi else 2 * r
    return CLOSE_UP_MARGIN * max(height_cm / 2, chord / (2 * FRAME_ASPECT))


def close_up_distance(half_extent, circumference, focal_mm, sensor_mm):
    """Camera distance from the arm's axis that frames ``half_extent`` at the
    skin, which is the arm's radius nearer the camera (any one unit)."""
    return frame_distance(half_extent, focal_mm, sensor_mm) + circumference / (2 * math.pi)


# --------------------------------------------------------------------------
# Healed ink. The design is turned into a transmittance texture (1 = bare
# skin, 0 = solid ink, linear light) before rendering; the shader then lays a
# cool healed black under the skin. Pure Python, so it runs in Blender builds
# without numpy (Ubuntu's) and can be tested without Blender.
# --------------------------------------------------------------------------

INKS = ('healed', 'fresh')
#: Gaussian sigma of a healed line's spread into the dermis, in mm of skin.
HEALED_SPREAD_MM = 0.15
#: Transmittance healed ink regains: solid black lets 2% more skin through,
#: which reads as about a fifth lighter than fresh black.
HEALED_DENSITY_LOSS = 0.02
#: How far coloured ink fades towards grey as it settles under the skin.
HEALED_DESATURATE = 0.25
#: Hue of solid healed black seen through the skin above it, as relative
#: linear RGB: a slightly blue-green black rather than fresh ink's warm brown.
HEALED_TINT = (0.80, 0.98, 1.12)
#: Rec. 709 luminance weights (Blender's linear working space).
REC709 = (0.2126, 0.7152, 0.0722)
#: Below this many texture pixels a blur is invisible; skip it.
MIN_SIGMA_PX = 0.25


def luminance(rgb):
    r, g, b = rgb
    return REC709[0] * r + REC709[1] * g + REC709[2] * b


#: Longest edge the healed texture is prepared at. A 12 cm design fills about
#: 900 px of a 2048 px render, so more is invisible, and plain-Python planes
#: cost ~32 bytes a value (a 4096 px image would need over 1.5 GB).
HEALED_MAX_PX = 2048


def fit_within(w, h, max_px):
    """(w, h) scaled down, keeping the aspect ratio, so neither exceeds ``max_px``."""
    scale = min(1.0, max_px / max(w, h))
    return max(1, round(w * scale)), max(1, round(h * scale))


def px_per_cm(px, cm):
    """Print resolution: texture pixels per cm of skin."""
    if px <= 0 or cm <= 0:
        raise ValueError('pixels and cm must be positive')
    return px / cm


def spread_sigma_px(spread_mm, ppc):
    """A spread of ``spread_mm`` of skin, in texture pixels at ``ppc`` px/cm.
    The same image printed larger has fewer px per cm, so the same physical
    spread is fewer pixels: the blur stays a fixed size on the skin."""
    if spread_mm < 0:
        raise ValueError('spread must not be negative')
    return spread_mm / 10 * ppc


def gaussian_kernel(sigma_px):
    """Normalised 1-D Gaussian taps out to 3 sigma (``[1.0]`` = no blur)."""
    if sigma_px < MIN_SIGMA_PX:
        return [1.0]
    r = math.ceil(3 * sigma_px)
    taps = [math.exp(-(i * i) / (2 * sigma_px * sigma_px)) for i in range(-r, r + 1)]
    total = sum(taps)
    return [t / total for t in taps]


def blur_plane(values, w, h, kernel, pad=1.0):
    """Separable blur of one ``w``×``h`` channel (row-major, flat). Outside the
    image is ``pad`` (bare skin), so ink at the border fades rather than
    gaining ink from beyond it. Blank rows (all ``pad``) are skipped: most of a
    line drawing is paper."""
    r = len(kernel) // 2
    if r == 0:
        return list(values)
    edge = [pad] * r
    rows, blank = [], []
    for y in range(h):
        row = list(values[y * w:(y + 1) * w])
        is_blank = min(row) == pad == max(row)
        blank.append(is_blank)
        if not is_blank:
            padded = edge + row + edge
            acc = [0.0] * w
            for k, weight in enumerate(kernel):
                acc = [a + weight * s for a, s in zip(acc, padded[k:k + w])]
            row = acc
        rows.append(row)
    pad_row = [pad] * w
    out = []
    for y in range(h):
        if all(blank[j] for j in range(max(0, y - r), min(h, y + r + 1))):
            out.extend(pad_row)
            continue
        acc = [0.0] * w
        for k, weight in enumerate(kernel):
            j = y - r + k
            src = rows[j] if 0 <= j < h else pad_row
            acc = [a + weight * s for a, s in zip(acc, src)]
        out.extend(acc)
    return out


def skin_rim(plane, w, h):
    """A copy of the plane with its outermost pixels set to bare skin (1).
    The healed texture is extended past its edges rather than clipped
    (clipping a float texture darkens its border), so the rim is what the
    rest of the arm shows."""
    out = list(plane)
    out[:w] = [1.0] * w
    out[(h - 1) * w:] = [1.0] * w
    for y in range(1, h - 1):
        out[y * w] = out[y * w + w - 1] = 1.0
    return out


#: --background: what the image's paper is. Sable's own concept cards are light
#: lines on near-black, where the ink is the light part; auto reads the border.
BACKGROUNDS = ('auto', 'light', 'dark')


def is_dark_background(pixels, w, h):
    """True when most of the image's outermost ring is dark (median sRGB
    luminance below 0.5). Transparent pixels count as bare skin, which is light.
    ``pixels`` are flat RGBA with straight alpha, as ``Image.pixels`` gives."""
    ring = [i for i in range(w)] + [(h - 1) * w + i for i in range(w)]
    ring += [y * w + x for y in range(1, h - 1) for x in (0, w - 1)]
    lums = sorted(pixels[4 * i + 3] * luminance(pixels[4 * i:4 * i + 3])
                  + (1.0 - pixels[4 * i + 3]) for i in ring)
    return lums[len(lums) // 2] < 0.5


def invert_lightness(pixels):
    """Flat RGBA with HSL lightness flipped and hue, chroma and alpha kept:
    each channel moves by 1 − max − min, so a cream line on a black card
    becomes a dark line on white paper and a red stays the same red."""
    out = list(pixels)
    for i in range(0, len(out), 4):
        r, g, b = out[i:i + 3]
        d = 1.0 - max(r, g, b) - min(r, g, b)
        out[i:i + 3] = (r + d, g + d, b + d)
    return out


def flip_for_background(background, pixels, w, h):
    """Whether to flip the image (``invert_lightness``) before inking it."""
    if background == 'auto':
        return is_dark_background(pixels, w, h)
    return background == 'dark'


def ink_planes(pixels, white_point):
    """Flat RGBA pixels (sRGB values, straight alpha, as Blender's
    ``Image.pixels`` gives a PNG) → linear transmittance planes (r, g, b),
    exactly as the fresh shader reads the design: levels against the white
    point, then transparency is bare skin."""
    wp = srgb_to_linear(white_point)
    cache = {}

    def level(c):
        v = cache.get(c)
        if v is None:
            v = cache[c] = min(1.0, srgb_to_linear(c) / wp)
        return v

    alpha = pixels[3::4]
    return tuple([a * level(c) + (1.0 - a) for c, a in zip(pixels[ch::4], alpha)]
                 for ch in range(3))


def heal_planes(r, g, b, *, density_loss=HEALED_DENSITY_LOSS, desaturate=HEALED_DESATURATE):
    """Transmittance planes as healed ink: colour fades towards its own
    luminance, then every channel regains ``density_loss`` of the way to
    bare skin."""
    kr, kg, kb = REC709
    lum = [kr * x + kg * y + kb * z for x, y, z in zip(r, g, b)]

    def heal(plane):
        out = []
        for c, y in zip(plane, lum):
            c = c + (y - c) * desaturate
            out.append(_clamp01(c + (1.0 - c) * density_loss))
        return out

    return heal(r), heal(g), heal(b)


def healed_transmittance(rgb, *, density_loss=HEALED_DENSITY_LOSS, desaturate=HEALED_DESATURATE):
    """One linear transmittance colour as healed ink (see ``heal_planes``)."""
    planes = heal_planes(*([c] for c in rgb), density_loss=density_loss, desaturate=desaturate)
    return tuple(p[0] for p in planes)


def healed_ink_floor(skin_linear, ink_strength, tint=HEALED_TINT):
    """Colour of solid healed black over this skin (linear RGB).

    Fresh ink over skin is the skin's own colour, darkened (a warm brown on
    light skin). Healed pigment sits under the epidermis, which scatters some
    light back before it reaches the ink, so solid black reads as a cool,
    slightly blue-green black instead. Same luminance as fresh black at this
    ``ink_strength``; only the hue moves."""
    y = luminance(skin_linear) * (1 - ink_strength)
    ty = luminance(tint)
    return tuple(y * t / ty for t in tint)


# --------------------------------------------------------------------------
# Skin tone. The presets are base colours (sRGB 0..255) picked by eye under
# this script's lights and colour transform, named for how they look and
# ordered light to deep. They are not a calibrated skin-tone scale.
# --------------------------------------------------------------------------

SKIN_TONES = {
    'light-peach': (201, 157, 128),  # the default until Nov 2026 (#c99d80)
    'light-warm-tan': (184, 143, 104),
    'light-warm-brown': (170, 132, 95),
    'warm-brown': (154, 118, 84),
    'medium-brown': (128, 95, 66),
    'deep-brown': (80, 58, 42),
}
DEFAULT_SKIN_TONE = 'warm-brown'
#: The tone the subsurface settings below were tuned on.
SKIN_REFERENCE = SKIN_TONES['light-peach']
#: Subsurface scattering distance per channel (× SUBSURFACE_SCALE_M) and the
#: blotchy redness mixed into the base colour, both for the reference tone.
SUBSURFACE_RADIUS = (1.0, 0.4, 0.22)
SKIN_FLUSH = (1.0, 0.86, 0.84)
#: How fast each channel's scattering distance shrinks as skin gets browner:
#: melanin absorbs short wavelengths most, so blue shrinks fastest.
SUBSURFACE_MELANIN = (0.25, 0.5, 0.75)


def parse_skin_rgb(text):
    """'R,G,B' (sRGB whole numbers 0..255) → (r, g, b)."""
    parts = [p.strip() for p in text.split(',')]
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValueError(f'expected R,G,B as whole numbers 0-255, got {text!r}')
    rgb = tuple(int(p) for p in parts)
    if max(rgb) > 255:
        raise ValueError(f'each of R,G,B must be 0-255, got {text!r}')
    return rgb


def skin_subsurface(skin_linear):
    """The subsurface look for a skin's base colour (linear RGB).

    ``lightness`` is the skin's luminance relative to the reference tone. In
    browner skin more melanin absorbs light before it travels far under the
    surface, the short wavelengths most: every channel's ``radius`` shrinks,
    blue fastest, so the glow is warmer and shallower rather than the pink
    translucency of lighter skin. Melanin also masks blood, so the blotchy
    ``flush`` (a multiplier on the base colour) is milder. The reference tone
    gets the reference settings exactly; lighter tones keep its redness."""
    k = luminance(skin_linear) / luminance(srgb8_to_linear(SKIN_REFERENCE))
    k = min(1.5, max(0.1, k))
    radius = tuple(r * k ** p for r, p in zip(SUBSURFACE_RADIUS, SUBSURFACE_MELANIN))
    m = min(1.0, k) ** 0.5
    flush = tuple(1 - (1 - f) * m for f in SKIN_FLUSH)
    return {'lightness': k, 'radius': radius, 'flush': flush}


# --------------------------------------------------------------------------
# Measuring true size on a triangle mesh: slice it with a plane and keep the
# part of the cross-section where the design's UV is inside the image.
# --------------------------------------------------------------------------


def _lerp(p, q, t):
    return tuple(a + (b - a) * t for a, b in zip(p, q))


def slice_triangle(tri, axis, level):
    """Cut a triangle of ``(point, attrs)`` corners with the plane
    ``point[axis] == level``. Returns the two ends ``((p, a), (q, b))`` with
    attributes interpolated, or None. A corner on the plane counts as above
    it, so an edge lying in the plane belongs to exactly one triangle."""
    above = [p[axis] >= level for p, _ in tri]
    if all(above) or not any(above):
        return None
    ends = []
    for i in range(3):
        j = (i + 1) % 3
        if above[i] != above[j]:
            (p, a), (q, b) = tri[i], tri[j]
            t = (level - p[axis]) / (q[axis] - p[axis])
            ends.append((_lerp(p, q, t), _lerp(a, b, t)))
    return ends[0], ends[1]


def clip_segment(seg, ranges):
    """The part of a segment whose (linearly interpolated) attributes satisfy
    ``{index: (lo, hi)}``, or None."""
    (p, a), (q, b) = seg
    t0, t1 = 0.0, 1.0
    for i, (lo, hi) in ranges.items():
        da = b[i] - a[i]
        if da == 0:
            if not lo <= a[i] <= hi:
                return None
            continue
        ta, tb = sorted(((lo - a[i]) / da, (hi - a[i]) / da))
        t0, t1 = max(t0, ta), min(t1, tb)
        if t0 > t1:
            return None
    if t0 == 0.0 and t1 == 1.0:
        return seg
    return (_lerp(p, q, t0), _lerp(a, b, t0)), (_lerp(p, q, t1), _lerp(a, b, t1))


def measure_slice(tris, axis, level, ranges):
    """Slice ``tris`` at ``point[axis] == level`` and measure the part whose
    attributes are within ``ranges``: ``(length, min corner, max corner)``,
    or ``(0.0, None, None)`` if nothing is in range. Faces across a UV seam
    carry out-of-range attributes, so they drop out without special cases."""
    total, lo, hi = 0.0, None, None
    for tri in tris:
        seg = slice_triangle(tri, axis, level)
        seg = seg and clip_segment(seg, ranges)
        if not seg:
            continue
        (p, _), (q, _) = seg
        total += math.dist(p, q)
        for pt in (p, q):
            lo = pt if lo is None else tuple(map(min, lo, pt))
            hi = pt if hi is None else tuple(map(max, hi, pt))
    return total, lo, hi


#: Names for measure_design: the limb's -y end, its +y end, and where y starts.
MEASURE_ENDS = {'forearm': ('wrist_end', 'elbow_end', 'at_cm_from_wrist'),
                'upper-arm': ('elbow_end', 'shoulder_end', 'at_cm_from_elbow')}


def measure_design(tris, *, height_cm, centre_cm, placement='forearm'):
    """How much skin the design covers on the arm as rendered.

    ``tris`` are ``((x, y, z) in cm, (u, v) design UV)`` corners, with the arm
    along +Y from the wrist (the elbow, for the upper arm) and its top line at
    x = 0, z > 0. The width round the arm is sliced across the arm near the
    design's two ends and middle; the length is the design's extent along the
    arm on the top line (u is out of range on the underside, so that line
    drops out)."""
    low, high, key = MEASURE_ENDS[placement]
    widths = {}
    for name, f in ((low, -0.7), ('middle', 0.0), (high, 0.7)):
        y = centre_cm + f * height_cm / 2
        width, _, _ = measure_slice(tris, 1, y, {0: (0.0, 1.0)})
        widths[name] = {key: round(y, 2), 'width_cm': round(width, 2)}
    _, lo, hi = measure_slice(tris, 0, 0.0, {0: (0.0, 1.0), 1: (0.0, 1.0)})
    along = round(hi[1] - lo[1], 2) if lo else 0.0
    return {'width_round_arm': widths, 'length_along_arm_cm': along}


# --------------------------------------------------------------------------
# A real arm (--body makehuman). MakeHuman's base mesh, targets and skeleton
# are CC0 data files (docs/BLENDER.md has the licence evidence); they are read
# here with this script's own parsers. None of MakeHuman's code (AGPL) is
# imported, run or copied. MakeHuman's unit is the decimetre.
# --------------------------------------------------------------------------

BODIES = ('parametric', 'makehuman')
SIDES = ('inner', 'outer')
DM = 10.0  # cm per MakeHuman unit
MH_ETHNICITIES = ('african', 'asian', 'caucasian')
#: Left-arm joints (the skeleton's ".L" side) as named in rigs/default.mhskel.
#: Each is the centre of a small helper cube in base.obj, so targets move it.
MH_JOINTS = {
    'upperarm': 'upperarm02.L____head',  # half-way down the upper arm
    'elbow': 'lowerarm01.L____head',
    'wrist': 'wrist.L____head',
    'index': 'finger2-1.L____head',  # index-finger knuckle
    'little': 'finger5-1.L____head',  # little-finger knuckle
}
MH_UPPER_ARM_BONES = ('upperarm01.L', 'upperarm02.L')


def is_lower_arm_bone(name, side='L'):
    """Bones that move with the forearm when the elbow bends: the two
    forearm (twist) bones, the wrist and the whole hand (left by default)."""
    return name in (f'lowerarm01.{side}', f'lowerarm02.{side}', f'wrist.{side}') or (
        name.endswith('.' + side) and name.startswith(('metacarpal', 'finger')))


def parse_obj(lines):
    """Vertices and faces of a Wavefront OBJ: ``(verts, faces_by_group)``,
    faces as tuples of 0-based vertex indices (texture indices dropped). A
    group name that comes back adds to its earlier faces."""
    verts, groups, group = [], {}, 'default'
    for line in lines:
        parts = line.split()
        if not parts:
            continue
        if parts[0] == 'v':
            verts.append(tuple(float(c) for c in parts[1:4]))
        elif parts[0] == 'g':
            group = ' '.join(parts[1:]) or 'default'
        elif parts[0] == 'f':
            idx = (int(item.split('/')[0]) for item in parts[1:])
            groups.setdefault(group, []).append(
                tuple(i - 1 if i > 0 else len(verts) + i for i in idx))
    return verts, groups


def parse_target(lines):
    """A MakeHuman ``.target``: one ``index dx dy dz`` offset per line."""
    out = []
    for line in lines:
        line = line.split('#', 1)[0].strip()
        if line:
            i, dx, dy, dz = line.split()
            out.append((int(i), (float(dx), float(dy), float(dz))))
    return out


def apply_targets(verts, weighted_targets):
    """The vertices moved by the sum of weight × offset over ``(weight,
    offsets)`` targets. ``verts`` itself is left alone."""
    out = [list(v) for v in verts]
    for weight, offsets in weighted_targets:
        if not weight:
            continue
        for i, (dx, dy, dz) in offsets:
            p = out[i]
            p[0] += weight * dx
            p[1] += weight * dy
            p[2] += weight * dz
    return [tuple(p) for p in out]


def makehuman_data_dir(path):
    """MakeHuman's ``data`` folder, given it, a checkout's root or the
    checkout's ``makehuman`` folder."""
    for folder in (path, os.path.join(path, 'makehuman', 'data'), os.path.join(path, 'data')):
        if os.path.isfile(os.path.join(folder, '3dobjs', 'base.obj')):
            return folder
    raise FileNotFoundError(
        f'no MakeHuman data under {path} (expected makehuman/data/3dobjs/base.obj)')


def three_way(value):
    """Weights of a MakeHuman min/average/max macro slider at ``value`` (0..1,
    0.5 = average): linear between neighbouring ends, summing to 1."""
    v = _clamp01(value)
    if v < 0.5:
        return {'min': 1 - 2 * v, 'average': 2 * v, 'max': 0.0}
    return {'min': 0.0, 'average': 2 - 2 * v, 'max': 2 * v - 1}


def macro_targets(sex=0.5, muscle=0.5, weight=0.5):
    """MakeHuman's macro targets for a 25-year-old (its default age, where
    only the ``young`` targets count) with an even mix of its three
    ethnicities, as ``{path under targets/: weight}``.

    Read from the files' names: ``<ethnicity>-<sex>-<age>`` targets blend by
    ethnicity × sex, ``universal-<sex>-<age>-<muscle>muscle-<weight>weight``
    by sex × muscle × weight. ``sex`` is 0 (female) to 1 (male). Height and
    proportions are left at their centre, where no target applies."""
    out = {}
    for name, w_sex in (('female', 1 - _clamp01(sex)), ('male', _clamp01(sex))):
        if w_sex <= 0:
            continue
        for ethnicity in MH_ETHNICITIES:
            out[f'macrodetails/{ethnicity}-{name}-young.target'] = w_sex / len(MH_ETHNICITIES)
        for m, w_m in three_way(muscle).items():
            for w, w_w in three_way(weight).items():
                if w_sex * w_m * w_w > 0:
                    out[f'macrodetails/universal-{name}-young-{m}muscle-{w}weight.target'] = (
                        w_sex * w_m * w_w)
    return out


# The body's sex. MakeHuman's gender slider runs from 0 to 1, and its own
# description (modifiers/modeling_modifiers_desc.json, "macrodetails/Gender")
# says "min is female, max is male"; the target files are named the same way
# (``*-female-*`` at 0, ``*-male-*`` at 1). ``--mh-sex random``, the default,
# draws one end or the other.

MH_SEX_RANDOM = 'random'
#: Fresh seeds are below this, short enough to retype.
SEED_LIMIT = 1_000_000
_SEX_ERROR = "--mh-sex is a number from 0 (female) to 1 (male), or 'random'; got {!r}"


def parse_mh_sex(value):
    """``--mh-sex``: ``'random'`` (any case), or MakeHuman's gender value as a
    float from 0 (female) to 1 (male), given as a number or as text. Anything
    else raises ValueError."""
    if isinstance(value, str):
        text = value.strip().lower()
        if text == MH_SEX_RANDOM:
            return MH_SEX_RANDOM
        try:
            number = float(text)
        except ValueError:
            raise ValueError(_SEX_ERROR.format(value)) from None
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
    else:
        raise ValueError(_SEX_ERROR.format(value))
    if not 0.0 <= number <= 1.0:  # NaN fails this too
        raise ValueError(_SEX_ERROR.format(value))
    return number


def body_sex(value, seed):
    """MakeHuman's gender value for one run. A number from 0 (female) to 1
    (male) passes through, whatever the seed. ``'random'`` draws a fully
    female (0.0) or fully male (1.0) body with equal odds from ``seed``, a
    whole number 0 or more. It uses ``random.Random(seed).random()``, the one
    sequence Python promises to keep across versions, so a recorded seed
    draws the same body again in any Blender."""
    value = parse_mh_sex(value)
    if value != MH_SEX_RANDOM:
        return value
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError(f'--mh-sex random needs a seed, a whole number 0 or more; got {seed!r}')
    return 1.0 if random.Random(seed).random() >= 0.5 else 0.0


def new_seed():
    """A fresh seed, for a random body when ``--seed`` isn't given."""
    return secrets.randbelow(SEED_LIMIT)


def sex_for_run(value, seed=None):
    """The body's sex for one run, as params.json records it: ``{'sex', 'sex_random',
    'seed'}``. A random sex without a seed gets a fresh one (``new_seed``), so
    the run can be repeated with ``--seed``."""
    value = parse_mh_sex(value)
    is_random = value == MH_SEX_RANDOM
    if is_random and seed is None:
        seed = new_seed()
    return {'sex': body_sex(value, seed), 'sex_random': is_random, 'seed': seed}


def sex_label(sex):
    """'female', 'male', or the value in between."""
    if sex == 0.0:
        return 'female'
    if sex == 1.0:
        return 'male'
    return f'{sex:g} (0 female, 1 male)'


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _scaled(a, k):
    return tuple(x * k for x in a)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _normalised(a):
    return _scaled(a, 1.0 / math.sqrt(_dot(a, a)))


def rotate_about(p, origin, axis, angle):
    """``p`` turned by ``angle`` (radians, right-handed) about the line
    through ``origin`` along the unit vector ``axis`` (Rodrigues)."""
    v = _sub(p, origin)
    c, s = math.cos(angle), math.sin(angle)
    kxv = _cross(axis, v)
    kv = _dot(axis, v) * (1 - c)
    return tuple(o + x * c + k * s + a * kv for o, x, k, a in zip(origin, v, kxv, axis))


def signed_angle(a, b, axis):
    """Angle turning ``a`` to ``b`` about ``axis`` (both perpendicular to it)."""
    return math.atan2(_dot(_cross(a, b), axis), _dot(a, b))


def pose_forearm(points, lower, joints, *, length_cm, side='inner'):
    """Lay MakeHuman's left forearm out like the parametric arm.

    The rest pose has the elbow bent and the hand thumb-forward (palm to the
    thigh). Each vertex turns about the elbow by its ``lower`` share (0..1,
    from the skeleton's weights) of the bend, which straightens the arm; then
    the forearm is supinated until the palm faces the same way as the inside
    of the elbow (about a quarter turn from the rest pose), the turn spread
    evenly from the elbow (none) to the wrist (all, with the hand), so the
    inner forearm lies flat and untwisted. The result is in cm, scaled
    evenly so wrist-to-elbow is ``length_cm``: the wrist joint at the origin,
    the elbow joint at (0, length, 0), the inner forearm towards +Z
    (``side='outer'`` turns the arm over about Y) and, palm up, the thumb on
    the +X side, as a left arm is: a rotation, never a mirror image."""
    if side not in SIDES:
        raise ValueError(f'unknown side: {side!r}')
    elbow, wrist = joints['elbow'], joints['wrist']
    ua = _normalised(_sub(elbow, joints['upperarm']))  # down the upper arm
    fa = _sub(wrist, elbow)
    forearm = math.sqrt(_dot(fa, fa))
    fa = _scaled(fa, 1 / forearm)
    bend = math.acos(max(-1.0, min(1.0, _dot(ua, fa))))
    flexion = _sub(fa, _scaled(ua, _dot(fa, ua)))  # the inside of the elbow
    if bend > 1e-9:
        hinge = _normalised(_cross(fa, ua))
        points = [rotate_about(p, elbow, hinge, w * bend) for p, w in zip(points, lower)]
        wrist, index, little = (rotate_about(joints[k], elbow, hinge, bend)
                                for k in ('wrist', 'index', 'little'))
    else:
        index, little = joints['index'], joints['little']
    palm = _cross(_sub(little, wrist), _sub(index, wrist))  # palm side of a left hand
    palm = _normalised(_sub(palm, _scaled(ua, _dot(palm, ua))))
    anterior = _normalised(flexion) if bend > 1e-9 else palm
    twist = signed_angle(palm, anterior, ua)

    def supinate(p):
        share = _clamp01(_dot(_sub(p, elbow), ua) / forearm)
        return rotate_about(p, elbow, ua, share * twist) if share else p

    points = [supinate(p) for p in points]
    y_axis = _scaled(ua, -1.0)
    z_axis = anterior if side == 'inner' else _scaled(anterior, -1.0)
    x_axis = _cross(y_axis, z_axis)
    scale = length_cm / (forearm * DM)
    k = DM * scale
    out = [tuple(k * _dot(_sub(p, wrist), axis) for axis in (x_axis, y_axis, z_axis))
           for p in points]
    return out, {'bend_deg': math.degrees(bend), 'twist_deg': math.degrees(twist),
                 'forearm_cm': forearm * DM, 'scale': scale}


# Cross-sections of an arbitrary mesh, and arc length round them.


def polygon_length(pts, closed=True):
    total = sum(math.dist(p, q) for p, q in zip(pts, pts[1:]))
    if closed and len(pts) > 1:
        total += math.dist(pts[-1], pts[0])
    return total


def polygon_centroid(pts):
    """``(signed area, (cx, cz))`` of a closed 2-D polygon."""
    area = cx = cz = 0.0
    for (x0, z0), (x1, z1) in zip(pts, pts[1:] + pts[:1]):
        c = x0 * z1 - x1 * z0
        area += c
        cx += (x0 + x1) * c
        cz += (z0 + z1) * c
    area /= 2
    if abs(area) < 1e-12:
        n = len(pts)
        return 0.0, (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    return area, (cx / (6 * area), cz / (6 * area))


def section_loops(points, tris, axis, level):
    """Where the plane ``point[axis] == level`` cuts a triangle mesh, as
    ``[(points, closed)]`` polylines. ``tris`` are vertex index triples; the
    pieces are chained through the mesh edges they cross, so a closed loop
    comes back exactly to its start (a corner on the plane counts as above
    it, as in ``slice_triangle``)."""
    segs = []
    for tri in tris:
        above = [points[i][axis] >= level for i in tri]
        if all(above) or not any(above):
            continue
        ends = []
        for k in range(3):
            if above[k] != above[(k + 1) % 3]:
                i, j = tri[k], tri[(k + 1) % 3]
                ends.append((i, j) if i < j else (j, i))
        segs.append(ends)
    by_edge = {}
    for s, (a, b) in enumerate(segs):
        by_edge.setdefault(a, []).append(s)
        by_edge.setdefault(b, []).append(s)

    def point(edge):
        p, q = points[edge[0]], points[edge[1]]
        return _lerp(p, q, (level - p[axis]) / (q[axis] - p[axis]))

    def extend(chain, used, at_end):
        while True:
            tip = chain[-1] if at_end else chain[0]
            nxt = [s for s in by_edge[tip] if not used[s]]
            if not nxt:
                return
            used[nxt[0]] = True
            a, b = segs[nxt[0]]
            new = b if a == tip else a
            if at_end:
                chain.append(new)
            else:
                chain.insert(0, new)

    used = [False] * len(segs)
    loops = []
    for start, (a, b) in enumerate(segs):
        if used[start]:
            continue
        used[start] = True
        chain = [a, b]
        extend(chain, used, at_end=True)
        closed = len(chain) > 2 and chain[-1] == chain[0]
        if closed:
            chain.pop()
        else:
            extend(chain, used, at_end=False)
        loops.append(([point(e) for e in chain], closed))
    return loops


def longest_loop_length(points, tris, axis, level):
    """Length of the longest closed loop where the plane cuts these
    triangles, or 0. Given only the arm's triangles, that is the arm's
    circumference even where the same plane also cuts the torso."""
    lengths = [polygon_length(lp) for lp, closed in section_loops(points, tris, axis, level)
               if closed and len(lp) > 2]
    return max(lengths, default=0.0)


def _wrap_angle(d):
    return (d + math.pi) % (2 * math.pi) - math.pi


def winding(loop, centre):
    """Total angle a closed 2-D loop turns round ``centre`` (±2π if it goes
    round it once, about 0 if the centre is outside)."""
    cx, cz = centre
    ang = [math.atan2(x - cx, z - cz) for x, z in loop]
    return sum(_wrap_angle(b - a) for a, b in zip(ang, ang[1:] + ang[:1]))


def contour_table(loop, centre):
    """Skin distance round a closed cross-section, from its top line.

    ``loop`` is the section as 2-D ``(x, z)`` points in order (either way
    round); ``centre`` a point inside it that sees all of it (the section is
    star-shaped about it, as an arm's is). The top line is where the ray from
    ``centre`` towards +z meets the loop. Returns ``(thetas, arcs, perimeter,
    points)``: the loop from the top line once round towards +x, with each
    point's angle about ``centre`` (0..2π) and the distance travelled to it."""
    cx, cz = centre
    ang = [math.atan2(x - cx, z - cz) for x, z in loop]
    n = len(loop)
    if sum(_wrap_angle(ang[(i + 1) % n] - ang[i]) for i in range(n)) < 0:
        loop, ang = loop[::-1], ang[::-1]
    start, best = None, None
    for i in range(n):
        a0, a1 = ang[i], ang[(i + 1) % n]
        if a0 <= 0 < a1 and a1 - a0 < math.pi:  # crosses the top ray going towards +x
            (x0, z0), (x1, z1) = loop[i], loop[(i + 1) % n]
            t = 0.0 if x1 == x0 else min(1.0, max(0.0, (cx - x0) / (x1 - x0)))
            top = (x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)
            if best is None or top[1] > best[1]:  # the outermost crossing
                start, best = i, top
    if start is None:
        raise ValueError('the section does not go round its centre')
    pts = [best] + [loop[(start + k) % n] for k in range(1, n + 1)] + [best]
    thetas, arcs = [0.0], [0.0]
    prev = turned = 0.0
    for p, q in zip(pts, pts[1:]):
        a = math.atan2(q[0] - cx, q[1] - cz)
        # Where the outline folds back (it turns the other way round the
        # centre for a while), the angle holds until it is passed again.
        turned += _wrap_angle(a - prev)
        thetas.append(max(thetas[-1], turned))
        arcs.append(arcs[-1] + math.dist(p, q))
        prev = a
    return thetas, arcs, arcs[-1], pts, centre


def arc_at(table, theta):
    """Signed skin distance from the top line to where the ray at angle
    ``theta`` (from +z towards +x) meets the section: positive on the +x
    side. The underside seam is half the perimeter round from the top line
    either way, so a design as wide as the arm fits without being cut early
    on the narrower side of a lopsided section."""
    thetas, arcs, perimeter, pts, (cx, cz) = table
    t = theta % (2 * math.pi)
    i = min(max(bisect.bisect_right(thetas, t), 1), len(thetas) - 1)
    (x0, z0), (x1, z1) = pts[i - 1], pts[i]
    ex, ez = x1 - x0, z1 - z0
    dx, dz = math.sin(t), math.cos(t)
    denom = ex * dz - ez * dx
    if abs(denom) > 1e-12:  # where the ray meets this side
        f = ((cx - x0) * dz - (cz - z0) * dx) / denom
    else:
        f = 0.0 if thetas[i] == thetas[i - 1] else (t - thetas[i - 1]) / (thetas[i] - thetas[i - 1])
    s = arcs[i - 1] + min(1.0, max(0.0, f)) * (arcs[i] - arcs[i - 1])
    return s if s <= perimeter / 2 else s - perimeter


def fit_line(xs, ys):
    """Least-squares ``(a, b)`` of y = a + b·x."""
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs)
    b = 0.0 if sxx == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my - b * mx, b


def arm_stations(points, tris, y_from, y_to, step, *, open_ends=False, axis_range=None):
    """Cross-sections across the arm (planes of constant y) every ``step`` cm.
    Where a plane cuts several loops (fingers), the longest is the arm; where
    it cuts none, the nearest section stands in. Each section's centre is its
    centroid, and its top line is the ray from there towards +z.

    With ``open_ends``, a plane that cuts only open pieces (above the armpit,
    where the arm's skin joins the torso) uses the longest piece, closed by a
    straight chord, about the nearest closed section's centre: arcs from the
    top line then follow the skin that is there. Its "perimeter" includes the
    chord, so it only moves the underside seam, far from the top line.

    With ``axis_range`` (lo, hi), every centre lies instead on one straight
    line, fitted to the centroids of the closed sections between lo and hi:
    the axis of a limb that is straight, so its top line is straight too
    where bulges (the armpit) would pull the centroids aside."""
    n = max(1, int(round((y_to - y_from) / step)))
    buckets = [[] for _ in range(n + 1)]
    for tri in tris:
        ys = [points[i][1] for i in tri]
        lo = math.floor((min(ys) - y_from) / step)
        hi = math.ceil((max(ys) - y_from) / step)
        for k in range(max(lo, 0), min(hi, n) + 1):
            buckets[k].append(tri)
    mains, pieces = {}, {}
    for k in range(n + 1):
        cuts = section_loops(points, buckets[k], 1, y_from + k * step)
        loops = [[(p[0], p[2]) for p in lp] for lp, closed in cuts if closed and len(lp) > 2]
        chains = [[(p[0], p[2]) for p in lp] for lp, closed in cuts if not closed and len(lp) > 2]
        if loops:
            mains[k] = max(loops, key=polygon_length)
        elif open_ends and chains:
            pieces[k] = max(chains, key=lambda c: polygon_length(c, closed=False))
    if not mains:
        raise ValueError('the mesh has no closed cross-section in that range')
    centroids = {k: polygon_centroid(loop)[1] for k, loop in mains.items()}
    axis = None
    if axis_range:
        ks = [k for k in mains if axis_range[0] <= y_from + k * step <= axis_range[1]]
        if len(ks) >= 2:
            ys = [y_from + k * step for k in ks]
            axis = [fit_line(ys, [centroids[k][c] for k in ks]) for c in (0, 1)]

    def centre_for(k):
        if axis is None:
            return centroids[min(mains, key=lambda j: abs(j - k))]
        y = y_from + k * step
        return tuple(a + b * y for a, b in axis)

    found = [None] * (n + 1)
    for k, loop in mains.items():
        centre = centre_for(k)
        if axis is not None and abs(winding(loop, centre)) < math.pi:
            centre = centroids[k]  # the axis misses this section: keep its own centre
        found[k] = {'y': y_from + k * step, 'centre': centre, 'table': contour_table(loop, centre)}
    for k, chain in pieces.items():
        centre = centre_for(k)
        if abs(winding(chain, centre)) < math.pi:  # doesn't go round the arm's axis
            continue
        found[k] = {'y': y_from + k * step, 'centre': centre,
                    'table': contour_table(chain, centre), 'open': True}
    have = sorted(mains)
    stations = [s or found[min(have, key=lambda j, k=k: abs(j - k))] for k, s in enumerate(found)]
    return {'from': y_from, 'step': step, 'list': stations}


def _bracket(stations, y):
    lst = stations['list']
    f = (y - stations['from']) / stations['step']
    j = min(max(math.floor(f), 0), len(lst) - 1)
    k = min(j + 1, len(lst) - 1)
    return lst[j], lst[k], min(1.0, max(0.0, f - j))


def centre_at(stations, y):
    a, b, t = _bracket(stations, y)
    return tuple(p + t * (q - p) for p, q in zip(a['centre'], b['centre']))


def perimeter_at(stations, y):
    a, b, t = _bracket(stations, y)
    pa, pb = a['table'][2], b['table'][2]
    return pa + t * (pb - pa)


def surface_coords(stations, p):
    """``(arc, perimeter)`` at a point on the arm: its signed skin distance
    round the arm from the top line, and the arm's circumference there,
    interpolated between the cross-sections either side of it."""
    x, y, z = p
    a, b, t = _bracket(stations, y)
    cx, cz = (u + t * (v - u) for u, v in zip(a['centre'], b['centre']))
    theta = math.atan2(x - cx, z - cz)
    pa, pb = a['table'][2], b['table'][2]
    arc_a, arc_b = arc_at(a['table'], theta), arc_at(b['table'], theta)
    if abs(arc_b - arc_a) > min(pa, pb) / 2:  # either side of the underside seam
        arc_b += pb if arc_b < arc_a else -pb
    arc, perimeter = arc_a + t * (arc_b - arc_a), pa + t * (pb - pa)
    if arc > perimeter / 2:
        arc -= perimeter
    elif arc <= -perimeter / 2:
        arc += perimeter
    return arc, perimeter


def widest_station(stations, lo, hi, *, narrowest=False):
    """y of the longest (or shortest) cross-section between ``lo`` and ``hi``."""
    inside = [s for s in stations['list'] if lo <= s['y'] <= hi]
    pick = min if narrowest else max
    return pick(inside, key=lambda s: s['table'][2])['y']


def scale_at(y, wrist, elbow):
    """Radial scale at ``y``: linear between the ``(y, scale)`` stations,
    level beyond them (the hand follows the wrist, the elbow end the elbow)."""
    (y_w, s_w), (y_e, s_e) = wrist, elbow
    if y <= y_w:
        return s_w
    if y >= y_e:
        return s_e
    return s_w + (s_e - s_w) * (y - y_w) / (y_e - y_w)


def unwrap_seam(arcs, perimeter):
    """A face's corner arcs, made continuous where it crosses the underside seam."""
    if max(arcs) - min(arcs) > perimeter / 2:
        return [a + perimeter if a < 0 else a for a in arcs]
    return list(arcs)


def design_uv_cm(arc_cm, y_cm, *, width_cm, height_cm, centre_cm, up='elbow'):
    """The design texture's UV at a point ``arc_cm`` round the arm from the
    top line and ``y_cm`` along it from the wrist: ``design_uv`` in skin cm."""
    return _oriented(arc_cm / width_cm, (y_cm - centre_cm) / height_cm, up)


def fit_and_map(points, tris, *, wrist, elbow, step, y_range=None, share=None, mapped=None,
                open_ends=False, axis_range=None):
    """Fit an arm mesh to measured circumferences, and find every vertex's
    place on the skin in cm.

    ``wrist`` and ``elbow`` are ``(y, circumference_cm)``: the narrow and the
    wide measurement (on the upper arm, just above the elbow and round the
    biceps). Either y may be a ``(lo, hi)`` range instead: the narrowest
    section in it for the wrist, the widest for the elbow, which is where a
    tape measure goes. Sections are scaled about their centres by a factor
    linear in y between the two, so both circumferences come out as measured
    while the mesh keeps its own shape between them. Past the elbow the
    factor stays level; past the wrist the hand is scaled as a whole (along
    the arm too) by the wrist's factor, so it keeps its proportions. Each
    vertex's arc round the arm is found before scaling and scales with it.

    Only ``tris`` (the arm's own triangles) are sliced into sections. When the
    mesh is a whole body, ``share`` (0..1 per point, the arm's bone weights)
    fades the fit out into the shoulder and leaves the torso as it is, and
    ``mapped`` says which points need an arc (the rest get None).
    ``open_ends`` and ``axis_range`` go to ``arm_stations``."""
    ys = [p[1] for p in points]
    lo, hi = y_range or (min(ys), max(ys))
    stations = arm_stations(points, tris, lo, hi, step, open_ends=open_ends,
                            axis_range=axis_range)
    y_w, cm_w = wrist
    y_e, cm_e = elbow
    if isinstance(y_w, tuple):
        y_w = widest_station(stations, *y_w, narrowest=True)
    if isinstance(y_e, tuple):
        y_e = widest_station(stations, *y_e)
    before = (perimeter_at(stations, y_w), perimeter_at(stations, y_e))
    scale = ((y_w, cm_w / before[0]), (y_e, cm_e / before[1]))
    wrist_centre = centre_at(stations, y_w)
    new, arcs, perimeters = [], [], []
    for i, (x, y, z) in enumerate(points):
        w = 1.0 if share is None else min(1.0, share[i])
        if mapped is None or mapped[i]:
            arc, perimeter = surface_coords(stations, (x, y, z))
        else:
            arc = perimeter = None
        if w <= 0.0:
            new.append((x, y, z))
            arcs.append(arc)
            perimeters.append(perimeter)
            continue
        s = scale_at(y, *scale)
        if w < 1.0:
            s = 1.0 + (s - 1.0) * w
        cx, cz = centre_at(stations, y) if y >= y_w else wrist_centre
        new.append((cx + s * (x - cx), y if y >= y_w else y_w + s * (y - y_w), cz + s * (z - cz)))
        arcs.append(None if arc is None else s * arc)
        perimeters.append(None if perimeter is None else s * perimeter)
    return {'points': new, 'arcs': arcs, 'perimeters': perimeters, 'scale': scale,
            'before_cm': before, 'stations': stations}


def fitted_circumference(fit, y):
    """The fitted arm's circumference at ``y``."""
    return perimeter_at(fit['stations'], y) * scale_at(y, *fit['scale'])


def read_makehuman(data_dir, sex=0.5, muscle=0.5, weight=0.5):
    """MakeHuman's base mesh with the macro targets for this build applied,
    its default skeleton and the skeleton's weights: ``(verts, groups,
    skeleton, weights, targets)``."""
    def read(*parts):
        return open(os.path.join(data_dir, *parts), encoding='utf-8')

    with read('3dobjs', 'base.obj') as fh:
        verts, groups = parse_obj(fh)
    wanted = sorted(macro_targets(sex, muscle, weight).items())
    targets = []
    for rel, w in wanted:
        with read('targets', *rel.split('/')) as fh:
            targets.append((w, parse_target(fh)))
    verts = apply_targets(verts, targets)
    with read('rigs', 'default.mhskel') as fh:
        skeleton = json.load(fh)
    with read('rigs', 'default_weights.mhw') as fh:
        weights = json.load(fh)['weights']
    return verts, groups, skeleton, weights, wanted


def joint_at(verts, skeleton, name):
    """A skeleton joint: the centre of its helper cube's vertices."""
    idx = skeleton['joints'][name]
    return tuple(sum(verts[i][c] for i in idx) / len(idx) for c in range(3))


def load_makehuman_forearm(data_dir, *, length_cm, side='inner', sex=0.5, muscle=0.5,
                           weight=0.5, past_elbow_cm=8.0):
    """MakeHuman's left forearm with its wrist and hand, posed by
    ``pose_forearm``, as a cage of points (cm) and faces (MakeHuman's own
    quads). Reads base.obj's ``body`` group only (no helper geometry), the
    macro targets for the build, and the default skeleton's joints and
    weights. Keeps every face of the forearm and hand, and of the upper arm up
    to ``past_elbow_cm`` beyond the elbow joint."""
    verts, groups, skeleton, weights, wanted = read_makehuman(data_dir, sex, muscle, weight)
    joints = {key: joint_at(verts, skeleton, name) for key, name in MH_JOINTS.items()}
    lower, arm = {}, {}
    for bone, pairs in weights.items():
        is_lower = is_lower_arm_bone(bone)
        if not (is_lower or bone in MH_UPPER_ARM_BONES):
            continue
        for i, w in pairs:
            arm[i] = arm.get(i, 0.0) + w
            if is_lower:
                lower[i] = lower.get(i, 0.0) + w
    faces = [f for f in groups['body'] if all(arm.get(i, 0.0) >= 0.5 for i in f)]
    used = sorted({i for f in faces for i in f})
    posed, info = pose_forearm([verts[i] for i in used],
                               [min(1.0, lower.get(i, 0.0)) for i in used],
                               joints, length_cm=length_cm, side=side)
    at = dict(zip(used, posed))
    faces = [f for f in faces if all(at[i][1] <= length_cm + past_elbow_cm for i in f)]
    keep = sorted({i for f in faces for i in f})
    index = {old: new for new, old in enumerate(keep)}
    info.update({'targets': {rel: round(w, 4) for rel, w in wanted},
                 'cage_vertices': len(keep), 'cage_faces': len(faces)})
    return [at[i] for i in keep], [tuple(index[i] for i in f) for f in faces], info


# The upper arm (--placement upper-arm --body makehuman): the whole body is
# kept, so the shoulder joins the torso as it really does and the camera's crop
# is the only edge. MakeHuman's rest pose is an A-pose (arms about 42° out from
# the sides, elbows bent about 43°); both arms are lowered to hang beside the
# body, which is how an outer upper arm is photographed.

#: How far out from the side the arms hang, and how bent the elbows stay. The
#: right arm, never in view, hangs straighter so its hand stays behind the
#: hips in the outer view.
MH_ARM_ABDUCTION_DEG = 12.0
MH_ELBOW_BEND_DEG = 20.0
MH_RIGHT_ELBOW_BEND_DEG = 5.0
#: Joints of each arm as named in rigs/default.mhskel ("{s}" is L or R).
MH_ARM_JOINTS = {'shoulder': 'upperarm01.{s}____head', 'elbow': 'lowerarm01.{s}____head',
                 'wrist': 'wrist.{s}____head'}


def pose_arm_down(points, arm, lower, joints, *, abduction_deg, elbow_bend_deg):
    """Lower one of MakeHuman's A-posed arms to hang beside the body.

    First the elbow is relaxed to ``elbow_bend_deg``: each vertex turns about
    the elbow by its ``lower`` share (the forearm and hand bones' weights) of
    the change. Then the arm is turned down about the shoulder joint, in the
    plane of the arm and the vertical, until the upper arm is
    ``abduction_deg`` from vertical: each vertex by its ``arm`` share (the
    upper arm, forearm and hand bones' weights), so the turn fades out across
    the shoulder into the torso, which stays put. Works for either arm.
    Returns ``(points, joints after posing, info)``."""
    sh, el, wr = joints['shoulder'], joints['elbow'], joints['wrist']
    ua = _normalised(_sub(el, sh))
    fa = _normalised(_sub(wr, el))
    bend = math.acos(max(-1.0, min(1.0, _dot(ua, fa))))
    out = list(points)
    relax = bend - math.radians(elbow_bend_deg)
    if bend > 1e-9 and relax:
        hinge = _normalised(_cross(fa, ua))
        out = [rotate_about(p, el, hinge, min(1.0, w) * relax) if w else p
               for p, w in zip(out, lower)]
        wr = rotate_about(wr, el, hinge, relax)
    down = (0.0, -1.0, 0.0)
    abduction = math.acos(max(-1.0, min(1.0, _dot(ua, down))))
    turn = abduction - math.radians(abduction_deg)
    if abduction > 1e-9 and turn:
        axis = _normalised(_cross(ua, down))
        out = [rotate_about(p, sh, axis, min(1.0, w) * turn) if w else p
               for p, w in zip(out, arm)]
        el, wr = rotate_about(el, sh, axis, turn), rotate_about(wr, sh, axis, turn)
    return out, {'shoulder': sh, 'elbow': el, 'wrist': wr}, {
        'rest_abduction_deg': math.degrees(abduction), 'rest_bend_deg': math.degrees(bend),
        'abduction_deg': abduction_deg, 'elbow_bend_deg': elbow_bend_deg}


def upper_arm_frame(shoulder, elbow, side):
    """``(origin, (x, y, z))`` axes laid on MakeHuman's left upper arm: the
    elbow joint at the origin, +y up the arm to the shoulder joint, +z out of
    the side that carries the design (``outer``: the outside of the arm, the
    body's +X; ``inner``: the front of the arm over the biceps, the body's +Z),
    and x = y × z, so the frame is a rotation of the body, never a mirror."""
    if side not in SIDES:
        raise ValueError(f'unknown side: {side!r}')
    y = _normalised(_sub(shoulder, elbow))
    ref = (1.0, 0.0, 0.0) if side == 'outer' else (0.0, 0.0, 1.0)
    z = _normalised(_sub(ref, _scaled(y, _dot(ref, y))))
    return elbow, (_cross(y, z), y, z)


def to_frame(points, origin, axes, k=1.0):
    """Points in a frame's coordinates, scaled by ``k``."""
    return [tuple(k * _dot(_sub(p, origin), axis) for axis in axes) for p in points]


def shoulder_top_y(points, share, lateral):
    """Height up the arm (y) of the top of the shoulder: where the outline,
    coming up the outside of the arm and over the shoulder, faces 45° up and
    out (the point furthest that way). Only points with ``share`` of at least
    half count, so the neck and head, though higher, don't."""
    n = _normalised((lateral[0], lateral[1] + 1.0, lateral[2]))
    best = max((p for p, w in zip(points, share) if w >= 0.5), key=lambda p: _dot(p, n))
    return best[1]


def load_makehuman_upper_arm(data_dir, *, length_cm, side='outer', sex=0.5, muscle=0.5,
                             weight=0.5, abduction_deg=MH_ARM_ABDUCTION_DEG,
                             elbow_bend_deg=MH_ELBOW_BEND_DEG):
    """MakeHuman's whole body (the ``body`` group), both arms lowered by
    ``pose_arm_down``, in cm in the left upper arm's frame
    (``upper_arm_frame``), scaled evenly so that the top of the shoulder
    (``shoulder_top_y``) is ``length_cm`` up the arm from the elbow joint.

    Returns ``(points, faces, shares, info)``. ``shares`` are per point, from
    the left arm's weights: ``arm`` (upper arm, forearm and hand), which the
    fit fades with, and ``upper`` (the upper arm alone), the skin the design
    may go on."""
    verts, groups, skeleton, weights, wanted = read_makehuman(data_dir, sex, muscle, weight)
    faces = groups['body']
    used = sorted({i for f in faces for i in f})
    index = {old: new for new, old in enumerate(used)}
    points = [verts[i] for i in used]
    info = {'targets': {rel: round(w, 4) for rel, w in wanted}}
    for s in ('R', 'L'):
        arm, lower, upper, top = ([0.0] * len(used) for _ in range(4))
        for bone, pairs in weights.items():
            is_lower = is_lower_arm_bone(bone, s)
            is_upper = bone in (f'upperarm01.{s}', f'upperarm02.{s}')
            is_shoulder = bone == f'shoulder01.{s}'
            if not (is_lower or is_upper or is_shoulder):
                continue
            for i, w in pairs:
                k = index.get(i)
                if k is None:
                    continue
                if is_lower or is_upper:
                    arm[k] += w
                lower[k] += w if is_lower else 0.0
                upper[k] += w if is_upper else 0.0
                top[k] += w if (is_upper or is_shoulder) else 0.0
        joints = {key: joint_at(verts, skeleton, name.format(s=s))
                  for key, name in MH_ARM_JOINTS.items()}
        points, posed, pose = pose_arm_down(
            points, arm, lower, joints, abduction_deg=abduction_deg,
            elbow_bend_deg=elbow_bend_deg if s == 'L' else MH_RIGHT_ELBOW_BEND_DEG)
    origin, axes = upper_arm_frame(posed['shoulder'], posed['elbow'], side)
    points = to_frame(points, origin, axes, DM)
    lateral = (0.0, 0.0, 1.0) if side == 'outer' else (1.0, 0.0, 0.0)
    top_y = shoulder_top_y(points, top, lateral)
    scale = length_cm / top_y
    points = [tuple(scale * c for c in p) for p in points]
    joint_cm = DM * math.dist(posed['shoulder'], posed['elbow'])
    info.update({
        'pose': {k: round(v, 1) for k, v in pose.items()},
        'shoulder_joint_cm': round(joint_cm * scale, 2),
        'rest_shoulder_top_cm': round(top_y, 2), 'scale': round(scale, 4),
        'cage_vertices': len(points), 'cage_faces': len(faces)})
    shares = {'arm': [min(1.0, w) for w in arm], 'upper': [min(1.0, w) for w in upper]}
    return points, [tuple(index[i] for i in f) for f in faces], shares, info


# --------------------------------------------------------------------------
# Arguments
# --------------------------------------------------------------------------

PLACEMENTS = ('upper-arm', 'forearm')
#: The forearm's views: (degrees round the arm from the design's line
#: towards +x, tilt along the arm towards the wrist).
VIEWS = ('top', 'three-quarter', 'side')
VIEW_ANGLES = {'top': (0.0, 0.0), 'three-quarter': (42.0, 28.0), 'side': (80.0, 6.0)}
#: The upper arm's views, named for where the camera stands: (degrees round
#: the arm from its outside towards the front, tilt along the arm towards
#: the elbow, so negative is a little from above). With the arm down, the
#: chest hides the inside of the arm, so no view looks from there.
UPPER_ARM_VIEW_ANGLES = {
    'outer': (0.0, 0.0),
    'front-three-quarter': (45.0, -10.0),
    'back-three-quarter': (-45.0, -10.0),
    'front': (90.0, 0.0),
}
#: Where each side's design line is, in the same degrees round the arm.
UPPER_ARM_SIDE_DEG = {'outer': 0.0, 'inner': 90.0}
#: A view of either placement: square on to the design, framed on it, so lines
#: finer than a pixel of the arm views (about 0.44 mm) read at their weight.
CLOSE_UP = 'close-up'
PLACEMENT_VIEWS = {'forearm': VIEWS + (CLOSE_UP,),
                   'upper-arm': tuple(UPPER_ARM_VIEW_ANGLES) + (CLOSE_UP,)}
DEFAULT_SIDE = {'forearm': 'inner', 'upper-arm': 'outer'}
DEFAULT_VIEWS = {
    ('forearm', 'inner'): VIEWS + (CLOSE_UP,), ('forearm', 'outer'): VIEWS + (CLOSE_UP,),
    ('upper-arm', 'outer'): ('outer', 'front-three-quarter', 'back-three-quarter', CLOSE_UP),
    ('upper-arm', 'inner'): ('front', 'front-three-quarter', CLOSE_UP),
}
#: Each placement's tape measurements, narrow end, wide end, then length,
#: with their defaults in cm.
MEASUREMENTS = {
    'forearm': (('wrist_cm', 17.0), ('elbow_cm', 26.0), ('length_cm', 25.0)),
    'upper-arm': (('above_elbow_cm', 26.0), ('biceps_cm', 30.0), ('upper_arm_length_cm', 32.0)),
}
#: Each placement's (+y end, -y end): y runs from the wrist (forearm) or the
#: elbow crease (upper arm) towards the body.
LIMB_ENDS = {'forearm': ('elbow', 'wrist'), 'upper-arm': ('shoulder', 'elbow')}


def limb_up(placement, end):
    """'+y' or '-y': the direction along the limb that ``end`` (the end the
    top of the image points to) lies in."""
    plus, minus = LIMB_ENDS[placement]
    if end == plus:
        return '+y'
    if end == minus:
        return '-y'
    raise ValueError(f'--design-up {end} is not an end of the {placement}')


def arm_profile(args):
    """(narrow circumference, wide circumference, length) in cm for the
    placement: wrist, below the elbow and wrist to elbow on the forearm; just
    above the elbow, round the biceps and the top of the shoulder to the
    elbow crease on the upper arm."""
    return tuple(getattr(args, name) for name, _ in MEASUREMENTS[args.placement])


def view_angles(placement, side, view):
    """(degrees round the arm from the design's line towards +x, tilt) of a
    view. On the upper arm a view is a place round the body, so it is the
    same place whichever side carries the design. The close-up faces the
    design line."""
    if view == CLOSE_UP:
        return 0.0, 0.0
    if placement == 'forearm':
        return VIEW_ANGLES[view]
    around, tilt = UPPER_ARM_VIEW_ANGLES[view]
    return UPPER_ARM_SIDE_DEG[side] - around, tilt


def _finite(text):
    """A float that is a real number: argparse's float takes 'nan' and 'inf'."""
    value = float(text)
    if not math.isfinite(value):
        raise argparse.ArgumentTypeError(f'must be a finite number, got {text}')
    return value


def _positive(kind):
    def check(text):
        value = _finite(text) if kind is float else kind(text)
        if value <= 0:
            raise argparse.ArgumentTypeError(f'must be positive, got {text}')
        return value
    return check


def _non_negative(text):
    value = _finite(text)
    if value < 0:
        raise argparse.ArgumentTypeError(f'must not be negative, got {text}')
    return value


def _unit(text):
    value = _finite(text)
    if not 0 < value <= 1:
        raise argparse.ArgumentTypeError(f'must be in (0, 1], got {text}')
    return value


def _fraction(text):
    value = _finite(text)
    if not 0 <= value <= 1:
        raise argparse.ArgumentTypeError(f'must be in [0, 1], got {text}')
    return value


LABEL_CHARS = frozenset('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-')


def _label(text):
    if not text or text[0] == '.' or not set(text) <= LABEL_CHARS:
        raise argparse.ArgumentTypeError(
            f'must be a plain file name (letters, digits, . _ -), got {text!r}')
    return text


def view_filename(view, label):
    """A view's PNG: ``outer.png``, or ``koi-12cm-outer.png`` with ``--label``,
    so renders of several sizes stay apart once they leave their folders."""
    return f'{label}-{view}.png' if label else f'{view}.png'


def params_filename(label):
    """``params.json``, or ``koi-12cm-params.json`` with ``--label``, so runs of
    several sizes can share one folder."""
    return f'{label}-params.json' if label else 'params.json'


def _views(text):
    views = [v.strip() for v in text.split(',') if v.strip()]
    if not views:
        raise argparse.ArgumentTypeError('name at least one view')
    return views


def _skin_rgb(text):
    try:
        return parse_skin_rgb(text)
    except ValueError as err:
        raise argparse.ArgumentTypeError(str(err)) from None


def _mh_sex(text):
    try:
        return parse_mh_sex(text)
    except ValueError as err:
        raise argparse.ArgumentTypeError(str(err)) from None


def _seed(text):
    if not text.strip().isdecimal():
        raise argparse.ArgumentTypeError(f'must be a whole number 0 or more, got {text}')
    return int(text)


def parse_args(argv):
    """Parse the arguments after ``--`` (Blender keeps everything before it)."""
    argv = list(argv)
    own = argv[argv.index('--') + 1:] if '--' in argv else argv
    p = argparse.ArgumentParser(
        prog='blender -b -P render-on-body.py --',
        description='Render a concept image on a 3D arm at true size.')
    p.add_argument('--image', required=True, help='design PNG/JPEG/WebP; white = no ink')
    p.add_argument('--width-cm', type=_positive(float), required=True,
                   help='printed width on the skin, measured around the curve')
    p.add_argument('--out', required=True, help='output directory (created if missing)')
    p.add_argument('--placement', choices=PLACEMENTS, default='upper-arm',
                   help='body part: the upper arm (default) or the forearm')
    p.add_argument('--body', choices=BODIES, default='parametric',
                   help='parametric: a smooth tapered tube; makehuman: MakeHuman\'s CC0 body '
                        '(needs --makehuman-data)')
    p.add_argument('--makehuman-data', metavar='DIR',
                   help='a MakeHuman checkout (or its makehuman/data folder), for --body makehuman')
    p.add_argument('--side', choices=SIDES, default=None,
                   help='which side carries the design: upper arm outer (default; the outside '
                        'of the arm) or inner (the front, over the biceps); forearm inner '
                        '(default; palm side) or outer (makehuman only)')
    p.add_argument('--mh-sex', type=_mh_sex, default=MH_SEX_RANDOM, metavar='{random,0..1}',
                   help='makehuman: random (default: a fully female or fully male body, even '
                        'odds, drawn from --seed), or a number from 0 female to 1 male '
                        '(MakeHuman\'s own default is 0.5)')
    p.add_argument('--seed', type=_seed, default=None,
                   help='makehuman: the seed for --mh-sex random; without one a fresh seed is '
                        'drawn, printed and recorded in params.json, so the body can be rendered '
                        'again')
    p.add_argument('--mh-muscle', type=_fraction, default=0.5, help='makehuman: muscle 0..1')
    p.add_argument('--mh-weight', type=_fraction, default=0.5, help='makehuman: weight 0..1')
    p.add_argument('--above-elbow-cm', type=_positive(float),
                   help='upper arm: circumference just above the elbow, an eighth of the way '
                        'up to the shoulder (default 26)')
    p.add_argument('--biceps-cm', type=_positive(float),
                   help='upper arm: circumference half-way between the top of the shoulder and '
                        'the elbow crease, round the biceps, arm relaxed (default 30)')
    p.add_argument('--upper-arm-length-cm', type=_positive(float),
                   help='upper arm: top of the shoulder to the elbow crease (default 32)')
    p.add_argument('--wrist-cm', type=_positive(float),
                   help='forearm: wrist circumference (default 17)')
    p.add_argument('--elbow-cm', type=_positive(float),
                   help='forearm: circumference just below the elbow (default 26)')
    p.add_argument('--length-cm', type=_positive(float),
                   help='forearm: wrist to elbow (default 25)')
    p.add_argument('--centre-cm', type=_finite, default=None,
                   help='design centre, measured from the elbow crease (upper arm) or the '
                        'wrist (forearm); default: half-way')
    p.add_argument('--design-up', choices=('shoulder', 'elbow', 'wrist'), default=None,
                   help='which end the top of the image points to (default: the end nearer '
                        'the body: shoulder on the upper arm, elbow on the forearm)')
    skin = p.add_mutually_exclusive_group()
    skin.add_argument('--skin-tone', choices=tuple(SKIN_TONES),
                      help=f'skin tone preset (default {DEFAULT_SKIN_TONE})')
    skin.add_argument('--skin-rgb', type=_skin_rgb, metavar='R,G,B',
                      help='exact skin colour, sRGB 0-255, e.g. 186,142,104')
    skin.add_argument('--skin', metavar='#RRGGBB', help='exact skin colour as hex sRGB')
    p.add_argument('--ink', choices=INKS, default='healed',
                   help='healed: settled under the skin (soft, cool black); fresh: crisp, just inked')
    p.add_argument('--ink-spread-mm', type=_non_negative, default=HEALED_SPREAD_MM,
                   help='healed ink only: how far lines have spread into the skin (Gaussian sigma)')
    p.add_argument('--ink-strength', type=_unit, default=0.92,
                   help='how dark solid black is: 1 = pure black; lower lets a little skin through')
    p.add_argument('--background', choices=BACKGROUNDS, default='auto',
                   help='the image\'s paper: light (dark ink on white), dark (light lines on '
                        'black, like Sable\'s concept cards: flipped before inking) or auto '
                        '(read from the border)')
    p.add_argument('--white-point', type=_unit, default=0.9,
                   help='sRGB level at or above which the image counts as bare skin (off-white paper)')
    p.add_argument('--samples', type=_positive(int), default=64)
    p.add_argument('--size', type=_positive(int), default=1024,
                   help='long edge in px; renders are 2:3 portrait like Sable cards')
    p.add_argument('--views', type=_views, default=None,
                   help='comma-separated views; upper arm: ' + ','.join(UPPER_ARM_VIEW_ANGLES)
                        + ' (default outer,front-three-quarter,back-three-quarter; with --side '
                          'inner front,front-three-quarter); forearm: '
                        + ','.join(VIEWS) + '; either: ' + CLOSE_UP
                        + ' (framed on the design; in every default)')
    p.add_argument('--label', type=_label, default=None,
                   help='prefix for the view files and params.json (koi-12cm gives '
                        'koi-12cm-outer.png and koi-12cm-params.json)')
    args = p.parse_args(own)
    place = args.placement
    if args.side is None:
        args.side = DEFAULT_SIDE[place]
    for placement, items in MEASUREMENTS.items():
        for name, default in items:
            if placement == place:
                if getattr(args, name) is None:
                    setattr(args, name, default)
            elif getattr(args, name) is not None:
                p.error(f'--{name.replace("_", "-")} is for --placement {placement}')
    if args.views is None:
        args.views = list(DEFAULT_VIEWS[place, args.side])
    bad = [v for v in args.views if v not in PLACEMENT_VIEWS[place]]
    if bad:
        p.error(f'--placement {place} views are {",".join(PLACEMENT_VIEWS[place])} '
                f'(not {",".join(bad)})')
    if args.design_up is None:
        args.design_up = LIMB_ENDS[place][0]
    elif args.design_up not in LIMB_ENDS[place]:
        p.error(f'--design-up for the {place} is {" or ".join(LIMB_ENDS[place])}')
    if args.skin is not None:
        try:
            args.skin_rgb = hex_to_srgb8(args.skin)
        except ValueError as err:
            p.error(str(err))
    elif args.skin_rgb is None:
        args.skin_tone = args.skin_tone or DEFAULT_SKIN_TONE
        args.skin_rgb = SKIN_TONES[args.skin_tone]
    if args.body == 'makehuman' and not args.makehuman_data:
        p.error('--body makehuman needs --makehuman-data '
                '(a MakeHuman checkout; see docs/BLENDER.md)')
    return args


#: How much of the hand the MakeHuman forearm's framing takes in, past the
#: wrist joint: the palm and the knuckles.
MH_HAND_FRAME_CM = 12.0
#: The MakeHuman upper arm's framing: this much forearm below the elbow joint
#: and this much above the top of the shoulder.
MH_FOREARM_FRAME_CM = 9.0
MH_SHOULDER_FRAME_CM = 4.0


def camera_frame(body, length_cm, placement='forearm'):
    """(centre, half-height) of what the camera frames along the arm, in cm
    from the wrist (the elbow crease on the upper arm). It depends only on the
    arm, so two designs on one arm compare like for like. The parametric arm
    is framed end to end; the MakeHuman forearm takes in the hand as well,
    and the MakeHuman upper arm a little forearm and the top of the
    shoulder."""
    if body == 'makehuman':
        if placement == 'upper-arm':
            lo, hi = -MH_FOREARM_FRAME_CM, length_cm + MH_SHOULDER_FRAME_CM
        else:
            lo, hi = -MH_HAND_FRAME_CM, length_cm + 1.5
        return (lo + hi) / 2, (hi - lo) / 2
    return length_cm / 2, length_cm / 2 + 1.5


def measured_warnings(measured, *, width_cm, height_cm, check_width=True, check_length=True):
    """Where the design as measured on the rendered arm (``measure_design``)
    is more than 2% off its size: most likely it runs off the skin it may go
    on (past the upper arm's skin into the armpit, say) and is cut off there.
    Skip a check when ``design_warnings`` has already explained it."""
    out = []
    if check_width:
        for name, spot in measured['width_round_arm'].items():
            got = spot['width_cm']
            if abs(got - width_cm) > 0.02 * width_cm:
                where = name.replace('_', ' ')
                out.append(f'the design measures {got:g} cm round the rendered arm at its '
                           f'{where}, not {width_cm:g} cm: part of it is cut off there')
    along = measured['length_along_arm_cm']
    if check_length and abs(along - height_cm) > 0.02 * height_cm:
        out.append(f'the design measures {along:g} cm along the rendered arm, not '
                   f'{height_cm:.2f} cm: part of it is cut off')
    return out


def design_warnings(placement, *, width_cm, lo, hi, length_cm, thinnest_cm, centre_cm_round):
    """What to know before trusting the render: the design is
    wider than the arm somewhere (clipped at the underside), wraps more than
    half way round (no one view shows all of it), or runs past the ends of
    the limb. ``lo``/``hi`` are its ends along the limb, in cm from its
    narrow end."""
    out = []
    if width_cm > thinnest_cm:
        out.append(f'design is {width_cm:g} cm wide but the arm is only {thinnest_cm:.1f} cm '
                   'round under part of it; the overlap is clipped at the underside')
    elif width_cm > centre_cm_round / 2:
        out.append(f'design wraps {360 * width_cm / centre_cm_round:.0f}° round the arm, more '
                   'than half way: no single view shows all of it')
    if lo < 0 or hi > length_cm:
        if placement == 'upper-arm':
            out.append(f'design runs from {lo:.1f} to {hi:.1f} cm above the elbow crease on a '
                       f'{length_cm:g} cm upper arm, past the elbow or the top of the shoulder')
        else:
            out.append(f'design runs from {lo:.1f} to {hi:.1f} cm along a {length_cm:g} cm '
                       'forearm, past the wrist or elbow')
    return out


# --------------------------------------------------------------------------
# Blender scene (only runs inside Blender)
# --------------------------------------------------------------------------

CM = 0.01  # Blender units are metres
RING_VERTS = 64
RING_STEP_CM = 0.5
EXTEND_CM = 8.0  # straight tube past each end so the ends stay out of frame
FOCAL_MM = 85.0
SENSOR_MM = 36.0
BACKDROP = '#0e0d0b'  # Sable's ink-black
BACKDROP_STRENGTH = 3.0  # AgX's toe crushes darks: 3 is what displays as #0e0d0b
#: The forearm's lights: (name, degrees round the arm from the design's line
#: towards +x, tilt towards the wrist, distance m, size m, watts, colour).
FOREARM_LIGHTS = (('Key', -50, 22, 0.9, 0.45, 16.0, (1.0, 0.95, 0.88)),
                  ('Fill', 60, -5, 1.2, 1.2, 3.0, (0.86, 0.92, 1.0)),
                  ('Rim', 125, -30, 0.8, 0.4, 5.0, (1.0, 0.95, 0.9)))
#: The upper arm's, placed round the body like its views (degrees from the
#: outside of the arm towards the front; negative tilt is from above): a warm
#: key from the front and above, a cool fill from behind, and a rim from
#: behind and above that edges the arm against the torso.
UPPER_ARM_LIGHTS = (('Key', 50, -25, 0.9, 0.7, 16.0, (1.0, 0.95, 0.88)),
                    ('Fill', -60, 5, 1.2, 1.2, 3.0, (0.86, 0.92, 1.0)),
                    ('Rim', -120, 10, 0.9, 0.8, 3.0, (1.0, 0.95, 0.9)))


def skin_params(args):
    """The skin as recorded in params.json."""
    rgb = args.skin_rgb
    sss = skin_subsurface(srgb8_to_linear(rgb))
    return {'tone': args.skin_tone or 'custom', 'srgb': list(rgb),
            'hex': '#{:02x}{:02x}{:02x}'.format(*rgb),
            'subsurface_radius': [round(c, 3) for c in sss['radius']],
            'flush': [round(c, 3) for c in sss['flush']]}


def _socket(sockets, name, kind=None):
    for s in sockets:
        if s.name == name and (kind is None or s.type == kind):
            return s
    raise KeyError(name)


def _first_socket(sockets, *names):
    for name in names:
        if name in sockets:
            return sockets[name]
    return None


def _mix(nodes, links, blend, a, b, factor=1.0, clamp=False):
    """Colour Mix node (ShaderNodeMix, Blender 3.4+). ``a``/``b`` are sockets or RGB."""
    node = nodes.new('ShaderNodeMix')
    node.data_type = 'RGBA'
    node.blend_type = blend
    node.clamp_result = clamp
    fac = _socket(node.inputs, 'Factor', 'VALUE')
    if isinstance(factor, (int, float)):
        fac.default_value = factor
    else:
        links.new(factor, fac)
    for name, value in (('A', a), ('B', b)):
        sock = _socket(node.inputs, name, 'RGBA')
        if isinstance(value, tuple):
            sock.default_value = (*value, 1.0)
        else:
            links.new(value, sock)
    return _socket(node.outputs, 'Result', 'RGBA')


#: The parametric upper arm's cross-section, width (front to back) over
#: thickness (outside to inside): flattened just above the elbow, where the
#: arm is widest across its epicondyles, and slightly deep round the biceps.
UPPER_ARM_ASPECTS = (0.92, 1.06)


def build_arm(bpy, args, height_cm, centre_cm, up):
    """The parametric arm: a tube from the narrow measurement at y = 0 to the
    wide one at y = length, slightly elliptical, its ends carried on straight
    out of frame."""
    narrow_cm, wide_cm, L = arm_profile(args)
    aspects = UPPER_ARM_ASPECTS if args.placement == 'upper-arm' else (WRIST_ASPECT, ELBOW_ASPECT)
    rings = []
    y = -EXTEND_CM
    while y <= L + EXTEND_CM + 1e-9:
        rings.append(y)
        y += RING_STEP_CM
    n = RING_VERTS
    verts, ring_info = [], []
    for y in rings:
        t = taper_t(y, L, args.placement)
        circ = circumference_at(t, narrow_cm, wide_cm)
        a, b = semi_axes_for(circ, aspect_at(t, *aspects))
        pts = ring_points(a, b, n)
        ring_info.append((circ, [arc for _, _, arc in pts]))
        verts.extend(((x * CM, y * CM, z * CM) for x, z, _ in pts))

    faces = []
    for r in range(len(rings) - 1):
        for k in range(n):
            k1 = (k + 1) % n
            # Outward normals: wind (ring r, k) → (r, k+1) → (r+1, k+1) → (r+1, k).
            faces.append((r * n + k, r * n + k1, (r + 1) * n + k1, (r + 1) * n + k))

    mesh = bpy.data.meshes.new('Forearm')
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    main = mesh.uv_layers.new(name='UVMap')
    design = mesh.uv_layers.new(name='Design')
    main_uv, design_uvs = [], []
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        idx = [mesh.loops[li].vertex_index for li in loops]
        arcs = [ring_info[v // n][1][v % n] for v in idx]
        circs = [ring_info[v // n][0] for v in idx]
        if max(arcs) - min(arcs) > max(circs) / 2:  # the face across the underside seam
            arcs = [arc - c if arc > 0 else arc for arc, c in zip(arcs, circs)]
        for v, arc, circ in zip(idx, arcs, circs):
            u_m = 0.5 + arc / circ
            v_m = rings[v // n] / L
            main_uv.extend((u_m, v_m))
            design_uvs.extend(design_uv(
                u_m, v_m, circumference_cm=circ, length_cm=L, width_cm=args.width_cm,
                height_cm=height_cm, centre_cm=centre_cm, up=up))
    main.data.foreach_set('uv', main_uv)
    design.data.foreach_set('uv', design_uvs)
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))

    obj = bpy.data.objects.new('Forearm', mesh)
    bpy.context.collection.objects.link(obj)
    sub = obj.modifiers.new('Subdivision', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 2
    sub.uv_smooth = 'PRESERVE_BOUNDARIES'
    return obj


#: The MakeHuman cage is subdivided twice (Catmull-Clark) and the result is
#: what's fitted, mapped, measured and rendered: no modifier at render time.
MH_SUBDIVISIONS = 2
MH_STATION_STEP_CM = 0.25
#: Where the tape measure goes, as fractions of wrist-to-elbow: the wrist
#: round its narrowest point, the forearm round its widest below the elbow.
MH_WRIST_RANGE = (0.0, 0.2)
MH_ELBOW_RANGE = (0.55, 0.85)


def subdivided_cage(bpy, cage, faces, name, shares=None):
    """MakeHuman's cage (points in cm, quads) smoothed by ``MH_SUBDIVISIONS``
    applied Catmull-Clark levels: ``(mesh, points in cm, triangles, shares)``.
    ``shares`` ({name: one value per cage point}) are carried through the
    subdivision as point attributes, interpolated like the points."""
    from array import array  # noqa: PLC0415

    cage_mesh = bpy.data.meshes.new(name + ' cage')
    cage_mesh.from_pydata([tuple(c * CM for c in p) for p in cage], [], faces)
    cage_mesh.update()
    for key, values in (shares or {}).items():
        attribute = cage_mesh.attributes.new(key, 'FLOAT', 'POINT')
        attribute.data.foreach_set('value', array('f', values))
    cage_obj = bpy.data.objects.new(name + ' cage', cage_mesh)
    bpy.context.collection.objects.link(cage_obj)
    sub = cage_obj.modifiers.new('Subdivision', 'SUBSURF')
    sub.levels = sub.render_levels = MH_SUBDIVISIONS
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(cage_obj.evaluated_get(depsgraph))
    mesh.name = name
    bpy.data.objects.remove(cage_obj)
    bpy.data.meshes.remove(cage_mesh)

    nv = len(mesh.vertices)
    co = array('f', bytes(12 * nv))
    mesh.vertices.foreach_get('co', co)
    points = [(co[i] / CM, co[i + 1] / CM, co[i + 2] / CM) for i in range(0, 3 * nv, 3)]
    mesh.calc_loop_triangles()
    nt = len(mesh.loop_triangles)
    tri_verts = array('i', bytes(12 * nt))
    mesh.loop_triangles.foreach_get('vertices', tri_verts)
    tris = [tuple(tri_verts[i:i + 3]) for i in range(0, 3 * nt, 3)]
    out = {}
    for key in shares or {}:
        values = array('f', bytes(4 * nv))
        mesh.attributes[key].data.foreach_get('value', values)
        mesh.attributes.remove(mesh.attributes[key])
        out[key] = values
    return mesh, points, tris, out


def build_makehuman_arm(bpy, args, width_cm, height_cm, centre_cm, up, *, sex):
    """MakeHuman's forearm and hand, fitted to the measurements, with the
    design mapped per vertex at true size (``fit_and_map``)."""
    from array import array  # noqa: PLC0415

    L = args.length_cm
    start = time.perf_counter()
    data = makehuman_data_dir(os.path.expanduser(args.makehuman_data))
    cage, faces, info = load_makehuman_forearm(
        data, length_cm=L, side=args.side, sex=sex, muscle=args.mh_muscle,
        weight=args.mh_weight, past_elbow_cm=EXTEND_CM)
    mesh, points, tris, _ = subdivided_cage(bpy, cage, faces, 'Forearm')
    nv, nl, npoly = len(mesh.vertices), len(mesh.loops), len(mesh.polygons)
    fit = fit_and_map(points, tris, step=MH_STATION_STEP_CM, y_range=(-3.0, L + EXTEND_CM - 2),
                      wrist=(tuple(f * L for f in MH_WRIST_RANGE), args.wrist_cm),
                      elbow=(tuple(f * L for f in MH_ELBOW_RANGE), args.elbow_cm))
    new = fit['points']
    mesh.vertices.foreach_set('co', array('f', [c * CM for p in new for c in p]))

    loop_verts = array('i', bytes(4 * nl))
    mesh.loops.foreach_get('vertex_index', loop_verts)
    starts, totals = array('i', bytes(4 * npoly)), array('i', bytes(4 * npoly))
    mesh.polygons.foreach_get('loop_start', starts)
    mesh.polygons.foreach_get('loop_total', totals)
    uv = array('f', bytes(8 * nl))
    arcs, perimeters = fit['arcs'], fit['perimeters']
    for first, total in zip(starts, totals):
        corners = loop_verts[first:first + total]
        corner_arcs = unwrap_seam([arcs[v] for v in corners], min(perimeters[v] for v in corners))
        for k, (v, arc) in enumerate(zip(corners, corner_arcs)):
            uv[2 * (first + k)], uv[2 * (first + k) + 1] = design_uv_cm(
                arc, new[v][1], width_cm=width_cm, height_cm=height_cm, centre_cm=centre_cm,
                up=up)
    mesh.uv_layers.new(name='Design').data.foreach_set('uv', uv)
    mesh.polygons.foreach_set('use_smooth', [True] * npoly)
    mesh.update()

    obj = bpy.data.objects.new('Forearm', mesh)
    bpy.context.collection.objects.link(obj)
    (y_w, s_w), (y_e, s_e) = fit['scale']
    info.update({
        'data': data, 'subdivisions': MH_SUBDIVISIONS, 'vertices': nv,
        'fit': {'wrist': {'at_cm_from_wrist': round(y_w, 2), 'target_cm': args.wrist_cm,
                          'makehuman_cm': round(fit['before_cm'][0], 2), 'scale': round(s_w, 4)},
                'elbow': {'at_cm_from_wrist': round(y_e, 2), 'target_cm': args.elbow_cm,
                          'makehuman_cm': round(fit['before_cm'][1], 2), 'scale': round(s_e, 4)}},
        'seconds': round(time.perf_counter() - start, 1),
    })
    print(f'[render-on-body] makehuman arm: {nv} vertices, fitted and mapped '
          f'({info["seconds"]}s)', flush=True)
    return obj, fit, info


#: Where the tape measure goes on the upper arm, as fractions of the way from
#: the elbow crease to the top of the shoulder: just above the elbow, and
#: half-way, round the biceps (the usual mid-upper-arm site). Fixed places,
#: not the narrowest and widest: MakeHuman's upper arm narrows all the way
#: down into the elbow and widens all the way up into the armpit.
MH_ABOVE_ELBOW_AT = ABOVE_ELBOW_AT
MH_BICEPS_AT = BICEPS_AT
#: The upper arm's straight axis is fitted to its sections' centres between
#: these fractions, clear of the elbow and of the armpit.
MH_AXIS_RANGE = (0.15, 0.55)
#: Design UV for skin the design may not go on (outside the image: bare skin).
NO_DESIGN_UV = (-1.0, -1.0)


def build_makehuman_upper_arm(bpy, args, width_cm, height_cm, centre_cm, up, *, sex):
    """MakeHuman's whole body with the arms lowered, its left upper arm
    fitted to the measurements, and the design mapped per vertex at true size
    onto the upper arm's skin only (``fit_and_map``). Returns ``(object, fit,
    info)``; ``info['fit']`` carries the circumferences measured on the
    rendered mesh."""
    from array import array  # noqa: PLC0415

    L = args.upper_arm_length_cm
    start = time.perf_counter()
    data = makehuman_data_dir(os.path.expanduser(args.makehuman_data))
    cage, faces, shares, info = load_makehuman_upper_arm(
        data, length_cm=L, side=args.side, sex=sex, muscle=args.mh_muscle,
        weight=args.mh_weight)
    mesh, points, tris, shares = subdivided_cage(bpy, cage, faces, 'Body', shares)
    arm, upper = shares['arm'], shares['upper']
    nv, nl, npoly = len(mesh.vertices), len(mesh.loops), len(mesh.polygons)
    loop_verts = array('i', bytes(4 * nl))
    mesh.loops.foreach_get('vertex_index', loop_verts)
    starts, totals = array('i', bytes(4 * npoly)), array('i', bytes(4 * npoly))
    mesh.polygons.foreach_get('loop_start', starts)
    mesh.polygons.foreach_get('loop_total', totals)
    # The arm's own triangles are what's sliced into sections; the design
    # goes only on faces of the upper arm (its bones' weights at least half).
    arm_tris = [t for t in tris if min(arm[i] for i in t) >= 0.5]
    on_upper = [min(upper[v] for v in loop_verts[first:first + total]) >= 0.5
                for first, total in zip(starts, totals)]
    mapped = bytearray(nv)
    for inside, first, total in zip(on_upper, starts, totals):
        if inside:
            for v in loop_verts[first:first + total]:
                mapped[v] = 1
    fit = fit_and_map(points, arm_tris, step=MH_STATION_STEP_CM, y_range=(-3.0, L),
                      wrist=(MH_ABOVE_ELBOW_AT * L, args.above_elbow_cm),
                      elbow=(MH_BICEPS_AT * L, args.biceps_cm),
                      share=arm, mapped=mapped, open_ends=True,
                      axis_range=tuple(f * L for f in MH_AXIS_RANGE))
    new = fit['points']
    mesh.vertices.foreach_set('co', array('f', [c * CM for p in new for c in p]))

    uv = array('f', NO_DESIGN_UV) * nl
    arcs, perimeters = fit['arcs'], fit['perimeters']
    for inside, first, total in zip(on_upper, starts, totals):
        if not inside:
            continue
        corners = loop_verts[first:first + total]
        corner_arcs = unwrap_seam([arcs[v] for v in corners], min(perimeters[v] for v in corners))
        for k, (v, arc) in enumerate(zip(corners, corner_arcs)):
            uv[2 * (first + k)], uv[2 * (first + k) + 1] = design_uv_cm(
                arc, new[v][1], width_cm=width_cm, height_cm=height_cm, centre_cm=centre_cm,
                up=up)
    mesh.uv_layers.new(name='Design').data.foreach_set('uv', uv)
    mesh.polygons.foreach_set('use_smooth', [True] * npoly)
    mesh.update()

    obj = bpy.data.objects.new('Body', mesh)
    bpy.context.collection.objects.link(obj)
    upper_ys = [new[v][1] for v in range(nv) if mapped[v]]
    stations = {}
    for name, (y, s), target, before in zip(
            ('above_elbow', 'biceps'), fit['scale'], (args.above_elbow_cm, args.biceps_cm),
            fit['before_cm']):
        stations[name] = {
            'at_cm_from_elbow': round(y, 2), 'target_cm': target,
            'makehuman_cm': round(before, 2), 'scale': round(s, 4),
            'measured_cm': round(longest_loop_length(new, arm_tris, 1, y), 2)}
    info.update({
        'data': data, 'subdivisions': MH_SUBDIVISIONS, 'vertices': nv,
        'upper_arm_skin_cm': [round(min(upper_ys), 1), round(max(upper_ys), 1)],
        'fit': stations, 'seconds': round(time.perf_counter() - start, 1),
    })
    print(f'[render-on-body] makehuman upper arm: {nv} vertices, fitted and mapped '
          f'({info["seconds"]}s)', flush=True)
    return obj, fit, info


#: Healed ink: pigment settles unevenly, so about half the ink is lifted
#: towards bare skin in sub-millimetre patches, typically by up to this much;
#: and the skin's soft sheen shows over the ink.
HEALED_PATCHINESS = 0.10
HEALED_SHEEN = 0.25


def healed_ink_image(bpy, image, args, width_cm):
    """The design as a healed-ink transmittance texture (linear, Non-Color):
    levels as the fresh shader, a Gaussian spread of ``--ink-spread-mm`` of skin
    at this print size, then colour fade and density loss. Large images are
    prepared at ``HEALED_MAX_PX``."""
    from array import array  # noqa: PLC0415

    w, h = fit_within(*image.size, HEALED_MAX_PX)
    n = w * h
    src = array('f', bytes(16 * n))
    if (w, h) == tuple(image.size):
        image.pixels.foreach_get(src)
    else:
        smaller = image.copy()
        smaller.scale(w, h)
        smaller.pixels.foreach_get(src)
        bpy.data.images.remove(smaller)
    planes = ink_planes(src, args.white_point)
    sigma = spread_sigma_px(args.ink_spread_mm, px_per_cm(w, width_cm))
    kernel = gaussian_kernel(sigma)
    planes = heal_planes(*(blur_plane(p, w, h, kernel) for p in planes))
    planes = [skin_rim(p, w, h) for p in planes]
    out = array('f', bytes(16 * n))
    for ch, plane in enumerate(planes):
        out[ch::4] = array('f', plane)
    out[3::4] = array('f', [1.0]) * n
    healed = bpy.data.images.new('Healed ink', w, h, alpha=True, float_buffer=True)
    healed.colorspace_settings.name = 'Non-Color'
    healed.pixels.foreach_set(out)
    healed.update()
    return healed, sigma


def _vector_math(nodes, links, operation, a, b):
    """Per-channel maths on colours. ``a``/``b`` are sockets or RGB tuples."""
    node = nodes.new('ShaderNodeVectorMath')
    node.operation = operation
    for sock, value in zip(node.inputs, (a, b)):
        if isinstance(value, tuple):
            sock.default_value = value
        else:
            links.new(value, sock)
    return node.outputs['Vector']


def skin_material(bpy, args, image, healed_image=None):
    mat = bpy.data.materials.new('Skin with ink')
    if mat.node_tree is None:  # Blender < 5 (use_nodes is deprecated from 5.0)
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    # Design: Design UV → image. Nothing outside it: the fresh image is clipped
    # (transparent), the healed texture extends its bare-skin rim.
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'Design'
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image if healed_image is None else healed_image
    tex.extension = 'CLIP' if healed_image is None else 'EXTEND'
    tex.interpolation = 'Cubic'
    links.new(uv.outputs['UV'], tex.inputs['Vector'])
    if healed_image is None:
        # Fresh: levels in the shader (the white point is chosen on screen values).
        wp = srgb_to_linear(args.white_point)
        design = _mix(nodes, links, 'DIVIDE', tex.outputs['Color'], (wp, wp, wp), clamp=True)
    else:
        design = tex.outputs['Color']  # already levelled, spread and faded
    # Transparent pixels (and everything outside the clipped image) are bare skin.
    ink = _mix(nodes, links, 'MIX', (1.0, 1.0, 1.0), design, factor=tex.outputs['Alpha'])

    # Skin: base tone, gentle mottling, faint blotchy redness, fine pore bump.
    # Noise scales are per metre (object space): 18 ≈ 5 cm patches, 450 ≈ 2 mm.
    coords = nodes.new('ShaderNodeTexCoord')

    def noise(scale, detail, lo, hi):
        tex_n = nodes.new('ShaderNodeTexNoise')
        tex_n.inputs['Scale'].default_value = scale
        tex_n.inputs['Detail'].default_value = detail
        links.new(coords.outputs['Object'], tex_n.inputs['Vector'])
        rng = nodes.new('ShaderNodeMapRange')
        rng.inputs['To Min'].default_value = lo
        rng.inputs['To Max'].default_value = hi
        links.new(tex_n.outputs['Fac'], rng.inputs['Value'])
        return rng.outputs['Result']

    tone = srgb8_to_linear(args.skin_rgb)
    subsurface = skin_subsurface(tone)
    flushed = tuple(c * f for c, f in zip(tone, subsurface['flush']))
    skin = _mix(nodes, links, 'MIX', tone, flushed, factor=noise(14.0, 2.0, -0.4, 0.7))
    skin = _mix(nodes, links, 'MULTIPLY', skin, (1.0, 1.0, 1.0))
    links.new(noise(18.0, 3.0, 0.9, 1.06), _socket(skin.node.inputs, 'B', 'RGBA'))

    if healed_image is None:
        # Fresh: the design multiplied straight onto the skin.
        inked = _mix(nodes, links, 'MULTIPLY', skin, ink, factor=args.ink_strength)
    else:
        # Healed: pigment settles a little unevenly, and what lies under solid
        # ink is a cool healed black, not darkened skin. Per channel:
        # skin·T + floor·(1 − T), with T the ink's transmittance.
        ink = _mix(nodes, links, 'MIX', ink, (1.0, 1.0, 1.0),
                   factor=noise(1800.0, 3.0, -2 * HEALED_PATCHINESS, 2 * HEALED_PATCHINESS))
        floor = healed_ink_floor(tone, args.ink_strength)
        covered = _vector_math(nodes, links, 'SUBTRACT', (1.0, 1.0, 1.0), ink)
        inked = _vector_math(nodes, links, 'ADD',
                             _vector_math(nodes, links, 'MULTIPLY', skin, ink),
                             _vector_math(nodes, links, 'MULTIPLY', floor, covered))
        sheen = _first_socket(bsdf.inputs, 'Sheen Weight', 'Sheen')  # 4.x+, 3.x
        if sheen is not None:  # a soft microfibre glow that lies over ink and skin alike
            sheen.default_value = HEALED_SHEEN
    links.new(inked, bsdf.inputs['Base Color'])

    pores = nodes.new('ShaderNodeTexNoise')
    pores.inputs['Scale'].default_value = 450.0
    pores.inputs['Detail'].default_value = 3.0
    links.new(coords.outputs['Object'], pores.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35
    bump.inputs['Distance'].default_value = 0.0003
    links.new(pores.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    bsdf.inputs['Roughness'].default_value = 0.48
    sss = _first_socket(bsdf.inputs, 'Subsurface Weight', 'Subsurface')  # 4.x, 3.x
    sss.default_value = 0.35 if sss.name == 'Subsurface Weight' else 0.08
    bsdf.inputs['Subsurface Radius'].default_value = subsurface['radius']
    scale = _first_socket(bsdf.inputs, 'Subsurface Scale')
    if scale is not None:
        scale.default_value = 0.003  # metres: a few mm of light bleed in red
    if 'Subsurface Color' in bsdf.inputs:  # 3.x takes the SSS tint separately
        links.new(inked, bsdf.inputs['Subsurface Color'])
    spec = _first_socket(bsdf.inputs, 'Specular IOR Level', 'Specular')
    spec.default_value = 0.45
    for method in ('RANDOM_WALK_SKIN', 'RANDOM_WALK'):
        try:
            bsdf.subsurface_method = method
            break
        except TypeError:
            continue
    return mat


def design_triangles(bpy, obj):
    """The arm as rendered (render-level subdivision), as ``measure_design``
    triangles: corners of ((x, y, z) in cm, design UV)."""
    from array import array  # noqa: PLC0415

    sub = obj.modifiers.get('Subdivision')
    viewport_levels = sub.levels if sub else None
    if sub:
        sub.levels = sub.render_levels
    try:
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            nv, nt, nl = len(mesh.vertices), len(mesh.loop_triangles), len(mesh.loops)
            co = array('f', bytes(12 * nv))
            mesh.vertices.foreach_get('co', co)
            tri_verts = array('i', bytes(12 * nt))
            mesh.loop_triangles.foreach_get('vertices', tri_verts)
            tri_loops = array('i', bytes(12 * nt))
            mesh.loop_triangles.foreach_get('loops', tri_loops)
            uv = array('f', bytes(8 * nl))
            mesh.uv_layers['Design'].data.foreach_get('uv', uv)
        finally:
            evaluated.to_mesh_clear()
    finally:
        if sub:
            sub.levels = viewport_levels
    pts = [(co[i] / CM, co[i + 1] / CM, co[i + 2] / CM) for i in range(0, 3 * nv, 3)]
    uvs = [(uv[i], uv[i + 1]) for i in range(0, 2 * nl, 2)]
    out = []
    for i in range(0, 3 * nt, 3):
        tri = tuple((pts[tri_verts[i + c]], uvs[tri_loops[i + c]]) for c in range(3))
        if any(corner_uv != NO_DESIGN_UV for _, corner_uv in tri):  # skin the design can't reach
            out.append(tri)
    return out


def _look_at(Matrix, Vector, eye, target, up=(0.0, 1.0, 0.0)):
    """Camera/light rotation looking from ``eye`` at ``target``, with the image's
    up direction as close to ``up`` (the arm's axis, towards the elbow) as possible."""
    f = (Vector(target) - Vector(eye)).normalized()
    u = Vector(up)
    r = f.cross(u)
    if r.length < 1e-6:
        r = f.cross(Vector((0.0, 0.0, 1.0)))
    r.normalize()
    u = r.cross(f)
    return Matrix((r, u, -f)).transposed().to_euler()


def _direction(around_deg, tilt_deg):
    th, ph = math.radians(around_deg), math.radians(tilt_deg)
    return (math.sin(th) * math.cos(ph), -math.sin(ph), math.cos(th) * math.cos(ph))


def add_light(bpy, Matrix, Vector, name, target, around, tilt, dist, size, watts, colour):
    light = bpy.data.lights.new(name, 'AREA')
    light.shape = 'DISK'
    light.size = size
    light.energy = watts
    light.color = colour
    obj = bpy.data.objects.new(name, light)
    d = _direction(around, tilt)
    obj.location = tuple(t + dist * c for t, c in zip(target, d))
    obj.rotation_euler = _look_at(Matrix, Vector, obj.location, target)
    bpy.context.collection.objects.link(obj)
    return obj


def configure_render(bpy, args):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    cyc = scene.cycles
    cyc.device = 'CPU'
    cyc.samples = args.samples
    cyc.use_adaptive_sampling = True
    cyc.max_bounces = 4  # one convex limb on a void: little light bounces back
    cyc.diffuse_bounces = 2
    cyc.glossy_bounces = 1
    cyc.transmission_bounces = 0
    cyc.volume_bounces = 0
    cyc.transparent_max_bounces = 2
    denoiser = None
    try:
        import _cycles  # noqa: PLC0415 (Blender-only module)
        has_oidn = bool(getattr(_cycles, 'with_openimagedenoise', False))
    except ImportError:
        has_oidn = False
    if has_oidn:
        cyc.use_denoising = True
        cyc.denoiser = 'OPENIMAGEDENOISE'
        cyc.adaptive_threshold = 0.02  # the denoiser cleans up what's left
        denoiser = 'OpenImageDenoise'
    else:
        cyc.use_denoising = False
    scene.render.resolution_x = round(args.size * 2 / 3)
    scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    view = scene.view_settings
    for transform, look in (('AgX', 'AgX - Medium High Contrast'), ('AgX', 'Medium High Contrast'),
                            ('Filmic', 'Medium High Contrast')):
        try:
            view.view_transform = transform
            view.look = look
            break
        except TypeError:
            continue
    world = bpy.data.worlds.new('Backdrop')
    if world.node_tree is None:  # Blender < 5
        world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (*srgb_hex_to_linear(BACKDROP), 1.0)
    background.inputs['Strength'].default_value = BACKDROP_STRENGTH
    scene.world = world
    return denoiser, f'{view.view_transform} / {view.look}'


def _remove_quietly(path):
    try:
        os.remove(path)
    except OSError:
        pass


def flip_image_for_background(image, background):
    """Flip a dark-background image in place (see ``flip_for_background``) so
    that both ink paths read dark ink on light paper. True when flipped."""
    from array import array  # noqa: PLC0415

    w, h = image.size
    pixels = array('f', bytes(16 * w * h))
    image.pixels.foreach_get(pixels)
    if not flip_for_background(background, pixels, w, h):
        return False
    image.pixels.foreach_set(array('f', invert_lightness(pixels)))
    # Save the flip and point the image at it: Image.copy() (the healed path's
    # downscale) re-reads the file and would drop an in-memory edit.
    fd, path = tempfile.mkstemp(prefix='sable-flipped-', suffix='.png')
    os.close(fd)
    atexit.register(_remove_quietly, path)
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    image.reload()
    print('[render-on-body] dark background: lightness flipped so the light lines are the ink'
          + (' (--background light keeps it as it is)' if background == 'auto' else ''),
          flush=True)
    return True


def main(argv=None):
    import bpy  # noqa: PLC0415 (only inside Blender)
    from mathutils import Matrix, Vector  # noqa: PLC0415

    args = parse_args(sys.argv if argv is None else argv)
    image_path = os.path.abspath(args.image)
    if not os.path.isfile(image_path):
        raise SystemExit(f'no such image: {image_path}')
    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    image = bpy.data.images.load(image_path, check_existing=False)
    image.colorspace_settings.name = 'sRGB'
    image.alpha_mode = 'STRAIGHT'
    px_w, px_h = image.size
    if not px_w or not px_h:
        raise SystemExit(f'could not read image: {image_path}')
    flipped = flip_image_for_background(image, args.background)

    narrow_cm, wide_cm, L = arm_profile(args)
    upper_arm = args.placement == 'upper-arm'
    up = limb_up(args.placement, args.design_up)
    width_cm, height_cm = design_size_cm(args.width_cm, px_w, px_h)
    centre_cm = L / 2 if args.centre_cm is None else args.centre_cm
    lo, hi = centre_cm - height_cm / 2, centre_cm + height_cm / 2
    arm = body = None
    if args.body == 'makehuman':
        # One body per run: every view below renders this same mesh.
        sex = sex_for_run(args.mh_sex, args.seed)
        how = (f'drawn at random with --seed {sex["seed"]}; pass it to render this body again'
               if sex['sex_random'] else '--mh-sex')
        print(f'[render-on-body] body: {sex_label(sex["sex"])} ({how})', flush=True)
        build = build_makehuman_upper_arm if upper_arm else build_makehuman_arm
        arm, fit, body = build(bpy, args, width_cm, height_cm, centre_cm, up, sex=sex['sex'])
        centre_circ = fitted_circumference(fit, centre_cm)
        thinnest = min(fitted_circumference(fit, lo + (hi - lo) * k / 64) for k in range(65))
    else:
        centre_circ = circumference_at(taper_t(centre_cm, L, args.placement), narrow_cm, wide_cm)
        # the taper only grows
        thinnest = circumference_at(taper_t(lo, L, args.placement), narrow_cm, wide_cm)
    warnings = design_warnings(args.placement, width_cm=width_cm, lo=lo, hi=hi, length_cm=L,
                               thinnest_cm=thinnest, centre_cm_round=centre_circ)

    ink = {'mode': args.ink, 'strength': args.ink_strength}
    healed_image = None
    if args.ink == 'healed':
        start = time.perf_counter()
        healed_image, sigma_px = healed_ink_image(bpy, image, args, width_cm)
        floor = healed_ink_floor(srgb8_to_linear(args.skin_rgb), args.ink_strength)
        ink.update({
            'texture_px': list(healed_image.size),
            'spread_mm': args.ink_spread_mm, 'spread_px': round(sigma_px, 2),
            'blurred': len(gaussian_kernel(sigma_px)) > 1,
            'density_loss': HEALED_DENSITY_LOSS, 'desaturate': HEALED_DESATURATE,
            'patchiness': HEALED_PATCHINESS, 'sheen': HEALED_SHEEN,
            'solid_black_linear': [round(c, 4) for c in floor],
            'prepare_seconds': round(time.perf_counter() - start, 1),
        })
        print(f'[render-on-body] healed ink: {sigma_px:.2f} px spread '
              f'({ink["prepare_seconds"]}s)', flush=True)

    # No ground plane: a shadow catcher doubled the render time for a shadow
    # that barely registers on near-black.
    if arm is None:
        arm = build_arm(bpy, args, height_cm, centre_cm, up)
    arm.data.materials.append(skin_material(bpy, args, image, healed_image))

    start = time.perf_counter()
    triangles = design_triangles(bpy, arm)
    measured = measure_design(triangles, height_cm=height_cm, centre_cm=centre_cm,
                              placement=args.placement)
    measured['seconds'] = round(time.perf_counter() - start, 1)
    if body is not None and not upper_arm:  # the fitted circumferences, measured as rendered
        for station in body['fit'].values():
            whole, _, _ = measure_slice(triangles, 1, station['at_cm_from_wrist'], {})
            station['measured_cm'] = round(whole, 2)
    warnings += measured_warnings(measured, width_cm=width_cm, height_cm=height_cm,
                                  check_width=width_cm <= thinnest,
                                  check_length=0 <= lo and hi <= L)

    frame_centre, frame_half = camera_frame(args.body, L, args.placement)
    target = (0.0, frame_centre * CM, 0.0)  # on the arm's axis
    half_extent = frame_half * CM
    dist = frame_distance(half_extent, FOCAL_MM, SENSOR_MM)
    for name, around, tilt, *rest in UPPER_ARM_LIGHTS if upper_arm else FOREARM_LIGHTS:
        if upper_arm:
            around = UPPER_ARM_SIDE_DEG[args.side] - around
        add_light(bpy, Matrix, Vector, name, target, around, tilt, *rest)

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = FOCAL_MM
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.sensor_height = SENSOR_MM
    cam_data.clip_start = 0.05
    cam = bpy.data.objects.new('Camera', cam_data)
    bpy.context.collection.objects.link(cam)
    scene = bpy.context.scene
    scene.camera = cam
    denoiser, colour = configure_render(bpy, args)

    views = {}
    close_half = close_up_half_height(width_cm, height_cm, centre_circ)
    close_target = (0.0, centre_cm * CM, 0.0)  # the design's centre, on the axis
    close_dist = close_up_distance(close_half * CM, centre_circ * CM, FOCAL_MM, SENSOR_MM)
    for view in args.views:
        around, tilt = view_angles(args.placement, args.side, view)
        d = _direction(around, tilt)
        at, away = (close_target, close_dist) if view == CLOSE_UP else (target, dist)
        cam.location = tuple(t + away * c for t, c in zip(at, d))
        cam.rotation_euler = _look_at(Matrix, Vector, cam.location, at)
        path = os.path.join(out_dir, view_filename(view, args.label))
        scene.render.filepath = path
        start = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        seconds = round(time.perf_counter() - start, 1)
        views[view] = {'file': os.path.basename(path), 'seconds': seconds}
        print(f'[render-on-body] {view}: {path} ({seconds}s)', flush=True)

    params = {
        'issue': 192,
        'image': image_path,
        'image_px': [px_w, px_h],
        'design_cm': {'width': width_cm, 'height': round(height_cm, 2),
                      ('centre_from_elbow_crease' if upper_arm else 'centre_from_wrist'): centre_cm,
                      'up': args.design_up},
        'placement': args.placement,
        'side': args.side,
        'body': args.body,
        'arm_cm': {name[:-3]: value for (name, _), value in
                   zip(MEASUREMENTS[args.placement], (narrow_cm, wide_cm, L))},
        'at_design_centre': {
            'circumference_cm': round(centre_circ, 2),
            'u_span': round(uv_span_for_width(width_cm, centre_circ), 4),
            'wraps_degrees': round(360 * uv_span_for_width(width_cm, centre_circ), 1),
        },
        'measured_cm': measured,
        'skin': skin_params(args),
        'ink': ink,
        'ink_strength': args.ink_strength,
        'white_point': args.white_point,
        'background': {'setting': args.background, 'flipped': flipped},
        'render': {
            'blender': bpy.app.version_string, 'engine': 'CYCLES', 'device': 'CPU',
            'samples': args.samples, 'denoiser': denoiser, 'colour': colour,
            'resolution': [scene.render.resolution_x, scene.render.resolution_y],
            'lens_mm': FOCAL_MM, 'camera_distance_cm': round(dist / CM, 1),
            'close_up_frame_cm': round(2 * close_half, 1),
        },
        'views': views,
        'warnings': warnings,
    }
    if body is not None and upper_arm:
        params['makehuman'] = {
            'build': {**sex, 'muscle': args.mh_muscle, 'weight': args.mh_weight,
                      'age_years': 25, 'targets': body.pop('targets')},
            **body,
        }
    elif body is not None:
        params['makehuman'] = {
            'side': args.side,
            'build': {**sex, 'muscle': args.mh_muscle, 'weight': args.mh_weight,
                      'age_years': 25, 'targets': body.pop('targets')},
            'pose': {'elbow_straightened_deg': round(body.pop('bend_deg'), 1),
                     'supinated_deg': round(abs(body.pop('twist_deg')), 1),
                     'rest_forearm_cm': round(body.pop('forearm_cm'), 2),
                     'scale': round(body.pop('scale'), 4)},
            **body,
        }
    with open(os.path.join(out_dir, params_filename(args.label)), 'w', encoding='utf-8') as fh:
        json.dump(params, fh, indent=2)
        fh.write('\n')
    for w in warnings:
        print(f'[render-on-body] warning: {w}', flush=True)


if __name__ == '__main__':
    main()
