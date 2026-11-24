"""Unit tests for render-demo-guide.py (#194).

Run from the repo root with plain Python (no Blender needed):

    python3 -m unittest discover -s scripts/blender
"""
import contextlib
import importlib.util
import io
import os
import pathlib
import struct
import tempfile
import unittest

_SCRIPT = pathlib.Path(__file__).with_name('render-demo-guide.py')
_spec = importlib.util.spec_from_file_location('render_demo_guide', _SCRIPT)
rdg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rdg)


def _flag_values(argv, name):
    return [argv[i + 1] for i, a in enumerate(argv) if a == name]


def _make_vp8_webp(width=683, height=1024, payload_len=160):
    vp8 = (
        b'\x00\x00\x00\x9d\x01\x2a'
        + struct.pack('<HH', width & 0x3FFF, height & 0x3FFF)
        + b'\x00' * max(0, payload_len - 10)
    )
    pad = b'\x00' if len(vp8) % 2 else b''
    riff_body = b'WEBP' + b'VP8 ' + struct.pack('<I', len(vp8)) + vp8 + pad
    return b'RIFF' + struct.pack('<I', len(riff_body)) + riff_body


class Shots(unittest.TestCase):
    def test_every_shot_sources_fictional_design_and_targets_docs_images(self):
        repo = pathlib.Path(os.path.realpath(rdg.REPO_ROOT))
        self.assertGreaterEqual(len(rdg.SHOTS), 3)
        for shot in rdg.SHOTS:
            src = rdg.resolve_source(shot, repo_root=str(repo))
            dst = rdg.resolve_output(shot, repo_root=str(repo))
            self.assertTrue(src.startswith(str(repo / 'public' / 'models' / 'designs') + os.sep))
            self.assertTrue(dst.startswith(str(repo / 'docs' / 'images') + os.sep))
            self.assertTrue(dst.endswith('.webp'))

    def test_works_when_repo_root_is_a_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            real_repo = os.path.join(os.path.realpath(tmp), 'real-repo')
            os.makedirs(os.path.join(real_repo, 'public', 'models', 'designs'))
            design = os.path.join(real_repo, 'public', 'models', 'designs', 'hourglass.webp')
            with open(design, 'wb') as fh:
                fh.write(_make_vp8_webp())
            link_repo = os.path.join(tmp, 'link-repo')
            os.symlink(real_repo, link_repo)
            src = rdg.resolve_source(rdg.SHOT_BY_NAME['hero'], repo_root=link_repo)
            dst = rdg.resolve_output(rdg.SHOT_BY_NAME['hero'], repo_root=link_repo)
            self.assertTrue(src.startswith(real_repo + os.sep))
            self.assertTrue(dst.startswith(real_repo + os.sep))

    def test_select_shots_filters_or_rejects_unknown_names(self):
        self.assertEqual([s.name for s in rdg.select_shots(None)], ['hero', 'upper', 'forearm'])
        self.assertEqual([s.name for s in rdg.select_shots('forearm, hero')], ['forearm', 'hero'])
        for bad in ('', ',', 'unknown', 'hero,hero'):
            with self.subTest(bad=bad), self.assertRaises(rdg.PlanError):
                rdg.select_shots(bad)


class Guardrails(unittest.TestCase):
    def test_rejects_source_escaping_designs_folder(self):
        bad = rdg.Shot(
            name='bad', design_file='../../images/artists/real.jpg',
            out_name='out.webp', placement='upper-arm', side='outer',
            width_cm=10, skin_tone='warm-brown', view='outer',
        )
        with self.assertRaises(rdg.PlanError):
            rdg.resolve_source(bad, isfile=lambda _: True)

    def test_rejects_output_escaping_docs_images_or_symlink(self):
        bad = rdg.Shot(
            name='bad', design_file='hourglass.webp',
            out_name='../../escape.webp', placement='upper-arm', side='outer',
            width_cm=10, skin_tone='warm-brown', view='outer',
        )
        with self.assertRaises(rdg.PlanError):
            rdg.resolve_output(bad)

        with tempfile.TemporaryDirectory() as tmp:
            out_dir = os.path.join(tmp, 'docs-images')
            os.makedirs(out_dir)
            target = os.path.join(out_dir, 'gallery.png')
            with open(target, 'wb') as fh:
                fh.write(b'PNG')
            os.symlink(target, os.path.join(out_dir, 'demo-on-body-hero.webp'))
            with self.assertRaises(rdg.PlanError):
                rdg.resolve_output(rdg.SHOT_BY_NAME['hero'], out_dir=out_dir)


