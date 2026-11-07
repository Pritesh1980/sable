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


def _normal_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


class HealedSpread(unittest.TestCase):
    """Healed ink spreads a fraction of a millimetre: a blur sized in skin
    millimetres, converted to texture pixels via the print resolution."""

    def test_px_per_cm_is_the_print_resolution(self):
        self.assertAlmostEqual(rob.px_per_cm(1040, 12), 86.6667, places=3)
        with self.assertRaises(ValueError):
            rob.px_per_cm(1040, 0)

    def test_spread_sigma_in_px_scales_with_print_resolution(self):
        # 0.15 mm at 1040 px over 12 cm: 0.015 cm * 86.67 px/cm = 1.3 px
        self.assertAlmostEqual(rob.spread_sigma_px(0.15, rob.px_per_cm(1040, 12)), 1.3)
        # The same image printed at 18 cm has fewer px per cm: the same skin
        # spread is fewer texture pixels.
        self.assertAlmostEqual(rob.spread_sigma_px(0.15, rob.px_per_cm(1040, 18)), 1040 / 18 * 0.015)
        self.assertEqual(rob.spread_sigma_px(0, 86.0), 0)
        with self.assertRaises(ValueError):
            rob.spread_sigma_px(-0.1, 86.0)

    def test_large_designs_are_processed_at_most_2048_px_keeping_aspect(self):
        self.assertEqual(rob.fit_within(1040, 1040, 2048), (1040, 1040))
        self.assertEqual(rob.fit_within(4096, 2048, 2048), (2048, 1024))
        self.assertEqual(rob.fit_within(3000, 4500, 2048), (1365, 2048))
        self.assertEqual(rob.fit_within(9000, 3, 2048), (2048, 1))  # never 0 px

    def test_kernel_sums_to_one_is_symmetric_and_spans_three_sigma(self):
        k = rob.gaussian_kernel(1.3)
        self.assertEqual(len(k), 2 * math.ceil(3 * 1.3) + 1)
        self.assertAlmostEqual(sum(k), 1.0)
        self.assertEqual(k, k[::-1])
        self.assertEqual(k.index(max(k)), len(k) // 2)

    def test_tiny_sigma_is_the_identity(self):
        self.assertEqual(rob.gaussian_kernel(0), [1.0])
        self.assertEqual(rob.gaussian_kernel(0.1), [1.0])

    def test_blur_keeps_bare_skin_bare_including_at_the_edges(self):
        w, h = 7, 5
        out = rob.blur_plane([1.0] * (w * h), w, h, rob.gaussian_kernel(1.0))
        self.assertTrue(all(abs(v - 1.0) < 1e-12 for v in out))

    def test_blur_conserves_ink_away_from_the_edges(self):
        w = h = 21
        plane = [1.0] * (w * h)
        plane[10 * w + 10] = 0.0  # one dot of solid ink
        out = rob.blur_plane(plane, w, h, rob.gaussian_kernel(1.5))
        self.assertAlmostEqual(sum(1 - v for v in out), 1.0)
        self.assertGreater(out[10 * w + 10], 0.0)  # the dot is lighter...
        self.assertLess(out[10 * w + 12], 1.0)  # ...and has spread 2 px

    def test_blurred_edge_has_the_requested_sigma(self):
        # A hard ink/skin edge between columns 49 and 50; rows identical, so the
        # vertical pass changes nothing in the middle row.
        w, h, sigma = 100, 31, 2.0
        row = [0.0] * 50 + [1.0] * 50
        out = rob.blur_plane(row * h, w, h, rob.gaussian_kernel(sigma))
        mid = out[15 * w:16 * w]
        for x in (48, 50, 52, 54):
            self.assertAlmostEqual(mid[x], _normal_cdf((x - 49.5) / sigma), delta=0.01)

    def test_skin_rim_makes_the_outermost_pixels_bare_skin(self):
        # The healed texture is extended past its edges, so its rim must be skin:
        # otherwise ink touching the edge would smear across the whole arm.
        w, h = 4, 3
        out = rob.skin_rim([0.0] * (w * h), w, h)
        self.assertEqual(out, [1.0, 1.0, 1.0, 1.0,
                               1.0, 0.0, 0.0, 1.0,
                               1.0, 1.0, 1.0, 1.0])

    def test_blur_outside_the_image_is_bare_skin(self):
        # Ink touching the image border must not gain ink from beyond it.
        w, h = 9, 9
        plane = [0.0] * (w * h)  # solid ink everywhere
        out = rob.blur_plane(plane, w, h, rob.gaussian_kernel(1.0))
        self.assertGreater(out[0], 0.0)  # the corner lightens towards skin
        self.assertAlmostEqual(out[4 * w + 4], 0.0, places=3)  # the middle stays solid


class HealedColour(unittest.TestCase):
    def test_ink_planes_follow_the_fresh_shader(self):
        # Paper at or above the white point is bare skin (1), black is solid
        # ink (0), transparency is bare skin, and values are linear light.
        px = [0.95, 0.95, 0.95, 1.0,   # off-white paper
              0.0, 0.0, 0.0, 1.0,      # black
              0.0, 0.0, 0.0, 0.0,      # transparent black
              0.5, 0.5, 0.5, 1.0]      # mid grey (sRGB)
        r, g, b = rob.ink_planes(px, white_point=0.9)
        self.assertEqual(r[:3], [1.0, 0.0, 1.0])
        self.assertEqual(g, r)
        self.assertEqual(b, r)
        self.assertAlmostEqual(r[3], rob.srgb_to_linear(0.5) / rob.srgb_to_linear(0.9))

    def test_bare_skin_stays_bare(self):
        self.assertEqual(rob.healed_transmittance((1.0, 1.0, 1.0)), (1.0, 1.0, 1.0))

    def test_solid_black_loses_a_little_density(self):
        r, g, b = rob.healed_transmittance((0.0, 0.0, 0.0), density_loss=0.03)
        self.assertEqual((r, g, b), (0.03, 0.03, 0.03))

    def test_colour_ink_desaturates_towards_its_luminance(self):
        red = (0.8, 0.05, 0.05)
        out = rob.healed_transmittance(red, density_loss=0.0, desaturate=0.25)
        self.assertAlmostEqual(rob.luminance(out), rob.luminance(red))
        self.assertLess(out[0] - out[1], red[0] - red[1])
        self.assertTrue(all(0.0 <= c <= 1.0 for c in out))

    def test_planes_and_single_colours_agree(self):
        planes = rob.heal_planes([0.2, 1.0], [0.4, 1.0], [0.1, 0.0],
                                 density_loss=0.05, desaturate=0.3)
        one = rob.healed_transmittance((0.2, 0.4, 0.1), density_loss=0.05, desaturate=0.3)
        self.assertEqual(tuple(p[0] for p in planes), one)

    def test_healed_black_is_a_cool_desaturated_black_as_dark_as_fresh(self):
        skin = rob.srgb_hex_to_linear('#c99d80')
        fresh = tuple(c * (1 - 0.92) for c in skin)  # skin through 92% black ink
        healed = rob.healed_ink_floor(skin, ink_strength=0.92)
        self.assertAlmostEqual(rob.luminance(healed), rob.luminance(fresh))
        r, g, b = healed
        self.assertGreater(b, r)  # blue-black / green-black, not warm brown
        self.assertGreater(g, r)
        self.assertLess(max(healed) / min(healed), 1.5)  # only slightly tinted
        self.assertLess(fresh[2] / fresh[0], b / r)  # cooler than fresh black

    def test_pure_ink_strength_is_true_black(self):
        skin = rob.srgb_hex_to_linear('#c99d80')
        self.assertEqual(rob.healed_ink_floor(skin, ink_strength=1.0), (0.0, 0.0, 0.0))


def _cylinder(radius, length, n, width_cm):
    """Triangulated tube along +Y. Each corner carries (u, v): u is the design's
    around-the-arm coordinate (0.5 on the top line, +1 per ``width_cm`` of arc
    towards +X), v runs 0→1 along the length."""
    ring = []
    for k in range(n):
        th = 2 * math.pi * k / n
        arc = radius * th if th <= math.pi else radius * (th - 2 * math.pi)
        ring.append(((radius * math.sin(th), radius * math.cos(th)), arc))
    circ = 2 * math.pi * radius
    tris = []
    for k in range(n):
        (x0, z0), a0 = ring[k]
        (x1, z1), a1 = ring[(k + 1) % n]
        if a1 < a0:  # across the underside seam: unwrap within the face
            a1 += circ
        corners = [((x, y, z), (0.5 + a / width_cm, y / length))
                   for (x, z, a) in ((x0, z0, a0), (x1, z1, a1)) for y in (0.0, length)]
        p00, p01, p10, p11 = corners
        tris += [(p00, p10, p11), (p00, p11, p01)]
    return tris


class Measure(unittest.TestCase):
    """Slicing a triangle mesh to check, in cm, how much skin a design covers."""

    def test_slice_triangle_across_the_plane(self):
        tri = (((0, 0, 0), (0.0,)), ((2, 0, 0), (1.0,)), ((0, 2, 0), (0.0,)))
        (p, a), (q, b) = rob.slice_triangle(tri, axis=1, level=1.0)
        got = sorted([(p, a), (q, b)])
        self.assertEqual(got[0][0], (0.0, 1.0, 0.0))
        self.assertEqual(got[1][0], (1.0, 1.0, 0.0))
        self.assertEqual(got[1][1], (0.5,))

    def test_slice_misses_a_triangle_wholly_on_one_side(self):
        tri = (((0, 0, 0), (0,)), ((1, 0, 0), (0,)), ((0, 1, 0), (0,)))
        self.assertIsNone(rob.slice_triangle(tri, axis=1, level=2.0))
        self.assertIsNone(rob.slice_triangle(tri, axis=1, level=-0.5))

    def test_an_edge_on_the_plane_is_counted_once(self):
        # Two triangles sharing the edge x=0; the plane x=0 runs along it.
        left = (((0, 0, 0), (0,)), ((0, 1, 0), (0,)), ((-1, 0, 0), (0,)))
        right = (((0, 0, 0), (0,)), ((1, 0, 0), (0,)), ((0, 1, 0), (0,)))
        segs = [s for s in (rob.slice_triangle(t, 0, 0.0) for t in (left, right)) if s]
        self.assertEqual(len(segs), 1)
        (p, _), (q, _) = segs[0]
        self.assertAlmostEqual(math.dist(p, q), 1.0)

    def test_clip_segment_to_an_attribute_range(self):
        seg = (((0.0, 0.0, 0.0), (-1.0, 0.5)), ((4.0, 0.0, 0.0), (3.0, 0.5)))
        (p, a), (q, b) = rob.clip_segment(seg, {0: (0.0, 1.0)})
        self.assertEqual((p, q), ((1.0, 0.0, 0.0), (2.0, 0.0, 0.0)))
        self.assertEqual((a[0], b[0]), (0.0, 1.0))
        self.assertIsNone(rob.clip_segment(seg, {0: (5.0, 6.0)}))
        self.assertIsNone(rob.clip_segment(seg, {1: (0.6, 1.0)}))  # constant, out of range
        self.assertEqual(rob.clip_segment(seg, {1: (0.0, 1.0)}), seg)

    def test_width_round_a_cylinder_is_the_arc_not_the_chord(self):
        r, width = 21.5 / (2 * math.pi), 12.0
        tris = _cylinder(r, 10.0, 512, width)
        length, lo, hi = rob.measure_slice(tris, axis=1, level=5.0, ranges={0: (0.0, 1.0)})
        self.assertAlmostEqual(length, 12.0, places=3)
        # 12 cm of arc on a 21.5 cm arm reaches past the sides (x = ±r)
        self.assertAlmostEqual(hi[0], r, places=3)
        self.assertAlmostEqual(lo[0], -r, places=3)
        # and is centred on the top line: symmetric round to z = r cos(θ)
        self.assertAlmostEqual(lo[2], r * math.cos(6.0 / r), places=3)

    def test_seam_faces_do_not_count_as_design(self):
        r = 3.0
        tris = _cylinder(r, 10.0, 64, 4.0)
        total, _, _ = rob.measure_slice(tris, axis=1, level=5.0, ranges={0: (-100.0, 100.0)})
        design, _, _ = rob.measure_slice(tris, axis=1, level=5.0, ranges={0: (0.0, 1.0)})
        self.assertAlmostEqual(total, 2 * math.pi * r, delta=0.02)  # the whole polygon
        self.assertAlmostEqual(design, 4.0, delta=0.005)  # 64-gon chords: 0.04% short

    def test_length_along_the_top_line(self):
        tris = _cylinder(3.0, 10.0, 64, 4.0)
        # The plane x = 0 cuts the top and bottom lines; u keeps only the top.
        length, lo, hi = rob.measure_slice(tris, axis=0, level=0.0,
                                           ranges={0: (0.0, 1.0), 1: (0.2, 0.6)})
        self.assertAlmostEqual(length, 4.0)
        self.assertAlmostEqual(hi[1] - lo[1], 4.0)
        self.assertAlmostEqual(lo[2], 3.0)

    def test_nothing_in_range_measures_zero(self):
        tris = _cylinder(3.0, 10.0, 32, 4.0)
        self.assertEqual(rob.measure_slice(tris, 1, 50.0, {0: (0.0, 1.0)}), (0.0, None, None))

    def test_measure_design_reports_width_at_three_heights_and_length(self):
        # A design 4 cm round and 10 cm along a straight tube (v = y / 10).
        tris = _cylinder(3.0, 10.0, 256, 4.0)
        m = rob.measure_design(tris, height_cm=10.0, centre_cm=5.0)
        self.assertEqual(list(m['width_round_arm']), ['wrist_end', 'middle', 'elbow_end'])
        self.assertEqual(m['width_round_arm']['wrist_end']['at_cm_from_wrist'], 1.5)
        for spot in m['width_round_arm'].values():
            self.assertAlmostEqual(spot['width_cm'], 4.0, places=2)
        self.assertAlmostEqual(m['length_along_arm_cm'], 10.0, places=2)

    def test_measure_design_off_the_mesh_is_zero(self):
        # Widths are sliced where the design should be; past the mesh there is nothing.
        m = rob.measure_design(_cylinder(3.0, 10.0, 32, 4.0), height_cm=4.0, centre_cm=40.0)
        self.assertEqual({s['width_cm'] for s in m['width_round_arm'].values()}, {0.0})


class Args(unittest.TestCase):
    def test_reads_only_args_after_double_dash(self):
        args = rob.parse_args(['blender', '-b', '-P', 'x.py', '--', '--image', 'a.png',
                               '--width-cm', '12', '--out', 'renders', '--placement', 'forearm'])
        self.assertEqual(args.image, 'a.png')
        self.assertEqual(args.width_cm, 12)
        self.assertEqual((args.wrist_cm, args.elbow_cm, args.length_cm), (17, 26, 25))
        self.assertEqual((args.samples, args.size), (64, 1024))
        self.assertIsNone(args.centre_cm)

    def test_ink_defaults_to_healed(self):
        base = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']
        args = rob.parse_args(base)
        self.assertEqual(args.ink, 'healed')
        self.assertAlmostEqual(args.ink_spread_mm, 0.15)
        self.assertEqual(rob.parse_args(base + ['--ink', 'fresh']).ink, 'fresh')
        self.assertEqual(rob.parse_args(base + ['--ink-spread-mm', '0']).ink_spread_mm, 0)
        with self.assertRaises(SystemExit):
            rob.parse_args(base + ['--ink', 'faded'])
        with self.assertRaises(SystemExit):
            rob.parse_args(base + ['--ink-spread-mm', '-0.1'])

    def test_rejects_nonpositive_sizes(self):
        with self.assertRaises(SystemExit):
            rob.parse_args(['--', '--image', 'a.png', '--width-cm', '0', '--out', 'r'])
        with self.assertRaises(SystemExit):
            rob.parse_args(['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r',
                            '--wrist-cm', '-1'])

    def test_placement_defaults_to_the_upper_arm_and_the_forearm_still_works(self):
        base = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']
        self.assertEqual(rob.parse_args(base).placement, 'upper-arm')
        self.assertEqual(rob.parse_args(base + ['--placement', 'forearm']).placement, 'forearm')
        with self.assertRaises(SystemExit):
            rob.parse_args(base + ['--placement', 'shoulder'])

    def test_requires_image_width_and_out(self):
        with self.assertRaises(SystemExit):
            rob.parse_args(['--', '--image', 'a.png'])

    def test_rejects_nan_and_infinity(self):
        # inf made the ring loop run forever; nan failed later, in the blur.
        base = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']
        for flag, value in (('--width-cm', 'nan'), ('--upper-arm-length-cm', 'inf'),
                            ('--ink-spread-mm', 'inf'), ('--ink-strength', 'nan'),
                            ('--centre-cm', 'inf'), ('--biceps-cm', '-inf')):
            with self.subTest(flag=flag, value=value), self.assertRaises(SystemExit):
                rob.parse_args(base + [flag, value])


def _rgba(w, h, fill, inner=None, alpha=1.0):
    """Flat RGBA pixels (row-major, as Image.pixels), ``inner`` everywhere
    but the outermost ring."""
    px = []
    for y in range(h):
        for x in range(w):
            edge = x in (0, w - 1) or y in (0, h - 1)
            px.extend((*(fill if edge or inner is None else inner), alpha))
    return px


class DarkBackground(unittest.TestCase):
    """Sable's own concept cards are light lines on near-black; the ink is the
    light part there, so the image has to be flipped before it is inked."""

    CARD = (14 / 255, 13 / 255, 11 / 255)  # Sable's near-black card
    CREAM = (232 / 255, 226 / 255, 214 / 255)

    def test_detects_a_dark_card_and_not_white_paper(self):
        self.assertTrue(rob.is_dark_background(_rgba(8, 8, self.CARD, self.CREAM), 8, 8))
        self.assertFalse(rob.is_dark_background(_rgba(8, 8, (1, 1, 1), (0, 0, 0)), 8, 8))

    def test_a_transparent_border_is_bare_skin_not_dark(self):
        self.assertFalse(rob.is_dark_background(_rgba(8, 8, (0, 0, 0), alpha=0.0), 8, 8))

    def test_a_few_dark_edge_pixels_do_not_flip_paper(self):
        px = _rgba(10, 10, (1, 1, 1))
        px[0:4] = [0, 0, 0, 1]  # one dark corner pixel, say a design touching the edge
        self.assertFalse(rob.is_dark_background(px, 10, 10))

    def test_flipping_lightness_keeps_hue_and_alpha(self):
        out = rob.invert_lightness([*self.CARD, 1.0, 0.8, 0.2, 0.2, 0.5])
        card, red = out[:4], out[4:]
        self.assertGreater(min(card[:3]), 0.9)  # near-black card → near-white paper
        self.assertEqual(card[3], 1.0)
        # red keeps its hue and chroma, and HSL lightness 0.5 stays 0.5
        self.assertAlmostEqual(red[0] - red[1], 0.6)
        self.assertGreater(red[0], red[1])
        self.assertAlmostEqual(red[1], red[2])
        self.assertAlmostEqual((max(red[:3]) + min(red[:3])) / 2, 0.5)
        self.assertEqual(red[3], 0.5)

    def test_flipping_twice_is_the_identity(self):
        px = [0.1, 0.4, 0.9, 1.0, *self.CREAM, 1.0]
        for a, b in zip(rob.invert_lightness(rob.invert_lightness(px)), px):
            self.assertAlmostEqual(a, b)

    def test_background_flag_defaults_to_auto(self):
        base = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']
        self.assertEqual(rob.parse_args(base).background, 'auto')
        self.assertEqual(rob.parse_args(base + ['--background', 'dark']).background, 'dark')
        with self.assertRaises(SystemExit):
            rob.parse_args(base + ['--background', 'grey'])

    def test_resolve_background(self):
        dark = _rgba(4, 4, self.CARD)
        paper = _rgba(4, 4, (1, 1, 1))
        self.assertTrue(rob.flip_for_background('auto', dark, 4, 4))
        self.assertFalse(rob.flip_for_background('auto', paper, 4, 4))
        self.assertTrue(rob.flip_for_background('dark', paper, 4, 4))
        self.assertFalse(rob.flip_for_background('light', dark, 4, 4))


class CloseUp(unittest.TestCase):
    """At the arm views' scale (about 0.44 mm a pixel) fine lines are thinner
    than a pixel and read faint; the close-up frames the design itself."""

    def test_faces_the_design_whatever_the_placement_or_side(self):
        for placement, side in (('upper-arm', 'outer'), ('upper-arm', 'inner'),
                                ('forearm', 'inner'), ('forearm', 'outer')):
            self.assertEqual(rob.view_angles(placement, side, 'close-up'), (0.0, 0.0))

    def test_any_placement_can_ask_for_it(self):
        base = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']
        for placement in ('upper-arm', 'forearm'):
            args = rob.parse_args(base + ['--placement', placement, '--views', 'close-up'])
            self.assertEqual(args.views, ['close-up'])

    def test_frames_the_design_with_a_margin(self):
        # 12 x 12.4 cm on a 30 cm arm: from the front the design shows its
        # chord, 2r sin(w / 2r) = 9.08 cm, which the 2:3 frame's width must fit.
        r = 30 / (2 * math.pi)
        chord = 2 * r * math.sin(12 / (2 * r))
        half = rob.close_up_half_height(12, 12.4, 30)
        self.assertAlmostEqual(half, 1.3 * chord / (2 * 2 / 3))
        self.assertLess(2 * half, 45 / 2)  # well over twice the arm views' scale

    def test_a_tall_design_is_framed_by_its_height(self):
        self.assertAlmostEqual(rob.close_up_half_height(4, 20, 30), 1.3 * 10)

    def test_a_design_wrapping_past_half_way_shows_the_whole_arm_width(self):
        half = rob.close_up_half_height(20, 6, 30)
        self.assertAlmostEqual(half, 1.3 * (30 / math.pi) / (2 * 2 / 3))

    def test_the_skin_not_the_axis_sits_at_the_framing_distance(self):
        r = 30 / (2 * math.pi)
        d = rob.close_up_distance(8.0, 30, rob.FOCAL_MM, rob.SENSOR_MM)
        self.assertAlmostEqual(d, rob.frame_distance(8.0, rob.FOCAL_MM, rob.SENSOR_MM) + r)


class ParametricTaper(unittest.TestCase):
    """The parametric arm meets each measurement where the tape goes."""

    def circ(self, placement, y, narrow, wide, length):
        return rob.circumference_at(rob.taper_t(y, length, placement), narrow, wide)

    def test_upper_arm_meets_both_tape_positions(self):
        L = 32.0
        self.assertAlmostEqual(self.circ('upper-arm', L / 8, 26, 30, L), 26)
        self.assertAlmostEqual(self.circ('upper-arm', L / 2, 26, 30, L), 30)

    def test_upper_arm_holds_the_biceps_up_to_the_shoulder(self):
        L = 32.0
        for y in (L / 2, 0.75 * L, L):
            self.assertAlmostEqual(self.circ('upper-arm', y, 26, 30, L), 30)
        self.assertAlmostEqual(self.circ('upper-arm', 0.0, 26, 30, L), 26)

    def test_forearm_is_unchanged(self):
        for y in (0.0, 5.0, 12.5, 25.0):
            self.assertAlmostEqual(rob.taper_t(y, 25.0, 'forearm'), y / 25.0)


class MakeHumanFiles(unittest.TestCase):
    """Reading MakeHuman's CC0 data files with our own parsers (#192)."""

    OBJ = """# This is a mesh file
# basemesh hm08
v 0 0 0
v 1.5 0 0
v 1 1 0
v 0 1 0
v 5 5 5
vt 0.1 0.2
g body
s off
f 1/1 2/1 3/1 4/1
g helper-tights
f 2 3 5
g body
f 1 3 4
"""

    def test_obj_vertices_and_faces_by_group(self):
        verts, groups = rob.parse_obj(self.OBJ.splitlines())
        self.assertEqual(len(verts), 5)
        self.assertEqual(verts[1], (1.5, 0.0, 0.0))
        # 0-based indices, texture indices dropped, a repeated group name appends
        self.assertEqual(groups['body'], [(0, 1, 2, 3), (0, 2, 3)])
        self.assertEqual(groups['helper-tights'], [(1, 2, 4)])

    def test_target_offsets_skip_comments_and_blank_lines(self):
        lines = ['# This is a target file for MakeHuman', '#', '', '3 .5 -1 0.25', '0 0 0 -.125']
        self.assertEqual(rob.parse_target(lines), [(3, (0.5, -1.0, 0.25)), (0, (0.0, 0.0, -0.125))])

    def test_targets_add_weighted_offsets(self):
        verts = [(0.0, 0.0, 0.0), (1.0, 1.0, 1.0)]
        moved = rob.apply_targets(verts, [(0.5, [(1, (2.0, 0.0, -2.0))]),
                                          (0.25, [(0, (4.0, 4.0, 4.0)), (1, (4.0, 0.0, 0.0))])])
        self.assertEqual(moved, [(1.0, 1.0, 1.0), (3.0, 1.0, 0.0)])
        self.assertEqual(verts[1], (1.0, 1.0, 1.0))  # the base is not modified

    def test_data_dir_accepts_a_checkout_root_or_its_data_folder(self):
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as root:
            data = os.path.join(root, 'makehuman', 'data')
            os.makedirs(os.path.join(data, '3dobjs'))
            open(os.path.join(data, '3dobjs', 'base.obj'), 'w').close()
            self.assertEqual(rob.makehuman_data_dir(root), data)
            self.assertEqual(rob.makehuman_data_dir(data), data)
            self.assertEqual(rob.makehuman_data_dir(os.path.join(root, 'makehuman')), data)
            with self.assertRaises(FileNotFoundError):
                rob.makehuman_data_dir(os.path.join(root, 'elsewhere'))


class MakeHumanMacros(unittest.TestCase):
    """MakeHuman's macro sliders blend targets named by sex, age, muscle and weight."""

    def test_three_way_slider(self):
        self.assertEqual(rob.three_way(0.5), {'min': 0.0, 'average': 1.0, 'max': 0.0})
        self.assertEqual(rob.three_way(0.0), {'min': 1.0, 'average': 0.0, 'max': 0.0})
        self.assertEqual(rob.three_way(1.0), {'min': 0.0, 'average': 0.0, 'max': 1.0})
        self.assertEqual(rob.three_way(0.25), {'min': 0.5, 'average': 0.5, 'max': 0.0})

    def test_default_build_is_an_even_blend_of_young_adults(self):
        t = rob.macro_targets()
        ethnic = {k: w for k, w in t.items() if not k.startswith('macrodetails/universal-')}
        self.assertEqual(len(ethnic), 6)  # three ethnicities x two sexes
        self.assertAlmostEqual(sum(ethnic.values()), 1.0)
        for w in ethnic.values():
            self.assertAlmostEqual(w, 1 / 6)
        self.assertIn('macrodetails/caucasian-female-young.target', ethnic)
        self.assertEqual(
            {k: w for k, w in t.items() if k.startswith('macrodetails/universal-')},
            {'macrodetails/universal-female-young-averagemuscle-averageweight.target': 0.5,
             'macrodetails/universal-male-young-averagemuscle-averageweight.target': 0.5})

    def test_sex_muscle_and_weight_move_the_blend(self):
        t = rob.macro_targets(sex=1.0, muscle=0.75, weight=0.25)
        self.assertFalse([k for k in t if '-female-' in k])
        uni = {k.split('universal-male-young-')[1]: w for k, w in t.items() if 'universal' in k}
        self.assertEqual(uni, {'averagemuscle-minweight.target': 0.25,
                               'averagemuscle-averageweight.target': 0.25,
                               'maxmuscle-minweight.target': 0.25,
                               'maxmuscle-averageweight.target': 0.25})
        self.assertAlmostEqual(sum(w for k, w in t.items() if 'universal' not in k), 1.0)

    def test_sex_zero_is_female_and_one_is_male(self):
        # MakeHuman's convention (modifiers/modeling_modifiers_desc.json, Gender:
        # "min is female, max is male"), and its target names follow it.
        female, male = rob.macro_targets(sex=0.0), rob.macro_targets(sex=1.0)
        self.assertTrue(female and all('-female-' in k for k in female))
        self.assertTrue(male and all('-male-' in k for k in male))


class BodySex(unittest.TestCase):
    """--mh-sex random: a fully female or fully male body, drawn from a seed."""

    def test_the_same_seed_gives_the_same_body(self):
        for seed in range(200):
            self.assertEqual(rob.body_sex('random', seed), rob.body_sex('random', seed))

    def test_a_seed_keeps_its_draw(self):
        # Python guarantees random.Random(seed).random() across versions, so a
        # seed recorded in params.json renders the same body again later, in
        # Blender 4.0 (Python 3.12) or bpy 5.2 (3.13) alike.
        draws = {0: 1.0, 1: 0.0, 2: 1.0, 3: 0.0, 4: 0.0, 5: 1.0, 42: 1.0, 192: 0.0}
        self.assertEqual({seed: rob.body_sex('random', seed) for seed in draws}, draws)

    def test_random_is_always_exactly_female_or_male(self):
        for seed in range(500):
            sex = rob.body_sex('random', seed)
            self.assertIsInstance(sex, float)
            self.assertIn(sex, (0.0, 1.0))

    def test_random_is_roughly_balanced(self):
        draws = [rob.body_sex('random', seed) for seed in range(4000)]
        self.assertTrue(0.45 < sum(draws) / len(draws) < 0.55)
        big = [rob.body_sex('random', seed) for seed in range(10**9, 10**9 + 1000)]
        self.assertTrue(0.43 < sum(big) / len(big) < 0.57)

    def test_random_is_spelt_any_case(self):
        self.assertEqual(rob.body_sex(' Random ', 42), rob.body_sex('random', 42))

    def test_a_number_passes_through_and_ignores_the_seed(self):
        for value, want in ((0.5, 0.5), (0, 0.0), (1, 1.0), ('0.25', 0.25), (' 1 ', 1.0)):
            for seed in (None, 7):
                sex = rob.body_sex(value, seed)
                self.assertIsInstance(sex, float)
                self.assertEqual(sex, want)

    def test_out_of_range_or_non_numeric_input_errors_clearly(self):
        for bad in (1.5, -0.1, '2', 'banana', '', None, float('nan'), 'inf', True, [0.5]):
            with self.assertRaisesRegex(ValueError, r"0 \(female\) to 1 \(male\), or 'random'"):
                rob.body_sex(bad, 7)

    def test_random_needs_a_whole_number_seed(self):
        for bad in (None, 1.5, '7', -1, True):
            with self.assertRaisesRegex(ValueError, 'seed'):
                rob.body_sex('random', bad)

    def test_a_run_records_its_seed_its_sex_and_whether_it_was_random(self):
        self.assertEqual(rob.sex_for_run('random', 192),
                         {'sex': 0.0, 'sex_random': True, 'seed': 192})
        self.assertEqual(rob.sex_for_run(0.5, None),
                         {'sex': 0.5, 'sex_random': False, 'seed': None})
        self.assertEqual(rob.sex_for_run('1', 42), {'sex': 1.0, 'sex_random': False, 'seed': 42})

    def test_a_random_run_without_a_seed_gets_a_fresh_one(self):
        runs = [rob.sex_for_run('random') for _ in range(20)]
        for run in runs:
            self.assertTrue(run['sex_random'])
            self.assertIsInstance(run['seed'], int)
            self.assertTrue(0 <= run['seed'] < rob.SEED_LIMIT)
            self.assertEqual(run['sex'], rob.body_sex('random', run['seed']))
        self.assertGreater(len({run['seed'] for run in runs}), 1)

    def test_sex_labels(self):
        self.assertEqual(rob.sex_label(0.0), 'female')
        self.assertEqual(rob.sex_label(1.0), 'male')
        self.assertEqual(rob.sex_label(0.5), '0.5 (0 female, 1 male)')


def _bent_arm(bend_deg=45.0):
    """A toy left arm in decimetres: upper arm down -Y to the elbow at the
    origin, forearm bent towards +Z, hand in the neutral (thumb-forward)
    position with its palm facing -X, as MakeHuman's rest pose has it."""
    b = math.radians(bend_deg)
    fa = (0.0, -math.cos(b), math.sin(b))  # unit, elbow -> wrist
    radial = (0.0, math.sin(b), math.cos(b))  # little finger -> index, perpendicular to fa
    wrist = tuple(2.0 * c for c in fa)  # a 20 cm forearm

    def at(base, *terms):
        return tuple(base[i] + sum(k * v[i] for k, v in terms) for i in range(3))

    joints = {
        'upperarm': (0.0, 3.0, 0.0),
        'elbow': (0.0, 0.0, 0.0),
        'wrist': wrist,
        'index': at(wrist, (0.5, fa), (0.2, radial)),
        'little': at(wrist, (0.5, fa), (-0.2, radial)),
    }
    points = [
        (0.0, 1.0, 0.0),                      # 0: upper arm, 10 cm above the elbow
        at((0, 0, 0), (1.0, fa)),             # 1: mid-forearm on its axis
        at(wrist, (0.3, (-1.0, 0.0, 0.0))),   # 2: palm side of the wrist
        at(wrist, (0.3, radial)),             # 3: thumb side of the wrist
        at((0, 0, 0), (1.0, fa), (0.3, (0.0, -math.sin(b), -math.cos(b)))),  # 4: ulnar mid-forearm
    ]
    lower = [0.0, 1.0, 1.0, 1.0, 1.0]
    return points, lower, joints


class MakeHumanPose(unittest.TestCase):
    """The rest-pose arm is straightened at the elbow, turned palm up and laid
    along +Y from the wrist like the parametric arm, inner forearm on top."""

    def test_rotate_about_an_axis(self):
        p = rob.rotate_about((2.0, 0.0, 5.0), (1.0, 0.0, 5.0), (0.0, 0.0, 1.0), math.pi / 2)
        for got, want in zip(p, (1.0, 1.0, 5.0)):
            self.assertAlmostEqual(got, want)

    def test_signed_angle(self):
        self.assertAlmostEqual(rob.signed_angle((1, 0, 0), (0, 1, 0), (0, 0, 1)), math.pi / 2)
        self.assertAlmostEqual(rob.signed_angle((1, 0, 0), (0, -1, 0), (0, 0, 1)), -math.pi / 2)

    def test_forearm_lies_along_y_from_the_wrist_at_the_requested_length(self):
        points, lower, joints = _bent_arm()
        out, info = rob.pose_forearm(points, lower, joints, length_cm=25.0)
        self.assertAlmostEqual(info['bend_deg'], 45.0)
        self.assertAlmostEqual(info['forearm_cm'], 20.0)
        self.assertAlmostEqual(info['scale'], 25.0 / 20.0)
        x, y, z = out[1]  # mid-forearm: on the axis, half-way
        self.assertAlmostEqual(x, 0.0)
        self.assertAlmostEqual(y, 12.5)
        self.assertAlmostEqual(z, 0.0)
        x, y, z = out[0]  # the upper arm is straight on past the elbow
        self.assertAlmostEqual(x, 0.0)
        self.assertAlmostEqual(y, 25.0 + 12.5)
        self.assertAlmostEqual(z, 0.0)

    def test_inner_forearm_faces_up_and_the_thumb_is_on_the_right(self):
        points, lower, joints = _bent_arm()
        out, info = rob.pose_forearm(points, lower, joints, length_cm=20.0)
        self.assertAlmostEqual(abs(info['twist_deg']), 90.0)
        palm, thumb, ulnar = out[2], out[3], out[4]
        self.assertAlmostEqual(palm[2], 3.0)  # palm side of the wrist is +Z (camera side)
        self.assertAlmostEqual(palm[0], 0.0)
        self.assertAlmostEqual(thumb[0], 3.0)  # a left arm palm up: thumb towards +X, not mirrored
        self.assertAlmostEqual(thumb[2], 0.0)
        # Supination is spread along the forearm: half-way up, half the turn.
        self.assertAlmostEqual(ulnar[1], 10.0)
        self.assertAlmostEqual(ulnar[0], -3.0 * math.sin(math.pi / 4))
        self.assertAlmostEqual(ulnar[2], -3.0 * math.cos(math.pi / 4))

    def test_outer_forearm_turns_the_arm_over_without_mirroring(self):
        points, lower, joints = _bent_arm()
        out, _ = rob.pose_forearm(points, lower, joints, length_cm=20.0, side='outer')
        self.assertAlmostEqual(out[2][2], -3.0)  # palm now underneath
        self.assertAlmostEqual(out[3][0], -3.0)  # a rotation about Y, so the thumb swaps sides
        with self.assertRaises(ValueError):
            rob.pose_forearm(points, lower, joints, length_cm=20.0, side='front')


def _regular_polygon(n, r, centre=(0.0, 0.0), clockwise=False):
    """n points round a circle, starting on top (+z), going towards +x unless anticlockwise."""
    sign = -1 if clockwise else 1
    return [(centre[0] + sign * r * math.sin(2 * math.pi * k / n),
             centre[1] + r * math.cos(2 * math.pi * k / n)) for k in range(n)]


def _tube(ring, ys):
    """Points and triangles (index triples) of a tube: one copy of the 2-D
    ``ring`` (x, z) at each y."""
    n = len(ring)
    points = [(x, y, z) for y in ys for x, z in ring]
    tris = []
    for r in range(len(ys) - 1):
        for k in range(n):
            a, b = r * n + k, r * n + (k + 1) % n
            c, d = b + n, a + n
            tris += [(a, b, c), (a, c, d)]
    return points, tris


class Contours(unittest.TestCase):
    """Arc length round a cross-section of an arbitrary mesh."""

    def test_polygon_length(self):
        self.assertAlmostEqual(rob.polygon_length([(0, 0), (3, 0), (3, 4)]), 12.0)
        self.assertAlmostEqual(rob.polygon_length([(0, 0), (3, 0), (3, 4)], closed=False), 7.0)

    def test_polygon_centroid_and_area(self):
        area, (cx, cz) = rob.polygon_centroid([(1, 1), (3, 1), (3, 2), (1, 2)])
        self.assertAlmostEqual(abs(area), 2.0)
        self.assertAlmostEqual(cx, 2.0)
        self.assertAlmostEqual(cz, 1.5)

    def test_section_of_a_tube_is_one_closed_loop(self):
        ring = _regular_polygon(32, 3.0)
        points, tris = _tube(ring, [0.0, 1.0, 2.0])
        loops = rob.section_loops(points, tris, axis=1, level=1.5)
        self.assertEqual(len(loops), 1)
        loop, closed = loops[0]
        self.assertTrue(closed)
        self.assertEqual(len(loop), 64)  # each quad's diagonal adds a point on the chord
        self.assertAlmostEqual(rob.polygon_length([(p[0], p[2]) for p in loop]),
                               rob.polygon_length(ring))

    def test_two_tubes_give_two_loops(self):
        p1, t1 = _tube(_regular_polygon(12, 1.0), [0.0, 2.0])
        p2, t2 = _tube(_regular_polygon(12, 1.0, centre=(5.0, 0.0)), [0.0, 2.0])
        t2 = [tuple(i + len(p1) for i in t) for t in t2]
        loops = rob.section_loops(p1 + p2, t1 + t2, axis=1, level=1.0)
        self.assertEqual(sorted(len(lp) for lp, closed in loops if closed), [24, 24])

    def test_arc_round_a_polygon_counts_whole_sides_from_the_top(self):
        n, r = 12, 2.0
        side = 2 * r * math.sin(math.pi / n)
        for clockwise in (False, True):  # either winding gives the same answer
            table = rob.contour_table(_regular_polygon(n, r, (5.0, -1.0), clockwise), (5.0, -1.0))
            self.assertAlmostEqual(table[2], n * side)
            for k in (1, 3, 5):
                theta = 2 * math.pi * k / n  # vertex k, towards +x
                self.assertAlmostEqual(rob.arc_at(table, theta), k * side)
                self.assertAlmostEqual(rob.arc_at(table, -theta), -k * side)

    def test_arc_round_a_circle_is_radius_times_angle(self):
        r = 21.5 / (2 * math.pi)
        table = rob.contour_table(_regular_polygon(2048, r), (0.0, 0.0))
        self.assertAlmostEqual(table[2], 21.5, places=4)
        for theta in (0.1, 1.0, 2.5, -0.7, -3.0):
            self.assertAlmostEqual(rob.arc_at(table, theta), r * theta, places=3)

    def test_arc_round_an_ellipse_matches_its_arc_length(self):
        a, b = rob.semi_axes_for(20.0, 1.35)
        pts = rob.ring_points(a, b, 1024)
        table = rob.contour_table([(x, z) for x, z, _ in pts], (0.0, 0.0))
        self.assertAlmostEqual(table[2], 20.0, places=3)
        for x, z, arc in pts[::37]:
            self.assertAlmostEqual(rob.arc_at(table, math.atan2(x, z)), arc, places=3)

    def test_a_fold_in_the_section_does_not_shift_the_angles_after_it(self):
        # A circle with a fold at 90°: the outline runs out to 82° and back.
        # Rays beyond the fold must still meet the circle where they really do.
        r = 2.0
        loop = [(r * math.sin(math.radians(d)), r * math.cos(math.radians(d)))
                for d in range(0, 360, 5)]
        at90 = 90 // 5
        loop.insert(at90 + 1, (2.6 * math.sin(math.radians(82)), 2.6 * math.cos(math.radians(82))))
        table = rob.contour_table(loop, (0.0, 0.0))
        at150 = loop.index(min(loop, key=lambda p: math.dist(p, (r * math.sin(math.radians(150)),
                                                               r * math.cos(math.radians(150))))))
        want = rob.polygon_length(loop[:at150 + 1], closed=False)
        self.assertAlmostEqual(rob.arc_at(table, math.radians(150)), want, places=6)
        back_to_330 = [loop[0]] + loop[:-7:-1]
        self.assertAlmostEqual(rob.arc_at(table, math.radians(-30)),
                               -rob.polygon_length(back_to_330, closed=False), places=6)

    def test_the_seam_is_half_way_round_from_the_top_line(self):
        # A lopsided section (wider on +x): the underside seam is half the
        # perimeter round from the top either way, so a design up to the full
        # circumference fits without being cut early on the narrow side.
        loop = [(0.0, 1.0), (3.0, 1.0), (3.0, -1.0), (0.0, -1.0), (-1.0, -1.0), (-1.0, 1.0)]
        table = rob.contour_table(loop, (0.5, 0.0))
        self.assertAlmostEqual(table[2], 12.0)
        self.assertAlmostEqual(rob.arc_at(table, math.atan2(2.5, 1.0)), 2.5)  # (3, 1)
        self.assertAlmostEqual(rob.arc_at(table, math.atan2(-1.5, 1.0)), -1.5)  # (-1, 1)
        # (2, -1) is 2.5 + 2 + 1 = 5.5 round on the +x side, still under half (6);
        # (1, -1) would be 6.5 that way, so it is -5.5 the other way, although
        # both are on the +x side of the centre: the seam is not straight down.
        self.assertAlmostEqual(rob.arc_at(table, math.atan2(1.5, -1.0)), 5.5)
        self.assertAlmostEqual(rob.arc_at(table, math.atan2(0.5, -1.0)), -5.5)
        self.assertAlmostEqual(rob.arc_at(table, math.atan2(-0.5, -1.0)), -4.5)  # (0, -1)


class ForearmMapping(unittest.TestCase):
    """Per-vertex true-size mapping on an arbitrary arm mesh: position along
    the arm is the axial coordinate, round it the arc from the top line."""

    def test_design_uv_from_cm(self):
        kw = dict(width_cm=12.0, height_cm=10.0, centre_cm=12.5)
        self.assertEqual(rob.design_uv_cm(0.0, 12.5, **kw), (0.5, 0.5))
        u, v = rob.design_uv_cm(6.0, 17.5, **kw)
        self.assertAlmostEqual(u, 1.0)
        self.assertAlmostEqual(v, 1.0)
        u, v = rob.design_uv_cm(6.0, 17.5, up='wrist', **kw)  # rotated, not mirrored
        self.assertAlmostEqual(u, 0.0)
        self.assertAlmostEqual(v, 0.0)
        with self.assertRaises(ValueError):
            rob.design_uv_cm(0.0, 0.0, up='sideways', **kw)

    def test_design_uv_cm_agrees_with_the_parametric_mapping(self):
        circ = 21.5
        for arc, y in ((0.0, 12.5), (4.0, 9.0), (-5.5, 16.0)):
            for up in ('elbow', 'wrist'):
                want = rob.design_uv(0.5 + arc / circ, y / 25.0, circumference_cm=circ,
                                     length_cm=25.0, width_cm=12.0, height_cm=12.0,
                                     centre_cm=12.5, up=up)
                got = rob.design_uv_cm(arc, y, width_cm=12.0, height_cm=12.0, centre_cm=12.5, up=up)
                self.assertAlmostEqual(got[0], want[0])
                self.assertAlmostEqual(got[1], want[1])

    def test_scale_profile_is_linear_between_stations_and_flat_beyond(self):
        self.assertAlmostEqual(rob.scale_at(5.0, (2.0, 1.1), (20.0, 0.9)), 1.1 - 0.2 * 3 / 18)
        self.assertEqual(rob.scale_at(-4.0, (2.0, 1.1), (20.0, 0.9)), 1.1)
        self.assertEqual(rob.scale_at(30.0, (2.0, 1.1), (20.0, 0.9)), 0.9)

    def test_corner_arcs_unwrap_across_the_underside_seam(self):
        self.assertEqual(rob.unwrap_seam([9.5, -9.6, 9.8], 20.0), [9.5, 10.4, 9.8])
        self.assertEqual(rob.unwrap_seam([1.0, -1.0, 0.5], 20.0), [1.0, -1.0, 0.5])

    def _check_vertex_arcs(self, ring_pts, perimeter):
        # ring_pts: (x, z, arc) evenly spaced, starting on the top line
        ys = [i * 0.5 for i in range(21)]  # 10 cm of tube
        points, tris = _tube([(x, z) for x, z, _ in ring_pts], ys)
        stations = rob.arm_stations(points, tris, 0.0, 10.0, 0.25)
        n = len(ring_pts)
        for vi in range(0, len(points), 7):
            arc, perim = rob.surface_coords(stations, points[vi])
            want = ring_pts[vi % n][2]
            if abs(abs(want) - perimeter / 2) > 0.01:  # either sign at the seam itself
                self.assertAlmostEqual(arc, want, places=2)
            self.assertAlmostEqual(perim, perimeter, delta=0.01)

    def test_vertex_arcs_on_a_cylinder(self):
        r = 3.0
        ring = rob.ring_points(r, r, 96)
        self._check_vertex_arcs(ring, 96 * 2 * r * math.sin(math.pi / 96))

    def test_vertex_arcs_on_an_ellipse(self):
        a, b = rob.semi_axes_for(19.0, 1.3)
        ring = rob.ring_points(a, b, 128)
        self._check_vertex_arcs(ring, rob.polygon_length([(x, z) for x, z, _ in ring]))

    def test_fit_and_map_hits_the_measured_circumferences_and_true_size(self):
        # An elliptical tube 18 cm round, refitted to 16 cm at y=2 and 22 cm at y=8;
        # a 10 cm design must then cover 10 cm of skin round the arm at every height.
        a, b = rob.semi_axes_for(18.0, 1.3)
        ring = rob.ring_points(a, b, 128)
        points, tris = _tube([(x, z) for x, z, _ in ring], [i * 0.25 for i in range(41)])
        fit = rob.fit_and_map(points, tris, wrist=(2.0, 16.0), elbow=(8.0, 22.0), step=0.25)
        new = fit['points']
        self.assertEqual(len(new), len(points))
        self.assertAlmostEqual(fit['scale'][0][1], 16.0 / fit['before_cm'][0], places=6)
        mtris = []
        for t in tris:
            arcs = rob.unwrap_seam([fit['arcs'][i] for i in t],
                                   min(fit['perimeters'][i] for i in t))
            mtris.append(tuple((new[i], rob.design_uv_cm(arc, new[i][1], width_cm=10.0,
                                                          height_cm=6.0, centre_cm=5.0))
                               for i, arc in zip(t, arcs)))
        for y, want in ((2.0, 16.0), (8.0, 22.0), (5.0, 19.0)):
            whole, _, _ = rob.measure_slice(mtris, 1, y, {})
            self.assertAlmostEqual(whole, want, delta=0.02)
        m = rob.measure_design(mtris, height_cm=6.0, centre_cm=5.0)
        for spot in m['width_round_arm'].values():
            self.assertAlmostEqual(spot['width_cm'], 10.0, delta=0.02)
        self.assertAlmostEqual(m['length_along_arm_cm'], 6.0, delta=0.01)

    def test_elbow_station_can_be_the_widest_point_in_a_range(self):
        # A tube that bulges at y = 6: the elbow measurement belongs there.
        base, tris = _tube(_regular_polygon(48, 1.0), [i * 0.5 for i in range(21)])
        points = [((3.0 - abs(y - 6.0) * 0.2) * x, y, (3.0 - abs(y - 6.0) * 0.2) * z)
                  for x, y, z in base]
        fit = rob.fit_and_map(points, tris, wrist=(1.0, 15.0), elbow=((4.0, 9.0), 20.0),
                              step=0.25)
        self.assertAlmostEqual(fit['scale'][1][0], 6.0)

    def test_wrist_station_can_be_the_narrowest_point_in_a_range(self):
        base, tris = _tube(_regular_polygon(48, 1.0), [i * 0.5 for i in range(21)])
        points = [((2.0 + abs(y - 3.0) * 0.2) * x, y, (2.0 + abs(y - 3.0) * 0.2) * z)
                  for x, y, z in base]
        fit = rob.fit_and_map(points, tris, wrist=((0.0, 5.0), 15.0), elbow=(9.0, 20.0),
                              step=0.25)
        self.assertAlmostEqual(fit['scale'][0][0], 3.0)

    def test_the_hand_scales_as_a_whole_with_the_wrist(self):
        # Past the wrist station the arm is scaled about it in all three
        # directions, so the hand keeps its proportions.
        ring = _regular_polygon(32, 2.0)
        points, tris = _tube(ring, [i * 0.5 for i in range(-8, 21)])
        fit = rob.fit_and_map(points, tris, wrist=(0.0, 2.0 * rob.polygon_length(ring)),
                              elbow=(8.0, 2.0 * rob.polygon_length(ring)), step=0.25)
        x, y, z = fit['points'][0]  # (0, -4, 2): the first ring's top
        self.assertAlmostEqual(y, -8.0)
        self.assertAlmostEqual(z, 4.0)

    def test_a_hand_off_the_arm_axis_is_scaled_about_one_point(self):
        # Sections below the wrist drift sideways (as a hand's do); scaling each
        # about its own centre would shear the hand. Every vector within the
        # hand must scale by the same factor.
        ring = _regular_polygon(32, 2.0)
        points, tris = _tube(ring, [i * 0.5 for i in range(-8, 21)])
        points = [(x - 0.5 * min(y, 0.0), y, z) for x, y, z in points]
        fit = rob.fit_and_map(points, tris, wrist=(0.0, 3.0 * rob.polygon_length(ring)),
                              elbow=(8.0, rob.polygon_length(ring)), step=0.25)
        a, b = 0, 32 * 4 + 7  # a top vertex at y = -4 and another at y = -2
        before = rob._sub(points[b], points[a])
        after = rob._sub(fit['points'][b], fit['points'][a])
        for got, want in zip(after, before):
            self.assertAlmostEqual(got, 3.0 * want, places=6)


class BodyArgs(unittest.TestCase):
    BASE = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']

    def test_parametric_is_the_default_body(self):
        args = rob.parse_args(self.BASE)
        self.assertEqual(args.body, 'parametric')
        self.assertEqual(args.side, 'outer')  # the upper arm's classic spot
        self.assertEqual(rob.parse_args(self.BASE + ['--placement', 'forearm']).side, 'inner')

    def test_makehuman_needs_its_data_folder(self):
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--body', 'makehuman'])
        args = rob.parse_args(self.BASE + ['--body', 'makehuman', '--makehuman-data', '/mh',
                                           '--side', 'outer', '--mh-sex', '0',
                                           '--mh-muscle', '0.8'])
        self.assertEqual((args.body, args.makehuman_data, args.side), ('makehuman', '/mh', 'outer'))
        self.assertEqual((args.mh_sex, args.mh_muscle, args.mh_weight), (0.0, 0.8, 0.5))
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--body', 'makehuman', '--makehuman-data', '/mh',
                                        '--mh-sex', '1.5'])

    def test_sex_is_random_by_default_with_an_optional_seed(self):
        args = rob.parse_args(self.BASE)
        self.assertEqual((args.mh_sex, args.seed), ('random', None))
        self.assertEqual((args.mh_muscle, args.mh_weight), (0.5, 0.5))  # not randomised
        args = rob.parse_args(self.BASE + ['--mh-sex', 'random', '--seed', '42'])
        self.assertEqual((args.mh_sex, args.seed), ('random', 42))
        self.assertEqual(rob.parse_args(self.BASE + ['--mh-sex', '0.5']).mh_sex, 0.5)
        self.assertEqual(rob.parse_args(self.BASE + ['--seed', '0']).seed, 0)
        for bad in (['--mh-sex', 'banana'], ['--mh-sex', '-0.1'], ['--mh-sex', 'nan'],
                    ['--seed', '-1'], ['--seed', '1.5'], ['--seed', 'abc']):
            with self.assertRaises(SystemExit):
                rob.parse_args(self.BASE + bad)

    def test_framing_includes_the_hand_only_for_the_makehuman_arm(self):
        # (centre, half-height) along the arm, cm from the wrist
        self.assertEqual(rob.camera_frame('parametric', 25.0), (12.5, 14.0))
        self.assertEqual(rob.camera_frame('parametric', 25.0, 'forearm'), (12.5, 14.0))
        centre, half = rob.camera_frame('makehuman', 25.0)
        self.assertLess(centre - half, -8.0)  # the palm is in frame
        self.assertAlmostEqual(centre + half, 26.5)


