from html import escape

BG = "#070A14"
TEXT = "#E8EEF5"
MUTED = "#93A3B8"
FAINT = "#5D6B80"
GRID = "rgba(185,202,214,0.08)"
BAND = "rgba(185,202,214,0.10)"
PRIMARY = "#FFD9A0"
RELAPSE = "#C27E22"
STABLE = "#2FA3BE"
STATE = {"stable": "#4FC3D9", "watch": "#FFD27A", "check_in": "#F2B544", "booster": "#FF8A70"}
STATE_LABEL = {"watch": "Watch", "check_in": "Check-in call", "booster": "Booster discussion"}
FONT = "Inter, system-ui, -apple-system, Segoe UI, sans-serif"

class Svg:
    def __init__(self, w, h, title):
        self.w, self.h = w, h
        self.parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
                      f'font-family="{FONT}" role="img" aria-label="{escape(title)}">',
                      f"<title>{escape(title)}</title>",
                      f'<rect width="{w}" height="{h}" rx="14" fill="{BG}"/>']

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=12, fill=MUTED, anchor="start", weight=400, extra=""):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
                 f'font-weight="{weight}" {extra}>{escape(str(s))}</text>')

    def line(self, x1, y1, x2, y2, stroke=GRID, width=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" '
                 f'stroke-width="{width}"{d}/>')

    def render(self):
        return "\n".join(self.parts + ["</svg>"]) + "\n"

class Panel:
    def __init__(self, svg, x, y, w, h, xmin, xmax, ymin, ymax):
        self.svg, self.x, self.y, self.w, self.h = svg, x, y, w, h
        self.xmin, self.xmax, self.ymin, self.ymax = xmin, xmax, ymin, ymax

    def px(self, v):
        return self.x + (v - self.xmin) / (self.xmax - self.xmin) * self.w

    def py(self, v):
        v = max(self.ymin, min(self.ymax, v))
        return self.y + self.h - (v - self.ymin) / (self.ymax - self.ymin) * self.h

    def grid(self, yticks, xticks, yfmt=lambda v: f"{v:g}", xlabel=None):
        for t in yticks:
            self.svg.line(self.x, self.py(t), self.x + self.w, self.py(t))
            self.svg.text(self.x - 8, self.py(t) + 4, yfmt(t), 11, FAINT, "end")
        for t in xticks:
            self.svg.text(self.px(t), self.y + self.h + 18, t, 11, FAINT, "middle")
        if xlabel:
            self.svg.text(self.x + self.w, self.y + self.h + 34, xlabel, 11, FAINT, "end")

    def path(self, xs, ys):
        segs, cur = [], []
        for x, y in zip(xs, ys):
            if y is None:
                if cur:
                    segs.append(cur)
                cur = []
            else:
                cur.append((self.px(x), self.py(y)))
        if cur:
            segs.append(cur)
        return " ".join("M" + " L".join(f"{a:.1f},{b:.1f}" for a, b in s) for s in segs if s)

    def series(self, xs, ys, color, width=2, glow=False, dash=None):
        d = self.path(xs, ys)
        if not d:
            return
        if glow:
            self.svg.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="7" stroke-opacity="0.18" '
                         f'stroke-linecap="round" stroke-linejoin="round"/>')
        da = f' stroke-dasharray="{dash}"' if dash else ""
        self.svg.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" '
                     f'stroke-linejoin="round"{da}/>')

    def band(self, xs, lo, hi, color, opacity=0.18):
        pts = [(x, a, b) for x, a, b in zip(xs, lo, hi) if a is not None and b is not None]
        if not pts:
            return
        top = " L".join(f"{self.px(x):.1f},{self.py(b):.1f}" for x, _, b in pts)
        bot = " L".join(f"{self.px(x):.1f},{self.py(a):.1f}" for x, a, _ in reversed(pts))
        self.svg.add(f'<path d="M{top} L{bot} Z" fill="{color}" fill-opacity="{opacity}"/>')

    def hover_points(self, xs, ys, fmt):
        for x, y in zip(xs, ys):
            if y is not None:
                self.svg.add(f'<circle cx="{self.px(x):.1f}" cy="{self.py(y):.1f}" r="7" fill="transparent">'
                             f"<title>{escape(fmt(x, y))}</title></circle>")

    def vmarker(self, x, label, color=MUTED):
        self.svg.line(self.px(x), self.y, self.px(x), self.y + self.h, color, 1, "3 4")
        self.svg.text(self.px(x) + 6, self.y + 12, label, 11, color)

    def threshold(self, v, label, color):
        self.svg.line(self.x, self.py(v), self.x + self.w, self.py(v), color, 1, "4 4")
        self.svg.text(self.x + self.w - 4, self.py(v) - 5, label, 11, color, "end")

