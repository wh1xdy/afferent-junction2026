import argparse
import datetime as dt
import json
from pathlib import Path

from . import charts
from .engine import PARAMS
from .features import FEATURES
from .validation import ONSET, run_validation

ROOT = Path(__file__).resolve().parents[3]
RESULTS = Path(__file__).with_name("validation_results.json")
DOCS = ROOT / "docs" / "validation"
REPORT = ROOT / "Validation.md"


def fmt(s: dict, unit: str = "days") -> str:
    if not s or s.get("median") is None:
        return "not reached"
    lo, hi = s["iqr"]
    if unit == "days" and s["median"] == 1:
        unit = "day"
    return f"{s['median']:g} {unit} (IQR {lo:g} to {hi:g}, n = {s['n']})"


def num(x) -> str:
    return "n/a" if x is None else f"{x:g}"


def days(x) -> str:
    return "n/a days" if x is None else f"{x:g} day" + ("" if x == 1 else "s")


def pct(x) -> str:
    return "n/a" if x is None else f"{round(100 * x)}%"


def write_charts(r: dict) -> list[str]:
    DOCS.mkdir(parents=True, exist_ok=True)
    th = r["params"]["thresholds"]
    ex = r["example"]
    files = {
        "anna_timeline.svg": charts.patient_example(ex["anna"], "anna", "Anna", th),
        "mikko_timeline.svg": charts.patient_example(ex["mikko"], "mikko", "Mikko", th),
        "juha_timeline.svg": charts.patient_example(ex["juha"], "juha", "Juha", th),
        "cohort_composite.svg": charts.cohort_bands(r["curves"], ONSET),
        "lead_times.svg": charts.lead_times(r["relapse"]["per_seed_days_onset_to_check_in"],
                                            r["relapse"]["per_seed_mood_only_days_onset_to_flag"]),
        "bandit_convergence.svg": charts.bandit_curve(r["curves"], ex["bandit_p_best"]),
    }
    for name, svg in files.items():
        (DOCS / name).write_text(svg)
    return list(files)


