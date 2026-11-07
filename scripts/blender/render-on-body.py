"""Render a Sable concept image onto a parametric 3D forearm (#192).

Run headless with Blender (Sable itself never calls Blender):

    blender -b -P scripts/blender/render-on-body.py -- \
        --image concept.png --width-cm 12 --out renders/

Builds a tapered, slightly elliptical forearm, wraps the design onto the top of
it at a true printed width (``--width-cm`` of skin, measured around the curve),
lights it softly against a near-black backdrop and renders three angles plus a
``params.json``. The ink looks healed by default (``--ink healed``: spread a
fraction of a millimetre, a cool settled black under the skin); ``--ink fresh``
is the crisp just-inked look. ``params.json`` records the design's size as
measured on the rendered mesh. Everything after ``--`` is this script's own
arguments; see ``--help`` (``blender -b -P render-on-body.py -- --help``) and
docs/BLENDER.md.

The maths at the top of this file is plain Python so it can be unit tested
without Blender: ``python3 -m unittest discover -s scripts/blender``.
"""

import argparse
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
                   help='body part (only a parametric forearm so far)')
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
    return args


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
    centre_circ = circumference_at(centre_cm / L, args.wrist_cm, args.elbow_cm)

    warnings = []
    lo, hi = centre_cm - height_cm / 2, centre_cm + height_cm / 2
    thinnest = circumference_at(lo / L, args.wrist_cm, args.elbow_cm)  # the taper only grows
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
    arm = build_arm(bpy, args, height_cm, centre_cm)
    arm.data.materials.append(skin_material(bpy, args, image, healed_image))

    start = time.perf_counter()
    measured = measure_design(design_triangles(bpy, arm), height_cm=height_cm,
                              centre_cm=centre_cm)
    measured['seconds'] = round(time.perf_counter() - start, 1)
    middle = measured['width_round_arm']['middle']['width_cm']
    if width_cm <= thinnest and abs(middle - width_cm) > 0.02 * width_cm:
        warnings.append(f'the design measures {middle:g} cm round the rendered arm, '
                        f'not {width_cm:g} cm')

    target = (0.0, L / 2 * CM, 0.0)  # on the arm's axis, mid-forearm
    half_extent = (L / 2 + 1.5) * CM
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
    with open(os.path.join(out_dir, 'params.json'), 'w', encoding='utf-8') as fh:
        json.dump(params, fh, indent=2)
        fh.write('\n')
    for w in warnings:
        print(f'[render-on-body] warning: {w}', flush=True)


if __name__ == '__main__':
    main()