def _lin(name):
    return rob.srgb8_to_linear(rob.SKIN_TONES[name])


class SkinTone(unittest.TestCase):
    """Skin tone presets, exact sRGB, and the subsurface look that goes with them."""

    BASE = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']

    def test_presets_are_neutral_names_ordered_light_to_deep(self):
        self.assertEqual(rob.DEFAULT_SKIN_TONE, 'warm-brown')
        self.assertIn(rob.DEFAULT_SKIN_TONE, rob.SKIN_TONES)
        self.assertEqual(rob.SKIN_TONES['light-peach'], (201, 157, 128))  # the earlier default
        self.assertGreaterEqual(len(rob.SKIN_TONES), 4)
        for name, rgb in rob.SKIN_TONES.items():
            self.assertRegex(name, r'^[a-z]+(-[a-z]+)*$')
            self.assertEqual(len(rgb), 3)
            self.assertTrue(all(isinstance(c, int) and 0 <= c <= 255 for c in rgb))
        lum = [rob.luminance(rob.srgb8_to_linear(rgb)) for rgb in rob.SKIN_TONES.values()]
        self.assertEqual(lum, sorted(lum, reverse=True))

    def test_light_warm_brown_is_browner_and_warmer_than_the_old_peach(self):
        (r, g, b), (r0, g0, b0) = rob.SKIN_TONES['light-warm-brown'], rob.SKIN_TONES['light-peach']
        self.assertLess(rob.luminance(_lin('light-warm-brown')), rob.luminance(_lin('light-peach')))
        self.assertGreater(g / b, g0 / b0)  # more yellow: warm, not pink
        self.assertLessEqual(r / g, r0 / g0 + 0.02)  # no redder than the peach

    def test_the_default_is_warm_brown_one_step_deeper_than_light_warm_brown(self):
        self.assertEqual(rob.SKIN_TONES[rob.DEFAULT_SKIN_TONE], (154, 118, 84))
        self.assertEqual(rob.srgb8_to_linear(rob.SKIN_TONES['warm-brown']),
                         rob.srgb_hex_to_linear('#9a7654'))
        self.assertLess(rob.luminance(_lin('warm-brown')), rob.luminance(_lin('light-warm-brown')))
        (_, g, b), (_, g0, b0) = rob.SKIN_TONES['warm-brown'], rob.SKIN_TONES['light-peach']
        self.assertGreater(g / b, g0 / b0)  # warm, not pink
        # Its neighbours, a step lighter and a step deeper, sit either side of it.
        names = list(rob.SKIN_TONES)
        at = names.index('warm-brown')
        self.assertEqual(names[at - 1:at + 2], ['light-warm-brown', 'warm-brown', 'medium-brown'])

    def test_srgb8_to_linear_agrees_with_the_hex_form(self):
        self.assertEqual(rob.srgb8_to_linear((201, 157, 128)), rob.srgb_hex_to_linear('#c99d80'))
        self.assertEqual(rob.srgb8_to_linear((0, 255, 0)), (0.0, 1.0, 0.0))
        self.assertAlmostEqual(rob.srgb8_to_linear((128, 128, 128))[1], 0.2158605, places=6)

    def test_parse_skin_rgb(self):
        self.assertEqual(rob.parse_skin_rgb('201,157,128'), (201, 157, 128))
        self.assertEqual(rob.parse_skin_rgb(' 190 , 150, 110 '), (190, 150, 110))
        for bad in ('256,0,0', '1,2', '1,2,3,4', 'a,b,c', '-1,0,0', '1.5,2,3', ''):
            with self.assertRaises(ValueError):
                rob.parse_skin_rgb(bad)

    def test_the_old_tone_keeps_the_old_subsurface_exactly(self):
        sss = rob.skin_subsurface(_lin('light-peach'))
        self.assertEqual(sss['radius'], (1.0, 0.4, 0.22))
        self.assertEqual(sss['flush'], (1.0, 0.86, 0.84))

    def test_browner_skin_scatters_less_far_and_shows_less_redness(self):
        old = rob.skin_subsurface(_lin('light-peach'))
        new = rob.skin_subsurface(_lin('light-warm-brown'))
        for a, b in zip(new['radius'], old['radius']):
            self.assertLess(a, b)
        r, g, b = new['radius']
        self.assertGreater(r, g)
        self.assertGreater(g, b)
        # Melanin takes more of the short wavelengths: blue shrinks most.
        self.assertLess(b / r, old['radius'][2] / old['radius'][0])
        self.assertEqual(new['flush'][0], 1.0)
        self.assertGreater(new['flush'][1], old['flush'][1])  # milder red blotches
        self.assertGreater(new['flush'][2], old['flush'][2])
        deep = rob.skin_subsurface(_lin('deep-brown'))
        self.assertLess(deep['radius'][0], r)
        self.assertGreater(deep['radius'][2], 0)

    def test_args_pick_a_preset_an_exact_rgb_or_the_legacy_hex(self):
        args = rob.parse_args(self.BASE)
        self.assertEqual(args.skin_tone, 'warm-brown')
        self.assertEqual(args.skin_rgb, rob.SKIN_TONES['warm-brown'])
        self.assertEqual(rob.parse_args(self.BASE + ['--skin-tone', 'light-peach']).skin_rgb,
                         (201, 157, 128))
        args = rob.parse_args(self.BASE + ['--skin-rgb', '180,140,100'])
        self.assertEqual((args.skin_tone, args.skin_rgb), (None, (180, 140, 100)))
        self.assertEqual(rob.parse_args(self.BASE + ['--skin', '#c99d80']).skin_rgb,
                         (201, 157, 128))
        for bad in (['--skin-tone', 'beige'], ['--skin-rgb', '300,0,0'], ['--skin', 'c99d8'],
                    ['--skin-tone', 'light-peach', '--skin-rgb', '1,2,3']):
            with self.assertRaises(SystemExit):
                rob.parse_args(self.BASE + bad)


