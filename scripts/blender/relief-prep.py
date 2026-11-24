#!/usr/bin/env python3
"""Repair, decimate, frame, and preview a Sable relief STL before slicing (#193).

    blender -b --python-exit-code 1 -P scripts/blender/relief-prep.py -- \
        --input ~/Downloads/relief.stl --out-stl /tmp/relief-clean.stl \
        --preview /tmp/relief-preview.png

Runs headless on the Mac through Blender (never in the browser app). Checks
manifoldness, welds coincident vertices, fills open boundary holes, removes
loose/degenerate geometry, optionally decimates to a target triangle count,
optionally adds an extra base plate or perimeter frame, writes a cleaned
watertight binary (or ASCII) STL, and renders a raking-light studio preview.

The analysis, camera math, and CLI validation sit at top level with zero
Blender imports so they are unit tested with plain Python:
    python3 -m unittest discover -s scripts/blender
"""
import argparse
import collections
import json
import math
import os
import sys

DEFAULT_MAX_TRIANGLES = 50_000
DEFAULT_MERGE_DISTANCE = 0.001
DEFAULT_SAMPLES = 48
DEFAULT_SIZE = 1024
BACKDROP_HEX = '131110'
DEFAULT_AREA_EPS = 1e-10

# Matte 3D-printing filament presets: (name, sRGB 0..1 RGB, roughness).
MATERIALS = {
    'pla-ivory': ((0.82, 0.78, 0.70), 0.52),
    'pla-slate': ((0.22, 0.24, 0.27), 0.50),
    'resin-grey': ((0.50, 0.52, 0.55), 0.36),
}


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _length(v):
    return math.sqrt(_dot(v, v))


def _normalised(v):
    mag = _length(v)
    if mag == 0:
        return (0.0, 0.0, 0.0)
    return (v[0] / mag, v[1] / mag, v[2] / mag)