def report(r: dict) -> str:
    rel, st, b = r["relapse"], r["stable"], r["bandit"]
    p = r["params"]
    th = p["thresholds"]
    ex = r["example"]
    mm = rel["mood_only_at_matched_false_alarms"]
    bk = mm["best_k"]
    sweep = "\n".join(
        f"| {x['k']:g} | {num(x['check_in_threshold'])} | {fmt(x['days_onset_to_flag'])} | {pct(x['detected_share'])} | "
        f"{num(x['false_check_in_episodes'])} |" for x in mm["k_sweep"])
    sens = "\n".join(
        f"| {row['k']:g} | {row['check_in']:g} | {fmt(row['days_onset_to_check_in'])} | {pct(row['detected_share'])} | "
        f"{row['false_alarms_per_patient_month']:.3f} |{' current' if row['current'] else ''}"
        for row in r["sensitivity"])
    modes = "\n".join(
        f"| {m} | {fmt(v['sessions_to_p_best_0_8'], 'sessions')} | {fmt(v['sessions_to_first_p_best_0_8'], 'sessions')} | "
        f"{pct(v['found_share_by_day_56'])} | {pct(v['wrong_arm_crossed_first_share'])} | "
        f"{pct(v['best_arm_pick_share_days_0_13'])} | {pct(v['best_arm_pick_share_days_42_55'])} |"
        for m, v in b["by_mode"].items())
    feats = "\n".join(f"| {f['label']} | {f['weight']:g} | {f['floor']:g} ({f['unit']}) | {f['evidence']} |" for f in FEATURES)
    return f"""# Validation on synthetic data

**SIMULATED. Every number on this page comes from our own synthetic generator (`hub/afferent_hub/synthetic.py`), not from patients.** The parameters were set on this same synthetic data and were never tuned on real patient data. Nothing here is clinically validated. The detector and the generator were written by the same team, so the generator shares the detector's assumptions; real data will have more non-stationarity, more missingness patterns and smaller, less consistent changes, so expect longer detection delays and more false alarms in practice.

Reproduce: `cd hub && .venv/bin/python -m afferent_hub.analytics.validate` (writes this file, `docs/validation/*.svg` and `hub/afferent_hub/analytics/validation_results.json`, which `GET /api/validation` serves). Generated {r['generated_iso']}, {r['n_seeds']} seeds.

## What was simulated

For each seed, one relapse patient and one stable control, 56 days each (days 0 to 55 after the end of TMS), with personal baselines drawn per patient, day-to-day noise, a shared slow "day quality" factor, weekends (later sleep, more home-only days), about 10 to 15% missed days at baseline, about 3% declined days, sensor dropouts (presence sensor about 4% of nights, phone presence about 5% of days, pulse quality below 0.5 in about 7% of sessions, face not tracked in about 4%), morning pulse readings missing on about 25% of days, a reaction-time practice effect in the first week, and occasional partial sessions.

- Relapse: severity ramps linearly from 0 on day {ONSET} (week 5) to 1 on day {ONSET + 21}. At full severity: reaction time about +80 ms, mood check-in about 2 lanterns lower, sleep timing more irregular (lower inter-daily stability), wake time later, more naps, more home-only days, more missed sessions, fewer hard choices at the fork, a weaker reward bias in Two lanterns, less upright time and a morning resting pulse about 6 bpm higher.
- Stable control: no relapse, but about half of them get a short simulated rough patch (4 to 8 days at up to 30% severity), so the false-alarm numbers are not trivially zero by construction.
- Bandit: every patient has true per-task "helped" rates (calm: Breath about 0.75, Löyly at least 0.2 lower; wake and fatigue arms closer together and varying by patient). The simulated game picks tasks with the Thompson-sampling weights computed from that patient's earlier sessions, so this is a closed loop. Like the real game, it never repeats the previous task back to back (a deliberate variety rule); with only two calm tasks, a second calm slot in a session always gets the other task, whatever the weights.

The analytics engine (`analyze_patient`) is run day by day (`now_day` = 14 to 55), seeing only data up to that day.

## Parameters used

EWMA lambda {p['ewma_lambda']}, CUSUM from day {p['cusum_start_day']} with k = {p['cusum_k']}, thresholds watch {th['watch']:g}, check-in {th['check_in']:g}, booster {th['booster']:g}. Composite features, weights and MAD floors:

| Feature | Weight | MAD floor | Evidence |
|---|---|---|---|
{feats}

Changes from the first contract draft (logged in `Statistics.md`): k lowered from 0.5 to 0.35, and the MAD floors of mood (0.5 to 1 lantern), missed sessions and home-only days (0.75 to 1 day), effort (0.15 to 0.2) and reward bias (0.1 to 0.15) raised. The windowed features are strongly autocorrelated inside the 14-day baseline, so their raw MAD underestimates their real day-to-day spread and inflated the z-scores of stable patients.

## Results

### Early warning on relapse patients ({r['n_seeds']} simulated)

| Measure | Result |
|---|---|
| Days from onset to first "watch" | {fmt(rel['days_onset_to_watch'])} |
| Days from onset to first "consider a check-in call" (detection delay) | {fmt(rel['days_onset_to_check_in'])} |
| Days from onset to first "consider discussing a booster session" | {fmt(rel['days_onset_to_booster'])} |
| Relapses flagged with a check-in by day 55 | {pct(rel['detected_share'])} |
| Relapse patients flagged before onset (days 14 to 27) | {pct(rel['pre_onset_check_in_share'])} |
| Mood check-in alone (same CUSUM on the mood feature only), days to flag | {fmt(rel['mood_only_rule_days_onset_to_flag'])}, flagged {pct(rel['mood_only_detected_share'])} |
| Lead of the composite over mood alone | {fmt(rel['lead_time_vs_mood_only_days'])} ({rel['lead_time_vs_mood_only_note']}) |
| Mood alone, composite k = {mm['k']:g}, threshold raised until its false alarms on stable controls match the composite ({mm['false_check_in_episodes']} episodes, threshold {mm['check_in_threshold']}) | {fmt(mm['days_onset_to_flag'])}, flagged {pct(mm['detected_share'])} |
| Mood alone, best k from the sweep below (k = {bk['k']:g}, threshold {bk['check_in_threshold']}, {bk['false_check_in_episodes']} false episodes) | {fmt(bk['days_onset_to_flag'])}, flagged {pct(bk['detected_share'])} |

Reading: the fair comparison holds both rules to the same false-alarm count on the stable controls. Mood alone then flags a median of {days(mm['days_onset_to_flag']['median'])} after onset and catches {pct(mm['detected_share'])} at the composite's k, and {days(bk['days_onset_to_flag']['median'])} and {pct(bk['detected_share'])} with its own best k, against {days(rel['days_onset_to_check_in']['median'])} and {pct(rel['detected_share'])} for the composite. So at equal false alarms the composite flags about {days(bk['days_onset_to_flag']['median'] - rel['days_onset_to_check_in']['median'])} earlier and misses fewer relapses. With identical settings (same k and thresholds, which were tuned for the composite) mood alone raises {st['mood_only_false_check_in_episodes']} false check-in suggestions against {st['false_check_in_episodes']}, but that gap mostly reflects that the mood series is about twice as noisy as the composite, not a property of combining signals; at identical settings the composite leads mood alone by only {fmt(rel['lead_time_vs_mood_only_days'])}.

Mood alone at equal false alarms, by CUSUM k (threshold raised in steps of 0.5 until false check-in episodes are at most {mm['false_check_in_episodes']}):

| k | Check-in threshold | Days onset to flag | Flagged by day 55 | False check-in episodes |
|---|---|---|---|---|
{sweep}

Severity reaches 1 on day {ONSET + 21}, so a check-in suggestion about {days(rel['days_onset_to_check_in']['median'])} after onset arrives while the simulated relapse is still building.

![Days from onset to flag](docs/validation/lead_times.svg)

![Cohort composite](docs/validation/cohort_composite.svg)

### False alarms on stable controls

| Measure | Result |
|---|---|
| Stable patients, patient-days (days 14 to 55) | {st['patients']}, {st['patient_days']} |
| False "check-in" episodes | {st['false_check_in_episodes']} ({st['false_alarms_per_patient_month']:.3f} per patient-month) |
| False "watch" episodes | {st['false_watch_episodes']} |
| False "booster" episodes | {st['false_booster_episodes']} |
| Stable patients with any check-in suggestion | {pct(st['patients_with_any_check_in_share'])} |
| Mood-only rule, false check-in episodes | {st['mood_only_false_check_in_episodes']} |

### Sensitivity (detection delay against false alarms)

| CUSUM k | Check-in threshold | Days onset to check-in | Flagged by day 55 | False check-ins per patient-month |
|---|---|---|---|---|
{sens}

### What works for this person (bandit)

Sessions until the bandit's P(best) for the truly most helpful task reaches {b['target_p_best']:g} and stays there to day 55, over {b['patients']} simulated patients (relapse and stable). The first crossing is shown as a secondary figure: in calm, P(best) fell back below {b['target_p_best']:g} after its first crossing in {pct(b['by_mode']['calm']['dropped_back_after_first_crossing_share'])} of patients. "Wrong arm first" is the share of patients where another task reached {b['target_p_best']:g} before the true best one. "Pick share" is how often the director actually chose the true best task in that mode, early and late: Thompson sampling shifts the choice towards what helps while still exploring, and the no-repeat rule caps the share in calm (two tasks) well below 100%.

| Mode | Sessions until P(best) stays >= 0.8 | First crossing (secondary) | Above 0.8 at day 55 | Wrong arm first | Pick share days 0 to 13 | Pick share days 42 to 55 |
|---|---|---|---|---|---|---|
{modes}

Calm has one clearly better task (Breath), so it settles within a few weeks for most patients (median {days(b['sessions_to_p_best_0_8']['median']).replace('day', 'session')}). Wake and fatigue tasks are closer together, so the posterior often stays uncertain over 8 weeks; the dashboard shows that uncertainty instead of a false winner.

![Bandit convergence](docs/validation/bandit_convergence.svg)

## Demo patients

The six demo patients use fixed seeds that were picked so the roster tells the intended story (Anna: relapse from day {ex['anna']['onset_day']}, check-in suggestion on day {ex['anna']['first_check_in_day']}; Juha: relapse from day {ex['juha']['onset_day']}, check-in suggestion on day {ex['juha']['first_check_in_day']}; Mikko, Leena, Sofia and Eero stable). That pick is a presentation choice; the numbers above use {r['n_seeds']} unpicked seeds.

![Anna](docs/validation/anna_timeline.svg)

![Juha](docs/validation/juha_timeline.svg)

![Mikko](docs/validation/mikko_timeline.svg)

## Limits

- Simulated, in-sample, not clinically validated. The relapse effect sizes are our assumptions, not measured values.
- The comparison rule (mood alone) uses the same detector; it is not a validated clinical instrument such as a PHQ-9 schedule.
- The bandit outcome ("pulse moved 2 bpm in the intended direction") is a within-session proxy. It says nothing about longer-term benefit; the next-day associations on the dashboard are associations, not causation.
- The system only suggests. A clinician decides.
"""