class UpperArmArgs(unittest.TestCase):
    BASE = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']

    def test_upper_arm_measurements_have_adult_defaults(self):
        args = rob.parse_args(self.BASE)
        self.assertEqual((args.above_elbow_cm, args.biceps_cm, args.upper_arm_length_cm),
                         (26, 30, 32))
        self.assertIsNone(args.wrist_cm)
        self.assertEqual(rob.arm_profile(args), (26, 30, 32))
        fore = rob.parse_args(self.BASE + ['--placement', 'forearm'])
        self.assertEqual(rob.arm_profile(fore), (17, 26, 25))
        self.assertIsNone(fore.biceps_cm)
        args = rob.parse_args(self.BASE + ['--biceps-cm', '33', '--above-elbow-cm', '26',
                                           '--upper-arm-length-cm', '34'])
        self.assertEqual(rob.arm_profile(args), (26, 33, 34))

    def test_measurements_must_belong_to_the_placement(self):
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--wrist-cm', '16'])
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--placement', 'forearm', '--biceps-cm', '31'])
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--biceps-cm', '0'])

    def test_views_default_per_placement_and_side(self):
        self.assertEqual(rob.parse_args(self.BASE).views,
                         ['outer', 'front-three-quarter', 'back-three-quarter', 'close-up'])
        self.assertEqual(rob.parse_args(self.BASE + ['--side', 'inner']).views,
                         ['front', 'front-three-quarter', 'close-up'])
        self.assertEqual(rob.parse_args(self.BASE + ['--placement', 'forearm']).views,
                         ['top', 'three-quarter', 'side', 'close-up'])
        self.assertEqual(rob.parse_args(self.BASE + ['--views', 'outer,front']).views,
                         ['outer', 'front'])
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--views', 'top'])
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--placement', 'forearm', '--views', 'outer'])

    def test_design_up_points_to_the_shoulder_by_default(self):
        args = rob.parse_args(self.BASE)
        self.assertEqual(args.design_up, 'shoulder')
        self.assertEqual(rob.limb_up(args.placement, args.design_up), '+y')
        args = rob.parse_args(self.BASE + ['--design-up', 'elbow'])
        self.assertEqual(rob.limb_up(args.placement, args.design_up), '-y')
        fore = rob.parse_args(self.BASE + ['--placement', 'forearm'])
        self.assertEqual(fore.design_up, 'elbow')
        self.assertEqual(rob.limb_up('forearm', 'elbow'), '+y')
        self.assertEqual(rob.limb_up('forearm', 'wrist'), '-y')
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--design-up', 'wrist'])
        with self.assertRaises(SystemExit):
            rob.parse_args(self.BASE + ['--placement', 'forearm', '--design-up', 'shoulder'])

    def test_design_uv_takes_plus_or_minus_y(self):
        kw = dict(width_cm=12.0, height_cm=10.0, centre_cm=12.5)
        self.assertEqual(rob.design_uv_cm(6.0, 17.5, up='+y', **kw),
                         rob.design_uv_cm(6.0, 17.5, up='elbow', **kw))
        self.assertEqual(rob.design_uv_cm(6.0, 17.5, up='-y', **kw),
                         rob.design_uv_cm(6.0, 17.5, up='wrist', **kw))


