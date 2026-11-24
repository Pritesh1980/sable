"""Unit tests for render-demo-guide.py (#194).

Run from the repo root with plain Python (no Blender needed):

    python3 -m unittest discover -s scripts/blender
"""
import importlib.util
import io
import contextlib
import os
import pathlib
import tempfile
import unittest

_SCRIPT = pathlib.Path(__file__).with_name('render-demo-guide.py')
_spec = importlib.util.spec_from_file_location('render_demo_guide', _SCRIPT)
rdg = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rdg)


def _flag_values(argv, name):
    return [argv[i + 1] for i, a in enumerate(argv) if a == name]


class Shots(unittest.TestCase):
    def test_every_shot_sources_fictional_design_and_targets_docs_images(self):
        repo = pathlib.Path(rdg.REPO_ROOT)
        self.assertGreaterEqual(len(rdg.SHOTS), 3)
        for shot in rdg.SHOTS:
            src = rdg.resolve_source(shot, repo_root=str(repo))
            dst = rdg.resolve_output(shot, repo_root=str(repo))
            self.assertTrue(src.startswith(str(repo / 'public' / 'models' / 'designs') + os.sep))
            self.assertTrue(dst.startswith(str(repo / 'docs' / 'images') + os.sep))
            self.assertTrue(dst.endswith('.webp'))

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

    def test_rejects_output_escaping_docs_images(self):
        bad = rdg.Shot(
            name='bad', design_file='hourglass.webp',
            out_name='../../escape.webp', placement='upper-arm', side='outer',
            width_cm=10, skin_tone='warm-brown', view='outer',
        )
        with self.assertRaises(rdg.PlanError):
            rdg.resolve_output(bad)


class Commands(unittest.TestCase):
    def test_builds_makehuman_and_parametric_commands_without_user_config(self):
        shot = rdg.SHOT_BY_NAME['hero']
        mh_argv = rdg.render_argv(
            shot, image_path='/designs/hourglass.webp', temp_dir='/tmp/out',
            body='makehuman', makehuman_data='/src/makehuman', samples=64, size=1024,
        )
        self.assertEqual(_flag_values(mh_argv, '--body'), ['makehuman'])
        self.assertEqual(_flag_values(mh_argv, '--makehuman-data'), ['/src/makehuman'])
        self.assertEqual(_flag_values(mh_argv, '--mh-sex'), ['0.5'])
        self.assertEqual(_flag_values(mh_argv, '--seed'), ['194'])
        self.assertEqual(_flag_values(mh_argv, '--ink'), ['healed'])
        self.assertEqual(_flag_values(mh_argv, '--views'), ['front-three-quarter'])

        para_argv = rdg.render_argv(
            shot, image_path='/designs/hourglass.webp', temp_dir='/tmp/out',
            body='parametric', makehuman_data=None, samples=32, size=512,
        )
        self.assertEqual(_flag_values(para_argv, '--body'), ['parametric'])
        self.assertEqual(_flag_values(para_argv, '--makehuman-data'), [])
        self.assertEqual(_flag_values(para_argv, '--mh-sex'), [])

    def test_body_resolution_prefers_makehuman_when_present_else_parametric(self):
        self.assertEqual(
            rdg.resolve_body_and_makehuman(None, None, isdir=lambda _: True),
            ('makehuman', os.path.abspath(os.path.expanduser('~/src/makehuman'))),
        )
        self.assertEqual(
            rdg.resolve_body_and_makehuman(None, None, isdir=lambda _: False),
            ('parametric', None),
        )
        with self.assertRaises(rdg.PlanError):
            rdg.resolve_body_and_makehuman('makehuman', '/missing/mh', isdir=lambda _: False)


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
