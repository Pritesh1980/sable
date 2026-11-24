"""Unit tests for relief-prep.py (#193).

Run from the repo root with plain Python (no Blender needed):

    python3 -m unittest discover -s scripts/blender
"""
import importlib.util
import pathlib
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
            'preview': 'preview.png',
            'before': {'triangles': 120_000, 'is_manifold': False, 'non_manifold_edges': 4},
            'after': {
                'triangles': 25_000, 'is_manifold': True, 'non_manifold_edges': 0,
                'bounds_mm': {'width': 86.0, 'depth': 126.0, 'height': 5.7},
            },
            'steps': ['weld-and-repair', 'decimate(0.21)', 'base(+1.5mm)', 'frame(3mm x 5.7mm)'],
            'warnings': [],
        })
        self.assertIn('120,000 tris, non-manifold (4 edges)', text)
        self.assertIn('25,000 tris, manifold', text)
        self.assertIn('86 × 126 × 5.7 mm', text)
        self.assertIn('preview.png', text)
