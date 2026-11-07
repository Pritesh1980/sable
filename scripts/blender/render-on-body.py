"""Render a Sable concept image onto a 3D forearm at true size (#192).

Run headless with Blender (Sable itself never calls Blender):

    blender -b -P scripts/blender/render-on-body.py -- \
        --image concept.png --width-cm 12 --out renders/

Builds a forearm, wraps the design onto the top of it at a true printed width
(``--width-cm`` of skin, measured around the curve), lights it softly against a
near-black backdrop and renders three angles plus a ``params.json``. The arm is
a tapered, slightly elliptical tube by default (``--body parametric``), or
MakeHuman's CC0 forearm with its wrist and hand (``--body makehuman
--makehuman-data DIR``), fitted to the same measurements and mapped per vertex.
The ink looks healed by default (``--ink healed``: spread a
fraction of a millimetre, a cool settled black under the skin); ``--ink fresh``
is the crisp just-inked look. ``params.json`` records the design's size as
measured on the rendered mesh. Everything after ``--`` is this script's own
arguments; see ``--help`` (``blender -b -P render-on-body.py -- --help``) and
docs/BLENDER.md.

The maths at the top of this file is plain Python so it can be unit tested
without Blender: ``python3 -m unittest discover -s scripts/blender``.
"""

import argparse
import bisect
import json
import math
import os
import sys
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


def aspect_at(t):
    """Cross-section width/thickness ratio along the arm."""
    return WRIST_ASPECT + (ELBOW_ASPECT - WRIST_ASPECT) * ease_profile(t)


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
    ``up`` is which end of the arm the top of the image points to."""
    du = (u_main - 0.5) * circumference_cm / width_cm
    dv = (v_main * length_cm - centre_cm) / height_cm
    if up == 'elbow':
        return 0.5 + du, 0.5 + dv
    if up == 'wrist':  # rotate 180°, never mirror
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


def frame_distance(half_extent, focal_mm, sensor_mm):
    """Distance at which a lens shows ``half_extent`` either side of centre."""
    return half_extent * focal_mm / (sensor_mm / 2)


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


def measure_design(tris, *, height_cm, centre_cm):
    """How much skin the design covers on the arm as rendered.

    ``tris`` are ``((x, y, z) in cm, (u, v) design UV)`` corners, with the arm
    along +Y from the wrist and its top line at x = 0, z > 0. The width round
    the arm is sliced across the arm near the design's wrist end, middle and
    elbow end; the length is the design's extent along the arm on the top line
    (u is out of range on the underside, so that line drops out)."""
    widths = {}
    for name, f in (('wrist_end', -0.7), ('middle', 0.0), ('elbow_end', 0.7)):
        y = centre_cm + f * height_cm / 2
        width, _, _ = measure_slice(tris, 1, y, {0: (0.0, 1.0)})
        widths[name] = {'at_cm_from_wrist': round(y, 2), 'width_cm': round(width, 2)}
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


def is_lower_arm_bone(name):
    """Bones that move with the forearm when the elbow bends: the two
    forearm (twist) bones, the wrist and the whole left hand."""
    return name in ('lowerarm01.L', 'lowerarm02.L', 'wrist.L') or (
        name.endswith('.L') and name.startswith(('metacarpal', 'finger')))


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


def _wrap_angle(d):
    return (d + math.pi) % (2 * math.pi) - math.pi


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
    prev = 0.0
    for p, q in zip(pts, pts[1:]):
        a = math.atan2(q[0] - cx, q[1] - cz)
        thetas.append(max(thetas[-1], thetas[-1] + _wrap_angle(a - prev)))
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


def arm_stations(points, tris, y_from, y_to, step):
    """Cross-sections across the arm (planes of constant y) every ``step`` cm.
    Where a plane cuts several loops (fingers), the longest is the arm; where
    it cuts none, the nearest section stands in."""
    n = max(1, int(round((y_to - y_from) / step)))
    buckets = [[] for _ in range(n + 1)]
    for tri in tris:
        ys = [points[i][1] for i in tri]
        lo = math.floor((min(ys) - y_from) / step)
        hi = math.ceil((max(ys) - y_from) / step)
        for k in range(max(lo, 0), min(hi, n) + 1):
            buckets[k].append(tri)
    found = []
    for k in range(n + 1):
        y = y_from + k * step
        loops = [[(p[0], p[2]) for p in lp]
                 for lp, closed in section_loops(points, buckets[k], 1, y)
                 if closed and len(lp) > 2]
        if not loops:
            found.append(None)
            continue
        main = max(loops, key=polygon_length)
        _, centre = polygon_centroid(main)
        found.append({'y': y, 'centre': centre, 'table': contour_table(main, centre)})
    have = [k for k, s in enumerate(found) if s]
    if not have:
        raise ValueError('the mesh has no closed cross-section in that range')
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
    du = arc_cm / width_cm
    dv = (y_cm - centre_cm) / height_cm
    if up == 'elbow':
        return 0.5 + du, 0.5 + dv
    if up == 'wrist':  # rotate 180°, never mirror
        return 0.5 - du, 0.5 - dv
    raise ValueError(f'unknown design orientation: {up!r}')


def fit_and_map(points, tris, *, wrist, elbow, step, y_range=None):
    """Fit an arm mesh to measured circumferences, and find every vertex's
    place on the skin in cm.

    ``wrist`` and ``elbow`` are ``(y, circumference_cm)``. Either y may be a
    ``(lo, hi)`` range instead: the narrowest section in it for the wrist, the
    widest for the elbow, which is where a tape measure goes. Sections are
    scaled about their centres by a factor linear in y between the two, so
    both circumferences come out as measured while the mesh keeps its own
    shape between them. Past the elbow the factor stays level; past the wrist
    the hand is scaled as a whole (along the arm too) by the wrist's factor,
    so it keeps its proportions. Each vertex's arc round the arm is found
    before scaling and scales with it."""
    ys = [p[1] for p in points]
    lo, hi = y_range or (min(ys), max(ys))
    stations = arm_stations(points, tris, lo, hi, step)
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
    for x, y, z in points:
        arc, perimeter = surface_coords(stations, (x, y, z))
        s = scale_at(y, *scale)
        cx, cz = centre_at(stations, y) if y >= y_w else wrist_centre
        new.append((cx + s * (x - cx), y if y >= y_w else y_w + s * (y - y_w), cz + s * (z - cz)))
        arcs.append(s * arc)
        perimeters.append(s * perimeter)
    return {'points': new, 'arcs': arcs, 'perimeters': perimeters, 'scale': scale,
            'before_cm': before, 'stations': stations}


def fitted_circumference(fit, y):
    """The fitted arm's circumference at ``y``."""
    return perimeter_at(fit['stations'], y) * scale_at(y, *fit['scale'])


