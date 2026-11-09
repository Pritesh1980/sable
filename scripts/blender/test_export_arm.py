"""Unit tests for export-arm-gltf.py's plain-Python helpers (no Blender).

    python3 -m unittest discover -s scripts/blender
"""
import importlib.util
import os
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    'export_arm_gltf', os.path.join(_HERE, 'export-arm-gltf.py'))
ex = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ex)


class Smoothstep(unittest.TestCase):
    def test_clamps_and_eases(self):
        self.assertEqual(ex.smoothstep(0.2, 0.8, 0.1), 0.0)
        self.assertEqual(ex.smoothstep(0.2, 0.8, 0.9), 1.0)
        self.assertAlmostEqual(ex.smoothstep(0.2, 0.8, 0.5), 0.5)


class VertexFade(unittest.TestCase):
    def test_solid_on_the_upper_arm(self):
        self.assertEqual(ex.vertex_fade(1.0, 16.0), 1.0)

    def test_gone_on_the_torso(self):
        self.assertEqual(ex.vertex_fade(0.0, 16.0), 0.0)

    def test_fades_out_down_the_forearm(self):
        solid = ex.vertex_fade(1.0, ex.FOREARM_FADE_CM[1])
        half = ex.vertex_fade(1.0, sum(ex.FOREARM_FADE_CM) / 2)
        gone = ex.vertex_fade(1.0, ex.FOREARM_FADE_CM[0])
        self.assertEqual((solid, gone), (1.0, 0.0))
        self.assertTrue(0.0 < half < 1.0)

    def test_is_the_smaller_of_the_two_fades(self):
        low_share = ex.vertex_fade(ex.SHARE_FADE[0] + 0.01, 16.0)
        self.assertTrue(0.0 < low_share < 0.1)


class Crop(unittest.TestCase):
    def test_keeps_triangles_with_any_visible_corner_and_renumbers(self):
        fades = [0.0, 0.0, 0.0, 1.0, 0.5]
        tris = [(0, 1, 2), (1, 2, 3), (2, 3, 4)]
        kept, used = ex.crop(tris, fades)
        self.assertEqual(used, [1, 2, 3, 4])
        self.assertEqual(kept, [(0, 1, 2), (1, 2, 3)])

    def test_nothing_visible_keeps_nothing(self):
        self.assertEqual(ex.crop([(0, 1, 2)], [0.0, 0.0, 0.0]), ([], []))


class CornerSurface(unittest.TestCase):
    def test_mapped_triangle_carries_arc_and_perimeter(self):
        arcs, perimeters = [1.0, 2.0, 3.0], [30.0, 30.0, 31.0]
        self.assertEqual(ex.corner_surface((0, 1, 2), arcs, perimeters),
                         [(1.0, 30.0), (2.0, 30.0), (3.0, 31.0)])

    def test_unmapped_corner_blanks_the_whole_triangle(self):
        arcs, perimeters = [1.0, None, 3.0], [30.0, None, 31.0]
        self.assertEqual(ex.corner_surface((0, 1, 2), arcs, perimeters), [ex.NO_SKIN] * 3)

    def test_triangle_across_the_underside_seam_is_made_continuous(self):
        # Arcs run -P/2..P/2; a face with corners either side of the seam
        # would otherwise interpolate through the whole way round the arm.
        arcs, perimeters = [14.5, -14.6, 14.9], [30.0, 30.0, 30.0]
        out = ex.corner_surface((0, 1, 2), arcs, perimeters)
        self.assertEqual([a for a, _ in out], [14.5, 15.4, 14.9])


class PerimeterTable(unittest.TestCase):
    def test_samples_every_cm_across_the_skin(self):
        table = ex.perimeter_table(lambda y: 26.0 + y / 10, 2.0, 4.5)
        self.assertEqual(table, [[2.0, 26.2], [3.0, 26.3], [4.0, 26.4], [4.5, 26.45]])


class Args(unittest.TestCase):
    def test_defaults(self):
        a = ex.parse_args(['--makehuman-data', '/x', '--out', '/y'])
        self.assertEqual((a.subdivisions, a.draco, a.mh_sex), (1, False, 0.5))
        self.assertEqual((a.upper_arm_length_cm, a.biceps_cm, a.above_elbow_cm), (32.0, 30.0, 26.0))


if __name__ == '__main__':
    unittest.main()
