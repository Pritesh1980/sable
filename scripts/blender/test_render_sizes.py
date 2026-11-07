"""Unit tests for render-sizes.py, the batch wrapper round render-on-body.py.

Run from the repo root with plain Python (no Blender needed):

    python3 -m unittest discover -s scripts/blender
"""
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest

_SCRIPT = pathlib.Path(__file__).with_name('render-sizes.py')
_spec = importlib.util.spec_from_file_location('render_sizes', _SCRIPT)
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)

HOME = os.path.expanduser('~')
OUT = os.path.join(tempfile.gettempdir(), 'sable-renders-test')


def plan(sizes=(12.0,), config=None, extra=(), seed=7, out_root=OUT, image='/x/Koi Sketch.png'):
    return rs.plan_runs(image, list(sizes), config or {}, list(extra), seed=seed,
                        out_root=out_root)


def flag(argv, name):
    """The value of the last ``name`` in ``argv`` (argparse keeps the last)."""
    idx = [i for i, a in enumerate(argv) if a == name]
    return argv[idx[-1] + 1] if idx else None


class Sizes(unittest.TestCase):
    def test_reads_a_comma_separated_list_in_order(self):
        self.assertEqual(rs.parse_sizes('12,15,18'), [12, 15, 18])
        self.assertEqual(rs.parse_sizes(' 18 , 12.5 '), [18, 12.5])
        self.assertEqual(rs.parse_sizes('9'), [9])

    def test_rejects_anything_that_is_not_a_positive_finite_size(self):
        for bad in ('', ',', '12,,15', '0', '-3', 'nan', 'inf', 'twelve', '12cm'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                rs.parse_sizes(bad)

    def test_rejects_the_same_size_twice(self):
        with self.assertRaises(ValueError):
            rs.parse_sizes('12,15,12.0')

    def test_formats_whole_and_fractional_centimetres(self):
        self.assertEqual(rs.format_cm(12.0), '12')
        self.assertEqual(rs.format_cm(12.5), '12.5')
        self.assertEqual(rs.format_cm(7.25), '7.25')


class Names(unittest.TestCase):
    def test_stem_is_a_plain_file_name(self):
        self.assertEqual(rs.safe_stem('/a/b/Koi Sketch (v2).png'), 'Koi-Sketch-v2')
        self.assertEqual(rs.safe_stem('concept.final.webp'), 'concept.final')
        self.assertEqual(rs.safe_stem('/a/.hidden.png'), 'hidden')
        self.assertEqual(rs.safe_stem('/a/★.png'), 'design')

    def test_label_carries_the_size_placement_and_side(self):
        self.assertEqual(rs.run_label('koi', 12.0, 'upper-arm', 'outer'), 'koi-12cm-upper-outer')
        self.assertEqual(rs.run_label('koi', 12.5, 'forearm', 'inner'),
                         'koi-12.5cm-forearm-inner')


class Paths(unittest.TestCase):
    def test_relative_paths_are_from_where_npm_was_run(self):
        env = {'INIT_CWD': '/Users/me/Downloads'}
        self.assertEqual(rs.resolve_path('koi.png', env), '/Users/me/Downloads/koi.png')
        self.assertEqual(rs.resolve_path('/a/koi.png', env), '/a/koi.png')
        self.assertEqual(rs.resolve_path('~/koi.png', env), os.path.join(HOME, 'koi.png'))
        self.assertEqual(rs.resolve_path('koi.png', {}), os.path.abspath('koi.png'))


class Config(unittest.TestCase):
    def write(self, data):
        fd, path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as fh:
            fh.write(data if isinstance(data, str) else json.dumps(data))
        self.addCleanup(os.remove, path)
        return path

    def test_a_missing_file_is_an_empty_config(self):
        self.assertEqual(rs.load_config('/no/such/render-body.json'), {})

    def test_reads_the_known_keys(self):
        cfg = {'blender': '/b', 'out': '~/r', 'seed': 42,
               'render': {'body': 'makehuman'}, 'upper-arm': {'biceps-cm': 30},
               'forearm': {'wrist-cm': 17}}
        self.assertEqual(rs.load_config(self.write(cfg)), cfg)

    def test_rejects_broken_json_unknown_keys_and_bad_values(self):
        bad = ['{', '[]', {'colour': 'red'}, {'render': []}, {'seed': -1}, {'seed': True},
               {'seed': 1.5}, {'out': 3}, {'render': {'samples': True}},
               {'render': {'views': ['outer']}}, {'render': {'image': 'a.png'}},
               {'upper-arm': {'width-cm': 12}}, {'render': {'out': 'x'}},
               {'render': {'label': 'x'}}, {'render': {'seed': 3}}]
        for data in bad:
            with self.subTest(data=data), self.assertRaises(rs.ConfigError):
                rs.load_config(self.write(data))


class Seed(unittest.TestCase):
    def test_the_command_line_wins_then_the_config_then_a_fresh_draw(self):
        self.assertEqual(rs.choose_seed(5, {'seed': 9}, draw=lambda: 1), 5)
        self.assertEqual(rs.choose_seed(None, {'seed': 9}, draw=lambda: 1), 9)
        self.assertEqual(rs.choose_seed(None, {}, draw=lambda: 1), 1)
        self.assertEqual(rs.choose_seed(0, {'seed': 9}, draw=lambda: 1), 0)


class Plan(unittest.TestCase):
    def test_one_run_per_size_with_the_same_seed(self):
        runs = plan(sizes=(12, 15, 18), seed=42)
        self.assertEqual([r.width_cm for r in runs], [12, 15, 18])
        self.assertEqual({flag(r.argv, '--seed') for r in runs}, {'42'})
        self.assertEqual([flag(r.argv, '--width-cm') for r in runs], ['12', '15', '18'])
        self.assertEqual({flag(r.argv, '--image') for r in runs}, {'/x/Koi Sketch.png'})

    def test_every_size_shares_one_folder_with_the_size_in_each_name(self):
        r12, r18 = plan(sizes=(12, 18))
        self.assertEqual(r12.label, 'Koi-Sketch-12cm-upper-outer')
        self.assertEqual(r12.out_dir, os.path.join(OUT, 'Koi-Sketch-upper-outer'))
        self.assertEqual(r18.out_dir, r12.out_dir)
        self.assertEqual(flag(r12.argv, '--out'), r12.out_dir)
        self.assertEqual(flag(r12.argv, '--label'), r12.label)
        self.assertEqual(r12.params_file, os.path.join(r12.out_dir,
                                                       'Koi-Sketch-12cm-upper-outer-params.json'))

    def test_passes_the_config_flags_with_home_expanded(self):
        cfg = {'render': {'body': 'makehuman', 'makehuman-data': '~/src/makehuman',
                          'samples': 32}}
        argv = plan(config=cfg)[0].argv
        self.assertEqual(flag(argv, '--body'), 'makehuman')
        self.assertEqual(flag(argv, '--makehuman-data'), os.path.join(HOME, 'src/makehuman'))
        self.assertEqual(flag(argv, '--samples'), '32')

    def test_uses_only_the_measurements_for_the_placement_being_rendered(self):
        cfg = {'upper-arm': {'biceps-cm': 31}, 'forearm': {'wrist-cm': 16}}
        upper = plan(config=cfg)[0]
        self.assertEqual(flag(upper.argv, '--biceps-cm'), '31')
        self.assertIsNone(flag(upper.argv, '--wrist-cm'))
        fore = plan(config=cfg, extra=['--placement', 'forearm'])[0]
        self.assertEqual(flag(fore.argv, '--wrist-cm'), '16')
        self.assertIsNone(flag(fore.argv, '--biceps-cm'))
        self.assertEqual(fore.label, 'Koi-Sketch-12cm-forearm-inner')

    def test_a_placement_in_the_config_picks_its_section_too(self):
        cfg = {'render': {'placement': 'forearm'}, 'forearm': {'wrist-cm': 16}}
        self.assertEqual(flag(plan(config=cfg)[0].argv, '--wrist-cm'), '16')

    def test_extra_arguments_override_the_config(self):
        cfg = {'render': {'views': 'outer'}, 'upper-arm': {'biceps-cm': 31}}
        run = plan(config=cfg, extra=['--views', 'close-up', '--biceps-cm=29',
                                      '--side', 'inner'])[0]
        self.assertEqual(run.views, ['close-up'])
        self.assertEqual(run.args.biceps_cm, 29)
        self.assertEqual(run.argv[-5:], ['--views', 'close-up', '--biceps-cm=29',
                                         '--side', 'inner'])
        self.assertEqual(run.label, 'Koi-Sketch-12cm-upper-inner')

    def test_refuses_arguments_the_wrapper_sets_itself(self):
        for extra in (['--image', 'b.png'], ['--width-cm', '9'], ['--out', '/tmp/x'],
                      ['--out=/tmp/x'], ['--label', 'x'], ['--seed', '3']):
            with self.subTest(extra=extra), self.assertRaises(rs.PlanError):
                plan(extra=extra)

    def test_refuses_abbreviations_of_the_arguments_it_sets(self):
        for extra in (['--wid', '9'], ['--o', '/tmp/x'], ['--lab', 'x'], ['--ima', 'b.png'],
                      ['--se', '3']):
            with self.subTest(extra=extra), self.assertRaises(rs.PlanError):
                plan(extra=extra)

    def test_a_skin_on_the_command_line_replaces_the_configs(self):
        cfg = {'render': {'skin-tone': rs.rob.DEFAULT_SKIN_TONE}}
        run = plan(config=cfg, extra=['--skin', '#ba8e68'])[0]
        self.assertEqual(run.args.skin, '#ba8e68')
        self.assertNotIn('--skin-tone', run.argv)
        self.assertEqual(flag(plan(config=cfg)[0].argv, '--skin-tone'), rs.rob.DEFAULT_SKIN_TONE)

    def test_refuses_a_size_folder_that_leads_back_into_the_repo(self):
        root = tempfile.mkdtemp()
        os.symlink(rs.REPO_ROOT, os.path.join(root, 'Koi-Sketch-upper-outer'))
        with self.assertRaises(rs.PlanError):
            plan(out_root=root)

    def test_checks_every_run_before_any_render_starts(self):
        for extra in (['--views', 'sideways'], ['--biceps-cm', '-2'], ['--colour', 'red'],
                      ['--wrist-cm', '17']):
            with self.subTest(extra=extra), self.assertRaises(rs.PlanError):
                plan(extra=extra)

    def test_refuses_to_write_renders_inside_the_repo(self):
        for inside in (rs.REPO_ROOT, os.path.join(rs.REPO_ROOT, 'renders')):
            with self.subTest(inside=inside), self.assertRaises(rs.PlanError):
                plan(out_root=inside)

    def test_blender_command_runs_render_on_body_headless(self):
        run = plan()[0]
        cmd = rs.blender_command('/Apps/Blender', run)
        # Without --python-exit-code Blender exits 0 when the script raises.
        self.assertEqual(cmd[:6], ['/Apps/Blender', '-b', '--python-exit-code', '1', '-P',
                                   rs.RENDER_ON_BODY])
        self.assertEqual(cmd[6], '--')
        self.assertEqual(cmd[7:], run.argv)


class FindBlender(unittest.TestCase):
    def test_config_then_environment_then_the_mac_app_then_the_path(self):
        app = rs.MAC_BLENDER
        yes = lambda p: True  # noqa: E731
        self.assertEqual(rs.find_blender({'blender': '~/B'}, {'BLENDER': '/e'}, exists=yes,
                                         which=lambda n: None), os.path.join(HOME, 'B'))
        self.assertEqual(rs.find_blender({}, {'BLENDER': '/e'}, exists=yes,
                                         which=lambda n: None), '/e')
        self.assertEqual(rs.find_blender({}, {}, exists=lambda p: p == app,
                                         which=lambda n: '/usr/bin/blender'), app)
        self.assertEqual(rs.find_blender({}, {}, exists=lambda p: False,
                                         which=lambda n: '/usr/bin/blender'), '/usr/bin/blender')
        self.assertIsNone(rs.find_blender({}, {}, exists=lambda p: False, which=lambda n: None))


class Estimate(unittest.TestCase):
    def test_rough_minutes_for_the_batch(self):
        self.assertEqual(rs.estimate_minutes(sizes=3, views=4), 15)
        self.assertEqual(rs.estimate_minutes(sizes=1, views=1), 2)


class Summary(unittest.TestCase):
    PARAMS = {
        'design_cm': {'width': 12, 'height': 12.4},
        'at_design_centre': {'wraps_degrees': 151.3},
        'measured_cm': {'width_round_arm': {'elbow_end': {'width_cm': 11.98},
                                            'middle': {'width_cm': 12.0},
                                            'shoulder_end': {'width_cm': 11.99}},
                        'length_along_arm_cm': 12.41},
        'warnings': [],
        'makehuman': {'build': {'sex': 'male'}},
    }

    def test_one_line_per_size_with_the_wrap_and_the_fit(self):
        wide = dict(self.PARAMS, design_cm={'width': 18, 'height': 18.6},
                    at_design_centre={'wraps_degrees': 227.0},
                    warnings=['design wraps 227° round the arm, more than half way'])
        lines = rs.summarise([(12, self.PARAMS), (18, wide), (21, None)])
        self.assertEqual(len(lines), 3)
        self.assertIn('12 cm', lines[0])
        self.assertIn('12.4 cm tall', lines[0])
        self.assertIn('wraps 151°', lines[0])
        self.assertIn('11.98–12 cm round', lines[0])
        self.assertIn('12.41 cm along', lines[0])
        self.assertNotIn('warning', lines[0])
        self.assertIn('wraps 227°', lines[1])
        self.assertIn('1 warning', lines[1])
        self.assertIn('21 cm', lines[2])
        self.assertIn('no params.json', lines[2])


class Main(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.image = os.path.join(self.tmp, 'koi.png')
        open(self.image, 'wb').close()
        self.out = os.path.join(self.tmp, 'renders')
        self.config = os.path.join(self.tmp, 'render-body.json')
        with open(self.config, 'w') as fh:
            json.dump({'blender': '/Apps/Blender', 'seed': 42,
                       'upper-arm': {'biceps-cm': 30}}, fh)
        self.calls = []
        self.cwds = []

    def fake_run(self, returncode=0):
        def run(cmd, cwd):
            self.calls.append(cmd)
            self.cwds.append(cwd)
            out, label = cmd[cmd.index('--out') + 1], cmd[cmd.index('--label') + 1]
            os.makedirs(out, exist_ok=True)
            with open(os.path.join(out, label + '-params.json'), 'w') as fh:
                json.dump(Summary.PARAMS, fh)
            return returncode
        return run

    def main(self, *argv, run=None):
        return rs.main([self.image, *argv, '--config', self.config, '--out', self.out],
                       run=run or self.fake_run(), exists=lambda p: True)

    def test_renders_every_size_in_turn(self):
        self.assertEqual(self.main('12,18'), 0)
        self.assertEqual(len(self.calls), 2)
        self.assertEqual([c[c.index('--width-cm') + 1] for c in self.calls], ['12', '18'])
        self.assertEqual({c[0] for c in self.calls}, {'/Apps/Blender'})
        batch = os.path.join(self.out, 'koi-upper-outer')
        self.assertTrue(os.path.isfile(os.path.join(batch, 'koi-18cm-upper-outer-params.json')))
        with open(os.path.join(batch, 'summary.txt')) as fh:
            summary = fh.read().splitlines()
        self.assertEqual(len(summary), 2)
        self.assertTrue(summary[0].startswith('12 cm wide'))

    def test_blender_runs_where_npm_was_run_so_relative_paths_hold(self):
        os.environ['INIT_CWD'] = self.tmp
        self.addCleanup(os.environ.pop, 'INIT_CWD')
        self.assertEqual(self.main('12'), 0)
        self.assertEqual(self.cwds, [self.tmp])

    def test_a_failed_render_never_reports_an_older_params_json(self):
        stale = os.path.join(self.out, 'koi-upper-outer', 'koi-12cm-upper-outer-params.json')
        os.makedirs(os.path.dirname(stale))
        with open(stale, 'w') as fh:
            json.dump(Summary.PARAMS, fh)
        self.assertEqual(self.main('12', run=lambda cmd, cwd: 0), 0)
        self.assertFalse(os.path.exists(stale))

    def test_help_works_anywhere_in_the_command(self):
        for argv in (['--help'], ['koi.png', '12', '--help'], ['koi.png', '-h']):
            with self.subTest(argv=argv):
                self.assertEqual(rs.main(argv, run=self.fake_run()), 0)
        self.assertEqual(self.calls, [])

    def test_dry_run_renders_nothing(self):
        self.assertEqual(self.main('12,18', '--dry-run'), 0)
        self.assertEqual(self.calls, [])

    def test_stops_at_the_first_failed_render(self):
        self.assertEqual(self.main('12,18', run=self.fake_run(returncode=1)), 1)
        self.assertEqual(len(self.calls), 1)

    def test_bad_input_fails_before_blender_starts(self):
        for argv in (['12,,18'], ['12', '--views', 'sideways']):
            with self.subTest(argv=argv):
                self.assertEqual(self.main(*argv), 2)
        self.assertEqual(rs.main([os.path.join(self.tmp, 'missing.png'), '12', '--config',
                                  self.config, '--out', self.out], run=self.fake_run(),
                                 exists=lambda p: True), 2)
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