def _a_posed_arm(side=1):
    """A toy arm in decimetres, posed as MakeHuman's rest pose: the upper arm
    out 42° from vertical in the frontal plane, the elbow bent 43° forward
    (+Z). ``side`` 1 is the left arm (+X), -1 its mirror image, the right."""
    a, b = math.radians(42.0), math.radians(43.0)
    shoulder = (side * 1.7, 5.0, 0.0)
    d = (side * math.sin(a), -math.cos(a), 0.0)
    elbow = tuple(s + 2.4 * c for s, c in zip(shoulder, d))
    fa = tuple(math.cos(b) * c + math.sin(b) * f for c, f in zip(d, (0.0, 0.0, 1.0)))
    wrist = tuple(e + 2.5 * c for e, c in zip(elbow, fa))
    points = [
        (side * 0.5, 3.0, 0.0),                                  # 0: torso
        tuple(s + 1.2 * c for s, c in zip(shoulder, d)),          # 1: mid upper arm
        tuple(e + 1.25 * c for e, c in zip(elbow, fa)),           # 2: mid forearm
        tuple(s + 0.8 * c for s, c in zip(shoulder, d)),          # 3: half-weight, by the shoulder
    ]
    arm = [0.0, 1.0, 1.0, 0.5]
    lower = [0.0, 0.0, 1.0, 0.0]
    return points, arm, lower, {'shoulder': shoulder, 'elbow': elbow, 'wrist': wrist}


