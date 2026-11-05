"""Unit tests for the bpy-free maths in render-on-body.py (#192).

Run from the repo root with plain Python (no Blender needed):

    python3 -m unittest discover -s scripts/blender
"""
import importlib.util
import math
import pathlib
import unittest

_SCRIPT = pathlib.Path(__file__).with_name('render-on-body.py')
_spec = importlib.util.spec_from_file_location('render_on_body', _SCRIPT)
rob = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rob)


class TaperProfile(unittest.TestCase):
    def test_ends_hit_the_measured_circumferences(self):
        self.assertAlmostEqual(rob.circumference_at(0.0, 17, 26), 17)
        self.assertAlmostEqual(rob.circumference_at(1.0, 17, 26), 26)

    def test_grows_monotonically_from_wrist_to_elbow(self):
        values = [rob.circumference_at(i / 50, 17, 26) for i in range(51)]
        self.assertTrue(all(b >= a for a, b in zip(values, values[1:])))

    def test_is_a_tube_beyond_the_measured_section(self):
        self.assertAlmostEqual(rob.circumference_at(-0.3, 17, 26), 17)
        self.assertAlmostEqual(rob.circumference_at(1.4, 17, 26), 26)

    def test_profile_is_eased_not_a_cone(self):
        # Narrow tendinous wrist, fuller muscle belly: below linear near the wrist.
        linear = 17 + (26 - 17) * 0.2
        self.assertLess(rob.circumference_at(0.2, 17, 26), linear)

    def test_uniform_arm_is_constant(self):
        self.assertAlmostEqual(rob.circumference_at(0.37, 20, 20), 20)


class Ellipse(unittest.TestCase):
    def test_circle_perimeter(self):
        self.assertAlmostEqual(rob.ellipse_perimeter(3, 3), 2 * math.pi * 3)

    def test_semi_axes_reproduce_circumference_and_aspect(self):
        a, b = rob.semi_axes_for(21.5, 1.2)
        self.assertAlmostEqual(a / b, 1.2)
        self.assertAlmostEqual(rob.ellipse_perimeter(a, b), 21.5, places=6)

    def test_wrist_is_flatter_than_elbow(self):
        self.assertGreater(rob.aspect_at(0.0), rob.aspect_at(1.0))
        self.assertGreater(rob.aspect_at(1.0), 1.0)

    def test_ring_points_are_evenly_spaced_by_arc_from_the_top(self):
        a, b = rob.semi_axes_for(20, 1.3)
        pts = rob.ring_points(a, b, 64)
        self.assertEqual(len(pts), 64)
        x0, z0, arc0 = pts[0]
        self.assertAlmostEqual(x0, 0, places=9)
        self.assertAlmostEqual(z0, b, places=9)  # vertex 0 sits on the top centreline
        self.assertEqual(arc0, 0)
        # arc increases towards +X (so the design is not mirrored in the top view)
        self.assertGreater(pts[1][0], 0)
        self.assertAlmostEqual(pts[1][2], 20 / 64, places=3)
        # underside vertex is half-way round
        self.assertAlmostEqual(abs(pts[32][2]), 10, places=3)
        self.assertAlmostEqual(pts[32][1], -b, places=3)
        # neighbouring chords are (near) equal, i.e. arc-length parametrised
        chords = [math.dist(pts[i][:2], pts[(i + 1) % 64][:2]) for i in range(64)]
        self.assertLess(max(chords) / min(chords), 1.01)

    def test_ring_points_lie_on_the_ellipse(self):
        a, b = 4.0, 3.0
        for x, z, _ in rob.ring_points(a, b, 48):
            self.assertAlmostEqual((x / a) ** 2 + (z / b) ** 2, 1.0, places=6)