def load_makehuman_forearm(data_dir, *, length_cm, side='inner', sex=0.5, muscle=0.5,
                           weight=0.5, past_elbow_cm=8.0):
    """MakeHuman's left forearm with its wrist and hand, posed by
    ``pose_forearm``, as a cage of points (cm) and faces (MakeHuman's own
    quads). Reads base.obj's ``body`` group only (no helper geometry), the
    macro targets for the build, and the default skeleton's joints and
    weights. Keeps every face of the forearm and hand, and of the upper arm up
    to ``past_elbow_cm`` beyond the elbow joint."""
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
    joints = {}
    for key, name in MH_JOINTS.items():
        idx = skeleton['joints'][name]
        joints[key] = tuple(sum(verts[i][c] for i in idx) / len(idx) for c in range(3))
    with read('rigs', 'default_weights.mhw') as fh:
        weights = json.load(fh)['weights']
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


# --------------------------------------------------------------------------
# Arguments
# --------------------------------------------------------------------------

VIEWS = ('top', 'three-quarter', 'side')


def _positive(kind):
    def check(text):
        value = kind(text)
        if value <= 0:
            raise argparse.ArgumentTypeError(f'must be positive, got {text}')
        return value
    return check


def _non_negative(text):
    value = float(text)
    if value < 0:
        raise argparse.ArgumentTypeError(f'must not be negative, got {text}')
    return value


def _unit(text):
    value = float(text)
    if not 0 < value <= 1:
        raise argparse.ArgumentTypeError(f'must be in (0, 1], got {text}')
    return value


def _fraction(text):
    value = float(text)
    if not 0 <= value <= 1:
        raise argparse.ArgumentTypeError(f'must be in [0, 1], got {text}')
    return value


def _views(text):
    views = [v.strip() for v in text.split(',') if v.strip()]
    bad = [v for v in views if v not in VIEWS]
    if bad or not views:
        raise argparse.ArgumentTypeError(f'views must be from {",".join(VIEWS)}')
    return views


