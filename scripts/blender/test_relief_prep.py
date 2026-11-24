"""Unit tests for relief-prep.py (#193).

Run from the repo root with plain Python (no Blender needed):

    python3 -m unittest discover -s scripts/blender
"""
import importlib.util
import os
import pathlib
import tempfile
import unittest

_SCRIPT = pathlib.Path(__file__).with_name('relief-prep.py')
_spec = importlib.util.spec_from_file_location('relief_prep', _SCRIPT)
rp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rp)


def _cube(size=10.0):
    s = float(size)
    verts = [
        (0, 0, 0), (s, 0, 0), (s, s, 0), (0, s, 0),
        (0, 0, s), (s, 0, s), (s, s, s), (0, s, s),
    ]
    # Outward counter-clockwise faces.
    faces = [
        (0, 3, 2), (0, 2, 1),  # bottom (-Z)
        (4, 5, 6), (4, 6, 7),  # top (+Z)
        (0, 1, 5), (0, 5, 4),  # front (-Y)
        (1, 2, 6), (1, 6, 5),  # right (+X)
        (2, 3, 7), (2, 7, 6),  # back (+Y)
        (3, 0, 4), (3, 4, 7),  # left (-X)
    ]
    return verts, faces


class Args(unittest.TestCase):
    def test_parses_defaults_after_blender_double_dash(self):
        args = rp.parse_args(['-b', '-P', 'relief-prep.py', '--', '--input', 'in.stl', '--out-stl', 'out.stl'])
        self.assertEqual(args.input, 'in.stl')
        self.assertEqual(args.out_stl, 'out.stl')
        self.assertEqual(args.max_triangles, rp.DEFAULT_MAX_TRIANGLES)
        self.assertEqual(args.base_mm, 0.0)
        self.assertEqual(args.frame_mm, 0.0)
        self.assertIsNone(args.frame_height_mm)
        self.assertEqual(args.material, 'pla-ivory')
        self.assertFalse(args.ascii)
        self.assertFalse(args.allow_non_manifold)

    def test_parses_allow_non_manifold_and_rejects_path_collisions(self):
        args = rp.parse_args([
            '--input', 'in.stl', '--out-stl', 'out.stl', '--allow-non-manifold',
        ])
        self.assertTrue(args.allow_non_manifold)

        for bad in (
            ['--input', 'same.stl', '--out-stl', 'same.stl'],
            ['--input', 'orig.stl', '--out-stl', 'clean.stl', '--report', 'orig.stl'],
            ['--input', 'orig.stl', '--out-stl', 'clean.stl', '--report', 'clean.stl'],
            ['--input', 'orig.stl', '--out-stl', 'clean.stl', '--preview', 'clean.stl'],
        ):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                rp.parse_args(bad)

    def test_validate_io_paths_rejects_symlinks_hardlinks_and_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            orig = os.path.join(tmp, 'orig.stl')
            with open(orig, 'wb') as fh:
                fh.write(b'solid x\nendsolid x\n')
            sym = os.path.join(tmp, 'sym.stl')
            os.symlink(orig, sym)
            hard = os.path.join(tmp, 'hard.stl')
            os.link(orig, hard)
            sub = os.path.join(tmp, 'dir')
            os.makedirs(sub)

            for args in (
                (orig, sym, None, None),
                (orig, hard, None, None),
                (orig, sub, None, None),
            ):
                with self.subTest(args=args), self.assertRaises(ValueError):
                    rp.validate_io_paths(*args)

            rp.validate_io_paths(orig, os.path.join(tmp, 'clean.stl'), os.path.join(tmp, 'p.png'), os.path.join(tmp, 'r.json'))

    def test_rejects_negative_or_non_finite_numeric_options(self):
        for bad in (['--max-triangles', '-1'], ['--base-mm', '-0.5'], ['--frame-mm', 'nan'],
                    ['--frame-height-mm', '0'], ['--samples', '0']):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                rp.parse_args(['--input', 'a.stl', '--out-stl', 'b.stl'] + bad)