def main():
    ap = argparse.ArgumentParser(description="Synthetic validation of the Afferent analytics (simulated data only)")
    ap.add_argument("--seeds", type=int, default=50)
    ap.add_argument("--roster-seed", type=int, default=7)
    args = ap.parse_args()
    now = dt.datetime.now().astimezone()
    r = run_validation(args.seeds, roster_seed=args.roster_seed, today=now.date(),
                       generated_iso=now.isoformat(timespec="seconds"), include_curves=True)
    RESULTS.write_text(json.dumps(r, indent=1, ensure_ascii=False) + "\n")
    names = write_charts(r)
    REPORT.write_text(report(r))
    rel, st = r["relapse"], r["stable"]
    print(f"days from onset to check-in: {fmt(rel['days_onset_to_check_in'])}; detected {pct(rel['detected_share'])}")
    print(f"false check-ins: {st['false_check_in_episodes']} ({st['false_alarms_per_patient_month']:.3f} per patient-month)")
    print(f"bandit calm sessions to P(best) 0.8: {fmt(r['bandit']['sessions_to_p_best_0_8'], 'sessions')}")
    print(f"wrote {RESULTS.relative_to(ROOT)}, {REPORT.relative_to(ROOT)}, docs/validation/ ({len(names)} SVG)")


if __name__ == "__main__":
    main()