class DesignScale(unittest.TestCase):
    def test_uv_span_is_width_over_circumference(self):
        self.assertAlmostEqual(rob.uv_span_for_width(12, 24), 0.5)
        self.assertAlmostEqual(rob.uv_span_for_width(6, 24), 0.25)

    def test_uv_span_rejects_nonpositive(self):
        with self.assertRaises(ValueError):
            rob.uv_span_for_width(0, 24)
        with self.assertRaises(ValueError):
            rob.uv_span_for_width(12, 0)

    def test_design_size_keeps_aspect(self):
        self.assertEqual(rob.design_size_cm(12, 1000, 1500), (12, 18))
        self.assertEqual(rob.design_size_cm(10, 800, 400), (10, 5))

    def test_design_centre_maps_to_texture_centre(self):
        u, v = rob.design_uv(0.5, 0.5, circumference_cm=21, length_cm=25,
                             width_cm=12, height_cm=12, centre_cm=12.5)
        self.assertAlmostEqual(u, 0.5)
        self.assertAlmostEqual(v, 0.5)

    def test_design_edges_land_at_exact_skin_arc_wherever_the_arm_tapers(self):
        # Half the width of skin arc from the centreline is the design's edge,
        # whether that ring is thin (wrist side) or thick (elbow side).
        for circ in (17.0, 21.5, 26.0):
            u_main = 0.5 + 6.0 / circ  # 6 cm of arc to the right of the top centreline
            u, _ = rob.design_uv(u_main, 0.5, circumference_cm=circ, length_cm=25,
                                 width_cm=12, height_cm=12, centre_cm=12.5)
            self.assertAlmostEqual(u, 1.0)

    def test_design_height_follows_the_arm_axis(self):
        # 6 cm towards the elbow from the centre is the top edge (image up = elbow)
        _, v = rob.design_uv(0.5, (12.5 + 6) / 25, circumference_cm=21, length_cm=25,
                             width_cm=12, height_cm=12, centre_cm=12.5)
        self.assertAlmostEqual(v, 1.0)

    def test_design_up_wrist_rotates_rather_than_mirrors(self):
        kw = dict(circumference_cm=21, length_cm=25, width_cm=12, height_cm=12,
                  centre_cm=12.5, up='wrist')
        u, v = rob.design_uv(0.5 + 6 / 21, (12.5 + 6) / 25, **kw)
        self.assertAlmostEqual(u, 0.0)
        self.assertAlmostEqual(v, 0.0)

    def test_design_uv_rejects_unknown_orientation(self):
        with self.assertRaises(ValueError):
            rob.design_uv(0.5, 0.5, circumference_cm=21, length_cm=25, width_cm=12,
                          height_cm=12, centre_cm=12.5, up='sideways')


class Helpers(unittest.TestCase):
    def test_srgb_to_linear(self):
        self.assertEqual(rob.srgb_to_linear(0.0), 0.0)
        self.assertEqual(rob.srgb_to_linear(1.0), 1.0)
        self.assertAlmostEqual(rob.srgb_to_linear(0.02), 0.02 / 12.92)
        # The white point is chosen on screen values, but the shader runs in linear:
        # off-white paper (sRGB 0.92) must still clear a 0.9 white point there.
        self.assertGreater(rob.srgb_to_linear(0.92), rob.srgb_to_linear(0.9))
        self.assertLess(rob.srgb_to_linear(0.9), 0.8)

    def test_srgb_hex_to_linear(self):
        self.assertEqual(rob.srgb_hex_to_linear('#ffffff'), (1.0, 1.0, 1.0))
        self.assertEqual(rob.srgb_hex_to_linear('000000'), (0.0, 0.0, 0.0))
        r, g, b = rob.srgb_hex_to_linear('#808080')
        self.assertAlmostEqual(r, 0.2158605, places=5)
        with self.assertRaises(ValueError):
            rob.srgb_hex_to_linear('#abc')

    def test_frame_distance_fits_half_extent(self):
        # 50 mm lens on a 36 mm sensor: tan(half fov) = 18/50
        self.assertAlmostEqual(rob.frame_distance(18, 50, 36), 50)


class Args(unittest.TestCase):
    def test_reads_only_args_after_double_dash(self):
        args = rob.parse_args(['blender', '-b', '-P', 'x.py', '--', '--image', 'a.png',
                               '--width-cm', '12', '--out', 'renders'])
        self.assertEqual(args.image, 'a.png')
        self.assertEqual(args.width_cm, 12)
        self.assertEqual((args.wrist_cm, args.elbow_cm, args.length_cm), (17, 26, 25))
        self.assertEqual((args.samples, args.size), (64, 1024))
        self.assertIsNone(args.centre_cm)

    def test_rejects_nonpositive_sizes(self):
        with self.assertRaises(SystemExit):
            rob.parse_args(['--', '--image', 'a.png', '--width-cm', '0', '--out', 'r'])
        with self.assertRaises(SystemExit):
            rob.parse_args(['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r',
                            '--wrist-cm', '-1'])

    def test_placement_is_forearm_until_another_body_part_exists(self):
        base = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']
        self.assertEqual(rob.parse_args(base).placement, 'forearm')
        self.assertEqual(rob.parse_args(base + ['--placement', 'forearm']).placement, 'forearm')
        with self.assertRaises(SystemExit):
            rob.parse_args(base + ['--placement', 'shoulder'])

    def test_requires_image_width_and_out(self):
        with self.assertRaises(SystemExit):
            rob.parse_args(['--', '--image', 'a.png'])


if __name__ == '__main__':
    unittest.main()
