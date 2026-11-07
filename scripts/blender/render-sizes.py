#!/usr/bin/env python3
"""Render one concept at several sizes on the same body, to compare them.

    npm run render:body -- concept.png 12,15,18
    npm run render:body -- concept.png 12,18 --views outer,close-up --dry-run

A wrapper round render-on-body.py (docs/BLENDER.md). It reads your measurements and
Blender settings from ~/.config/sable/render-body.json (outside the repo, so they are
never committed), draws one seed for the whole batch so every size lands on the same
body, checks every run's arguments before the first slow render starts, and writes
every size to one folder with the size in each file name, plus a summary.txt. Any other option is
passed through to render-on-body.py and overrides the config.

Plain Python (no Blender) apart from the renders themselves, so it is unit tested
with ``python3 -m unittest discover -s scripts/blender``.
"""
import argparse
import collections
import contextlib
import importlib.util
import io
import json
import math
import os
import secrets
import shlex
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
RENDER_ON_BODY = os.path.join(HERE, 'render-on-body.py')
DEFAULT_CONFIG = os.path.join('~', '.config', 'sable', 'render-body.json')
DEFAULT_OUT = os.path.join('~', 'Pictures', 'sable-renders')
MAC_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'

_spec = importlib.util.spec_from_file_location('render_on_body', RENDER_ON_BODY)
rob = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rob)

PLACEMENTS = tuple(rob.PLACEMENTS)
CONFIG_KEYS = ('blender', 'out', 'seed', 'render') + PLACEMENTS
# Set by this wrapper for every run, so neither the config nor the command line may.
OWN_FLAGS = ('image', 'width-cm', 'out', 'label', 'seed')
# render-on-body's mutually exclusive skin options: one on the command line
# replaces whichever the config chose.
SKIN_FLAGS = ('skin-tone', 'skin-rgb', 'skin')
SHORT_PLACEMENT = {'upper-arm': 'upper'}
# Rough timings on the Intel Mac (Nov 2026): ink prep per run, then each view.
PREP_SECONDS, VIEW_SECONDS = 50, 60

Run = collections.namedtuple('Run', 'width_cm label out_dir params_file argv views args')


class ConfigError(ValueError):
    pass


class PlanError(ValueError):
    pass


def parse_sizes(text):
    """``'12,15,18'`` → ``[12.0, 15.0, 18.0]``: printed widths in cm, in order."""
    sizes = []
    for part in text.split(','):
        try:
            size = float(part.strip())
        except ValueError:
            raise ValueError(f'sizes are numbers in cm separated by commas, got {text!r}') \
                from None
        if not math.isfinite(size) or size <= 0:
            raise ValueError(f'each size must be more than 0 cm, got {part.strip()!r}')
        if size in sizes:
            raise ValueError(f'{format_cm(size)} cm is listed twice')
        sizes.append(size)
    return sizes


def format_cm(value):
    return f'{value:g}'


def safe_stem(path):
    """The image's name without its extension, as a plain file name."""
    stem = os.path.splitext(os.path.basename(path))[0]
    out, gap = [], False
    for ch in stem:
        if ch in rob.LABEL_CHARS:
            if gap and out:
                out.append('-')
            out.append(ch)
            gap = False
        else:
            gap = True
    return ''.join(out).strip('.-') or 'design'


def run_label(stem, width_cm, placement, side):
    place = SHORT_PLACEMENT.get(placement, placement)
    return f'{stem}-{format_cm(width_cm)}cm-{place}-{side}'


def batch_folder(stem, placement, side):
    """One folder per concept and spot, shared by every size, so the sizes sit
    side by side in Finder and AirDrop in one go."""
    return f'{stem}-{SHORT_PLACEMENT.get(placement, placement)}-{side}'


def resolve_path(path, env):
    """An absolute path. ``npm run`` starts scripts in the repo root, so a relative
    path is taken from where the command was typed (npm's ``INIT_CWD``)."""
    path = os.path.expanduser(path)
    return os.path.normpath(os.path.join(env.get('INIT_CWD') or os.getcwd(), path))


def _check_flags(where, flags):
    if not isinstance(flags, dict):
        raise ConfigError(f'"{where}" must be an object of render-on-body options')
    for name, value in flags.items():
        if name in OWN_FLAGS:
            raise ConfigError(f'"{where}" sets --{name}, which render-sizes sets itself')
        if isinstance(value, bool) or not isinstance(value, (str, int, float)):
            raise ConfigError(f'"{where}" → "{name}" must be a number or text')