def _srgb_hex_to_linear(code):
    code = code.lstrip('#')
    rgb = tuple(int(code[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)


def _positive(cast, label='number'):
    def parse(text):
        try:
            value = cast(text)
        except ValueError:
            raise argparse.ArgumentTypeError(f'expected a {label}, got {text!r}') from None
        if not math.isfinite(value) or value <= 0:
            raise argparse.ArgumentTypeError(f'must be > 0, got {text!r}')
        return value
    return parse


def _non_negative(cast, label='number'):
    def parse(text):
        try:
            value = cast(text)
        except ValueError:
            raise argparse.ArgumentTypeError(f'expected a {label}, got {text!r}') from None
        if not math.isfinite(value) or value < 0:
            raise argparse.ArgumentTypeError(f'must be >= 0, got {text!r}')
        return value
    return parse


def parse_args(argv):
    """Parse CLI arguments after ``--`` (Blender ignores everything before it)."""
    argv = list(argv)
    own = argv[argv.index('--') + 1:] if '--' in argv else argv
    p = argparse.ArgumentParser(
        prog='blender -b -P scripts/blender/relief-prep.py --',
        description='Repair, decimate, frame, and preview a relief STL before printing.',
    )
    p.add_argument('--input', required=True, help='input STL file path')
    p.add_argument('--out-stl', required=True, help='output cleaned STL file path')
    p.add_argument('--preview', default=None, help='optional preview PNG/WebP output path')
    p.add_argument('--report', default=None, help='optional JSON report output path')
    p.add_argument(
        '--max-triangles', type=_non_negative(int, 'integer'), default=DEFAULT_MAX_TRIANGLES,
        help=f'decimate above this triangle count; 0 disables (default: {DEFAULT_MAX_TRIANGLES})',
    )
    p.add_argument(
        '--base-mm', type=_non_negative(float), default=0.0,
        help='extra base thickness added underneath in mm (default: 0)',
    )
    p.add_argument(
        '--frame-mm', type=_non_negative(float), default=0.0,
        help='perimeter border width in mm (default: 0)',
    )
    p.add_argument(
        '--frame-height-mm', type=_positive(float), default=None,
        help='total frame height in mm when --frame-mm > 0 (default: relief peak height)',
    )
    p.add_argument(
        '--merge-distance', type=_non_negative(float), default=DEFAULT_MERGE_DISTANCE,
        help=f'vertex weld tolerance in mm (default: {DEFAULT_MERGE_DISTANCE})',
    )
    p.add_argument(
        '--material', choices=tuple(MATERIALS), default='pla-ivory',
        help='preview filament/resin appearance (default: pla-ivory)',
    )
    p.add_argument(
        '--samples', type=_positive(int, 'integer'), default=DEFAULT_SAMPLES,
        help=f'Cycles preview samples (default: {DEFAULT_SAMPLES})',
    )
    p.add_argument(
        '--size', type=_positive(int, 'integer'), default=DEFAULT_SIZE,
        help=f'preview square image size in px (default: {DEFAULT_SIZE})',
    )
    p.add_argument('--ascii', action='store_true', help='write ASCII STL instead of binary')
    return p.parse_args(own)


def analyze_topology(vertices, faces, *, area_eps=DEFAULT_AREA_EPS):
    """Inspect vertices/faces for manifoldness, boundaries, loose verts, volume, and bounds."""
    verts = [tuple(float(c) for c in v) for v in vertices]
    referenced = set()
    edge_counts = collections.Counter()
    half_edges = collections.Counter()
    triangles = 0
    degenerate_faces = 0
    signed_volume = 0.0

    for raw_face in faces:
        n = len(raw_face)
        if n < 3:
            degenerate_faces += 1
            continue
        face = [int(idx) for idx in raw_face]
        referenced.update(face)
        if len(set(face)) < 3:
            degenerate_faces += 1
        triangles += n - 2
        p0 = verts[face[0]]
        face_area = 0.0
        for i in range(1, n - 1):
            p1, p2 = verts[face[i]], verts[face[i + 1]]
            c = _cross(_sub(p1, p0), _sub(p2, p0))
            face_area += 0.5 * _length(c)
            signed_volume += _dot(p0, _cross(p1, p2)) / 6.0
        if face_area <= area_eps:
            degenerate_faces += 1
        for i in range(n):
            u, v = face[i], face[(i + 1) % n]
            if u == v:
                continue
            key = (u, v) if u < v else (v, u)
            edge_counts[key] += 1
            half_edges[(u, v)] += 1

    boundary_edges = 0
    non_manifold_edges = 0
    for (u, v), count in edge_counts.items():
        if count == 1:
            boundary_edges += 1
            non_manifold_edges += 1
        elif count != 2 or half_edges[(u, v)] != 1 or half_edges[(v, u)] != 1:
            non_manifold_edges += 1

    loose_vertices = max(0, len(verts) - len(referenced))
    if verts:
        xs = [v[0] for v in verts]
        ys = [v[1] for v in verts]
        zs = [v[2] for v in verts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        min_z, max_z = min(zs), max(zs)
    else:
        min_x = max_x = min_y = max_y = min_z = max_z = 0.0

    bounds_mm = {
        'width': round(max_x - min_x, 4),
        'depth': round(max_y - min_y, 4),
        'height': round(max_z - min_z, 4),
        'min_x': round(min_x, 4),
        'max_x': round(max_x, 4),
        'min_y': round(min_y, 4),
        'max_y': round(max_y, 4),
        'min_z': round(min_z, 4),
        'max_z': round(max_z, 4),
    }
    return {
        'triangles': triangles,
        'vertices': len(verts),
        'edges': len(edge_counts),
        'boundary_edges': boundary_edges,
        'non_manifold_edges': non_manifold_edges,
        'loose_vertices': loose_vertices,
        'degenerate_faces': degenerate_faces,
        'signed_volume_mm3': round(signed_volume, 4),
        'bounds_mm': bounds_mm,
        'is_manifold': triangles > 0 and non_manifold_edges == 0 and loose_vertices == 0,
    }


def compute_decimate_ratio(current_triangles, max_triangles):
    """Collapse ratio clamped cleanly to ``[0.01, 1.0]``."""
    if max_triangles <= 0 or current_triangles <= 0 or current_triangles <= max_triangles:
        return 1.0
    return max(0.01, min(1.0, max_triangles / current_triangles))


def preview_camera_pose(bounds_mm, *, focal_mm=50.0, sensor_mm=36.0, fill=0.92):
    """Elevated three-quarter studio camera framing the whole relief plaque."""
    cx = 0.5 * (bounds_mm['min_x'] + bounds_mm['max_x'])
    cy = 0.5 * (bounds_mm['min_y'] + bounds_mm['max_y'])
    cz = 0.5 * (bounds_mm['min_z'] + bounds_mm['max_z'])
    w = bounds_mm['width']
    d = bounds_mm['depth']
    h = bounds_mm['height']
    radius = max(1.0, 0.5 * math.sqrt(w * w + d * d + h * h))
    half_fov_tan = (sensor_mm * 0.5) / focal_mm
    dist = max(radius / (fill * half_fov_tan), radius * 1.5)

    az = math.radians(-22.0)
    el = math.radians(48.0)
    cos_el, sin_el = math.cos(el), math.sin(el)
    direction = (
        math.sin(az) * cos_el,
        -math.cos(az) * cos_el,
        sin_el,
    )
    location = tuple(t + dist * d_c for t, d_c in zip((cx, cy, cz), direction))
    return {
        'target': (round(cx, 4), round(cy, 4), round(cz, 4)),
        'location': tuple(round(v, 4) for v in location),
        'distance_mm': round(dist, 4),
        'radius_mm': round(radius, 4),
        'focal_mm': focal_mm,
        'sensor_mm': sensor_mm,
    }


def format_report(report):
    """Format a concise human-readable before/after summary."""
    b, a = report['before'], report['after']
    b_state = 'manifold' if b['is_manifold'] else f'non-manifold ({b["non_manifold_edges"]} edges)'
    a_state = 'manifold' if a['is_manifold'] else f'non-manifold ({a["non_manifold_edges"]} edges)'
    dims = a['bounds_mm']
    lines = [
        f'[relief-prep] input:  {report["input"]} ({b["triangles"]:,} tris, {b_state})',
        (f'[relief-prep] output: {report["out_stl"]} ({a["triangles"]:,} tris, {a_state}, '
         f'{dims["width"]:g} × {dims["depth"]:g} × {dims["height"]:g} mm)'),
    ]
    if report.get('steps'):
        lines.append('[relief-prep] steps:  ' + ', '.join(report['steps']))
    if report.get('preview'):
        lines.append(f'[relief-prep] preview: {report["preview"]}')
    for warn in report.get('warnings') or ():
        lines.append(f'[relief-prep] warning: {warn}')
    return '\n'.join(lines)


def _inspect_bmesh(bm):
    bm.verts.index_update()
    bm.faces.index_update()
    verts = [(v.co.x, v.co.y, v.co.z) for v in bm.verts]
    faces = [[v.index for v in f.verts] for f in bm.faces]
    return analyze_topology(verts, faces)


def _clean_and_orient_bmesh(bm, bmesh_mod, merge_distance):
    """Weld, clean loose/degenerate geometry, fill holes, triangulate, and orient outward."""
    if merge_distance > 0 and len(bm.verts) > 0:
        bmesh_mod.ops.remove_doubles(bm, verts=list(bm.verts), dist=merge_distance)
    if len(bm.faces) > 0:
        bmesh_mod.ops.dissolve_degenerate(bm, dist=max(merge_distance * 0.25, 1e-6), edges=list(bm.edges))
    wire_edges = [e for e in bm.edges if len(e.link_faces) == 0]
    if wire_edges:
        bmesh_mod.ops.delete(bm, geom=wire_edges, context='EDGES')
    loose_verts = [v for v in bm.verts if len(v.link_edges) == 0]
    if loose_verts:
        bmesh_mod.ops.delete(bm, geom=loose_verts, context='VERTS')
    boundary = [e for e in bm.edges if e.is_boundary]
    if boundary:
        bmesh_mod.ops.holes_fill(bm, edges=boundary, sides=0)
    if len(bm.faces) > 0:
        bmesh_mod.ops.triangulate(bm, faces=list(bm.faces))
        bmesh_mod.ops.recalc_face_normals(bm, faces=list(bm.faces))
        stats = _inspect_bmesh(bm)
        if stats['boundary_edges'] == 0 and stats['signed_volume_mm3'] < 0:
            bmesh_mod.ops.reverse_faces(bm, faces=list(bm.faces))
    else:
        stats = _inspect_bmesh(bm)
    if len(bm.verts) > 0:
        min_z = min(v.co.z for v in bm.verts)
        if abs(min_z) > 1e-6:
            for v in bm.verts:
                v.co.z -= min_z
            bm.normal_update()
        stats = _inspect_bmesh(bm)
    return stats


def _import_stl(bpy, path):
    abs_path = os.path.abspath(os.path.expanduser(path))
    if not os.path.isfile(abs_path):
        raise SystemExit(f'no such STL file: {abs_path}')
    if hasattr(bpy.ops.wm, 'stl_import'):
        bpy.ops.wm.stl_import(filepath=abs_path, use_mesh_validate=True)
    else:
        bpy.ops.import_mesh.stl(filepath=abs_path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise SystemExit(f'no mesh found in STL: {abs_path}')
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def _apply_mesh_bmesh(obj, bm, bmesh_mod, merge_distance):
    stats = _clean_and_orient_bmesh(bm, bmesh_mod, merge_distance)
    bm.to_mesh(obj.data)
    obj.data.update()
    return stats


def _clean_object_mesh(obj, bmesh_mod, merge_distance):
    bm = bmesh_mod.new()
    bm.from_mesh(obj.data)
    try:
        return _apply_mesh_bmesh(obj, bm, bmesh_mod, merge_distance)
    finally:
        bm.free()


def _create_box_object(bpy, bmesh_mod, name, min_x, max_x, min_y, max_y, min_z, max_z):
    bm = bmesh_mod.new()
    try:
        corners = [
            (min_x, min_y, min_z),
            (max_x, min_y, min_z),
            (max_x, max_y, min_z),
            (min_x, max_y, min_z),
            (min_x, min_y, max_z),
            (max_x, min_y, max_z),
            (max_x, max_y, max_z),
            (min_x, max_y, max_z),
        ]
        vs = [bm.verts.new(c) for c in corners]
        bm.faces.new((vs[3], vs[2], vs[1], vs[0]))  # bottom (-Z)
        bm.faces.new((vs[4], vs[5], vs[6], vs[7]))  # top (+Z)
        bm.faces.new((vs[0], vs[1], vs[5], vs[4]))  # front (-Y)
        bm.faces.new((vs[1], vs[2], vs[6], vs[5]))  # right (+X)
        bm.faces.new((vs[2], vs[3], vs[7], vs[6]))  # back (+Y)
        bm.faces.new((vs[3], vs[0], vs[4], vs[7]))  # left (-X)
        bmesh_mod.ops.triangulate(bm, faces=list(bm.faces))
        bmesh_mod.ops.recalc_face_normals(bm, faces=list(bm.faces))
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
    finally:
        bm.free()
    helper = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(helper)
    return helper


def _create_frame_object(bpy, bmesh_mod, bounds, frame_mm, frame_height_mm):
    """Watertight rectangular ring prism slightly overlapping outer relief edges."""
    w, d = bounds['width'], bounds['depth']
    overlap = min(0.15, w * 0.02, d * 0.02)
    ox0, ox1 = bounds['min_x'] - frame_mm, bounds['max_x'] + frame_mm
    oy0, oy1 = bounds['min_y'] - frame_mm, bounds['max_y'] + frame_mm
    ix0, ix1 = bounds['min_x'] + overlap, bounds['max_x'] - overlap
    iy0, iy1 = bounds['min_y'] + overlap, bounds['max_y'] - overlap
    z0, z1 = 0.0, frame_height_mm

    bm = bmesh_mod.new()
    try:
        outer_bot = [bm.verts.new(p) for p in ((ox0, oy0, z0), (ox1, oy0, z0), (ox1, oy1, z0), (ox0, oy1, z0))]
        inner_bot = [bm.verts.new(p) for p in ((ix0, iy0, z0), (ix1, iy0, z0), (ix1, iy1, z0), (ix0, iy1, z0))]
        outer_top = [bm.verts.new(p) for p in ((ox0, oy0, z1), (ox1, oy0, z1), (ox1, oy1, z1), (ox0, oy1, z1))]
        inner_top = [bm.verts.new(p) for p in ((ix0, iy0, z1), (ix1, iy0, z1), (ix1, iy1, z1), (ix0, iy1, z1))]
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((outer_bot[i], outer_top[i], outer_top[j], outer_bot[j]))  # outer wall
            bm.faces.new((inner_bot[j], inner_top[j], inner_top[i], inner_bot[i]))  # inner wall
            bm.faces.new((outer_top[i], inner_top[i], inner_top[j], outer_top[j]))  # top rim
            bm.faces.new((outer_bot[j], inner_bot[j], inner_bot[i], outer_bot[i]))  # bottom rim
        bmesh_mod.ops.triangulate(bm, faces=list(bm.faces))
        bmesh_mod.ops.recalc_face_normals(bm, faces=list(bm.faces))
        mesh = bpy.data.meshes.new('ReliefFrame')
        bm.to_mesh(mesh)
    finally:
        bm.free()
    helper = bpy.data.objects.new('ReliefFrame', mesh)
    bpy.context.collection.objects.link(helper)
    return helper


def _boolean_union(bpy, target, helper, bmesh_mod, merge_distance):
    mod = target.modifiers.new(name='ReliefUnion', type='BOOLEAN')
    mod.operation = 'UNION'
    mod.object = helper
    if hasattr(mod, 'solver'):
        mod.solver = 'EXACT'
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    helper_mesh = helper.data
    bpy.data.objects.remove(helper, do_unlink=True)
    if helper_mesh and helper_mesh.users == 0:
        bpy.data.meshes.remove(helper_mesh)
    return _clean_object_mesh(target, bmesh_mod, merge_distance)


def _decimate_object(bpy, obj, bmesh_mod, target_triangles, current_stats, merge_distance):
    ratio = compute_decimate_ratio(current_stats['triangles'], target_triangles)
    was_manifold = current_stats['is_manifold']
    backup = obj.data.copy()
    stats = current_stats
    applied_ratio = ratio
    for attempt_ratio in (ratio, min(0.95, math.sqrt(ratio))):
        mod = obj.modifiers.new(name='ReliefDecimate', type='DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = attempt_ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        stats = _clean_object_mesh(obj, bmesh_mod, merge_distance)
        applied_ratio = attempt_ratio
        if not was_manifold or stats['is_manifold']:
            bpy.data.meshes.remove(backup)
            return stats, applied_ratio, None
        obj.data = backup.copy()
    obj.data = backup
    stats = _clean_object_mesh(obj, bmesh_mod, merge_distance)
    return stats, 1.0, 'decimation broke manifoldness; restored repaired mesh'


def _add_area_light(bpy, Matrix, Vector, name, target, az_deg, el_deg, dist, energy_scale,
                    color, size):
    az, el = math.radians(az_deg), math.radians(el_deg)
    d = (math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))
    loc = tuple(t + dist * c for t, c in zip(target, d))
    data = bpy.data.lights.new(name=name, type='AREA')
    data.energy = energy_scale * (dist ** 2)
    data.color = color
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size
    light = bpy.data.objects.new(name=name, object_data=data)
    bpy.context.collection.objects.link(light)
    light.location = loc
    aim = Vector(target) - Vector(loc)
    light.rotation_euler = aim.to_track_quat('-Z', 'Y').to_euler()
    return light


def _render_preview(bpy, Matrix, Vector, obj, bounds_mm, args):
    pose = preview_camera_pose(bounds_mm)
    dist = pose['distance_mm']
    radius = pose['radius_mm']
    target = pose['target']

    # Matte filament material.
    rgb, rough = MATERIALS[args.material]
    mat = bpy.data.materials.new('Filament')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.4
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = False

    # Three-point raking studio lighting scaled cleanly to mm world coordinates.
    _add_area_light(
        bpy, Matrix, Vector, 'Key', target,
        az_deg=-68.0, el_deg=15.0, dist=dist * 1.45,
        energy_scale=11.0, color=(1.0, 0.96, 0.91), size=radius * 0.45,
    )
    _add_area_light(
        bpy, Matrix, Vector, 'Fill', target,
        az_deg=65.0, el_deg=48.0, dist=dist * 1.65,
        energy_scale=1.8, color=(0.86, 0.92, 1.0), size=radius * 1.5,
    )
    _add_area_light(
        bpy, Matrix, Vector, 'Rim', target,
        az_deg=155.0, el_deg=32.0, dist=dist * 1.55,
        energy_scale=4.5, color=(1.0, 0.99, 0.97), size=radius * 1.0,
    )

    cam_data = bpy.data.cameras.new('PreviewCamera')
    cam_data.lens = pose['focal_mm']
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.sensor_height = pose['sensor_mm']
    cam_data.clip_start = max(0.1, dist * 0.01)
    cam_data.clip_end = max(1000.0, dist * 20.0)
    cam = bpy.data.objects.new('PreviewCamera', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = pose['location']
    cam.rotation_euler = (Vector(target) - Vector(pose['location'])).to_track_quat('-Z', 'Y').to_euler()

    scene = bpy.context.scene
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    cyc = scene.cycles
    cyc.device = 'CPU'
    cyc.samples = args.samples
    cyc.use_adaptive_sampling = True
    cyc.max_bounces = 4
    try:
        import _cycles  # noqa: PLC0415
        if getattr(_cycles, 'with_openimagedenoise', False):
            cyc.use_denoising = True
            cyc.denoiser = 'OPENIMAGEDENOISE'
            cyc.adaptive_threshold = 0.02
    except ImportError:
        pass

    scene.render.resolution_x = args.size
    scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    preview_abs = os.path.abspath(os.path.expanduser(args.preview))
    os.makedirs(os.path.dirname(preview_abs), exist_ok=True)
    img_cfg = scene.render.image_settings
    img_cfg.file_format = 'WEBP' if preview_abs.lower().endswith('.webp') else 'PNG'
    img_cfg.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.render.filepath = preview_abs

    for transform, look in (('AgX', 'AgX - Medium High Contrast'), ('AgX', 'Medium High Contrast'),
                            ('Filmic', 'Medium High Contrast')):
        try:
            scene.view_settings.view_transform = transform
            scene.view_settings.look = look
            break
        except TypeError:
            continue

    world = bpy.data.worlds.new('Backdrop')
    if world.node_tree is None:
        world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*_srgb_hex_to_linear(BACKDROP_HEX), 1.0)
    bg.inputs['Strength'].default_value = 1.0
    scene.world = world
    bpy.ops.render.render(write_still=True)
    return preview_abs


def run_in_blender(args):
    import bpy  # noqa: PLC0415
    import bmesh  # noqa: PLC0415
    from mathutils import Matrix, Vector  # noqa: PLC0415

    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj = _import_stl(bpy, args.input)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    try:
        raw_triangles = sum(max(0, len(f.verts) - 2) for f in bm.faces)
        raw_vertices = len(bm.verts)
        if args.merge_distance > 0 and len(bm.verts) > 0:
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=args.merge_distance)
        before_stats = _inspect_bmesh(bm)
        before_stats['raw_triangles'] = raw_triangles
        before_stats['raw_vertices'] = raw_vertices
        stats = _apply_mesh_bmesh(obj, bm, bmesh, args.merge_distance)
    finally:
        bm.free()

    steps = ['weld-and-repair']
    warnings = []

    if args.max_triangles > 0 and stats['triangles'] > args.max_triangles:
        stats, used_ratio, warn = _decimate_object(
            bpy, obj, bmesh, args.max_triangles, stats, args.merge_distance,
        )
        if warn:
            warnings.append(warn)
        else:
            steps.append(f'decimate({used_ratio:.2f})')

    if args.base_mm > 0:
        b = stats['bounds_mm']
        for v in obj.data.vertices:
            v.co.z += args.base_mm
        obj.data.update()
        # Inset by a fraction of a micron on XY? Keep exact relief footprint; tiny +0.05 mm Z overlap prevents coplanar seam.
        helper = _create_box_object(
            bpy, bmesh, 'ReliefBase',
            b['min_x'], b['max_x'], b['min_y'], b['max_y'],
            0.0, args.base_mm + 0.05,
        )
        stats = _boolean_union(bpy, obj, helper, bmesh, args.merge_distance)
        steps.append(f'base(+{args.base_mm:g}mm)')

    if args.frame_mm > 0:
        b = stats['bounds_mm']
        frame_h = args.frame_height_mm if args.frame_height_mm is not None else max(b['height'], 1.0)
        helper = _create_frame_object(bpy, bmesh, b, args.frame_mm, frame_h)
        stats = _boolean_union(bpy, obj, helper, bmesh, args.merge_distance)
        steps.append(f'frame({args.frame_mm:g}mm x {frame_h:g}mm)')

    out_abs = os.path.abspath(os.path.expanduser(args.out_stl))
    os.makedirs(os.path.dirname(out_abs), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if hasattr(bpy.ops.wm, 'stl_export'):
        bpy.ops.wm.stl_export(
            filepath=out_abs,
            ascii_format=bool(args.ascii),
            export_selected_objects=True,
            apply_modifiers=True,
        )
    else:
        bpy.ops.export_mesh.stl(filepath=out_abs, ascii=bool(args.ascii), use_selection=True)

    preview_abs = None
    if args.preview:
        preview_abs = _render_preview(bpy, Matrix, Vector, obj, stats['bounds_mm'], args)
        steps.append(f'preview({args.material})')

    if not stats['is_manifold']:
        warnings.append(
            f'output mesh still has {stats["non_manifold_edges"]} non-manifold edge(s) and {stats["loose_vertices"]} loose vertex/vertices',
        )

    report = {
        'issue': 193,
        'input': os.path.abspath(os.path.expanduser(args.input)),
        'out_stl': out_abs,
        'out_stl_bytes': os.path.getsize(out_abs),
        'preview': preview_abs,
        'before': before_stats,
        'after': stats,
        'steps': steps,
        'warnings': warnings,
    }
    if args.report:
        rep_abs = os.path.abspath(os.path.expanduser(args.report))
        os.makedirs(os.path.dirname(rep_abs), exist_ok=True)
        with open(rep_abs, 'w', encoding='utf-8') as fh:
            json.dump(report, fh, indent=2)
            fh.write('\n')

    print(format_report(report), flush=True)
    return report


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    run_in_blender(args)
    return 0


if __name__ == '__main__':
    sys.exit(main())
