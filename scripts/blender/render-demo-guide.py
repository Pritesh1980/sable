#!/usr/bin/env python3
"""Render fictional demo and guide imagery with Blender (#194).

    npm run render:demo-guide
    npm run render:demo-guide -- --only hero --dry-run

Uses only the fictional demo artwork under ``public/models/designs/`` and never
reads personal measurements from ``~/.config/sable/render-body.json``. Outputs
compressed WebP renders to ``docs/images/``.

Plain Python (no Blender) apart from the Blender invocations themselves, so it
is unit tested with ``python3 -m unittest discover -s scripts/blender``.
"""
import argparse
import contextlib
import dataclasses
import importlib.util
import io
import json
import os
import shlex
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
RENDER_ON_BODY = os.path.join(HERE, 'render-on-body.py')
RENDER_SIZES = os.path.join(HERE, 'render-sizes.py')
DEFAULT_MAKEHUMAN = os.path.join('~', 'src', 'makehuman')
DESIGNS_REL = os.path.join('public', 'models', 'designs')
OUT_REL = os.path.join('docs', 'images')
DEFAULT_SAMPLES = 64
DEFAULT_SIZE = 1024
DEFAULT_QUALITY = 86


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rob = _load_module('render_on_body', RENDER_ON_BODY)
rs = _load_module('render_sizes', RENDER_SIZES)
PlanError = rs.PlanError


@dataclasses.dataclass(frozen=True)
class Shot:
    """One reproducible fictional guide/demo render."""
    name: str
    design_file: str
    out_name: str
    placement: str
    side: str
    width_cm: float
    skin_tone: str
    view: str
    mh_sex: float = 0.5
    seed: int = 194


SHOTS = (
    Shot(
        name='hero',
        design_file='hourglass.webp',
        out_name='demo-on-body-hero.webp',
        placement='upper-arm',
        side='outer',
        width_cm=10,
        skin_tone='warm-brown',
        view='front-three-quarter',
    ),
    Shot(
        name='upper',
        design_file='tiger.webp',
        out_name='demo-on-body-upper.webp',
        placement='upper-arm',
        side='outer',
        width_cm=11,
        skin_tone='light-warm-brown',
        view='outer',
    ),
    Shot(
        name='forearm',
        design_file='koi.webp',
        out_name='demo-on-body-forearm.webp',
        placement='forearm',
        side='inner',
        width_cm=7,
        skin_tone='warm-brown',
        view='three-quarter',
    ),
)

SHOT_BY_NAME = {shot.name: shot for shot in SHOTS}


def select_shots(only_text):
    """Parse ``--only`` comma list or return every defined fictional shot."""
    if only_text is None:
        return list(SHOTS)
    names = [part.strip() for part in only_text.split(',') if part.strip()]
    if not names:
        raise PlanError('--only requires at least one shot name')
    selected = []
    seen = set()
    known = ', '.join(s.name for s in SHOTS)
    for name in names:
        if name not in SHOT_BY_NAME:
            raise PlanError(f'unknown shot {name!r} (choose from: {known})')
        if name in seen:
            raise PlanError(f'shot {name!r} listed twice')
        seen.add(name)
        selected.append(SHOT_BY_NAME[name])
    return selected


def resolve_source(shot, *, repo_root=REPO_ROOT, isfile=os.path.isfile):
    """Resolve and verify that the shot reads only fictional demo design art."""
    designs_root = os.path.realpath(os.path.join(repo_root, DESIGNS_REL))
    candidate = os.path.realpath(os.path.join(designs_root, shot.design_file))
    if not candidate.startswith(designs_root + os.sep):
        raise PlanError(f'fictional artwork only: {shot.design_file!r} escapes {DESIGNS_REL}')
    if not isfile(candidate):
        raise PlanError(f'missing fictional design file: {candidate}')
    return candidate


def resolve_output(shot, *, out_dir=None, repo_root=REPO_ROOT):
    """Resolve destination path safely inside ``docs/images/`` (or ``--out-dir``)."""
    root = os.path.realpath(out_dir if out_dir is not None else os.path.join(repo_root, OUT_REL))
    dest = os.path.realpath(os.path.join(root, shot.out_name))
    if not dest.startswith(root + os.sep):
        raise PlanError(f'output name escapes directory: {shot.out_name!r}')
    return dest


