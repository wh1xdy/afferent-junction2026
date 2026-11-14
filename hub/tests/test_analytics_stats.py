import math

import numpy as np
import pytest

from afferent_hub.analytics import stats


def test_median_mad_ignore_missing():
    assert stats.median([3, None, 1, 2]) == 2
    assert stats.mad([1, 2, 3, 4, 100]) == 1
    assert stats.median([]) is None and stats.mad([None]) is None


def test_baseline_uses_first_14_days_with_floor():
    series = [10.0] * 14 + [50.0] * 10
    b = stats.baseline(series, floor=2.0)
    assert b["median"] == 10 and b["mad"] == 0 and b["scale"] == 2.0
    assert b["n"] == 14 and b["last_day"] == 13 and b["ready"]
    assert b["band_lo"] == 8 and b["band_hi"] == 12


def test_baseline_extends_until_seven_values():
    series = [1.0, None, None, None, None, None, None, None, None, None, None, None, None, 2.0] + [3.0] * 10
    b = stats.baseline(series, floor=0.1)
    assert b["n"] == 7 and b["last_day"] == 18 and b["ready"]


def test_baseline_not_ready_and_empty():
    assert stats.baseline([1.0, 2.0], floor=1)["ready"] is False
    empty = stats.baseline([None] * 20, floor=1)
    assert empty["n"] == 0 and empty["median"] is None and not empty["ready"]


def test_baseline_respects_now_day():
    b = stats.baseline([1.0] * 30, floor=1, now_day=5)
    assert b["n"] == 6 and b["last_day"] == 5


def test_baseline_scale_is_mad_times_1_4826():
    series = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    b = stats.baseline(series, floor=0.01)
    assert b["scale"] == pytest.approx(1.4826 * b["mad"])


def test_robust_z():
    assert stats.robust_z(14, 10, 2) == 2
    assert stats.robust_z(None, 10, 2) is None
    assert stats.robust_z(1, None, 2) is None


def test_ewma_skips_missing_and_goes_stale():
    e = stats.ewma([1.0, None, 0.0, None, None, None, None], lam=0.5, stale_days=3)
    assert e[0] == 1 and e[1] == 1 and e[2] == 0.5
    assert e[5] == 0.5 and e[6] is None


def test_ewma_matches_contract_example():
    e = stats.ewma([0.04, 0.17], lam=0.3)
    assert round(e[1], 3) == round(0.3 * 0.17 + 0.7 * 0.04, 3)


def test_rolling_requires_min_obs():
    r = stats.rolling([1, 2, None, 4, 5, 6, 7, 8], window=3, min_obs=2)
    assert r[0] is None and r[1] == 1.5 and r[2] == 1.5 and r[7] == 7


def test_cusum_one_sided_and_starts_late():
    c = stats.cusum([5, 5, 1, None, 0, 0, 0], k=0.5, start=1)
    assert c[0] == 0
    assert c[1] == 4.5 and c[2] == 5.0 and c[3] == 5.0
    assert c[4] == 4.5 and min(c) >= 0


def test_state_for_thresholds():
    th = {"watch": 1.5, "check_in": 3.0, "booster": 8.0}
    assert [stats.state_for(v, th) for v in (0, 1.5, 3.0, 8.0)] == ["stable", "watch", "check_in", "booster"]


def test_inter_daily_stability_bounds():
    day = [1.0] * 7 + [0.0] * 15 + [1.0] * 2
    assert stats.inter_daily_stability([day] * 7) == pytest.approx(1.0)
    rng = np.random.default_rng(0)
    noisy = [list(rng.random(24)) for _ in range(7)]
    assert stats.inter_daily_stability(noisy) < 0.4
    assert stats.inter_daily_stability([[0.5] * 24] * 7) is None
    assert stats.inter_daily_stability([]) is None


def test_inter_daily_stability_drops_when_shifted():
    day = [1.0] * 7 + [0.0] * 17
    shifted = [day[i:] + day[:i] for i in (0, 3, 6, 1, 4, 7, 2)]
    assert stats.inter_daily_stability(shifted) < stats.inter_daily_stability([day] * 7)


def test_intradaily_variability():
    smooth = [[1.0] * 12 + [0.0] * 12] * 3
    choppy = [[1.0, 0.0] * 12] * 3
    assert stats.intradaily_variability(choppy) > stats.intradaily_variability(smooth)
    assert stats.intradaily_variability([[0.0] * 24]) is None


def test_log_b_log_d_formula_matches_session_example():
    assert round(stats.log_b(5, 1, 3, 3), 3) == 0.282
    assert round(stats.log_d(5, 1, 3, 3), 3) == 0.282
    assert stats.log_b(6, 0, 6, 0) == pytest.approx(0.0)
    assert stats.log_b(6, 0, 0, 6) > 0


def test_rnd_no_negative_zero():
    assert math.copysign(1, stats.rnd(-0.0001, 2)) == 1
    assert stats.rnd(None) is None


def test_quantiles_and_mean():
    assert stats.quantiles([1, 2, 3, 4, 5]) == [2, 4]
    assert stats.mean([1, None, 3]) == 2
    assert stats.quantiles([]) is None and stats.mean([]) is None
