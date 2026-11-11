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


class SkinFloor(unittest.TestCase):
    def test_is_just_above_the_highest_unmapped_arm_vertex_below_mid_arm(self):
        # y, arm share, mapped
        ys = [-2.0, 3.0, 6.5, 9.0, 20.0, 28.0]
        arm = [1.0, 1.0, 1.0, 1.0, 1.0, 0.2]
        arcs = [None, None, None, 0.0, 0.0, None]
        self.assertEqual(ex.skin_floor(ys, arm, arcs, mid=16.0), 6.6)

    def test_ignores_the_torso_and_the_shoulder(self):
        ys = [5.0, 30.0, 9.0]
        arm = [0.1, 1.0, 1.0]  # a torso vertex beside the arm; an unmapped shoulder vertex
        arcs = [None, None, 0.0]
        self.assertEqual(ex.skin_floor(ys, arm, arcs, mid=16.0, fallback=0.0), 0.0)


class SkinCeiling(unittest.TestCase):
    def test_is_just_below_the_lowest_unmapped_vertex_on_the_outside_of_the_shoulder(self):
        ys = [10.0, 22.0, 27.3, 29.0, 31.0]
        zs = [4.0, -3.0, 4.0, 3.0, 2.0]  # the 22 cm one is the armpit, on the inside
        arcs = [0.0, None, None, None, 0.0]
        self.assertEqual(ex.skin_ceiling(ys, zs, arcs, mid=16.0, fallback=31.4), 27.2)

    def test_falls_back_when_the_outside_is_mapped_all_the_way_up(self):
        self.assertEqual(ex.skin_ceiling([10.0, 30.0], [4.0, 4.0], [0.0, 0.0], mid=16.0, fallback=31.4), 31.4)


class PerimeterTable(unittest.TestCase):
    def test_samples_every_cm_across_the_skin(self):
        table = ex.perimeter_table(lambda y: 26.0 + y / 10, 2.0, 4.5)
        self.assertEqual(table, [[2.0, 26.2], [3.0, 26.3], [4.0, 26.4], [4.5, 26.45]])


class Args(unittest.TestCase):
    def test_defaults(self):
        a = ex.parse_args(['--makehuman-data', '/x', '--out', '/y'])
        self.assertEqual((a.subdivisions, a.draco, a.mh_sex), (1, False, 0.5))
        self.assertEqual((a.upper_arm_length_cm, a.biceps_cm, a.above_elbow_cm), (32.0, 30.0, 26.0))


class ForearmFade(unittest.TestCase):
    L = 25.0

    def test_solid_along_the_forearm(self):
        self.assertEqual(ex.forearm_fade(12.0, self.L), 1.0)

    def test_the_hand_dissolves_below_the_wrist(self):
        lo, hi = ex.HAND_FADE_CM
        self.assertEqual(ex.forearm_fade(lo, self.L), 0.0)
        self.assertEqual(ex.forearm_fade(hi, self.L), 1.0)
        self.assertTrue(0.0 < ex.forearm_fade((lo + hi) / 2, self.L) < 1.0)

    def test_the_upper_arm_dissolves_past_the_elbow(self):
        solid, gone = (self.L + d for d in ex.PAST_ELBOW_FADE_CM)
        self.assertEqual(ex.forearm_fade(solid, self.L), 1.0)
        self.assertEqual(ex.forearm_fade(gone, self.L), 0.0)
        self.assertTrue(0.0 < ex.forearm_fade((solid + gone) / 2, self.L) < 1.0)


class ForearmSkin(unittest.TestCase):
    def test_runs_from_above_the_wrist_to_below_the_elbow_crease(self):
        lo, hi = ex.forearm_skin(25.0)
        self.assertEqual(lo, ex.FOREARM_SKIN_FROM_WRIST_CM)
        self.assertEqual(hi, 25.0 - ex.FOREARM_SKIN_BELOW_ELBOW_CM)
        self.assertTrue(0.0 < lo < hi < 25.0)


class LimbArgs(unittest.TestCase):
    def test_upper_arm_is_the_default_and_keeps_its_file_name(self):
        a = ex.parse_args(['--makehuman-data', '/x', '--out', '/y'])
        self.assertEqual((a.limb, ex.output_name(a)), ('upper-arm', 'arm-upper'))

    def test_forearm_has_its_own_file_and_tape_measurements(self):
        a = ex.parse_args(['--makehuman-data', '/x', '--out', '/y', '--limb', 'forearm'])
        self.assertEqual(ex.output_name(a), 'arm-forearm')
        self.assertEqual((a.wrist_cm, a.elbow_cm, a.forearm_length_cm), (17.0, 26.0, 25.0))

    def test_an_explicit_name_wins(self):
        a = ex.parse_args(['--makehuman-data', '/x', '--out', '/y', '--limb', 'forearm', '--name', 'f'])
        self.assertEqual(ex.output_name(a), 'f')

    def test_files_match_the_precache_pattern(self):
        for limb in ex.LIMBS:
            a = ex.parse_args(['--makehuman-data', '/x', '--out', '/y', '--limb', limb])
            self.assertTrue(ex.output_name(a).startswith('arm-'))


if __name__ == '__main__':
    unittest.main()
