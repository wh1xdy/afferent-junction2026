import math
import unittest

import _path  # noqa: F401
import stats


class TestDescribe(unittest.TestCase):
    def test_empty_and_single(self):
        self.assertEqual(stats.describe([])["n"], 0)
        d = stats.describe([5])
        self.assertEqual((d["n"], d["median"], d["std"]), (1, 5, None))

    def test_percentiles_match_numpy_linear(self):
        d = stats.describe([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        self.assertAlmostEqual(d["median"], 5.5)
        self.assertAlmostEqual(d["p10"], 1.9)
        self.assertAlmostEqual(d["p90"], 9.1)
        self.assertAlmostEqual(d["std"], 3.028, places=3)   # sample SD (n-1)
        self.assertAlmostEqual(d["iqr"], 4.5)


class TestTrend(unittest.TestCase):
    def test_mann_kendall_increasing(self):
        r = stats.mann_kendall(list(range(1, 11)))
        self.assertEqual(r["s"], 45)
        self.assertAlmostEqual(r["z"], 44 / math.sqrt(125), places=3)
        self.assertLess(r["p"], 0.001)
        self.assertEqual(r["trend"], "increasing")

    def test_mann_kendall_flat_and_short(self):
        self.assertEqual(stats.mann_kendall([3, 3, 3, 3, 3])["trend"], "no trend")
        self.assertEqual(stats.mann_kendall([1, 2])["trend"], "insufficient data")

    def test_mann_kendall_decreasing_noisy(self):
        r = stats.mann_kendall([10, 9, 9.5, 8, 7, 7.5, 6, 5, 5.2, 4, 3, 2])
        self.assertEqual(r["trend"], "decreasing")

    def test_sen_slope_robust_to_outlier(self):
        xs = list(range(10))
        ys = [2 * x + 1 for x in xs]
        ys[5] = 1000
        self.assertAlmostEqual(stats.sen_slope(xs, ys), 2.0)


class TestBaselineAndCorrelation(unittest.TestCase):
    def test_robust_z(self):
        hist = [60, 61, 62, 60, 59, 61, 60]
        r = stats.robust_z(70, hist)
        self.assertEqual(r["baseline_median"], 60)
        self.assertGreater(r["z"], 5)
        self.assertIsNone(stats.robust_z(70, [60, 61])["z"])

    def test_robust_z_flat_history_falls_back_to_sd(self):
        r = stats.robust_z(2, [0, 0, 0, 0, 0, 0, 1])
        self.assertIsNotNone(r["z"])

    def test_correlation(self):
        xs = list(range(20))
        r = stats.correlation(xs, [x * x for x in xs])
        self.assertAlmostEqual(r["spearman_rho"], 1.0)
        self.assertLess(r["pearson_p"], 0.001)
        r = stats.correlation(xs, [5] * 20)
        self.assertIsNone(r["pearson_r"])

    def test_spearman_ties(self):
        self.assertAlmostEqual(stats.spearman([1, 2, 2, 3], [1, 2, 2, 3]), 1.0)


if __name__ == "__main__":
    unittest.main()
