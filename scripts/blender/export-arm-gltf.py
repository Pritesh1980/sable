"""Export a phone-sized arm as glTF for Sable's 3D placement view (#195, #206).

Run headless with Blender (Sable itself never calls Blender):

    blender -b -P scripts/blender/export-arm-gltf.py -- \
        --makehuman-data ~/src/makehuman --out public/models [--limb forearm]

Writes ``arm-upper.glb`` and ``arm-upper.json`` (``--limb upper-arm``, the
default) or ``arm-forearm.glb`` and ``arm-forearm.json``. Each mesh is the
MakeHuman CC0 body render-on-body.py renders, fitted to the measurements and
cut down to the limb, with a per-vertex fade that lets the browser dissolve
the cut edges into the backdrop instead of showing a hollow stump.

- upper arm: the whole body with the arms lowered, the outer upper arm
  facing +z; the torso and the forearm are faded out.
- forearm: the left forearm laid out straight and palm up
  (``load_makehuman_forearm``), the inner forearm facing +z and the thumb on
  +x; the hand and the upper arm past the elbow are faded out.

What makes the browser's job easy is that the skin is unwrapped here, not
there. Every vertex carries where it is on the skin in centimetres:

    POSITION    metres. Upper arm: origin at the elbow joint, +y up the arm
                to the shoulder, +z out of the outside of the arm. Forearm:
                origin at the wrist joint, +y up to the elbow, +z out of the
                inside of the forearm
    TEXCOORD_0  (arc_cm, perimeter_cm): skin distance round the arm from the
                line down the +z side (positive towards the back of the upper
                arm, towards the thumb on the forearm), and the arm's
                circumference there. perimeter 0 means "no design here"
    TEXCOORD_1  (fade, 0): 1 is solid skin, 0 is dissolved

A design ``w`` cm wide centred ``c`` cm up the limb (above the elbow, or
above the wrist) is then just
``u = arc / w + 0.5`` and ``v = (y_cm - c) / h + 0.5`` in a fragment shader,
at true size, with no projection and no decal geometry: resizing, sliding and
turning it round the arm are uniforms.

The helpers at the top are plain Python and unit tested without Blender:
``python3 -m unittest discover -s scripts/blender``.
"""

import argparse
import importlib.util
import json
import math
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

#: The limbs this script exports, and the file each one is written to: the
#: app precaches ``models/arm-*`` (src/precache.js), so keep the prefix.
LIMBS = {'upper-arm': 'arm-upper', 'forearm': 'arm-forearm'}
#: Forearm: height above the wrist joint over which the hand fades in, and
#: height past the elbow joint over which the upper arm fades out.
HAND_FADE_CM = (-4.0, 0.5)
PAST_ELBOW_FADE_CM = (1.0, 6.0)
#: Forearm skin a design may go on: from just above the wrist bone to clear of
#: the elbow crease, where a stencil would fold.
FOREARM_SKIN_FROM_WRIST_CM = 1.0
FOREARM_SKIN_BELOW_ELBOW_CM = 3.0