def parse_args(argv):
    """Parse the arguments after ``--`` (Blender keeps everything before it)."""
    argv = list(argv)
    own = argv[argv.index('--') + 1:] if '--' in argv else argv
    p = argparse.ArgumentParser(
        prog='blender -b -P render-on-body.py --',
        description='Render a concept image on a 3D forearm at true size.')
    p.add_argument('--image', required=True, help='design PNG/JPEG/WebP; white = no ink')
    p.add_argument('--width-cm', type=_positive(float), required=True,
                   help='printed width on the skin, measured around the curve')
    p.add_argument('--out', required=True, help='output directory (created if missing)')
    p.add_argument('--placement', choices=('forearm',), default='forearm',
                   help='body part (only the forearm so far)')
    p.add_argument('--body', choices=BODIES, default='parametric',
                   help='parametric: a smooth tapered tube; makehuman: MakeHuman\'s CC0 arm '
                        'with wrist and hand (needs --makehuman-data)')
    p.add_argument('--makehuman-data', metavar='DIR',
                   help='a MakeHuman checkout (or its makehuman/data folder), for --body makehuman')
    p.add_argument('--side', choices=SIDES, default='inner',
                   help='makehuman: which side of the forearm faces up and carries the design')
    p.add_argument('--mh-sex', type=_fraction, default=0.5,
                   help='makehuman: 0 female ... 1 male (MakeHuman\'s default 0.5)')
    p.add_argument('--mh-muscle', type=_fraction, default=0.5, help='makehuman: muscle 0..1')
    p.add_argument('--mh-weight', type=_fraction, default=0.5, help='makehuman: weight 0..1')
    p.add_argument('--wrist-cm', type=_positive(float), default=17.0, help='wrist circumference')
    p.add_argument('--elbow-cm', type=_positive(float), default=26.0,
                   help='forearm circumference just below the elbow')
    p.add_argument('--length-cm', type=_positive(float), default=25.0, help='wrist to elbow')
    p.add_argument('--centre-cm', type=float, default=None,
                   help='design centre, measured from the wrist (default: mid-forearm)')
    p.add_argument('--design-up', choices=('elbow', 'wrist'), default='elbow',
                   help='which end the top of the image points to')
    p.add_argument('--skin', default='#c99d80', help='skin tone as #rrggbb (sRGB)')
    p.add_argument('--ink', choices=INKS, default='healed',
                   help='healed: settled under the skin (soft, cool black); fresh: crisp, just inked')
    p.add_argument('--ink-spread-mm', type=_non_negative, default=HEALED_SPREAD_MM,
                   help='healed ink only: how far lines have spread into the skin (Gaussian sigma)')
    p.add_argument('--ink-strength', type=_unit, default=0.92,
                   help='how dark solid black is: 1 = pure black; lower lets a little skin through')
    p.add_argument('--white-point', type=_unit, default=0.9,
                   help='sRGB level at or above which the image counts as bare skin (off-white paper)')
    p.add_argument('--samples', type=_positive(int), default=64)
    p.add_argument('--size', type=_positive(int), default=1024,
                   help='long edge in px; renders are 2:3 portrait like Sable cards')
    p.add_argument('--views', type=_views, default=list(VIEWS),
                   help='comma-separated subset of ' + ','.join(VIEWS))
    args = p.parse_args(own)
    try:
        srgb_hex_to_linear(args.skin)
    except ValueError as err:
        p.error(str(err))
    if args.body == 'makehuman' and not args.makehuman_data:
        p.error('--body makehuman needs --makehuman-data '
                '(a MakeHuman checkout; see docs/BLENDER.md)')
    return args


#: How much of the hand the MakeHuman arm's framing takes in, past the wrist
#: joint: the palm and the knuckles.
MH_HAND_FRAME_CM = 12.0


def camera_frame(body, length_cm):
    """(centre, half-height) of what the camera frames along the arm, in cm
    from the wrist. It depends only on the arm, so two designs on one arm
    compare like for like. The parametric arm has no hand, so it is framed
    wrist to elbow; the MakeHuman arm takes in the hand as well."""
    if body == 'makehuman':
        lo, hi = -MH_HAND_FRAME_CM, length_cm + 1.5
        return (lo + hi) / 2, (hi - lo) / 2
    return length_cm / 2, length_cm / 2 + 1.5


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

