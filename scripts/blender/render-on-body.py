"""Render a Sable concept image onto a parametric 3D forearm (#192).

Run headless with Blender (Sable itself never calls Blender):

    blender -b -P scripts/blender/render-on-body.py -- \
        --image concept.png --width-cm 12 --out renders/

Builds a tapered, slightly elliptical forearm, wraps the design onto the top of
it at a true printed width (``--width-cm`` of skin, measured around the curve),
lights it softly against a near-black backdrop and renders three angles plus a
``params.json``. Everything after ``--`` is this script's own arguments; see
``--help`` (``blender -b -P render-on-body.py -- --help``) and docs/BLENDER.md.

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
    p.add_argument('--ink-strength', type=_unit, default=0.92,
                   help='1 = pure multiply; lower lets a little skin through solid black')
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


def skin_material(bpy, args, image):
    mat = bpy.data.materials.new('Skin with ink')
    if mat.node_tree is None:  # Blender < 5 (use_nodes is deprecated from 5.0)
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    # Design: Design UV → image (clipped: nothing outside it) → levels → ink colour.
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'Design'
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'CLIP'
    tex.interpolation = 'Cubic'
    links.new(uv.outputs['UV'], tex.inputs['Vector'])
    wp = srgb_to_linear(args.white_point)  # chosen on screen values; the shader is linear
    levelled = _mix(nodes, links, 'DIVIDE', tex.outputs['Color'], (wp, wp, wp), clamp=True)
    # Transparent pixels (and everything outside the clipped image) are bare skin.
    ink = _mix(nodes, links, 'MIX', (1.0, 1.0, 1.0), levelled, factor=tex.outputs['Alpha'])

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

    inked = _mix(nodes, links, 'MULTIPLY', skin, ink, factor=args.ink_strength)
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

    # No ground plane: a shadow catcher doubled the render time for a shadow
    # that barely registers on near-black.
    arm = build_arm(bpy, args, height_cm, centre_cm)
    arm.data.materials.append(skin_material(bpy, args, image))

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
        'skin': args.skin,
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