def _angle_deg(u, v):
    return math.degrees(math.acos(max(-1.0, min(1.0, rob._dot(rob._normalised(u),
                                                               rob._normalised(v))))))


class UpperArmPose(unittest.TestCase):
    """MakeHuman's A-pose arm is lowered by a weighted turn about the shoulder
    and its elbow relaxed, so the upper arm hangs as it does in a photo."""

    def test_the_arm_is_lowered_and_the_elbow_relaxed(self):
        points, arm, lower, joints = _a_posed_arm()
        out, posed, info = rob.pose_arm_down(points, arm, lower, joints, abduction_deg=12.0,
                                             elbow_bend_deg=15.0)
        self.assertAlmostEqual(info['rest_abduction_deg'], 42.0)
        self.assertAlmostEqual(info['rest_bend_deg'], 43.0)
        sh, el, wr = posed['shoulder'], posed['elbow'], posed['wrist']
        self.assertEqual(sh, joints['shoulder'])
        upper = rob._sub(el, sh)
        self.assertAlmostEqual(_angle_deg(upper, (0.0, -1.0, 0.0)), 12.0)
        self.assertAlmostEqual(math.sqrt(rob._dot(upper, upper)), 2.4)
        self.assertGreater(el[0], sh[0])  # still out to the side, not across the body
        self.assertAlmostEqual(el[2], 0.0)  # in the frontal plane
        self.assertAlmostEqual(_angle_deg(rob._sub(wr, el), upper), 15.0)
        self.assertGreater(wr[2], el[2])  # the forearm still bends forwards
        self.assertEqual(out[0], points[0])  # the torso stays put
        for got, want in zip(out[1], (s + 1.2 * c / 2.4 for s, c in zip(sh, upper))):
            self.assertAlmostEqual(got, want)
        for got, want in zip(out[2], (e + 1.25 * c for e, c in
                                      zip(el, rob._normalised(rob._sub(wr, el))))):
            self.assertAlmostEqual(got, want)
        # Half the arm's weight: half the turn (42 - 12 = 30°, so 15°).
        self.assertAlmostEqual(_angle_deg(rob._sub(out[3], sh), (0.0, -1.0, 0.0)), 42.0 - 15.0)

    def test_the_right_arm_is_lowered_as_a_mirror_image(self):
        points, arm, lower, joints = _a_posed_arm(side=-1)
        out, posed, _ = rob.pose_arm_down(points, arm, lower, joints, abduction_deg=12.0,
                                          elbow_bend_deg=15.0)
        sh, el, wr = posed['shoulder'], posed['elbow'], posed['wrist']
        self.assertLess(el[0], sh[0])
        self.assertAlmostEqual(_angle_deg(rob._sub(el, sh), (0.0, -1.0, 0.0)), 12.0)
        self.assertGreater(wr[2], el[2])