# (around the arm from the top, tilt along the arm towards the wrist), degrees
VIEW_ANGLES = {'top': (0.0, 0.0), 'three-quarter': (42.0, 28.0), 'side': (80.0, 6.0)}


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


def build_arm(bpy, args, height_cm, centre_cm):
    L = args.length_cm
    rings = []
    y = -EXTEND_CM
    while y <= L + EXTEND_CM + 1e-9:
        rings.append(y)
        y += RING_STEP_CM
    n = RING_VERTS
    verts, ring_info = [], []
    for y in rings:
        t = y / L
        circ = circumference_at(t, args.wrist_cm, args.elbow_cm)
        a, b = semi_axes_for(circ, aspect_at(t))
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
                height_cm=height_cm, centre_cm=centre_cm, up=args.design_up))
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


def build_makehuman_arm(bpy, args, width_cm, height_cm, centre_cm):
    """MakeHuman's forearm and hand, fitted to the measurements, with the
    design mapped per vertex at true size (``fit_and_map``)."""
    from array import array  # noqa: PLC0415

    L = args.length_cm
    start = time.perf_counter()
    data = makehuman_data_dir(os.path.expanduser(args.makehuman_data))
    cage, faces, info = load_makehuman_forearm(
        data, length_cm=L, side=args.side, sex=args.mh_sex, muscle=args.mh_muscle,
        weight=args.mh_weight, past_elbow_cm=EXTEND_CM)
    cage_mesh = bpy.data.meshes.new('Forearm cage')
    cage_mesh.from_pydata([tuple(c * CM for c in p) for p in cage], [], faces)
    cage_mesh.update()
    cage_obj = bpy.data.objects.new('Forearm cage', cage_mesh)
    bpy.context.collection.objects.link(cage_obj)
    sub = cage_obj.modifiers.new('Subdivision', 'SUBSURF')
    sub.levels = sub.render_levels = MH_SUBDIVISIONS
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(cage_obj.evaluated_get(depsgraph))
    mesh.name = 'Forearm'
    bpy.data.objects.remove(cage_obj)
    bpy.data.meshes.remove(cage_mesh)

    nv, nl, npoly = len(mesh.vertices), len(mesh.loops), len(mesh.polygons)
    co = array('f', bytes(12 * nv))
    mesh.vertices.foreach_get('co', co)
    points = [(co[i] / CM, co[i + 1] / CM, co[i + 2] / CM) for i in range(0, 3 * nv, 3)]
    mesh.calc_loop_triangles()
    nt = len(mesh.loop_triangles)
    tri_verts = array('i', bytes(12 * nt))
    mesh.loop_triangles.foreach_get('vertices', tri_verts)
    tris = [tuple(tri_verts[i:i + 3]) for i in range(0, 3 * nt, 3)]
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
                up=args.design_up)
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

    tone = srgb_hex_to_linear(args.skin)
    flushed = tuple(c * f for c, f in zip(tone, (1.0, 0.86, 0.84)))
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
        floor = healed_ink_floor(srgb_hex_to_linear(args.skin), args.ink_strength)
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
    bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.4, 0.22)
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
    return [tuple((pts[tri_verts[i + c]], uvs[tri_loops[i + c]]) for c in range(3))
            for i in range(0, 3 * nt, 3)]


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

    L = args.length_cm
    width_cm, height_cm = design_size_cm(args.width_cm, px_w, px_h)
    centre_cm = L / 2 if args.centre_cm is None else args.centre_cm
    lo, hi = centre_cm - height_cm / 2, centre_cm + height_cm / 2
    arm = body = None
    if args.body == 'makehuman':
        arm, fit, body = build_makehuman_arm(bpy, args, width_cm, height_cm, centre_cm)
        centre_circ = fitted_circumference(fit, centre_cm)
        thinnest = min(fitted_circumference(fit, lo + (hi - lo) * k / 64) for k in range(65))
    else:
        centre_circ = circumference_at(centre_cm / L, args.wrist_cm, args.elbow_cm)
        thinnest = circumference_at(lo / L, args.wrist_cm, args.elbow_cm)  # the taper only grows

    warnings = []
    if width_cm > thinnest:
        warnings.append(f'design is {width_cm:g} cm wide but the arm is only {thinnest:.1f} cm '
                        'round under part of it; the overlap is clipped at the underside')
    if lo < 0 or hi > L:
        warnings.append(f'design runs from {lo:.1f} to {hi:.1f} cm along a {L:g} cm forearm, '
                        'past the wrist or elbow')

    ink = {'mode': args.ink, 'strength': args.ink_strength}
    healed_image = None
    if args.ink == 'healed':
        start = time.perf_counter()
        healed_image, sigma_px = healed_ink_image(bpy, image, args, width_cm)
        floor = healed_ink_floor(srgb_hex_to_linear(args.skin), args.ink_strength)
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
        arm = build_arm(bpy, args, height_cm, centre_cm)
    arm.data.materials.append(skin_material(bpy, args, image, healed_image))

    start = time.perf_counter()
    triangles = design_triangles(bpy, arm)
    measured = measure_design(triangles, height_cm=height_cm, centre_cm=centre_cm)
    measured['seconds'] = round(time.perf_counter() - start, 1)
    if body is not None:  # the fitted circumferences, measured on the arm as rendered
        for station in body['fit'].values():
            whole, _, _ = measure_slice(triangles, 1, station['at_cm_from_wrist'], {})
            station['measured_cm'] = round(whole, 2)
    middle = measured['width_round_arm']['middle']['width_cm']
    if width_cm <= thinnest and abs(middle - width_cm) > 0.02 * width_cm:
        warnings.append(f'the design measures {middle:g} cm round the rendered arm, '
                        f'not {width_cm:g} cm')

    frame_centre, frame_half = camera_frame(args.body, L)
    target = (0.0, frame_centre * CM, 0.0)  # on the arm's axis
    half_extent = frame_half * CM
    dist = frame_distance(half_extent, FOCAL_MM, SENSOR_MM)
    add_light(bpy, Matrix, Vector, 'Key', target, -50, 22, 0.9, 0.45, 16.0, (1.0, 0.95, 0.88))
    add_light(bpy, Matrix, Vector, 'Fill', target, 60, -5, 1.2, 1.2, 3.0, (0.86, 0.92, 1.0))
    add_light(bpy, Matrix, Vector, 'Rim', target, 125, -30, 0.8, 0.4, 5.0, (1.0, 0.95, 0.9))

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
    for view in args.views:
        around, tilt = VIEW_ANGLES[view]
        d = _direction(around, tilt)
        cam.location = tuple(t + dist * c for t, c in zip(target, d))
        cam.rotation_euler = _look_at(Matrix, Vector, cam.location, target)
        path = os.path.join(out_dir, f'{view}.png')
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
                      'centre_from_wrist': centre_cm, 'up': args.design_up},
        'placement': args.placement,
        'body': args.body,
        'arm_cm': {'wrist': args.wrist_cm, 'elbow': args.elbow_cm, 'length': L},
        'at_design_centre': {
            'circumference_cm': round(centre_circ, 2),
            'u_span': round(uv_span_for_width(width_cm, centre_circ), 4),
            'wraps_degrees': round(360 * uv_span_for_width(width_cm, centre_circ), 1),
        },
        'measured_cm': measured,
        'skin': args.skin,
        'ink': ink,
        'ink_strength': args.ink_strength,
        'white_point': args.white_point,
        'render': {
            'blender': bpy.app.version_string, 'engine': 'CYCLES', 'device': 'CPU',
            'samples': args.samples, 'denoiser': denoiser, 'colour': colour,
            'resolution': [scene.render.resolution_x, scene.render.resolution_y],
            'lens_mm': FOCAL_MM, 'camera_distance_cm': round(dist / CM, 1),
        },
        'views': views,
        'warnings': warnings,
    }
    if body is not None:
        params['makehuman'] = {
            'side': args.side,
            'build': {'sex': args.mh_sex, 'muscle': args.mh_muscle, 'weight': args.mh_weight,
                      'age_years': 25, 'targets': body.pop('targets')},
            'pose': {'elbow_straightened_deg': round(body.pop('bend_deg'), 1),
                     'supinated_deg': round(abs(body.pop('twist_deg')), 1),
                     'rest_forearm_cm': round(body.pop('forearm_cm'), 2),
                     'scale': round(body.pop('scale'), 4)},
            **body,
        }
    with open(os.path.join(out_dir, 'params.json'), 'w', encoding='utf-8') as fh:
        json.dump(params, fh, indent=2)
        fh.write('\n')
    for w in warnings:
        print(f'[render-on-body] warning: {w}', flush=True)


if __name__ == '__main__':
    main()