def header(svg, title, subtitle):
    svg.text(28, 38, title, 17, TEXT, weight=600)
    svg.text(28, 60, subtitle, 12, MUTED)
    svg.add(f'<rect x="{svg.w - 128}" y="22" width="100" height="22" rx="11" fill="rgba(183,156,255,0.14)"/>')
    svg.text(svg.w - 78, 37, "SIMULATED", 11, "#B79CFF", "middle", 600, 'letter-spacing="1"')

def legend(svg, x, y, items):
    for label, color in items:
        svg.add(f'<rect x="{x}" y="{y - 9}" width="14" height="4" rx="2" fill="{color}"/>')
        svg.text(x + 20, y - 3, label, 12, MUTED)
        x += 28 + 7 * len(label)

def patient_example(ex: dict, pid: str, name: str, thresholds: dict) -> str:
    days = ex["days"]
    svg = Svg(880, 540, f"{name}: composite early-warning index and CUSUM")
    onset = ex.get("onset_day")
    sub = (f"Simulated relapse from day {onset}. First check-in suggestion on day {ex.get('first_check_in_day')}."
           if onset is not None else "Simulated stable control. No suggestion over 8 weeks.")
    header(svg, f"{name}: composite index and CUSUM", sub)
    top = Panel(svg, 70, 96, 770, 170, 0, days[-1], -1.0, 3.0)
    top.svg.add(f'<rect x="{top.px(0):.1f}" y="{top.y}" width="{top.px(13) - top.px(0):.1f}" height="{top.h}" '
                f'fill="{BAND}"/>')
    svg.text(top.px(6.5), top.y + top.h - 8, "baseline, days 0 to 13", 11, FAINT, "middle")
    top.grid([-1, 0, 1, 2, 3], [0, 7, 14, 21, 28, 35, 42, 49, 56])
    svg.text(70, 88, "Composite (weighted robust z, positive = worse than usual)", 12, MUTED)
    top.series(days, ex["composite"], PRIMARY, glow=True)
    top.hover_points(days, ex["composite"], lambda d, v: f"day {d}: composite {v:.2f}")
    if onset is not None:
        top.vmarker(onset, "relapse onset (truth)")
    ymax = max(thresholds["booster"] * 1.25, max(c for c in ex["cusum"] if c is not None) * 1.08)
    bot = Panel(svg, 70, 318, 770, 150, 0, days[-1], 0, ymax)
    svg.text(70, 308, "One-sided CUSUM of the composite", 12, MUTED)
    step = 5 if ymax <= 30 else 10
    bot.grid(list(range(0, int(ymax) + 1, step)), [0, 7, 14, 21, 28, 35, 42, 49, 56])
    for key in ("watch", "check_in", "booster"):
        bot.threshold(thresholds[key], "", STATE[key])
    svg.text(bot.x + 6, bot.py(thresholds["booster"]) - 5, f"{STATE_LABEL['booster']} {thresholds['booster']:g}", 11,
             STATE["booster"])
    svg.text(bot.x + 6, bot.py(thresholds["check_in"]) - 5,
             f"{STATE_LABEL['check_in']} {thresholds['check_in']:g}  /  {STATE_LABEL['watch']} {thresholds['watch']:g}",
             11, STATE["check_in"])
    bot.series(days, ex["cusum"], PRIMARY, glow=True)
    bot.hover_points(days, ex["cusum"], lambda d, v: f"day {d}: CUSUM {v:.2f}")
    if onset is not None:
        bot.vmarker(onset, "")
    y = 494
    for i, d in enumerate(days):
        x0 = bot.px(d - 0.5)
        svg.add(f'<rect x="{x0 + 0.5:.1f}" y="{y}" width="{bot.px(1) - bot.px(0) - 1:.1f}" height="8" rx="2" '
                f'fill="{STATE[ex["state"][i]]}" fill-opacity="0.85"><title>day {d}: {ex["state"][i]}</title></rect>')
    svg.text(62, y + 8, "state", 11, FAINT, "end")
    svg.text(bot.x + bot.w, y + 30, "day since TMS end", 11, FAINT, "end")
    return svg.render()

