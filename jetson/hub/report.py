"""Clinician and patient reports (HTML, printable) from Store.summary().

Clinician: objective measures over time, PHQ-9 with item 9 flagged, data coverage and quality,
how each number was computed. No diagnosis - the clinician interprets.
Patient: the same week in plain words, with support lines.
"""
import html

from store import METRICS

CSS = """
:root { --ink:#1d1d1f; --muted:#6e6e73; --line:#e5e5ea; --flag:#c62828; --ok:#2e7d32; --bg:#fff; }
* { box-sizing:border-box } body { font:15px/1.45 -apple-system,system-ui,sans-serif; color:var(--ink); background:var(--bg);
  max-width:860px; margin:24px auto; padding:0 16px }
h1 { font-size:22px; margin:0 0 2px } h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted);
  margin:28px 0 8px; border-bottom:1px solid var(--line); padding-bottom:4px }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums } td,th { padding:6px 8px; text-align:left;
  border-bottom:1px solid var(--line); vertical-align:middle } th { font-weight:600; font-size:13px; color:var(--muted) }
.flag { color:var(--flag); font-weight:700 } .muted { color:var(--muted); font-size:13px } .box { border:1px solid var(--line);
  border-radius:10px; padding:12px 14px; margin:12px 0 } .alert { border-color:var(--flag); background:#fdecea }
svg { vertical-align:middle } @media print { body { margin:0 } }
"""


def spark(values, w=140, h=28):
    pts = [(i, v) for i, v in enumerate(values) if v is not None]
    if len(pts) < 2:
        return '<span class="muted">—</span>'
    lo, hi = min(v for _, v in pts), max(v for _, v in pts)
    span = (hi - lo) or 1
    n = max(len(values) - 1, 1)
    path = " ".join(f"{'M' if k == 0 else 'L'}{i / n * (w - 4) + 2:.1f},{h - 3 - (v - lo) / span * (h - 6):.1f}"
                    for k, (i, v) in enumerate(pts))
    return f'<svg width="{w}" height="{h}" role="img" aria-label="trend"><path d="{path}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'


def fmt(v, unit=""):
    return "—" if v is None else f"{v:g}{(' ' + unit) if unit else ''}"


def clinician(summary, patient_label="Patient", narrative=None):
    s = summary
    e = html.escape
    rows = []
    for m, (name, unit, how) in METRICS.items():
        vals = [d[m] for d in s["daily"]]
        t = s["trends"][m]
        change = "—" if not t else f"{t['previous']:g} → {t['recent']:g} {unit} ({t['change']:+g}" + (f", {t['change_pct']:+d} %" if t["change_pct"] is not None else "") + ")"
        rows.append(f"<tr><td>{name}</td><td>{spark(vals)}</td><td>{e(change)}</td><td class='muted'>{e(how)}</td></tr>")
    phq_rows = "".join(
        f"<tr><td>{p['date']}</td><td>{p['score']}/27</td><td>{p['severity']}</td>"
        f"<td class='{'flag' if p['item9'] else ''}'>{p['item9']}{' — follow up' if p['item9'] else ''}</td></tr>"
        for p in s["phq9"]) or "<tr><td colspan=4 class='muted'>No PHQ-9 entries in this period.</td></tr>"
    b = s["behaviour"]
    cov = s["coverage"]
    alert = ('<div class="box alert"><b class="flag">PHQ-9 item 9 answered above 0</b> (thoughts of being better off dead '
             'or of self-harm) in this period. Please assess risk.</div>') if s["phq9_item9_flag"] else ""
    narr = f'<div class="box"><b>Summary</b><br>{e(narrative)}<div class="muted">Generated locally from the numbers below.</div></div>' if narrative else ""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Afferent clinician report</title><style>{CSS}</style></head><body>
<h1>Afferent — clinician report</h1>
<div class="muted">{e(patient_label)} · {s['period']['from']} to {s['period']['to']} ({s['period']['days']} days) · data stored on the patient's own device</div>
{alert}{narr}
<h2>Data coverage</h2>
<table><tr><th>Days with sensor data</th><th>Sensor minutes</th><th>App sessions</th><th>PHQ-9 entries</th></tr>
<tr><td>{cov['days_with_sensor_data']} / {s['period']['days']}</td><td>{cov['sensor_minutes']}</td><td>{cov['sessions']}</td><td>{cov['phq9_entries']}</td></tr></table>
<h2>PHQ-9</h2>
<table><tr><th>Date</th><th>Score</th><th>Severity band</th><th>Item 9</th></tr>{phq_rows}</table>
<h2>Physiology (finger sensors)</h2>
<table><tr><th>Measure</th><th>Daily trend</th><th>Last 7 d vs previous 7 d</th><th>How it is computed</th></tr>{''.join(rows)}</table>
<h2>Facial behaviour (phone sessions, averages)</h2>
<table><tr><th>Smiling</th><th>Facial movement</th><th>Blinks</th><th>Looking away</th><th>Micro-expressions</th></tr>
<tr><td>{fmt(None if b['smile_share'] is None else round(b['smile_share'] * 100), '%')}</td><td>{fmt(b['expressivity'])}</td>
<td>{fmt(None if b['blinks_per_min'] is None else round(b['blinks_per_min']), '/min')}</td>
<td>{fmt(None if b['gaze_away_share'] is None else round(b['gaze_away_share'] * 100), '%')}</td><td>{fmt(b['micro_expressions_per_session'])} / session</td></tr></table>
<p class="muted">Afferent is a screening and monitoring aid, not a diagnostic device. Physiological and facial measures are
behavioural context with known limitations (sensor contact, lighting, movement); the PHQ-9 is the validated instrument.
Trends need at least 3 days with data in each 7-day window.</p>
</body></html>"""


def patient(summary, narrative=None):
    s = summary
    t = s["trends"]
    lines = []
    if t["hrv_rmssd"]:
        d = t["hrv_rmssd"]["change_pct"]
        if d is not None:
            lines.append("Your heart-rate variability was " + (f"{abs(d)} % higher" if d > 0 else f"{abs(d)} % lower")
                         + " than the week before" + (" — usually a sign of less strain." if d > 0 else " — this can happen with stress, poor sleep or illness."))
    if t["finger_bpm"]:
        lines.append(f"Your resting pulse was around {t['finger_bpm']['recent']:g} BPM (the week before: {t['finger_bpm']['previous']:g}).")
    if s["phq9"]:
        p = s["phq9"][-1]
        lines.append(f"Your latest check-in score was {p['score']} out of 27.")
    if not lines:
        lines.append("There isn't enough data yet for a weekly picture — a few minutes with the finger clips on most days is enough.")
    support = ('<div class="box alert">You mentioned thoughts of hurting yourself. You don\'t have to handle this alone: '
               'call <b>112</b>, Mieli crisis line <b>09 2525 0111</b> (Finland) or Självmordslinjen <b>90101</b> (Sweden).</div>') if s["phq9_item9_flag"] else ""
    narr = f'<p>{html.escape(narrative)}</p>' if narrative else ""
    items = "".join(f"<li>{html.escape(x)}</li>" for x in lines)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your week</title><style>{CSS}</style></head><body>
<h1>Your week</h1><div class="muted">{s['period']['from']} to {s['period']['to']}</div>
{support}{narr}<ul>{items}</ul>
<p class="muted">These are measurements to talk about with your doctor, not a diagnosis.</p></body></html>"""
