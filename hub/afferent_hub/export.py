import csv
import io
import json
import zipfile

from . import views
from .analytics.features import FEATURES
from .settings import ROOT

DAILY_SCHEMA = ROOT / "contracts" / "daily.v1.schema.json"
SESSION_DOC = ROOT / "SessionSchema.md"
LIST_JOIN = ";"

DERIVED = {
    "streak_protection": "freeze or repair when the streak survived this missed day; the day stays missed",
    "pause_source": "patient or clinician when a streak pause covers this day",
    "pause_until": "Last day of the pause covering this day (YYYY-MM-DD)",
    "streak_len": "Streak length at the end of this day (covariate, never shown below 2)",
    "freezes_held": "Streak freezes held at the end of this day (0 to 2)",
    "repair_active": "true while up to 3 unprotected missed days wait for the silent repair",
}


def _flat(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flat(v, key + "."))
        elif isinstance(v, list):
            out[key] = LIST_JOIN.join("" if x is None else str(x) for x in v)
        else:
            out[key] = v
    return out


def _csv(rows: list[dict]) -> str:
    cols = list(dict.fromkeys(c for r in rows for c in r))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({c: "" if r.get(c) is None else r[c] for c in cols})
    return buf.getvalue()


def _schema_docs(props: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in props.items():
        if "properties" in v:
            out.update(_schema_docs(v["properties"], f"{prefix}{k}."))
        out[f"{prefix}{k}"] = v.get("description", "")
    return out


def feature_rows(analytics: dict, daily: list[dict], sessions: list[dict]) -> list[dict]:
    tl = analytics.get("timeline") or {}
    by_key = {f["key"]: f.get("series") or {} for f in analytics.get("features") or []}
    sim_days = {d["day_index"] for d in daily if d.get("simulated")} | {
        s.get("day_index") for s in sessions if s.get("simulated")}
    rows = []
    for i, day in enumerate(tl.get("days") or []):
        row = {"day_index": day, "date": (tl.get("dates") or [None] * (i + 1))[i], "simulated": day in sim_days}
        for f in FEATURES:
            series = by_key.get(f["key"], {})
            for part in ("value", "z", "ewma_z"):
                vals = series.get(part) or []
                row[f"{f['key']}.{part}"] = vals[i] if i < len(vals) else None
        for k in ("composite", "cusum", "state", "completeness"):
            vals = tl.get(k) or []
            row[k] = vals[i] if i < len(vals) else None
        rows.append(row)
    return rows


def codebook(daily_cols: list[str], feature_cols: list[str]) -> str:
    docs = {**_schema_docs(json.loads(DAILY_SCHEMA.read_text())["properties"]), **DERIVED}
    rows = [{"file": "sessions.ndjson", "column": "(one session document per line)",
             "description": "afferent.session/3, see SessionSchema.md in this zip", "unit": ""}]
    for c in daily_cols:
        doc = docs.get(c) or docs.get(c.rsplit(".", 1)[0], "")
        rows.append({"file": "daily.csv", "column": c, "description": doc, "unit": ""})
    feats = {f["key"]: f for f in FEATURES}
    parts = {"value": "raw value", "z": "robust z against the own 14-day baseline", "ewma_z": "EWMA of z"}
    fixed = {"day_index": ("Days since TMS end", ""), "date": ("Local date", ""),
             "simulated": ("true if any input of this day is simulated", ""),
             "composite": ("Composite early-warning index", "z"), "cusum": ("One-sided CUSUM of the index", ""),
             "state": ("stable, watch, check_in or booster (suggestion only)", ""),
             "completeness": ("Share of index weight with data", "0-1")}
    for c in feature_cols:
        if c in fixed:
            desc, unit = fixed[c]
        else:
            key, part = c.rsplit(".", 1)
            desc, unit = f"{feats[key]['label']}, {parts[part]}", feats[key]["unit"] if part == "value" else "z"
        rows.append({"file": "features.csv", "column": c, "description": desc, "unit": unit})
    return _csv(rows)


def build(patient: dict, sessions: list[dict], daily: list[dict], analytics: dict, checkins: list[dict]):
    simulated = bool(patient.get("simulated", True)) or any(s.get("simulated") for s in sessions) or any(
        d.get("simulated") for d in daily)
    nd = views.now_day(patient)
    date = views.day_date(patient, nd).isoformat()
    daily_rows = [_flat(d) for d in daily]
    feats = feature_rows(analytics, daily, sessions)
    daily_csv, feats_csv = _csv(daily_rows), _csv(feats)
    manifest = {
        "patient_id": patient["id"], "display_name": patient.get("display_name"), "simulated": simulated,
        "tms_end_date": patient.get("tms_end_date"), "now_day": nd, "date": date, "generated_iso": views.now_iso(),
        "schemas": {"sessions": "afferent.session/3", "daily": "afferent.daily/1",
                    "analytics": analytics.get("schema")},
        "counts": {"sessions": len(sessions), "daily": len(daily), "checkins": len(checkins)},
        "pauses": [{"source": q["source"], "from": views.day_date(patient, q["from_day"]).isoformat(),
                    "until": views.day_date(patient, q["until_day"]).isoformat()}
                   for q in patient.get("pauses") or []],
    }
    readme = ("SIMULATED DATA. Every row with simulated = true comes from the synthetic generator or the "
              "hardware simulator, not from a person.\n\n" if simulated else "") + (
        "Afferent clinic export. sessions.ndjson holds one session document per line, daily.csv one row per "
        "day, features.csv the per-day features with robust z and EWMA, checkins.ndjson the weekly check-ins. "
        "codebook.csv describes every column; SessionSchema.md describes the session document. "
        f"Lists inside a CSV cell are joined with '{LIST_JOIN}'.\n")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("README.txt", readme)
        z.writestr("manifest.json", json.dumps(manifest, indent=1))
        z.writestr("sessions.ndjson", "".join(json.dumps(s) + "\n" for s in sessions))
        z.writestr("daily.csv", daily_csv)
        z.writestr("features.csv", feats_csv)
        z.writestr("checkins.ndjson", "".join(json.dumps(c) + "\n" for c in checkins))
        z.writestr("codebook.csv", codebook(list(dict.fromkeys(c for r in daily_rows for c in r)),
                                            list(dict.fromkeys(c for r in feats for c in r))))
        if SESSION_DOC.exists():
            z.writestr("SessionSchema.md", SESSION_DOC.read_text())
    name = f"{'SIMULATED_' if simulated else ''}afferent_{patient['id']}_{date}.zip"
    return name, buf.getvalue()