class Commands(unittest.TestCase):
    def test_builds_makehuman_and_parametric_commands_without_user_config(self):
        shot = rdg.SHOT_BY_NAME['hero']
        mh_argv = rdg.render_argv(
            shot, image_path='/designs/hourglass.webp', temp_dir='/tmp/out',
            body='makehuman', makehuman_data='/src/makehuman', samples=64, size=1024,
        )
        self.assertEqual(_flag_values(mh_argv, '--body'), ['makehuman'])
        self.assertEqual(_flag_values(mh_argv, '--makehuman-data'), ['/src/makehuman'])
        self.assertEqual(_flag_values(mh_argv, '--mh-sex'), ['1.0'])
        self.assertEqual(_flag_values(mh_argv, '--seed'), ['194'])
        self.assertEqual(_flag_values(mh_argv, '--ink'), ['healed'])
        self.assertEqual(_flag_values(mh_argv, '--white-point'), ['0.76'])
        self.assertEqual(_flag_values(mh_argv, '--views'), ['close-up'])

        para_argv = rdg.render_argv(
            shot, image_path='/designs/hourglass.webp', temp_dir='/tmp/out',
            body='parametric', makehuman_data=None, samples=32, size=512,
        )
        self.assertEqual(_flag_values(para_argv, '--body'), ['parametric'])
        self.assertEqual(_flag_values(para_argv, '--white-point'), ['0.76'])
        self.assertEqual(_flag_values(para_argv, '--makehuman-data'), [])
        self.assertEqual(_flag_values(para_argv, '--mh-sex'), [])

    def test_body_resolution_requires_makehuman_for_default_docs_and_allows_fallback_only_explicitly(self):
        self.assertEqual(
            rdg.resolve_body_and_makehuman(
                None, None, require_makehuman=True, has_makehuman_data=lambda _: True,
            ),
            ('makehuman', os.path.abspath(os.path.expanduser('~/src/makehuman'))),
        )
        with self.assertRaises(rdg.PlanError):
            rdg.resolve_body_and_makehuman(
                None, None, require_makehuman=True, has_makehuman_data=lambda _: False,
            )
        self.assertEqual(
            rdg.resolve_body_and_makehuman(
                None, None, require_makehuman=False, has_makehuman_data=lambda _: False,
            ),
            ('parametric', None),
        )
        self.assertEqual(
            rdg.resolve_body_and_makehuman(
                'parametric', None, require_makehuman=True, has_makehuman_data=lambda _: False,
            ),
            ('parametric', None),
        )
        with tempfile.TemporaryDirectory() as empty_dir:
            with self.assertRaises(rdg.PlanError):
                rdg.resolve_body_and_makehuman(None, empty_dir)
            with self.assertRaises(rdg.PlanError):
                rdg.resolve_body_and_makehuman('makehuman', '/missing/mh', has_makehuman_data=lambda _: False)


class WebpValidation(unittest.TestCase):
    def test_validate_webp_file_accepts_real_payload_and_rejects_header_only_stub(self):
        with tempfile.TemporaryDirectory() as tmp:
            good = os.path.join(tmp, 'good.webp')
            with open(good, 'wb') as fh:
                fh.write(_make_vp8_webp(683, 1024, 160))
            self.assertEqual(rdg.validate_webp_file(good)[:2], (683, 1024))

            stub = os.path.join(tmp, 'stub.webp')
            with open(stub, 'wb') as fh:
                fh.write(b'RIFF\x04\x00\x00\x00WEBP')
            with self.assertRaises(ValueError):
                rdg.validate_webp_file(stub)


