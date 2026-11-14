import argparse
import datetime as dt
import json
from pathlib import Path

from . import charts
from .validation import ONSET, run_validation

ROOT = Path(__file__).resolve().parents[3]
RESULTS = Path(__file__).with_name("validation_results.json")
CHARTS = Path(__file__).with_name("validation_charts")

def fmt(s: dict, unit: str = "days") -> str:
    if not s or s.get("median") is None:
        return "not reached"
    lo, hi = s["iqr"]
    if unit == "days" and s["median"] == 1:
        unit = "day"
    return f"{s['median']:g} {unit} (IQR {lo:g} to {hi:g}, n = {s['n']})"

def pct(x) -> str:
    return "n/a" if x is None else f"{round(100 * x)}%"

def write_charts(r: dict) -> list[str]:
    CHARTS.mkdir(parents=True, exist_ok=True)
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
        (CHARTS / name).write_text(svg)
    return list(files)

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
    rel, st = r["relapse"], r["stable"]
    print(f"days from onset to check-in: {fmt(rel['days_onset_to_check_in'])}; detected {pct(rel['detected_share'])}")
    print(f"false check-ins: {st['false_check_in_episodes']} ({st['false_alarms_per_patient_month']:.3f} per patient-month)")
    print(f"bandit calm sessions to P(best) 0.8: {fmt(r['bandit']['sessions_to_p_best_0_8'], 'sessions')}")
    print(f"wrote {RESULTS.relative_to(ROOT)}, {CHARTS.relative_to(ROOT)}/ ({len(names)} SVG)")

if __name__ == "__main__":
    main()