def load_config(path):
    """The config file as a dict, or ``{}`` when there is none."""
    try:
        with open(os.path.expanduser(path), encoding='utf-8') as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as err:
        raise ConfigError(f'cannot read {path}: {err}') from None
    if not isinstance(data, dict):
        raise ConfigError(f'{path} must hold a JSON object')
    for key, value in data.items():
        if key not in CONFIG_KEYS:
            raise ConfigError(f'unknown key "{key}" in {path} (known: {", ".join(CONFIG_KEYS)})')
        if key in ('blender', 'out') and not isinstance(value, str):
            raise ConfigError(f'"{key}" must be a path')
        if key == 'seed' and (isinstance(value, bool) or not isinstance(value, int)
                              or value < 0):
            raise ConfigError('"seed" must be a whole number 0 or more')
        if key == 'render' or key in PLACEMENTS:
            _check_flags(key, value)
    return data


def _flags(mapping):
    argv = []
    for name, value in mapping.items():
        text = str(value)
        argv += [f'--{name}', os.path.expanduser(text) if text.startswith('~') else text]
    return argv


def choose_seed(cli_seed, config, draw=lambda: secrets.randbelow(2 ** 31)):
    if cli_seed is not None:
        return cli_seed
    if config.get('seed') is not None:
        return config['seed']
    return draw()


def _parse(argv):
    """render-on-body's own parse, with its usage errors turned into PlanError."""
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            return rob.parse_args(['--'] + argv)
    except SystemExit:
        lines = [ln for ln in err.getvalue().strip().splitlines() if ln]
        raise PlanError(lines[-1] if lines else 'render-on-body rejected the options') from None


def _flag_name(arg):
    return arg[2:].split('=', 1)[0] if arg.startswith('--') else None


def _own_values_held(args, image, width, out_dir, label, seed):
    """True if the parse kept the values this wrapper set. An abbreviation on the
    command line (``--wid 9``) gets past the name check but not this."""
    return (args.image, args.width_cm, args.out, args.label, args.seed) == \
        (image, width, out_dir, label, seed)


def _inside(path, root):
    path, root = os.path.realpath(path), os.path.realpath(root)
    return path == root or path.startswith(root + os.sep)


def plan_runs(image, sizes, config, extra, *, seed, out_root):
    """Every render in the batch, each one's arguments already checked."""
    for arg in extra:
        name = _flag_name(arg)
        if name in OWN_FLAGS:
            raise PlanError(f'--{name} is set by render-sizes for every run')
    out_root = os.path.abspath(os.path.expanduser(out_root))
    if _inside(out_root, REPO_ROOT):
        raise PlanError(f'renders are personal: write them outside the repo, not {out_root}')
    render = dict(config.get('render', {}))
    if any(_flag_name(a) in SKIN_FLAGS for a in extra):
        render = {k: v for k, v in render.items() if k not in SKIN_FLAGS}
    common = _flags(render)
    probe = ['--image', image, '--width-cm', '1', '--out', out_root]
    placement = _parse(probe + common + extra).placement
    section = _flags(config.get(placement, {}))
    stem = safe_stem(image)
    runs = []
    for width in sizes:
        head = ['--image', image, '--width-cm', format_cm(width), '--seed', str(seed)]
        # Placement and side can come from the config or the command line, so
        # parse once to learn them, then again with the label they give.
        args = _parse(head + ['--out', out_root] + common + section + extra)
        label = run_label(stem, width, args.placement, args.side)
        out_dir = os.path.join(out_root, batch_folder(stem, args.placement, args.side))
        if _inside(out_dir, REPO_ROOT):
            raise PlanError(f'{out_dir} leads back into the repo; renders are personal')
        argv = head + ['--out', out_dir, '--label', label] + common + section + extra
        args = _parse(argv)
        if not _own_values_held(args, image, float(format_cm(width)), out_dir, label, seed):
            raise PlanError('an option on the command line overrides --image, --width-cm, '
                            '--out, --label or --seed, which render-sizes sets itself')
        params_file = os.path.join(out_dir, rob.params_filename(label))
        runs.append(Run(width, label, out_dir, params_file, argv, list(args.views), args))
    return runs


def find_blender(config, env, exists=os.path.exists, which=shutil.which):
    if config.get('blender'):
        return os.path.expanduser(config['blender'])
    if env.get('BLENDER'):
        return env['BLENDER']
    if exists(MAC_BLENDER):
        return MAC_BLENDER
    return which('blender')


def blender_command(blender, run):
    # Blender exits 0 when a -P script raises unless told otherwise.
    return [blender, '-b', '--python-exit-code', '1', '-P', RENDER_ON_BODY, '--'] + run.argv


def estimate_minutes(*, sizes, views):
    return math.ceil(sizes * (PREP_SECONDS + views * VIEW_SECONDS) / 60)


