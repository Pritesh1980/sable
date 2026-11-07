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
                               '--width-cm', '12', '--out', 'renders'])
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