class Main(unittest.TestCase):
    def test_dry_run_prints_commands_without_invoking_blender(self):
        seen = []
        buf = io.StringIO()
        with tempfile.TemporaryDirectory() as out_dir:
            with contextlib.redirect_stdout(buf):
                rc = rdg.main(
                    ['--only', 'forearm', '--body', 'parametric', '--out-dir', out_dir, '--dry-run'],
                    run=lambda cmd, cwd: seen.append(cmd) or 0,
                    exists=lambda p: p == rdg.rs.MAC_BLENDER,
                )
        self.assertEqual(rc, 0)
        self.assertEqual(seen, [])
        text = buf.getvalue()
        self.assertIn('render-on-body.py', text)
        self.assertIn('--convert-webp', text)

    def test_stops_when_blender_exits_nonzero(self):
        calls = []
        with tempfile.TemporaryDirectory() as out_dir:
            rc = rdg.main(
                ['--only', 'hero,upper', '--body', 'parametric', '--out-dir', out_dir],
                run=lambda cmd, cwd: calls.append(cmd) or 1,
                exists=lambda p: p == rdg.rs.MAC_BLENDER,
            )
        self.assertEqual(rc, 1)
        self.assertEqual(len(calls), 1)

    def test_fails_without_writing_destination_when_convert_writes_nothing_or_later_shot_fails(self):
        with tempfile.TemporaryDirectory() as out_dir:
            existing = os.path.join(out_dir, 'demo-on-body-hero.webp')
            original = _make_vp8_webp(100, 100, 140)
            with open(existing, 'wb') as fh:
                fh.write(original)

            # Empty/missing output from converter leaves existing file untouched and exits 1.
            rc = rdg.main(
                ['--only', 'hero', '--body', 'parametric', '--out-dir', out_dir],
                run=lambda cmd, cwd: 0,
                exists=lambda p: p == rdg.rs.MAC_BLENDER,
            )
            self.assertEqual(rc, 1)
            with open(existing, 'rb') as fh:
                self.assertEqual(fh.read(), original)

            # Shot 1 converts validly into temp stage, shot 2 fails -> hero is still not overwritten.
            valid_shot1 = _make_vp8_webp(683, 1024, 200)

            def run_stage_fail_second(cmd, cwd):
                if '--convert-webp' in cmd:
                    dst = cmd[cmd.index('--convert-webp') + 2]
                    if dst.endswith('demo-on-body-hero.webp'):
                        with open(dst, 'wb') as fh:
                            fh.write(valid_shot1)
                        return 0
                if '--label' in cmd and cmd[cmd.index('--label') + 1] == 'demo-on-body-upper':
                    return 1
                return 0

            rc2 = rdg.main(
                ['--only', 'hero,upper', '--body', 'parametric', '--out-dir', out_dir],
                run=run_stage_fail_second,
                exists=lambda p: p == rdg.rs.MAC_BLENDER,
            )
            self.assertEqual(rc2, 1)
            with open(existing, 'rb') as fh:
                self.assertEqual(fh.read(), original)
            self.assertFalse(os.path.exists(os.path.join(out_dir, 'demo-on-body-upper.webp')))

            # Both succeed -> atomic install writes both outputs cleanly.
            def run_both_ok(cmd, cwd):
                if '--convert-webp' in cmd:
                    dst = cmd[cmd.index('--convert-webp') + 2]
                    with open(dst, 'wb') as fh:
                        fh.write(_make_vp8_webp(683, 1024, 220))
                return 0

            rc3 = rdg.main(
                ['--only', 'hero,upper', '--body', 'parametric', '--out-dir', out_dir],
                run=run_both_ok,
                exists=lambda p: p == rdg.rs.MAC_BLENDER,
            )
            self.assertEqual(rc3, 0)
            self.assertTrue(os.path.isfile(os.path.join(out_dir, 'demo-on-body-upper.webp')))
            self.assertEqual(rdg.validate_webp_file(existing)[:2], (683, 1024))
