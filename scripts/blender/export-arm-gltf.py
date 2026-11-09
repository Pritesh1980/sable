"""Export a phone-sized upper arm as glTF for Sable's 3D placement view (#195).

Run headless with Blender (Sable itself never calls Blender):

    blender -b -P scripts/blender/export-arm-gltf.py -- \
        --makehuman-data ~/src/makehuman --out public/models

Writes ``arm-upper.glb`` and ``arm-upper.json``. The mesh is the same
MakeHuman CC0 body render-on-body.py renders (arms lowered, left upper arm
fitted to the measurements), cut down to the arm: the torso and the forearm
are dropped, and a per-vertex fade lets the browser dissolve the cut edges
into the backdrop instead of showing a hollow stump.

What makes the browser's job easy is that the skin is unwrapped here, not
there. Every vertex carries where it is on the skin in centimetres:

    POSITION    metres; origin at the elbow joint, +y up the arm to the
                shoulder, +z out of the outside of the arm
    TEXCOORD_0  (arc_cm, perimeter_cm): skin distance round the arm from the
                line down the outside of the arm, and the arm's circumference
                there. perimeter 0 means "no design here" (off the upper arm)
    TEXCOORD_1  (fade, 0): 1 is solid skin, 0 is dissolved

A design ``w`` cm wide centred ``c`` cm above the elbow is then just
``u = arc / w + 0.5`` and ``v = (y_cm - c) / h + 0.5`` in a fragment shader,
at true size, with no projection and no decal geometry: resizing, sliding and
turning it round the arm are uniforms.

The helpers at the top are plain Python and unit tested without Blender:
``python3 -m unittest discover -s scripts/blender``.
"""

import argparse
import importlib.util
import json
import os
import struct
import sys

# --------------------------------------------------------------------------
# Pure helpers (no bpy). Centimetres unless a name says otherwise.
# --------------------------------------------------------------------------

#: The arm's share of a vertex's bone weights over which the skin fades in:
#: 0 on the torso, 1 on the arm, in between across the shoulder and armpit.
SHARE_FADE = (0.15, 0.6)
#: Height above the elbow joint (negative: down the forearm) over which the
#: forearm fades out. The hand and wrist are never exported.
FOREARM_FADE_CM = (-15.0, -7.0)
#: TEXCOORD_0 where there is no skin to ink: perimeter 0.
NO_SKIN = (0.0, 0.0)


def smoothstep(lo, hi, x):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def vertex_fade(arm_share, y_cm):
    """How solid the skin is at a vertex, 0..1: the smaller of the fade into
    the torso (by the arm's share of its weights) and the fade down the
    forearm (by height)."""
    return min(smoothstep(*SHARE_FADE, arm_share), smoothstep(*FOREARM_FADE_CM, y_cm))


def crop(tris, fades):
    """The triangles with at least one visible corner, renumbered over the
    vertices they use: ``(triangles, used)``, ``used`` being the old index of
    each new vertex."""
    kept = [t for t in tris if max(fades[i] for i in t) > 0.0]
    used = sorted({i for t in kept for i in t})
    index = {old: new for new, old in enumerate(used)}
    return [tuple(index[i] for i in t) for t in kept], used


def corner_surface(tri, arcs, perimeters):
    """``(arc_cm, perimeter_cm)`` for each corner of a triangle. A triangle
    with a corner off the mapped skin carries no design at all. One that
    crosses the underside seam (where arcs jump from +P/2 to -P/2) has its
    negative arcs moved a whole turn on, so it interpolates the short way."""
    corner_arcs = [arcs[i] for i in tri]
    if any(a is None for a in corner_arcs):
        return [NO_SKIN] * len(tri)
    corner_perimeters = [perimeters[i] for i in tri]
    turn = min(corner_perimeters)
    if max(corner_arcs) - min(corner_arcs) > turn / 2:
        corner_arcs = [round(a + turn, 6) if a < 0 else a for a in corner_arcs]
    return list(zip(corner_arcs, corner_perimeters))


def perimeter_table(circumference_at, lo, hi):
    """``[[y_cm, circumference_cm], ...]`` every centimetre from ``lo`` up,
    ending exactly at ``hi``: what the app needs to say how far round the arm
    a design goes, and to stop it being wider than the arm."""
    ys, y = [], lo
    while y < hi:
        ys.append(y)
        y += 1.0
    ys.append(hi)
    return [[round(y, 2), round(circumference_at(y), 2)] for y in ys]


def glb_json(path):
    """The JSON chunk of a .glb file."""
    with open(path, 'rb') as fh:
        magic, _version, _length = struct.unpack('<4sII', fh.read(12))
        if magic != b'glTF':
            raise ValueError(f'not a GLB file: {path}')
        size, kind = struct.unpack('<I4s', fh.read(8))
        if kind != b'JSON':
            raise ValueError('GLB does not start with a JSON chunk')
        return json.loads(fh.read(size))


def parse_args(argv):
    p = argparse.ArgumentParser(prog='export-arm-gltf.py', description=__doc__.split('\n')[0])
    p.add_argument('--makehuman-data', required=True,
                   help="MakeHuman checkout (its root or its makehuman/data folder)")
    p.add_argument('--out', required=True, help='output folder')
    p.add_argument('--name', default='arm-upper', help='file name without extension')
    p.add_argument('--upper-arm-length-cm', type=float, default=32.0)
    p.add_argument('--biceps-cm', type=float, default=30.0)
    p.add_argument('--above-elbow-cm', type=float, default=26.0)
    p.add_argument('--mh-sex', type=float, default=0.5,
                   help='0 (female) to 1 (male); 0.5 is MakeHuman\'s neutral body')
    p.add_argument('--subdivisions', type=int, default=1,
                   help='Catmull-Clark levels over MakeHuman\'s cage (0 to 2)')
    p.add_argument('--draco', action='store_true', help='Draco-compress the mesh')
    return p.parse_args(argv)