def cohort_bands(curves: dict, onset: int) -> str:
    days = curves["days"]
    svg = Svg(880, 380, "Composite index across 50 simulated relapse and 50 stable patients")
    header(svg, "Composite index, 50 relapse vs 50 stable simulated patients", "Median line, interquartile band")
    p = Panel(svg, 70, 96, 720, 230, 0, days[-1], -1.0, 3.0)
    p.grid([-1, 0, 1, 2, 3], [0, 7, 14, 21, 28, 35, 42, 49, 55], xlabel="day since TMS end")
    for key, color in (("stable_composite", STABLE), ("relapse_composite", RELAPSE)):
        c = curves[key]
        p.band(days, c["p25"], c["p75"], color, 0.22)
        p.series(days, c["median"], color, 2)
        p.hover_points(days, c["median"], lambda d, v, k=key: f"{k.split('_')[0]} day {d}: median {v:.2f}")
    p.vmarker(onset, "relapse onset")
    last = days[-1]
    svg.text(p.px(last) + 4, p.py(curves["relapse_composite"]["median"][-1]) + 4, "relapse", 12, TEXT)
    svg.text(p.px(last) + 4, p.py(curves["stable_composite"]["median"][-1]) + 4, "stable", 12, TEXT)
    legend(svg, 70, 364, [("relapse (onset day 28)", RELAPSE), ("stable control", STABLE)])
    return svg.render()

def lead_times(composite: list, mood: list) -> str:
    svg = Svg(880, 300, "Days from relapse onset to the first check-in suggestion")
    header(svg, "Days from onset to the first check-in suggestion", "Each dot is one simulated relapse patient")
    vals = [v for v in composite + mood if v is not None]
    hi = max(28, max(vals) + 1) if vals else 28
    p = Panel(svg, 150, 96, 690, 150, 0, hi, 0, 2)
    for t in range(0, int(hi) + 1, 4):
        svg.line(p.px(t), p.y, p.px(t), p.y + p.h)
        svg.text(p.px(t), p.y + p.h + 18, t, 11, FAINT, "middle")
    svg.text(p.x + p.w, p.y + p.h + 34, "days after onset", 11, FAINT, "end")
    rows = [("Composite + CUSUM", composite, RELAPSE, 0.5), ("Mood check-in only", mood, "#B9CAD6", 1.5)]
    for label, data, color, row in rows:
        cy = p.y + (row / 2) * p.h
        svg.text(p.x - 14, cy + 4, label, 12, TEXT, "end")
        counts: dict[int, int] = {}
        for v in sorted(x for x in data if x is not None):
            k = counts.get(v, 0)
            counts[v] = k + 1
            dy = (k // 2 + 1) * 5 * (1 if k % 2 else -1) if k else 0
            svg.add(f'<circle cx="{p.px(v):.1f}" cy="{cy + dy:.1f}" r="4" fill="{color}" stroke="{BG}" '
                    f'stroke-width="2"><title>{label}: {v} days</title></circle>')
        missing = sum(1 for x in data if x is None)
        if missing:
            svg.text(p.x + p.w, cy - 22, f"{missing} not flagged by day 55", 11, MUTED, "end")
    return svg.render()

def bandit_curve(curves: dict, anna: dict) -> str:
    xs = curves["bandit_sessions"]
    svg = Svg(880, 360, "Bandit convergence: P(best) of the truly most helpful calm task")
    header(svg, "How fast the bandit finds the most helpful calm task", "P(best) of the true best arm after each session")
    p = Panel(svg, 70, 96, 770, 200, 1, xs[-1], 0, 1)
    p.grid([0, 0.2, 0.4, 0.6, 0.8, 1.0], [x for x in xs if x == 1 or x % 5 == 0], lambda v: f"{v:.1f}",
           "sessions played")
    p.threshold(0.8, "P(best) 0.8", MUTED)
    q = curves["bandit_p_best"]
    p.band(xs, q["p25"], q["p75"], RELAPSE, 0.22)
    p.series(xs, q["median"], RELAPSE, 2)
    p.hover_points(xs, q["median"], lambda x, v: f"session {x}: median P(best) {v:.2f}")
    ax = [x for x in anna["sessions"] if x <= xs[-1]]
    p.series(ax, anna["breath"][:len(ax)], STABLE, 2)
    p.hover_points(ax, anna["breath"][:len(ax)], lambda x, v: f"Anna session {x}: P(best) {v:.2f}")
    legend(svg, 70, 340, [("100 simulated patients, median and IQR", RELAPSE), ("Anna (demo patient)", STABLE)])
    return svg.render()