class Topology(unittest.TestCase):
    def test_clean_closed_cube_is_manifold_with_exact_volume_and_bounds(self):
        verts, faces = _cube(10.0)
        stats = rp.analyze_topology(verts, faces)
        self.assertTrue(stats['is_manifold'])
        self.assertEqual(stats['triangles'], 12)
        self.assertEqual(stats['edges'], 18)
        self.assertEqual(stats['boundary_edges'], 0)
        self.assertEqual(stats['non_manifold_edges'], 0)
        self.assertEqual(stats['loose_vertices'], 0)
        self.assertEqual(stats['degenerate_faces'], 0)
        self.assertAlmostEqual(stats['signed_volume_mm3'], 1000.0, places=3)
        self.assertEqual(stats['bounds_mm']['width'], 10.0)
        self.assertEqual(stats['bounds_mm']['depth'], 10.0)
        self.assertEqual(stats['bounds_mm']['height'], 10.0)

    def test_open_hole_fails_manifold_check(self):
        verts, faces = _cube(10.0)
        stats = rp.analyze_topology(verts, faces[2:])  # drop bottom face (2 triangles -> 4 boundary edges)
        self.assertFalse(stats['is_manifold'])
        self.assertEqual(stats['boundary_edges'], 4)
        self.assertEqual(stats['non_manifold_edges'], 4)

    def test_inconsistent_winding_counts_as_non_manifold(self):
        verts = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, -1, 0)]
        # Shared edge 0->1 is traversed identically on both faces (flipped winding).
        faces = [(0, 1, 2), (0, 1, 3)]
        stats = rp.analyze_topology(verts, faces)
        self.assertFalse(stats['is_manifold'])
        self.assertGreaterEqual(stats['non_manifold_edges'], 1)

    def test_counts_loose_vertices_and_degenerate_triangles(self):
        verts = [(0, 0, 0), (2, 0, 0), (1, 0, 0), (9, 9, 9)]  # first 3 collinear, 4th loose
        faces = [(0, 1, 2)]
        stats = rp.analyze_topology(verts, faces)
        self.assertEqual(stats['loose_vertices'], 1)
        self.assertEqual(stats['degenerate_faces'], 1)
        self.assertFalse(stats['is_manifold'])

    def test_detects_pinched_non_manifold_vertex_and_disconnected_shells(self):
        # Two outward-wound cubes meeting only at shared corner vertex 0: edge-manifold but non-manifold vertex.
        c1_v, c1_f = _cube(5.0)
        c2_v_raw, c2_f_raw = _cube(5.0)
        verts = c1_v + [(-x, -y, -z) for (x, y, z) in c2_v_raw[1:]]

        def _remap(idx):
            return 0 if idx == 0 else idx + len(c1_v) - 1

        c2_f = [tuple(_remap(idx) for idx in f) for f in c2_f_raw]
        pinched = rp.analyze_topology(verts, c1_f + c2_f)
        self.assertEqual(pinched['non_manifold_edges'], 0)
        self.assertEqual(pinched['non_manifold_vertices'], 1)
        self.assertEqual(pinched['shells'], 2)
        self.assertFalse(pinched['is_manifold'])

        # Two completely disconnected cubes -> manifold edges/verts, shells == 2.
        c2_disjoint_v = [(x + 20.0, y, z) for (x, y, z) in c2_v_raw]
        c2_disjoint_f = [tuple(idx + len(c1_v) for idx in f) for f in c2_f_raw]
        shells = rp.analyze_topology(c1_v + c2_disjoint_v, c1_f + c2_disjoint_f)
        self.assertTrue(shells['is_manifold'])
        self.assertEqual(shells['shells'], 2)
        self.assertEqual(shells['non_manifold_vertices'], 0)

    def test_hollow_shell_preserves_valid_inward_cavity_normals(self):
        outer_v, outer_f = _cube(10.0)
        inner_v_raw, inner_f_raw = _cube(6.0)
        inner_v = [(x + 2.0, y + 2.0, z + 2.0) for (x, y, z) in inner_v_raw]
        inner_in = [tuple(reversed(tuple(idx + len(outer_v) for idx in f))) for f in inner_f_raw]
        stats = rp.analyze_topology(outer_v + inner_v, outer_f + inner_in)
        self.assertTrue(stats['is_manifold'])
        self.assertEqual(stats['shells'], 2)
        self.assertAlmostEqual(stats['signed_volume_mm3'], 784.0, places=3)
        self.assertFalse(rp.should_recalc_normals(stats, holes_filled=False))
        self.assertTrue(rp.should_recalc_normals(stats, holes_filled=True))

        inverted = dict(stats, signed_volume_mm3=-100.0)
        self.assertTrue(rp.should_recalc_normals(inverted, holes_filled=False))