# --------------------------------------------------------------------------
# Blender
# --------------------------------------------------------------------------

def load_render_module():
    """render-on-body.py as a module: its MakeHuman loader and fit are reused
    as they are, so the app's arm is the arm the renders show."""
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location(
        'render_on_body', os.path.join(here, 'render-on-body.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv=None):
    import bpy  # noqa: PLC0415
    from array import array  # noqa: PLC0415

    if argv is None:
        argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse_args(argv)
    rob = load_render_module()
    rob.MH_SUBDIVISIONS = args.subdivisions
    bpy.ops.wm.read_factory_settings(use_empty=True)

    L = args.upper_arm_length_cm
    data = rob.makehuman_data_dir(os.path.expanduser(args.makehuman_data))
    cage, faces, shares, info = rob.load_makehuman_upper_arm(
        data, length_cm=L, side='outer', sex=args.mh_sex, muscle=0.5, weight=0.5)
    body, points, tris, shares = rob.subdivided_cage(bpy, cage, faces, 'Body', shares)
    bpy.data.meshes.remove(body)
    arm, upper = shares['arm'], shares['upper']

    arm_tris = [t for t in tris if min(arm[i] for i in t) >= 0.5]
    mapped = bytearray(len(points))
    for t in tris:
        if min(upper[i] for i in t) >= 0.5:
            for i in t:
                mapped[i] = 1
    fit = rob.fit_and_map(
        points, arm_tris, step=rob.MH_STATION_STEP_CM, y_range=(-3.0, L),
        wrist=(rob.MH_ABOVE_ELBOW_AT * L, args.above_elbow_cm),
        elbow=(rob.MH_BICEPS_AT * L, args.biceps_cm),
        share=arm, mapped=mapped, open_ends=True,
        axis_range=tuple(f * L for f in rob.MH_AXIS_RANGE))
    fitted, arcs, perimeters = fit['points'], fit['arcs'], fit['perimeters']

    fades = [vertex_fade(arm[i], p[1]) for i, p in enumerate(fitted)]
    kept, used = crop(tris, fades)
    mesh = bpy.data.meshes.new('Arm')
    mesh.from_pydata([tuple(c * rob.CM for c in fitted[i]) for i in used], [], kept)
    mesh.update()
    # Blender's exporter writes v as 1 - v, so store 1 - value to get value.
    surface, fade_uv = array('f'), array('f')
    old_tris = [tuple(used[i] for i in t) for t in kept]
    for tri in old_tris:
        for (arc, perimeter), i in zip(corner_surface(tri, arcs, perimeters), tri):
            surface.extend((arc, 1.0 - perimeter))
            fade_uv.extend((fades[i], 1.0))
    mesh.uv_layers.new(name='Surface').data.foreach_set('uv', surface)
    mesh.uv_layers.new(name='Fade').data.foreach_set('uv', fade_uv)
    mesh.polygons.foreach_set('use_smooth', [True] * len(mesh.polygons))
    mesh.update()
    obj = bpy.data.objects.new('Arm', mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    out = os.path.expanduser(args.out)
    os.makedirs(out, exist_ok=True)
    glb = os.path.join(out, args.name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True, export_yup=False,
        export_materials='NONE', export_texcoords=True, export_normals=True,
        export_draco_mesh_compression_enable=args.draco,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14)

    primitive = glb_json(glb)['meshes'][0]['primitives'][0]
    attributes = sorted(primitive.get('attributes', {}))
    skin_ys = [fitted[i][1] for i in used if mapped[i]]
    lo, hi = min(skin_ys), max(skin_ys)
    meta = {
        'generator': 'scripts/blender/export-arm-gltf.py',
        'source': 'MakeHuman base mesh and targets (CC0 1.0)',
        'frame': 'metres; origin at the elbow joint; +y to the shoulder; +z out of the outer arm',
        'attributes': {
            'TEXCOORD_0': '(arc_cm, perimeter_cm); perimeter 0 = no design',
            'TEXCOORD_1': '(fade, 0); 1 solid, 0 dissolved'},
        'measurements_cm': {'upper_arm_length': L, 'biceps': args.biceps_cm,
                            'above_elbow': args.above_elbow_cm},
        'mh_sex': args.mh_sex, 'subdivisions': args.subdivisions, 'draco': args.draco,
        'skin_cm': [round(lo, 1), round(hi, 1)],
        'perimeter_cm': perimeter_table(lambda y: rob.fitted_circumference(fit, y),
                                        round(lo, 1), round(hi, 1)),
        'vertices': len(used), 'triangles': len(kept),
        'gltf_attributes': attributes, 'bytes': os.path.getsize(glb),
    }
    with open(os.path.join(out, args.name + '.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, indent=1)
        fh.write('\n')
    print(f'[export-arm-gltf] {glb}: {meta["vertices"]} vertices, {meta["triangles"]} '
          f'triangles, {meta["bytes"]} bytes, attributes {attributes}', flush=True)
    for needed in ('TEXCOORD_0', 'TEXCOORD_1', 'NORMAL'):
        if needed not in attributes:
            raise SystemExit(f'[export-arm-gltf] the export lost {needed}')


if __name__ == '__main__':
    main()