class UpperArmFrame(unittest.TestCase):
    SH = (1.7, 5.0, 0.0)
    EL = (1.7 + 2.4 * math.sin(math.radians(12)), 5.0 - 2.4 * math.cos(math.radians(12)), 0.0)

    def _axes(self, side):
        origin, (x, y, z) = rob.upper_arm_frame(self.SH, self.EL, side)
        self.assertEqual(origin, self.EL)
        for got, want in zip(y, rob._normalised(rob._sub(self.SH, self.EL))):
            self.assertAlmostEqual(got, want)
        self.assertAlmostEqual(rob._dot(rob._cross(x, y), z), 1.0)  # right-handed: never mirrored
        for a, b in ((x, y), (y, z), (z, x)):
            self.assertAlmostEqual(rob._dot(a, b), 0.0)
        return x, y, z

    def test_outer_side_faces_the_camera_with_the_back_on_the_right(self):
        x, _, z = self._axes('outer')
        self.assertGreater(z[0], 0.95)  # lateral: the left arm's outside is +X
        self.assertAlmostEqual(x[2], -1.0)  # +x is the back of the body

    def test_inner_side_is_the_front_of_the_arm(self):
        x, _, z = self._axes('inner')
        self.assertAlmostEqual(z[2], 1.0)  # the biceps faces forward
        self.assertGreater(x[0], 0.95)  # +x is the outside of the arm
        with self.assertRaises(ValueError):
            rob.upper_arm_frame(self.SH, self.EL, 'top')

    def test_to_frame_puts_the_elbow_at_the_origin_and_the_shoulder_up_y(self):
        origin, axes = rob.upper_arm_frame(self.SH, self.EL, 'outer')
        el, sh = rob.to_frame([self.EL, self.SH], origin, axes, 10.0)
        for c in el:
            self.assertAlmostEqual(c, 0.0)
        self.assertAlmostEqual(sh[0], 0.0)
        self.assertAlmostEqual(sh[1], 24.0)
        self.assertAlmostEqual(sh[2], 0.0)

    def test_shoulder_top_is_where_the_outline_faces_up_and_out(self):
        # A round shoulder (radius 5 about y = 20 in the y-z plane), a trapezius
        # sloping gently towards the neck, and a head that is higher still but
        # not part of the arm (share 0).
        pts, share = [], []
        for k in range(181):
            t = math.radians(k)
            pts.append((0.0, 20.0 + 5.0 * math.cos(t), 5.0 * math.sin(t)))
            share.append(1.0)
        pts += [(0.0, 25.0 + 0.3 * k, -k) for k in range(1, 12)]
        share += [1.0] * 11
        pts.append((0.0, 45.0, -15.0))
        share.append(0.0)
        y = rob.shoulder_top_y(pts, share, lateral=(0.0, 0.0, 1.0))
        self.assertAlmostEqual(y, 20.0 + 5.0 / math.sqrt(2), places=2)