def resolve_body_and_makehuman(body, makehuman_data, *, env=None, isdir=os.path.isdir):
    """Resolve body type (``makehuman`` or ``parametric``) without touching user config."""
    env = os.environ if env is None else env
    mh_path = (
        rs.resolve_path(makehuman_data, env)
        if makehuman_data is not None
        else os.path.abspath(os.path.expanduser(DEFAULT_MAKEHUMAN))
    )
    if body == 'parametric':
        return 'parametric', None
    if makehuman_data is not None and not isdir(mh_path):
        raise PlanError(f'MakeHuman directory not found: {mh_path}')
    if isdir(mh_path):
        return 'makehuman', mh_path
    if body == 'makehuman':
        raise PlanError(f'MakeHuman directory not found at {mh_path}; pass --makehuman-data DIR')
    return 'parametric', None


def render_argv(shot, *, image_path, temp_dir, body, makehuman_data, samples, size):
    """Build ``render-on-body.py`` CLI arguments for one fictional shot."""
    label = os.path.splitext(shot.out_name)[0]
    argv = [
        '--image', image_path,
        '--width-cm', rs.format_cm(shot.width_cm),
        '--out', temp_dir,
        '--placement', shot.placement,
        '--side', shot.side,
        '--skin-tone', shot.skin_tone,
        '--ink', 'healed',
        '--body', body,
        '--seed', str(shot.seed),
        '--samples', str(samples),
        '--size', str(size),
        '--views', shot.view,
        '--label', label,
    ]
    if body == 'makehuman':
        argv += ['--makehuman-data', makehuman_data, '--mh-sex', str(shot.mh_sex)]
    return argv


def render_command(blender, shot_argv):
    return [blender, '-b', '--python-exit-code', '1', '-P', RENDER_ON_BODY, '--'] + list(shot_argv)


def convert_command(blender, src_png, dst_webp, *, quality=DEFAULT_QUALITY):
    return [
        blender, '-b', '--python-exit-code', '1', '-P', os.path.abspath(__file__), '--',
        '--convert-webp', src_png, dst_webp, '--quality', str(quality),
    ]


def format_shot_report(shot, params, out_path, byte_size):
    """Format compact verification line from ``params.json`` + written WebP size."""
    dims = f'{shot.width_cm:g} cm wide'
    extra = ''
    warnings = []
    if isinstance(params, dict):
        dcm = params.get('design_cm', {})
        wrap = params.get('at_design_centre', {}).get('wraps_degrees')
        if dcm.get('height') is not None:
            dims = f'{shot.width_cm:g} × {rs.format_cm(dcm["height"])} cm'
        if wrap is not None:
            extra = f', wraps {wrap:.0f}°'
        warnings = list(params.get('warnings') or [])
    kib = byte_size / 1024
    line = f'[render-demo-guide] {shot.name}: {out_path} ({dims}{extra}, {kib:.1f} KiB)'
    if warnings:
        line += f' — {len(warnings)} warning(s): ' + '; '.join(warnings)
    return line


def _positive_int(value):
    n = int(value)
    if n <= 0:
        raise argparse.ArgumentTypeError('must be a positive integer')
    return n


def _quality_int(value):
    n = int(value)
    if not 1 <= n <= 100:
        raise argparse.ArgumentTypeError('quality must be 1..100')
    return n


def parse_cli(argv):
    argv = list(argv)
    if '--' in argv and '--convert-webp' in argv:
        argv = argv[argv.index('--') + 1:]
    p = argparse.ArgumentParser(
        prog='render-demo-guide',
        description='Render fictional demo & guide on-body imagery (#194).',
    )
    p.add_argument('--only', default=None,
                   help='comma-separated subset of shots (hero,upper,forearm)')
    p.add_argument('--body', choices=('makehuman', 'parametric'), default=None,
                   help='body mesh (defaults to makehuman when available)')
    p.add_argument('--makehuman-data', default=None,
                   help=f'MakeHuman directory (default: {DEFAULT_MAKEHUMAN})')
    p.add_argument('--samples', type=_positive_int, default=DEFAULT_SAMPLES,
                   help=f'Cycles samples (default: {DEFAULT_SAMPLES})')
    p.add_argument('--size', type=_positive_int, default=DEFAULT_SIZE,
                   help=f'long image edge in pixels (default: {DEFAULT_SIZE})')
    p.add_argument('--quality', type=_quality_int, default=DEFAULT_QUALITY,
                   help=f'WebP quality 1..100 (default: {DEFAULT_QUALITY})')
    p.add_argument('--out-dir', default=None,
                   help=f'output folder (default: {OUT_REL})')
    p.add_argument('--dry-run', action='store_true',
                   help='print the Blender commands without running them')
    p.add_argument('--convert-webp', nargs=2, metavar=('SRC', 'DST'), default=None,
                   help=argparse.SUPPRESS)
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            return p.parse_args(argv)
    except SystemExit as exc:
        if exc.code == 0:
            raise
        lines = [ln for ln in err.getvalue().strip().splitlines() if ln]
        raise PlanError(lines[-1] if lines else 'invalid render-demo-guide arguments') from None


