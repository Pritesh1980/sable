"""Unit tests for extract-design.py's maths. Needs numpy, which Blender's
Python has and macOS's system Python may not:

    blender -b --python-expr "import unittest,sys; sys.argv=['x']; \
      unittest.main(module=None, argv=['x','discover','-s','scripts/blender','-p','test_extract_design.py'])"
"""
import importlib.util
import os
import unittest

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

_HERE = os.path.dirname(os.path.abspath(__file__))


@unittest.skipUnless(np is not None, 'numpy not installed (run under Blender\'s Python)')
class Extract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location(
            'extract_design', os.path.join(_HERE, 'extract-design.py'))
        cls.ex = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.ex)

    def photo(self, h=120, w=96):
        """Brown skin, shaded across the limb, with a dark ink disc in the middle."""
        y, x = np.mgrid[0:h, 0:w].astype(np.float64)
        shade = 1.0 - 0.35 * ((x - w / 2) / (w / 2)) ** 2
        skin = np.stack([0.30 * shade, 0.17 * shade, 0.09 * shade], axis=-1)
        ink = np.ones((h, w))
        ink[(x - w / 2) ** 2 + (y - h / 2) ** 2 < 20 ** 2] = 0.2
        return skin * ink[..., None], ink

    def test_srgb_round_trip(self):
        v = np.linspace(0, 1, 11)
        np.testing.assert_allclose(self.ex.to_srgb(self.ex.to_linear(v)), v, atol=1e-9)

    def test_recovers_the_ink_and_divides_out_the_limb_shading(self):
        linear, ink = self.photo()
        t = self.ex.transmittance(linear, feather=0.0)
        self.assertEqual(t.shape, linear.shape)
        np.testing.assert_allclose(t[60, 48], [0.2] * 3, atol=0.03)  # inside the disc
        # Bare skin comes out as blank paper, at the bright centre and the
        # shaded edge alike.
        self.assertEqual(t[10, 48].min(), 1.0)
        self.assertEqual(t[60, 6].min(), 1.0)

    def test_uneven_skin_does_not_print_as_coloured_speckle(self):
        linear, _ = self.photo()
        rng = np.random.default_rng(1)
        linear = linear * (1 + 0.02 * rng.standard_normal(linear.shape))  # per-channel noise
        t = self.ex.transmittance(linear, feather=0.0)
        # The bare skin above the disc. The outermost columns, where the limb
        # turns away steeply, are the feather's job (off in this test).
        self.assertGreater(t[:30, 10:86].min(), 0.97)

    def test_a_lighter_background_is_blank_paper_not_ink(self):
        linear, _ = self.photo()
        linear[:, :8] = 0.6  # a grey wall beside the arm
        t = self.ex.transmittance(linear, feather=0.0)
        self.assertEqual(t[60, 3].min(), 1.0)

    def test_feather_fades_the_crop_edge_to_blank(self):
        linear, _ = self.photo()
        linear[:6, :] *= 0.3  # something dark at the very top of the crop
        t = self.ex.transmittance(linear, feather=0.1)
        self.assertEqual(t[0, 48].min(), 1.0)
        np.testing.assert_allclose(t[60, 48], [0.2] * 3, atol=0.03)


if __name__ == '__main__':
    unittest.main()