def smoothstep(lo, hi, x):
    t = min(1.0, max(0.0, (x - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def vertex_fade(arm_share, y_cm):
    """How solid the skin is at a vertex, 0..1: the smaller of the fade into
    the torso (by the arm's share of its weights) and the fade down the
    forearm (by height)."""
    return min(smoothstep(*SHARE_FADE, arm_share), smoothstep(*FOREARM_FADE_CM, y_cm))


def forearm_fade(y_cm, length_cm):
    """How solid the forearm's skin is at height ``y_cm`` above the wrist:
    the hand dissolves below the wrist, the upper arm past the elbow."""
    lo, hi = (length_cm + d for d in PAST_ELBOW_FADE_CM)
    return min(smoothstep(*HAND_FADE_CM, y_cm), 1.0 - smoothstep(lo, hi, y_cm))


def forearm_skin(length_cm):
    """``(lo, hi)``: the heights above the wrist a forearm design may span."""
    return FOREARM_SKIN_FROM_WRIST_CM, length_cm - FOREARM_SKIN_BELOW_ELBOW_CM


def output_name(args):
    """The file name (no extension) the export writes for ``args.limb``."""
    return args.name or LIMBS[args.limb]


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


def skin_floor(ys, arm_shares, arcs, mid, fallback=0.0):
    """The lowest height a design may reach: just above the highest vertex on
    the arm, below ``mid``, that has no place on the mapped skin. The upper
    arm's skin ends raggedly towards the elbow, where the forearm's bones take
    over the weights, and a design hanging past it would be cut off."""
    unmapped = [y for y, share, arc in zip(ys, arm_shares, arcs)
                if arc is None and share >= 0.5 and y < mid]
    if not unmapped:
        return fallback
    return math.floor(max(unmapped) * 10 + 1) / 10


def skin_ceiling(ys, zs, arcs, mid, fallback):
    """The highest a design may reach: just below the lowest exported vertex
    on the outside of the arm (z > 0), above ``mid``, with no place on the
    mapped skin. Over the shoulder the upper arm's weights give way to the
    shoulder's in a ragged line; the armpit, lower down but on the inside,
    doesn't count, since a design centred on the outside never gets there."""
    unmapped = [y for y, z, arc in zip(ys, zs, arcs) if arc is None and z > 0 and y > mid]
    if not unmapped:
        return fallback
    return math.ceil(min(unmapped) * 10 - 1) / 10


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
    p.add_argument('--limb', choices=tuple(LIMBS), default='upper-arm')
    p.add_argument('--name', default=None,
                   help='file name without extension (default: arm-upper or arm-forearm)')
    p.add_argument('--upper-arm-length-cm', type=float, default=32.0)
    p.add_argument('--biceps-cm', type=float, default=30.0)
    p.add_argument('--above-elbow-cm', type=float, default=26.0)
    p.add_argument('--wrist-cm', type=float, default=17.0, help='forearm: round the wrist')
    p.add_argument('--elbow-cm', type=float, default=26.0,
                   help='forearm: round its widest, below the elbow')
    p.add_argument('--forearm-length-cm', type=float, default=25.0,
                   help='forearm: wrist joint to elbow joint')
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


def build_upper_arm(rob, data, args):
    """The outer upper arm, cut from the whole posed body. Returns the shared
    shape ``write_limb`` takes."""
    L = args.upper_arm_length_cm
    cage, faces, shares, _info = rob.load_makehuman_upper_arm(
        data, length_cm=L, side='outer', sex=args.mh_sex, muscle=0.5, weight=0.5)
    body, points, tris, shares = rob.subdivided_cage(args.bpy, cage, faces, 'Body', shares)
    args.bpy.data.meshes.remove(body)
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
    fitted, arcs = fit['points'], fit['arcs']
    fades = [vertex_fade(arm[i], p[1]) for i, p in enumerate(fitted)]
    kept, used = crop(tris, fades)
    skin_ys = [fitted[i][1] for i in used if mapped[i]]
    hi = skin_ceiling([fitted[i][1] for i in used], [fitted[i][2] for i in used],
                      [arcs[i] for i in used], mid=L / 2, fallback=max(skin_ys))
    lo = skin_floor([p[1] for p in fitted], arm, arcs, mid=L / 2, fallback=min(skin_ys))
    return {
        'fit': fit, 'fades': fades, 'kept': kept, 'used': used, 'skin': (lo, hi),
        'frame': 'metres; origin at the elbow joint; +y to the shoulder; +z out of the outer arm',
        'measurements_cm': {'upper_arm_length': L, 'biceps': args.biceps_cm,
                            'above_elbow': args.above_elbow_cm},
    }


def build_forearm(rob, data, args):
    """The left forearm, straight and palm up, inner forearm towards +z.
    Returns the shared shape ``write_limb`` takes."""
    L = args.forearm_length_cm
    past = PAST_ELBOW_FADE_CM[1] + 2.0
    cage, faces, _info = rob.load_makehuman_forearm(
        data, length_cm=L, side='inner', sex=args.mh_sex, muscle=0.5, weight=0.5,
        past_elbow_cm=past)
    mesh, points, tris, _ = rob.subdivided_cage(args.bpy, cage, faces, 'Forearm')
    args.bpy.data.meshes.remove(mesh)
    fit = rob.fit_and_map(
        points, tris, step=rob.MH_STATION_STEP_CM, y_range=(-3.0, L + past - 2),
        wrist=(tuple(f * L for f in rob.MH_WRIST_RANGE), args.wrist_cm),
        elbow=(tuple(f * L for f in rob.MH_ELBOW_RANGE), args.elbow_cm))
    fades = [forearm_fade(p[1], L) for p in fit['points']]
    kept, used = crop(tris, fades)
    return {
        'fit': fit, 'fades': fades, 'kept': kept, 'used': used, 'skin': forearm_skin(L),
        'frame': 'metres; origin at the wrist joint; +y to the elbow; '
                 '+z out of the inner forearm; +x the thumb side',
        'measurements_cm': {'forearm_length': L, 'wrist': args.wrist_cm, 'elbow': args.elbow_cm},
    }


BUILDERS = {'upper-arm': build_upper_arm, 'forearm': build_forearm}


def main(argv=None):
    import bpy  # noqa: PLC0415
    from array import array  # noqa: PLC0415

    if argv is None:
        argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = parse_args(argv)
    args.bpy = bpy
    rob = load_render_module()
    rob.MH_SUBDIVISIONS = args.subdivisions
    bpy.ops.wm.read_factory_settings(use_empty=True)

    data = rob.makehuman_data_dir(os.path.expanduser(args.makehuman_data))
    limb = BUILDERS[args.limb](rob, data, args)
    fit, fades, kept, used = limb['fit'], limb['fades'], limb['kept'], limb['used']
    fitted, arcs, perimeters = fit['points'], fit['arcs'], fit['perimeters']

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
    name = output_name(args)
    glb = os.path.join(out, name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=True, export_yup=False,
        export_materials='NONE', export_texcoords=True, export_normals=True,
        export_draco_mesh_compression_enable=args.draco,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14)

    primitive = glb_json(glb)['meshes'][0]['primitives'][0]
    attributes = sorted(primitive.get('attributes', {}))
    lo, hi = limb['skin']
    visible = [fitted[i][1] for i in used if fades[i] > 0.0]
    meta = {
        'generator': 'scripts/blender/export-arm-gltf.py',
        'source': 'MakeHuman base mesh and targets (CC0 1.0)',
        'limb': args.limb,
        'frame': limb['frame'],
        'attributes': {
            'TEXCOORD_0': '(arc_cm, perimeter_cm); perimeter 0 = no design',
            'TEXCOORD_1': '(fade, 0); 1 solid, 0 dissolved'},
        'measurements_cm': limb['measurements_cm'],
        'mh_sex': args.mh_sex, 'subdivisions': args.subdivisions, 'draco': args.draco,
        'skin_cm': [round(lo, 1), round(hi, 1)],
        'extent_cm': [round(min(visible), 1), round(max(visible), 1)],
        'perimeter_cm': perimeter_table(lambda y: rob.fitted_circumference(fit, y),
                                        round(lo, 1), round(hi, 1)),
        'vertices': len(used), 'triangles': len(kept),
        'gltf_attributes': attributes, 'bytes': os.path.getsize(glb),
    }
    with open(os.path.join(out, name + '.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, indent=1)
        fh.write('\n')
    print(f'[export-arm-gltf] {glb}: {meta["vertices"]} vertices, {meta["triangles"]} '
          f'triangles, {meta["bytes"]} bytes, attributes {attributes}', flush=True)
    for needed in ('TEXCOORD_0', 'TEXCOORD_1', 'NORMAL'):
        if needed not in attributes:
            raise SystemExit(f'[export-arm-gltf] the export lost {needed}')


if __name__ == '__main__':
    main()