def _convert_webp_in_blender(src, dst, quality):
    import bpy  # noqa: PLC0415

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    img = bpy.data.images.load(os.path.abspath(src), check_existing=False)
    img.colorspace_settings.name = 'sRGB'
    settings = scene.render.image_settings
    settings.file_format = 'WEBP'
    settings.color_mode = 'RGB'
    settings.quality = quality
    out_abs = os.path.abspath(dst)
    os.makedirs(os.path.dirname(out_abs), exist_ok=True)
    img.save_render(out_abs, scene=scene)


def _read_params(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def main(argv=None, *, run=lambda cmd, cwd: subprocess.run(cmd, cwd=cwd).returncode,
         repo_root=REPO_ROOT, isfile=os.path.isfile, isdir=os.path.isdir,
         exists=os.path.exists):
    argv = sys.argv[1:] if argv is None else list(argv)
    if argv and argv[0] in ('-h', '--help') and '--convert-webp' not in argv:
        parse_cli(argv)
        return 0
    try:
        args = parse_cli(argv)
    except PlanError as err:
        print(f'[render-demo-guide] {err}', file=sys.stderr)
        return 2

    if args.convert_webp:
        src, dst = args.convert_webp
        _convert_webp_in_blender(src, dst, args.quality)
        return 0

    try:
        shots = select_shots(args.only)
        out_dir = rs.resolve_path(args.out_dir, os.environ) if args.out_dir else None
        planned = []
        for shot in shots:
            src_img = resolve_source(shot, repo_root=repo_root, isfile=isfile)
            dst_webp = resolve_output(shot, out_dir=out_dir, repo_root=repo_root)
            planned.append((shot, src_img, dst_webp))
        body, mh_dir = resolve_body_and_makehuman(
            args.body, args.makehuman_data, env=os.environ, isdir=isdir,
        )
        # Never pass personal render-body.json config into fictional guide renders.
        blender = rs.find_blender({}, os.environ, exists=exists)
        if not blender:
            raise PlanError('Blender not found: set $BLENDER or install Blender')
    except PlanError as err:
        print(f'[render-demo-guide] {err}', file=sys.stderr)
        return 2

    print(f'[render-demo-guide] {len(planned)} shot(s), body={body}, '
          f'samples={args.samples}, size={args.size}', flush=True)

    with tempfile.TemporaryDirectory(prefix='sable-demo-guide-') as tmp_root:
        for i, (shot, src_img, dst_webp) in enumerate(planned, 1):
            label = os.path.splitext(shot.out_name)[0]
            tmp_dir = os.path.join(tmp_root, shot.name)
            r_argv = render_argv(
                shot, image_path=src_img, temp_dir=tmp_dir, body=body,
                makehuman_data=mh_dir, samples=args.samples, size=args.size,
            )
            r_cmd = render_command(blender, r_argv)
            src_png = os.path.join(tmp_dir, rob.view_filename(shot.view, label))
            c_cmd = convert_command(blender, src_png, dst_webp, quality=args.quality)
            print(f'[render-demo-guide] {i}/{len(planned)} {shot.name} → {dst_webp}', flush=True)
            if args.dry_run:
                print('  ' + ' '.join(shlex.quote(c) for c in r_cmd), flush=True)
                print('  ' + ' '.join(shlex.quote(c) for c in c_cmd), flush=True)
                continue
            code = run(r_cmd, repo_root)
            if code != 0:
                print(f'[render-demo-guide] Blender render exited {code} at {shot.name}',
                      file=sys.stderr)
                return 1
            code = run(c_cmd, repo_root)
            if code != 0:
                print(f'[render-demo-guide] WebP convert exited {code} at {shot.name}',
                      file=sys.stderr)
                return 1
            params = _read_params(os.path.join(tmp_dir, rob.params_filename(label)))
            byte_size = os.path.getsize(dst_webp) if os.path.isfile(dst_webp) else 0
            print(format_shot_report(shot, params, dst_webp, byte_size), flush=True)

    return 0


if __name__ == '__main__':
    sys.exit(main())