class UpperArmViews(unittest.TestCase):
    def test_view_angles_are_set_by_the_body_not_the_design(self):
        self.assertEqual(rob.view_angles('upper-arm', 'outer', 'outer'), (0.0, 0.0))
        around, tilt = rob.view_angles('upper-arm', 'outer', 'back-three-quarter')
        self.assertEqual(around, 45.0)  # towards +x, the back
        self.assertLess(tilt, 0.0)  # a little from above: the shoulder end
        self.assertEqual(rob.view_angles('upper-arm', 'outer', 'front-three-quarter')[0], -45.0)
        self.assertEqual(rob.view_angles('upper-arm', 'inner', 'front'), (0.0, 0.0))
        self.assertEqual(rob.view_angles('upper-arm', 'inner', 'front-three-quarter')[0], 45.0)
        self.assertNotIn('inner-three-quarter', rob.UPPER_ARM_VIEW_ANGLES)  # the chest hides it
        self.assertEqual(rob.view_angles('upper-arm', 'outer', 'front')[0], -90.0)
        self.assertEqual(rob.view_angles('forearm', 'inner', 'three-quarter'), (42.0, 28.0))
        self.assertEqual(rob.view_angles('forearm', 'outer', 'top'), (0.0, 0.0))

    def test_upper_arm_framing_takes_in_the_elbow_and_the_shoulder(self):
        centre, half = rob.camera_frame('makehuman', 32.0, 'upper-arm')
        self.assertLess(centre - half, -4.0)  # a little forearm
        self.assertGreater(centre - half, -10.0)
        self.assertGreater(centre + half, 33.0)  # over the top of the shoulder
        self.assertEqual(rob.camera_frame('parametric', 32.0, 'upper-arm'), (16.0, 17.5))

    def test_aspect_at_takes_the_two_ends(self):
        self.assertEqual(rob.aspect_at(0.3), rob.aspect_at(0.3, rob.WRIST_ASPECT, rob.ELBOW_ASPECT))
        self.assertAlmostEqual(rob.aspect_at(0.0, 1.05, 1.15), 1.05)
        self.assertAlmostEqual(rob.aspect_at(1.0, 1.05, 1.15), 1.15)