def summarise(results):
    """One line per size from its params.json: how tall, how far round, and
    how it measured on the rendered arm."""
    lines = []
    for width, params in results:
        head = f'{format_cm(width)} cm'
        if params is None:
            lines.append(f'{head}: no params.json (did the render finish?)')
            continue
        widths = [s['width_cm'] for s in params['measured_cm']['width_round_arm'].values()]
        lo, hi = min(widths), max(widths)
        round_arm = format_cm(lo) if lo == hi else f'{format_cm(lo)}–{format_cm(hi)}'
        line = (f'{head} wide, {format_cm(params["design_cm"]["height"])} cm tall: '
                f'wraps {params["at_design_centre"]["wraps_degrees"]:.0f}° round the arm; '
                f'measured {round_arm} cm round, '
                f'{format_cm(params["measured_cm"]["length_along_arm_cm"])} cm along')
        count = len(params.get('warnings', []))
        if count:
            line += f'; {count} warning{"s" if count > 1 else ""} (see params.json)'
        lines.append(line)
    return lines


def _read_params(path):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def parse_cli(argv):
    if len(argv) < 2 or argv[0].startswith('-') or argv[1].startswith('-'):
        raise PlanError('usage: render-sizes IMAGE SIZES [options], e.g. concept.png 12,15,18')
    p = argparse.ArgumentParser(prog='render-sizes', allow_abbrev=False, add_help=False)
    p.add_argument('--config', default=DEFAULT_CONFIG)
    p.add_argument('--out', default=None)
    p.add_argument('--seed', type=rob._seed, default=None)
    p.add_argument('--dry-run', action='store_true')
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            opts, extra = p.parse_known_args(argv[2:])
    except SystemExit:
        raise PlanError(err.getvalue().strip().splitlines()[-1]) from None
    return argv[0], argv[1], opts, extra


def main(argv=None, run=lambda cmd, cwd: subprocess.run(cmd, cwd=cwd).returncode,
         exists=os.path.exists):
    argv = sys.argv[1:] if argv is None else list(argv)
    if '-h' in argv or '--help' in argv:
        print(__doc__.strip())
        return 0
    try:
        image, sizes_text, opts, extra = parse_cli(argv)
        sizes = parse_sizes(sizes_text)
        image = resolve_path(image, os.environ)
        if not os.path.isfile(image):
            raise PlanError(f'no such image: {image}')
        config = load_config(resolve_path(opts.config, os.environ))
        seed = choose_seed(opts.seed, config)
        out_root = resolve_path(opts.out or config.get('out') or DEFAULT_OUT, os.environ)
        runs = plan_runs(image, sizes, config, extra, seed=seed, out_root=out_root)
        blender = find_blender(config, os.environ, exists=exists)
        if not blender:
            raise PlanError('Blender not found: set "blender" in the config or $BLENDER')
    except (ValueError, ConfigError, PlanError) as err:
        print(f'[render-sizes] {err}', file=sys.stderr)
        return 2

    views = len(runs[0].views)
    source = ('from --seed' if opts.seed is not None else
              'from the config' if config.get('seed') is not None else 'drawn fresh')
    print(f'[render-sizes] {len(runs)} size(s) × {views} view(s), seed {seed} ({source}) for '
          f'every size (pass --seed {seed} to render this body again); roughly '
          f'{estimate_minutes(sizes=len(runs), views=views)} min', flush=True)
    if not os.path.exists(resolve_path(opts.config, os.environ)):
        print(f'[render-sizes] no config at {opts.config}: using the default arm '
              '(see docs/BLENDER.md, "Several sizes at once")', flush=True)
    results = []
    for i, r in enumerate(runs, 1):
        cmd = blender_command(blender, r)
        print(f'[render-sizes] {i}/{len(runs)} {format_cm(r.width_cm)} cm → {r.out_dir}',
              flush=True)
        if opts.dry_run:
            print('  ' + ' '.join(shlex.quote(c) for c in cmd), flush=True)
            continue
        with contextlib.suppress(FileNotFoundError):
            os.remove(r.params_file)  # never report a stale one
        # From where npm was run, so relative paths passed through hold.
        code = run(cmd, os.environ.get('INIT_CWD') or os.getcwd())
        if code != 0:
            print(f'[render-sizes] Blender exited with {code} at {format_cm(r.width_cm)} cm; '
                  'stopping', file=sys.stderr)
            return 1
        results.append((r.width_cm, _read_params(r.params_file)))
    if opts.dry_run:
        return 0
    lines = summarise(results)
    for line in lines:
        print(f'[render-sizes] {line}')
    # A copy to paste into the result's notes in Sable.
    summary = os.path.join(runs[0].out_dir, 'summary.txt')
    with open(summary, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    print(f'[render-sizes] summary: {summary}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