class GeometryBuilders(unittest.TestCase):
    def test_build_box_and_frame_produce_watertight_outward_winding(self):
        bv, bf = rp.build_box_geometry(0.0, 20.0, 0.0, 10.0, 0.0, 5.0)
        b_stats = rp.analyze_topology(bv, bf)
        self.assertTrue(b_stats['is_manifold'])
        self.assertEqual(b_stats['shells'], 1)
        self.assertEqual(b_stats['non_manifold_vertices'], 0)
        self.assertAlmostEqual(b_stats['signed_volume_mm3'], 1000.0, places=3)

        bounds = {'min_x': 0.0, 'max_x': 80.0, 'width': 80.0, 'min_y': 0.0, 'max_y': 100.0, 'depth': 100.0}
        fv, ff = rp.build_frame_geometry(bounds, 3.0, 4.0)
        f_stats = rp.analyze_topology(fv, ff)
        self.assertTrue(f_stats['is_manifold'])
        self.assertEqual(f_stats['shells'], 1)
        self.assertEqual(f_stats['non_manifold_edges'], 0)
        self.assertEqual(f_stats['non_manifold_vertices'], 0)
        self.assertAlmostEqual(f_stats['signed_volume_mm3'], (86.0 * 106.0 - 79.7 * 99.7) * 4.0, places=2)


class Helpers(unittest.TestCase):
    def test_compute_decimate_ratio_clamps_cleanly(self):
        self.assertEqual(rp.compute_decimate_ratio(10_000, 50_000), 1.0)
        self.assertEqual(rp.compute_decimate_ratio(100_000, 0), 1.0)
        self.assertAlmostEqual(rp.compute_decimate_ratio(100_000, 25_000), 0.25)
        self.assertEqual(rp.compute_decimate_ratio(10_000_000, 100), 0.01)

    def test_preview_camera_pose_frames_plaque_from_elevated_front_quarter(self):
        pose = rp.preview_camera_pose({
            'min_x': 0.0, 'max_x': 80.0, 'width': 80.0,
            'min_y': 0.0, 'max_y': 120.0, 'depth': 120.0,
            'min_z': 0.0, 'max_z': 4.2, 'height': 4.2,
        })
        self.assertEqual(pose['target'], (40.0, 60.0, 2.1))
        lx, ly, lz = pose['location']
        self.assertLess(lx, pose['target'][0])   # shifted slightly left (-X)
        self.assertLess(ly, pose['target'][1])   # in front (-Y)
        self.assertGreater(lz, pose['target'][2])  # elevated (+Z)
        self.assertGreater(pose['distance_mm'], 150.0)

    def test_format_report_includes_before_and_after_summary(self):
        text = rp.format_report({
            'input': 'raw.stl',
            'out_stl': 'clean.stl',
            'out_stl_written': True,
            'pause_height_shift_mm': 1.5,
            'preview': 'preview.png',
            'before': {'triangles': 120_000, 'is_manifold': False, 'non_manifold_edges': 4, 'non_manifold_vertices': 1},
            'after': {
                'triangles': 25_000, 'is_manifold': True, 'non_manifold_edges': 0, 'non_manifold_vertices': 0,
                'shells': 1,
                'bounds_mm': {'width': 86.0, 'depth': 126.0, 'height': 5.7},
            },
            'steps': ['weld-and-repair', 'decimate(0.21)', 'base(+1.5mm)', 'frame(3mm x 5.7mm)'],
            'warnings': [],
        })
        self.assertIn('120,000 tris, non-manifold (4 edges, 1 vertices)', text)
        self.assertIn('25,000 tris, manifold', text)
        self.assertIn('86 × 126 × 5.7 mm', text)
        self.assertIn('pause-at-height shifted by +1.5 mm', text)
        self.assertIn('preview.png', text)

        skipped = rp.format_report({
            'input': 'broken.stl',
            'out_stl': 'clean.stl',
            'out_stl_written': False,
            'preview': None,
            'before': {'triangles': 10, 'is_manifold': False, 'non_manifold_edges': 2, 'non_manifold_vertices': 0},
            'after': {
                'triangles': 10, 'is_manifold': False, 'non_manifold_edges': 2, 'non_manifold_vertices': 0,
                'shells': 2,
                'bounds_mm': {'width': 10.0, 'depth': 10.0, 'height': 2.0},
            },
            'steps': ['weld-and-repair'],
            'warnings': ['skipped STL export'],
        })
        self.assertIn('clean.stl (skipped)', skipped)
        self.assertIn('warning: skipped STL export', skipped)