class UpperArmMeasure(unittest.TestCase):
    def test_measure_design_names_the_ends_of_the_upper_arm(self):
        # A design 12 cm round and 12 cm along, centred 6 cm up the arm.
        tris = [tuple((p, (u, p[1] / 12.0)) for p, (u, _) in tri)
                for tri in _cylinder(5.0, 30.0, 256, 12.0)]
        m = rob.measure_design(tris, height_cm=12.0, centre_cm=6.0, placement='upper-arm')
        self.assertEqual(list(m['width_round_arm']), ['elbow_end', 'middle', 'shoulder_end'])
        self.assertEqual(m['width_round_arm']['elbow_end']['at_cm_from_elbow'], 1.8)
        for spot in m['width_round_arm'].values():
            self.assertAlmostEqual(spot['width_cm'], 12.0, places=1)
        self.assertAlmostEqual(m['length_along_arm_cm'], 12.0, places=2)

    def test_longest_loop_is_the_arm_not_the_torso_slice(self):
        p1, t1 = _tube(_regular_polygon(48, 1.0), [0.0, 2.0])
        p2, t2 = _tube(_regular_polygon(48, 3.0, centre=(8.0, 0.0)), [0.0, 2.0])
        t2 = [tuple(i + len(p1) for i in t) for t in t2]
        both = rob.longest_loop_length(p1 + p2, t1 + t2, axis=1, level=1.0)
        self.assertAlmostEqual(both, rob.polygon_length(_regular_polygon(48, 3.0)))
        arm_only = rob.longest_loop_length(p1 + p2, t1, axis=1, level=1.0)
        self.assertAlmostEqual(arm_only, rob.polygon_length(_regular_polygon(48, 1.0)))
        self.assertEqual(rob.longest_loop_length(p1, t1, axis=1, level=5.0), 0.0)

    def test_fit_leaves_the_torso_alone_and_blends_into_it(self):
        # An arm tube refitted from 18 cm to 20 cm round, beside a "torso" point
        # (share 0) and a point half-way into the shoulder (share 0.5).
        a, b = rob.semi_axes_for(18.0, 1.0)
        ring = rob.ring_points(a, b, 128)
        points, tris = _tube([(x, z) for x, z, _ in ring], [i * 0.25 for i in range(41)])
        n = len(points)
        top = points[40 * 128]  # the top line at y = 10
        points = points + [(-20.0, 5.0, 0.0), (0.0, 9.0, top[2])]
        share = [1.0] * n + [0.0, 0.5]
        mapped = [True] * n + [False, False]
        fit = rob.fit_and_map(points, tris, wrist=(2.0, 20.0), elbow=(8.0, 20.0), step=0.25,
                              share=share, mapped=mapped)
        k = 20.0 / fit['before_cm'][0]
        self.assertEqual(fit['points'][n], (-20.0, 5.0, 0.0))
        self.assertIsNone(fit['arcs'][n])
        cz = rob.centre_at(fit['stations'], 9.0)[1]
        self.assertAlmostEqual(fit['points'][n + 1][2] - cz, (1 + (k - 1) / 2) * (top[2] - cz))
        self.assertAlmostEqual(fit['points'][0][2], k * points[0][2])
        self.assertAlmostEqual(fit['arcs'][1], k * ring[1][2], places=2)
        # Without share/mapped the fit is unchanged (the forearm path).
        plain = rob.fit_and_map(points[:n], tris, wrist=(2.0, 20.0), elbow=(8.0, 20.0), step=0.25)
        self.assertEqual(plain['points'], fit['points'][:n])
        self.assertEqual(plain['arcs'], fit['arcs'][:n])


class AboveTheArmpit(unittest.TestCase):
    """Above the armpit the arm's own skin no longer goes all the way round:
    the arc is measured along the part that does, from the top line."""

    def _flaring_tube_open_above(self, y_open):
        # A circular tube whose radius grows above y = 5, with its underside
        # (z < -1.5) missing above y_open, as the arm's skin is where it joins
        # the torso.
        ring = _regular_polygon(96, 1.0)
        ys = [i * 0.25 for i in range(41)]
        points, tris = _tube(ring, ys)
        points = [(x * (3.0 + 0.3 * max(0.0, y - 5.0)), y, z * (3.0 + 0.3 * max(0.0, y - 5.0)))
                  for x, y, z in points]
        tris = [t for t in tris if not (min(points[i][1] for i in t) >= y_open
                                        and sum(points[i][2] for i in t) / 3 < -1.5)]
        return points, tris

    def test_arcs_above_the_armpit_follow_the_skin_that_is_there(self):
        points, tris = self._flaring_tube_open_above(6.0)
        stations = rob.arm_stations(points, tris, 0.0, 10.0, 0.25, open_ends=True)
        for vi in (96 * 32 + 8, 96 * 36 + 16, 96 * 38 + 88):  # y = 8, 9, 9.5
            x, y, z = points[vi]
            r = 3.0 + 0.3 * (y - 5.0)
            theta = math.atan2(x, z)
            arc, _ = rob.surface_coords(stations, (x, y, z))
            self.assertAlmostEqual(arc, r * theta, delta=0.01 * r)
        # A lump on one side near the top shifts those sections' centroids;
        # a straight axis fitted lower down keeps the top line straight.
        lumpy = [(x + (0.8 if (y > 4.0 and x > 2.0) else 0.0), y, z) for x, y, z in points]
        free = rob.arm_stations(lumpy, tris, 0.0, 10.0, 0.25, open_ends=True)
        fixed = rob.arm_stations(lumpy, tris, 0.0, 10.0, 0.25, open_ends=True,
                                 axis_range=(0.5, 4.0))
        self.assertGreater(abs(rob.centre_at(free, 5.0)[0]), 0.05)
        for y in (1.0, 5.0, 8.0):
            self.assertAlmostEqual(rob.centre_at(fixed, y)[0], 0.0, places=6)
            self.assertAlmostEqual(rob.centre_at(fixed, y)[1], 0.0, places=6)
        # Without open ends the nearest closed section stands in, which is narrower.
        closed_only = rob.arm_stations(points, tris, 0.0, 10.0, 0.25)
        x, y, z = points[96 * 36 + 16]
        arc, _ = rob.surface_coords(closed_only, (x, y, z))
        self.assertLess(arc, 0.9 * (3.0 + 0.3 * (y - 5.0)) * math.atan2(x, z))


class Warnings(unittest.TestCase):
    def test_wrapping_past_half_way_is_flagged(self):
        w = rob.design_warnings('upper-arm', width_cm=18.0, lo=7.0, hi=25.0, length_cm=32.0,
                                thinnest_cm=27.0, centre_cm_round=30.0)
        self.assertEqual(len(w), 1)
        self.assertIn('216', w[0])  # degrees round the arm
        self.assertIn('half', w[0])
        self.assertEqual(rob.design_warnings('upper-arm', width_cm=12.0, lo=10.0, hi=22.0,
                                             length_cm=32.0, thinnest_cm=27.0,
                                             centre_cm_round=30.0), [])

    def test_measured_size_off_by_more_than_two_percent_is_flagged(self):
        def measured(shoulder_end=12.0, along=12.0):
            return {'width_round_arm': {'elbow_end': {'width_cm': 12.0},
                                        'middle': {'width_cm': 11.99},
                                        'shoulder_end': {'width_cm': shoulder_end}},
                    'length_along_arm_cm': along}

        self.assertEqual(rob.measured_warnings(measured(), width_cm=12.0, height_cm=12.0), [])
        w = rob.measured_warnings(measured(shoulder_end=11.02), width_cm=12.0, height_cm=12.0)
        self.assertEqual(len(w), 1)
        self.assertIn('11.02 cm round the rendered arm at its shoulder end', w[0])
        w = rob.measured_warnings(measured(along=11.0), width_cm=12.0, height_cm=12.0)
        self.assertEqual(len(w), 1)
        self.assertIn('11 cm along', w[0])
        # A design wider than the arm, or past its ends, is warned about already.
        self.assertEqual(rob.measured_warnings(measured(shoulder_end=11.02, along=11.0),
                                               width_cm=12.0, height_cm=12.0,
                                               check_width=False, check_length=False), [])

    def test_too_wide_and_past_the_ends(self):
        w = rob.design_warnings('upper-arm', width_cm=28.0, lo=-1.0, hi=33.0, length_cm=32.0,
                                thinnest_cm=25.0, centre_cm_round=30.0)
        self.assertTrue(any('clipped at the underside' in x for x in w))
        self.assertTrue(any('past the elbow or the top of the shoulder' in x for x in w))
        w = rob.design_warnings('forearm', width_cm=12.0, lo=-1.0, hi=13.0, length_cm=25.0,
                                thinnest_cm=17.0, centre_cm_round=21.0)
        self.assertTrue(any('past the wrist or elbow' in x for x in w))


if __name__ == '__main__':
    unittest.main()


class Label(unittest.TestCase):
    BASE = ['--', '--image', 'a.png', '--width-cm', '12', '--out', 'r']

    def test_files_are_named_after_the_view_without_a_label(self):
        self.assertIsNone(rob.parse_args(self.BASE).label)
        self.assertEqual(rob.view_filename('close-up', None), 'close-up.png')

    def test_a_label_prefixes_every_view_file(self):
        args = rob.parse_args(self.BASE + ['--label', 'koi-12cm'])
        self.assertEqual(args.label, 'koi-12cm')
        self.assertEqual(rob.view_filename('outer', args.label), 'koi-12cm-outer.png')

    def test_a_label_names_params_json_too_so_sizes_can_share_a_folder(self):
        self.assertEqual(rob.params_filename(None), 'params.json')
        self.assertEqual(rob.params_filename('koi-12cm'), 'koi-12cm-params.json')

    def test_a_label_must_be_a_plain_file_name(self):
        for bad in ('', 'a/b', '../x', '.hidden', 'a b', 'x\\y'):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                rob.parse_args(self.BASE + ['--label', bad])
