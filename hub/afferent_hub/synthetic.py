import datetime as dt
import math
from typing import Literal

import numpy as np

from .analytics import bandit
from .analytics.engine import director
from .analytics.stats import log_b, log_d

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Europe/Helsinki")
except Exception:
    TZ = dt.timezone(dt.timedelta(hours=2))

DEFAULT_ONSET = 28
RAMP_DAYS = 21
CLINIC = {"name": "Your clinic", "number": None}
SENSORS = {"phone_camera": True, "pulse_stone": True, "bedside_camera": False, "bedside_light": True,
           "presence": False, "phone_motion": True}
ARM_RATES = {"calm/breath": 0.75, "calm/loyly": 0.45, "wake/fireflies": 0.62, "wake/beacon": 0.42,
             "wake/bells": 0.5, "fatigue/shutters": 0.6, "fatigue/bells": 0.42, "fatigue/beacon": 0.5,
             "rest/breath": 0.65}
DIRECTION = {"calm": "fall", "rest": "fall", "wake": "rise", "fatigue": "rise", "flow": "none", "measure": "none"}
TASKS_BY_MODE = {"calm": ["breath", "loyly"], "flow": ["threads", "stars"], "wake": ["fireflies", "beacon", "bells"],
                 "fatigue": ["shutters", "bells", "beacon"], "rest": ["breath"]}
DURATION_S = {"breath": (18, 22), "loyly": (15, 20), "threads": (12, 18), "stars": (12, 18), "fireflies": (8, 12),
              "beacon": (8, 12), "bells": (8, 12), "shutters": (8, 12), "fork": (15, 19), "lanterns": (17, 20)}
GAME_RT = {"threads": ("choice", 1050, 0.3, 0.2, (3, 5)), "stars": ("choice", 780, 0.3, 0.18, (5, 9)),
           "fireflies": ("catch", 560, -0.25, 0.16, (5, 9)), "beacon": ("beat", 390, -0.25, 0.12, (7, 11)),
           "bells": ("choice", 720, 0.3, 0.18, (5, 9)), "shutters": ("tap_target", 520, -0.2, 0.16, (4, 6))}
ROSTER = [("anna", "Anna", "relapse", 28, "morning", 113), ("mikko", "Mikko", "stable", None, "morning", 0),
          ("juha", "Juha", "relapse", 43, "morning", 148), ("leena", "Leena", "stable", None, "night", 0),
          ("sofia", "Sofia", "stable", None, "morning", 0), ("eero", "Eero", "stable", None, "morning", 1)]


def phi(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def r1(x, nd=1):
    return None if x is None else round(float(x), nd) + 0.0


def persona(rng, kind: str, clock: str) -> dict:
    return {
        "rt": rng.normal(405, 25), "rt_day_sd": rng.uniform(14, 22),
        "mood": rng.uniform(3.3, 3.9), "mood_sd": rng.uniform(0.4, 0.55),
        "onset": rng.normal(-0.9, 0.35), "wake": rng.normal(7.0, 0.35), "sleep_sd": rng.uniform(0.45, 0.75),
        "restless": rng.uniform(6, 10), "pulse": rng.normal(62, 4), "home_p": rng.uniform(0.08, 0.18),
        "miss_p": rng.uniform(0.06, 0.12), "session_h": rng.uniform(7.0, 8.3) if clock == "morning"
        else rng.uniform(21.3, 22.6), "clock": clock, "effort_bias": rng.normal(0.9, 0.3),
        "effort_sens": rng.uniform(0.8, 1.6), "dprime": rng.uniform(1.0, 1.4), "bias": rng.uniform(0.25, 0.45),
        "upright": rng.uniform(0.76, 0.86), "pitch": rng.normal(-8, 2), "eyes": rng.uniform(0.58, 0.7),
        "blink": rng.uniform(12, 20), "dawn_p": rng.uniform(0.6, 0.85), "dawn_level": int(rng.choice([10, 15, 20])),
        "reminder_h": 7.5 if clock == "morning" else 21.0,
    }


def severity_curve(rng, kind: str, days: int, onset: int) -> np.ndarray:
    d = np.arange(days)
    if kind == "relapse":
        return np.clip((d - onset) / RAMP_DAYS, 0, 1)
    sev = np.zeros(days)
    if rng.random() < 0.5:
        start = int(rng.integers(14, max(15, days - 8)))
        length = int(rng.integers(4, 9))
        peak = rng.uniform(0.1, 0.3)
        for i in range(length):
            if start + i < days:
                sev[start + i] = peak * math.sin(math.pi * (i + 0.5) / length)
    return sev


def arm_rates(rng) -> dict:
    rates = {k: float(np.clip(v + rng.normal(0, 0.04), 0.2, 0.9)) for k, v in ARM_RATES.items()}
    rates["calm/loyly"] = min(rates["calm/loyly"], rates["calm/breath"] - 0.2)
    return rates


def best_arms(rates: dict) -> dict:
    best = {}
    for mode in bandit.MODE_ARMS:
        cand = {k.split("/")[1]: v for k, v in rates.items() if k.startswith(mode + "/")}
        best[mode] = max(cand, key=cand.get)
    return best


def overlap(intervals, h):
    return sum(max(0.0, min(b, h + 1) - max(a, h)) for a, b in intervals)


def iso_at(date: dt.date, hour: float) -> str:
    h = int(hour)
    m = int(round((hour - h) * 60))
    if m == 60:
        h, m = h + 1, 0
    day = date + dt.timedelta(days=h // 24)
    t = dt.datetime(day.year, day.month, day.day, h % 24, m, tzinfo=TZ)
    return t.isoformat()


def rt_block(rng, mu: float, sev: float) -> dict:
    trials = []
    for i in range(5):
        fp = int(rng.integers(1000, 2501))
        u = rng.random()
        if u < 0.035:
            rt = int(rng.integers(-200, 150))
        elif u < 0.035 + 0.01 + 0.03 * sev:
            rt = None
        elif u < 0.035 + 0.01 + 0.03 * sev + 0.015 + 0.05 * sev:
            rt = int(rng.integers(1001, 1500))
        else:
            rt = int(np.clip(mu * math.exp(rng.normal(0, 0.12)), 160, 999))
        outcome = "miss" if rt is None else "anticipation" if rt < 150 else "hit" if rt <= 1000 else "lapse"
        trials.append({"trial": i + 1, "foreperiod_ms": fp, "rt_ms": rt, "outcome": outcome, "modality": "touch"})
    taps = sorted(t["rt_ms"] for t in trials if t["rt_ms"] is not None and t["rt_ms"] >= 150)
    med = iqr = None
    if taps:
        med = int(math.floor(float(np.median(taps)) + 0.5))
        q1, q3 = np.percentile(taps, [25, 75])
        iqr = int(round(q3 - q1))
    return {"trials": trials, "median_ms": med, "iqr_ms": iqr,
            "lapses": sum(t["outcome"] in ("lapse", "miss") for t in trials),
            "anticipations": sum(t["outcome"] == "anticipation" for t in trials),
            "hits": sum(t["outcome"] == "hit" for t in trials), "valid": len(trials) == 5 and len(taps) >= 3}


def fork_block(rng, p: dict, sev: float, g: float) -> dict:
    rewards = [2, 3] if rng.random() < 0.5 else [3, 2]
    choices = []
    for i, r in enumerate(rewards):
        if rng.random() < 0.03:
            path = "none"
        else:
            ph = sigmoid(p["effort_bias"] + p["effort_sens"] * (r - 2.5) - 2.6 * sev - 0.6 * g)
            path = "hard" if rng.random() < ph else "easy"
        task_ms = int(rng.normal(6200, 600)) if path == "hard" else int(rng.normal(2600, 300))
        choices.append({"choice": i + 1, "path": path, "reward": r,
                        "decision_ms": None if path == "none" else max(300, int(rng.normal(1900, 500) + 900 * sev)),
                        "completed": True, "task_ms": task_ms})
    chosen = [c for c in choices if c["path"] != "none"]
    hard_prop = sum(c["path"] == "hard" for c in chosen) / len(chosen) if chosen else None
    hbr = {str(c["reward"]): (None if c["path"] == "none" else int(c["path"] == "hard")) for c in choices}
    slope = hbr["3"] - hbr["2"] if hbr["2"] is not None and hbr["3"] is not None else None
    return {"choices": choices, "hard_prop": r1(hard_prop, 3), "hard_by_reward": hbr, "reward_slope": slope,
            "easy_task": {"lights": 3}, "hard_task": {"lights": 8}}


def lanterns_block(rng, p: dict, sev: float, g: float) -> dict:
    larger = ["rich"] * 6 + ["lean"] * 6
    rng.shuffle(larger)
    c = p["bias"] - 0.55 * sev - 0.1 * g
    dprime = p["dprime"] - 0.2 * sev
    trials = []
    for i, lg in enumerate(larger):
        if rng.random() < 0.02:
            resp = None
        else:
            pr = phi((dprime / 2 if lg == "rich" else -dprime / 2) + c)
            resp = "rich" if rng.random() < pr else "lean"
        trials.append({"trial": i + 1, "larger": lg, "rich_side": "left" if rng.random() < 0.5 else "right",
                       "response": resp, "correct": resp == lg, "rewarded": False,
                       "rt_ms": None if resp is None else int(rng.normal(820, 140) + 120 * sev)})
    for kind, n_rewards in (("rich", 3), ("lean", 1)):
        idx = [i for i, t in enumerate(trials) if t["larger"] == kind]
        for start in sorted(rng.choice(idx, n_rewards, replace=False)):
            for j in [k for k in idx if k >= start]:
                if trials[j]["correct"] and not trials[j]["rewarded"]:
                    trials[j]["rewarded"] = True
                    break
    rc = sum(t["larger"] == "rich" and t["response"] == "rich" for t in trials)
    ri = sum(t["larger"] == "rich" and t["response"] == "lean" for t in trials)
    lc = sum(t["larger"] == "lean" and t["response"] == "lean" for t in trials)
    li = sum(t["larger"] == "lean" and t["response"] == "rich" for t in trials)
    return {"rich_lantern": "amber", "size_diff": 0.08, "trials": trials, "rich_correct": rc, "rich_incorrect": ri,
            "lean_correct": lc, "lean_incorrect": li, "log_b": round(log_b(rc, ri, lc, li), 3),
            "log_d": round(log_d(rc, ri, lc, li), 3),
            "rewards_rich": sum(t["rewarded"] and t["larger"] == "rich" for t in trials),
            "rewards_lean": sum(t["rewarded"] and t["larger"] == "lean" for t in trials),
            "valid": sum(t["response"] is not None for t in trials) >= 10}


def task_rt(rng, tid: str, n_trials: int, scale: float, d: float, sev: float) -> dict:
    kind, base, slope, sigma, _ = GAME_RT[tid]
    mu = base * scale * (1 + slope * (d - 0.55)) * math.exp(rng.normal(0, 0.05))
    p_antic = 0.06 if kind == "beat" else 0.02
    p_lapse = 0.02 + 0.06 * sev
    taps, lapses, antic = [], 0, 0
    for _ in range(n_trials):
        u = rng.random()
        if u < p_antic:
            antic += 1
        elif u < p_antic + p_lapse:
            lapses += 1
        else:
            taps.append(int(np.clip(mu * math.exp(rng.normal(0, sigma)), 150, 2500)))
    med = iqr = None
    if taps:
        med = int(math.floor(float(np.median(taps)) + 0.5))
        q1, q3 = np.percentile(taps, [25, 75])
        iqr = int(round(q3 - q1))
    return {"n": len(taps), "median_ms": med, "iqr_ms": iqr, "lapses": lapses, "anticipations": antic,
            "by_kind": {kind: {"n": len(taps), "median_ms": med}}}


def add_task_extra(rng, session: dict, p: dict, sev: float) -> None:
    scale = (p["rt"] / 405) ** 0.7 * (p["rt_mu"] / p["rt"]) ** 0.6
    for task in session["tasks"]:
        if task["kind"] != "adaptive" or not task["completed"]:
            continue
        extra, d = {}, task["intensity"]
        if task["mode"] != "rest":
            extra["dda"] = {"v": 1, "d_start": round(max(0.0, d - rng.uniform(0, 0.08)), 3), "d_mean": d,
                            "d_max": round(min(1.0, d + rng.uniform(0, 0.1)), 3)}
        if task["id"] in GAME_RT:
            lo, hi = GAME_RT[task["id"]][4]
            n = int(rng.integers(lo, hi + 1))
            if task["completed_by"] == "auto":
                n //= 2
            extra["rt"] = task_rt(rng, task["id"], n, scale, d, sev)
        if extra:
            task["extra"] = extra


def pick_task(rng, mode: str, weights: dict, prev: str | None) -> tuple[str, float]:
    ids = TASKS_BY_MODE[mode]
    w = {i: weights.get(mode, {}).get(i, 1 / len(ids)) for i in ids}
    if prev in w and any(v > 0 for k, v in w.items() if k != prev):
        w = {k: v for k, v in w.items() if k != prev}
    keys = list(w)
    probs = np.asarray([w[k] for k in keys], dtype=float)
    k = keys[int(rng.choice(len(keys), p=probs / probs.sum()))]
    return k, weights.get(mode, {}).get(k)


def bandit_weights(arm_counts: dict) -> dict:
    out = {"flow": {a: 0.5 for a in bandit.FLOW}}
    for mode, ids in bandit.MODE_ARMS.items():
        alpha = [1 + arm_counts[(mode, a)][0] for a in ids]
        beta = [1 + arm_counts[(mode, a)][1] for a in ids]
        p, _ = bandit.p_best_from_counts(alpha, beta, draws=2000)
        raw = np.maximum(p, bandit.WEIGHT_FLOOR)
        out[mode] = {a: round(float(v), 3) for a, v in zip(ids, raw / raw.sum())}
    return out


def make_task(rng, tid, slot, kind, mode, dmode, t_ms, pulse_now, pulse_q, face_ok, p, sev, g, rates, weight):
    lo, hi = DURATION_S[tid]
    dur = float(rng.uniform(lo, hi))
    direction = DIRECTION[mode]
    skipped = kind == "adaptive" and rng.random() < 0.025
    helped = None
    if direction == "none":
        delta = float(rng.normal(-0.6, 1.2))
    elif skipped or pulse_q < 0.5:
        delta = float(rng.normal(0, 1.5))
    else:
        rate = rates[f"{mode}/{tid}"] * (1 - 0.15 * sev)
        helped = bool(rng.random() < rate)
        sign = -1 if direction == "fall" else 1
        mag = 2.05 + float(rng.gamma(2.0, 1.1)) if helped else float(rng.uniform(-1.5, 1.9))
        delta = sign * mag
    start = pulse_now
    end = start + delta
    t_target = None
    if helped:
        t_target = r1(rng.uniform(2, max(2.5, dur - 2)))
    slope = None
    if mode in ("calm", "rest"):
        slope = r1(delta / (dur / 60) + rng.normal(0, 1.5))
    up_frac = float(np.clip(p["upright"] - 0.2 * sev - 0.05 * g + rng.normal(0, 0.05), 0, 1))
    eyes = float(np.clip(p["eyes"] - 0.06 * sev + rng.normal(0, 0.04), 0.1, 0.95))
    perclos = float(np.clip(rng.normal(0.05 + 0.06 * sev, 0.03), 0, 1))
    if tid == "breath":
        eyes, perclos = eyes * 0.65, float(np.clip(perclos + 0.3, 0, 1))
    task = {
        "id": tid, "slot": slot, "kind": kind, "mode": mode, "director_mode": dmode,
        "intensity": r1(rng.uniform(0.4, 0.75), 2) if kind == "adaptive" else None,
        "weight_used": weight if kind == "adaptive" else None,
        "t_start_ms": int(t_ms), "duration_ms": 0 if skipped else int(dur * 1000),
        "completed_by": "skipped" if skipped else ("auto" if rng.random() < 0.05 else "touch"),
        "completed": not skipped, "items": int(rng.integers(2, 12)), "errors": int(rng.poisson(0.6 + sev)),
        "intended_direction": direction,
        "pulse": {"start_bpm": r1(start), "min_bpm": r1(min(start, end) - abs(rng.normal(0, 0.8))),
                  "max_bpm": r1(max(start, end) + abs(rng.normal(0, 0.8))), "end_bpm": r1(end),
                  "delta_bpm": r1(end - start), "time_to_target_s": t_target, "recovery_slope_bpm_per_min": slope,
                  "quality": r1(pulse_q, 2)},
        "pulse_samples": int(dur), "helped": helped if not skipped else None,
        "head_pitch_start_deg": r1(p["pitch"] - 3 * sev + rng.normal(0, 2)) if face_ok else None,
        "head_pitch_delta_deg": r1(rng.normal(1.5, 2)) if face_ok else None,
        "upright_s": r1(dur * up_frac) if face_ok and not skipped else None,
        "eye_openness_mean": r1(eyes, 2) if face_ok else None, "perclos": r1(perclos, 2) if face_ok else None,
        "long_closures": int(rng.poisson(2 if tid == "breath" else 0.2 + sev)) if face_ok else None,
    }
    if task["helped"] is not None:
        d = task["pulse"]["delta_bpm"]
        task["helped"] = d <= -2 if direction == "fall" else d >= 2
    if tid == "breath":
        task["breath_sync"] = r1(rng.uniform(0.6, 0.95), 2)
        task["eyes_closed_s"] = r1(dur * rng.uniform(0.3, 0.5)) if face_ok else None
    if skipped:
        task["skip_reason"] = "patient"
    return task, (end if not skipped else start) + float(rng.normal(0, 0.8)), dur


def skipped_measure(tid, slot, dmode, t_ms):
    return {"id": tid, "slot": slot, "kind": "measurement", "mode": "measure", "director_mode": dmode,
            "intensity": None, "weight_used": None, "t_start_ms": int(t_ms), "duration_ms": 0,
            "completed_by": "skipped", "completed": False, "intended_direction": "none",
            "pulse": {"start_bpm": None, "min_bpm": None, "max_bpm": None, "end_bpm": None, "delta_bpm": None,
                      "time_to_target_s": None, "recovery_slope_bpm_per_min": None, "quality": None},
            "helped": None, "skip_reason": "rest_mode"}


def draw_mode(rng, night: bool, sev: float) -> str:
    if night:
        modes, probs = ["calm", "flow", "rest"], [0.45, 0.2, 0.35]
    else:
        f = 0.16 + 0.1 * sev
        modes, probs = ["calm", "flow", "wake", "fatigue"], [0.4, 0.2, 0.4 - f, f]
    return str(rng.choice(modes, p=np.asarray(probs) / sum(probs)))


def make_session(rng, pid, day, date, p, sev, g, mood_latent, morning_pulse, rates, weights, prev_sessions):
    weekend = date.weekday() >= 5
    hour = float(np.clip(p["session_h"] + (0.9 if weekend and p["clock"] == "morning" else 0)
                         + rng.normal(0, 0.35) + 0.7 * sev, 0, 23.9))
    night = hour >= 21 or hour < 6
    status = "completed"
    u = rng.random()
    if night and u < 0.08:
        status = "fell_asleep"
    elif u < 0.05 + 0.05 * sev:
        status = "partial"
    pulse_q = float(rng.uniform(0.7, 0.96)) if rng.random() > 0.07 else float(rng.uniform(0.1, 0.45))
    face_ok = rng.random() > 0.04
    rest_pulse = morning_pulse + (5.5 if not night else 2.0) + float(rng.normal(0, 2.0))
    mood = None if rng.random() < 0.03 else int(np.clip(round(mood_latent), 1, 5))
    rt = rt_block(rng, p["rt_mu"], sev)
    base = director(prev_sessions, day)
    rest = {"duration_ms": 6000, "pulse_bpm": r1(rest_pulse), "pulse_quality": r1(pulse_q, 2),
            "blink_rate_per_min": r1(p["blink"] + 2 * sev + rng.normal(0, 4)) if face_ok else None,
            "blink_count": int(rng.poisson(p["blink"] / 10)) if face_ok else None,
            "blink_quality": r1(rng.uniform(0.5, 0.8), 2) if face_ok else None,
            "eye_openness": r1(p["eyes"] - 0.05 * sev + rng.normal(0, 0.03), 2) if face_ok else None,
            "eye_quality": r1(rng.uniform(0.85, 0.98), 2) if face_ok else None,
            "eyes_tracked_ratio": r1(rng.uniform(0.9, 1.0), 2) if face_ok else r1(rng.uniform(0, 0.3), 2),
            "head_pitch_deg": r1(p["pitch"] - 3 * sev + rng.normal(0, 2)) if face_ok else None,
            "head_pitch_quality": r1(rng.uniform(0.8, 0.95), 2) if face_ok else None,
            "ambient_light": r1(rng.uniform(0.05, 0.14) if night else rng.uniform(0.2, 0.5), 2)}
    core_ms = int(rng.integers(21500, 25500))
    core = {"source": "measured", "duration_ms": core_ms, "baseline_pulse_bpm": base["baseline_pulse_bpm"],
            "rest": rest, "mood_start": mood, "mood_start_ms": int(rng.normal(2400, 600) + 800 * sev), "rt": rt}

    n_slots = {"completed": int(rng.choice([4, 5, 5, 6])), "partial": int(rng.integers(2, 4)),
               "fell_asleep": int(rng.integers(2, 4))}[status]
    tasks, t_ms, pulse_now, prev_task = [], core_ms + 2000, rest_pulse, None
    dmode = draw_mode(rng, night, sev)
    fork = lanterns = None
    transitions = [{"t_ms": core_ms, "from": None, "to": dmode, "arousal": r1(rng.normal(0.5, 0.4), 2),
                    "fatigue": r1(abs(rng.normal(0.05 + 0.2 * sev, 0.05)), 2)}]
    mode_seconds = {m: 0.0 for m in TASKS_BY_MODE}
    for slot in range(1, n_slots + 1):
        new_mode = "rest" if status == "fell_asleep" and slot >= 2 else draw_mode(rng, night, sev)
        if new_mode != dmode:
            transitions.append({"t_ms": int(t_ms), "from": dmode, "to": new_mode,
                                "arousal": r1(rng.normal(0.2, 0.5), 2), "fatigue": r1(abs(rng.normal(0.1, 0.1)), 2)})
            dmode = new_mode
        if slot in (1, 3):
            tid = "fork" if slot == 1 else "lanterns"
            if dmode == "rest":
                tasks.append(skipped_measure(tid, slot, dmode, t_ms))
                continue
            task, pulse_now, dur = make_task(rng, tid, slot, "measurement", "measure", dmode, t_ms, pulse_now,
                                             pulse_q, face_ok, p, sev, g, rates, None)
            if tid == "fork":
                fork = fork_block(rng, p, sev, g)
            else:
                lanterns = lanterns_block(rng, p, sev, g)
        else:
            tid, weight = pick_task(rng, dmode, weights, prev_task)
            prev_task = tid
            task, pulse_now, dur = make_task(rng, tid, slot, "adaptive", dmode, dmode, t_ms, pulse_now, pulse_q,
                                             face_ok, p, sev, g, rates, weight)
        tasks.append(task)
        mode_seconds[dmode] += dur
        t_ms += dur * 1000 + float(rng.uniform(1500, 2600))
    duration_ms = int(t_ms + (0 if status == "fell_asleep" else rng.uniform(12000, 16000)))
    end_mood = None
    if status == "completed" and mood is not None and rng.random() > 0.04:
        step = rng.choice([1, 0, -1], p=[0.35 - 0.1 * sev, 0.6 + 0.1 * sev, 0.05])
        end_mood = int(np.clip(mood + step, 1, 5))
    pitch0, eyes0 = rest["head_pitch_deg"], rest["eye_openness"]
    pitch1 = r1(pitch0 + rng.normal(3.0, 2.0)) if pitch0 is not None and status != "fell_asleep" else None
    eyes1 = r1(eyes0 + rng.normal(0.04, 0.04), 2) if eyes0 is not None and status != "fell_asleep" else None
    pulse_end = r1(pulse_now) if pulse_q >= 0.5 else None
    pulse_start = rest["pulse_bpm"] if pulse_q >= 0.5 else None

    def pair(a, b, nd=1):
        return {"start": a, "end": b, "delta": r1(b - a, nd) if a is not None and b is not None else None}

    pulses = [t["pulse"][k] for t in tasks for k in ("start_bpm", "end_bpm") if t["pulse"][k] is not None]
    adaptive = [t for t in tasks if t["kind"] == "adaptive"]
    skipped = sum(t["completed_by"] == "skipped" for t in tasks)
    reminder = iso_at(date, p["reminder_h"])
    to_start = (hour - p["reminder_h"]) * 3600
    face_ratio = r1(rng.uniform(0.9, 0.99) if face_ok else rng.uniform(0.0, 0.3), 2)
    ambient = rest["ambient_light"]
    return {
        "schema": "afferent.session/3", "session_id": f"sim-{pid}-d{day}", "patient_id": pid,
        "device_id": f"sim-{pid}", "app_version": "0.3.0", "started_iso": iso_at(date, hour),
        "local_hour": round(hour, 2), "clock": "night" if night else "morning", "day_index": day,
        "status": status, "profile": "live", "simulated": True, "simulated_fields": ["*"],
        "input_backend": "simulated", "duration_ms": duration_ms, "sharing": "summary", "sensors": dict(SENSORS),
        "signal": {"pulse_source": "simulated", "pulse_quality_mean": r1(pulse_q, 2), "eyes_source": "simulated",
                   "face_tracked_ratio": face_ratio, "ambient_light": ambient, "dark_room": ambient < 0.15,
                   "pulse_implausible": False},
        "core": core, "tasks": tasks, "fork": fork, "two_lanterns": lanterns,
        "adaptive": {"mode_seconds": {k: round(v, 1) for k, v in mode_seconds.items()}, "transitions": transitions,
                     "perclos_mean": r1(np.mean([t["perclos"] for t in tasks if t.get("perclos") is not None]), 2)
                     if face_ok and any(t.get("perclos") is not None for t in tasks) else None,
                     "touch_errors": int(sum(t.get("errors", 0) for t in tasks)), "config_received": True},
        "mood_end": end_mood,
        "pre_post": {"pulse": pair(pulse_start, pulse_end), "head_pitch": pair(pitch0, pitch1),
                     "eye_openness": pair(eyes0, eyes1, 2),
                     "mood": {"start": mood, "end": end_mood,
                              "delta": end_mood - mood if mood is not None and end_mood is not None else None}},
        "engagement": {"completed": status == "completed", "duration_ms": duration_ms,
                       "pauses": int(rng.poisson(0.1)), "skipped_tasks": skipped,
                       "tasks_completed": len(tasks) - skipped, "tasks_total": len(tasks), "reminder_iso": reminder,
                       "time_to_start_s": round(to_start) if to_start >= 0 else None},
        "vitals": {"pulse_mean_bpm": r1(np.mean(pulses)) if pulses else None,
                   "pulse_min_bpm": r1(min(pulses)) if pulses else None,
                   "pulse_max_bpm": r1(max(pulses)) if pulses else None, "pulse_source": "simulated"},
        "context": {"room_temp_c": r1(rng.normal(20.6, 0.5)), "home": True, "visitors_present": 0,
                    "bedside_light_level": int(rng.choice([5, 8, 15]))},
    }, adaptive


def declined_session(pid, day, date, hour):
    return {"schema": "afferent.session/3", "session_id": f"sim-{pid}-d{day}", "patient_id": pid,
            "device_id": f"sim-{pid}", "started_iso": iso_at(date, hour), "local_hour": round(hour, 2),
            "day_index": day, "status": "declined", "profile": "live", "simulated": True,
            "simulated_fields": ["*"], "sharing": "summary"}


def nights(rng, p, sev, start_date, days):
    out = []
    for d in range(days + 1):
        date = start_date + dt.timedelta(days=d)
        weekend_night = date.weekday() in (5, 6)
        s = sev[min(d, days - 1)]
        sd = p["sleep_sd"] * (1 + 2.2 * s)
        onset = p["onset"] + (0.7 if weekend_night else 0) + 0.7 * s + rng.normal(0, sd)
        wake = p["wake"] + (1.1 if weekend_night else 0) + 1.4 * s + rng.normal(0, sd)
        wake = max(wake, onset + 4.0)
        out.append((onset, wake))
    return out


def daily_record(rng, pid, day, date, p, sev, night, next_night, dawn_min):
    weekend = date.weekday() >= 5
    onset, wake = night
    sensor_ok = rng.random() > 0.04
    pre_bed = float(rng.uniform(0, 0.8))
    lie_in = float(rng.uniform(0, 0.5))
    intervals = [(max(0.0, onset - pre_bed), wake + lie_in)]
    if next_night[0] < 0:
        intervals.append((max(0.0, 24 + next_night[0] - float(rng.uniform(0, 0.8))), 24.0))
    if rng.random() < 0.04 + 0.35 * sev:
        nap = rng.uniform(13, 16)
        intervals.append((nap, nap + rng.uniform(0.5, 2.0)))
    hourly = [min(1.0, overlap(intervals, h)) for h in range(24)]
    if rng.random() < 0.3:
        h = int(rng.integers(1, 6))
        hourly[h] = max(0.0, hourly[h] - float(rng.uniform(0.05, 0.25)))
    hourly = [round(x, 2) for x in hourly]
    restless = int(rng.poisson(p["restless"] * (1 + 1.0 * sev)))
    sleep = {"time_in_bed_h": r1(wake + lie_in - onset + pre_bed, 2), "sleep_onset_h": r1(onset, 2), "wake_time_h": r1(wake, 2),
             "sleep_midpoint_h": r1((onset + wake) / 2, 2), "restlessness_events": restless,
             "presence_hourly": hourly, "quality": r1(rng.uniform(0.8, 0.97), 2)}
    if not sensor_ok:
        sleep = {k: None for k in sleep}
    mp_present = rng.random() < 0.75 - 0.2 * sev
    mp_true = p["pulse"] + 6.0 * sev + (-0.5 if weekend else 0) + float(rng.normal(0, 1.8))
    mp_q = float(rng.uniform(0.55, 0.95)) if rng.random() > 0.06 else float(rng.uniform(0.2, 0.45))
    phone_ok = rng.random() > 0.05
    home_only = bool(rng.random() < min(0.95, p["home_p"] + (0.2 if weekend else 0) + 0.6 * sev))
    away = float(rng.uniform(0, 0.45)) if home_only else float(rng.gamma(3, (2.2 if not weekend else 1.3)) * (1 - 0.5 * sev) + 0.5)
    away = min(away, 16.0)
    presence = {"home_hours": r1(24 - away), "away_hours": r1(away), "home_only": away < 0.5,
                "visitors_count": int(rng.poisson(0.8 if weekend else 0.4))}
    if not phone_ok:
        presence = {k: None for k in presence}
    return {
        "schema": "afferent.daily/1", "patient_id": pid, "day_index": day, "date": date.isoformat(),
        "weekday": date.weekday(), "simulated": True,
        "simulated_fields": ["sleep", "morning_pulse_bpm", "room", "bedside_light", "presence", "steps", "knob_uses"],
        "day_complete": True, "sleep": sleep,
        "morning_pulse_bpm": r1(mp_true) if mp_present else None,
        "morning_pulse_quality": r1(mp_q, 2) if mp_present else None,
        "room": {"temp_c_mean": r1(rng.normal(20.7, 0.4)), "temp_c_night": r1(rng.normal(19.6, 0.4)),
                 "humidity_pct": r1(rng.normal(31, 3), 0)},
        "bedside_light": {"on_minutes": r1(dawn_min + rng.uniform(5, 30), 0), "dawn_level_pct": p["dawn_level"],
                          "morning_light_min": r1(dawn_min, 0)},
        "presence": presence,
        "steps": int(rng.lognormal(math.log(5200 * (1 - 0.5 * sev) * (0.8 if weekend else 1.0)), 0.35)),
        "knob_uses": int(rng.poisson(0.5)),
        "played": False, "declined": False, "missed": False, "session_time_h": None, "session_ids": [],
        "reminder_h": p["reminder_h"],
    }, mp_true


def generate_patient(kind: Literal["relapse", "stable"], days: int = 56, seed: int = 0, *,
                     patient_id: str | None = None, display_name: str | None = None,
                     onset_day: int | None = None, start_date: dt.date | None = None,
                     clock: str = "morning") -> dict:
    rng = np.random.default_rng(seed)
    extra_rng = np.random.default_rng([seed, 1])
    pid = patient_id or f"{kind}-{seed}"
    name = display_name or pid.capitalize()
    onset = (onset_day if onset_day is not None else DEFAULT_ONSET) if kind == "relapse" else None
    start = start_date or (dt.date.today() - dt.timedelta(days=days))
    p = persona(rng, kind, clock)
    sev = severity_curve(rng, kind, days, onset if onset is not None else days)
    rates = arm_rates(rng)
    g = np.zeros(days)
    for d in range(1, days):
        g[d] = 0.75 * g[d - 1] + rng.normal(0, 0.12)
    mood_ar = 0.0
    sleep_nights = nights(rng, p, sev, start, days)
    counts = {(m, a): [0, 0] for m, ids in bandit.MODE_ARMS.items() for a in ids}
    sessions, daily = [], []
    prev_dawn = False
    for d in range(days):
        date = start + dt.timedelta(days=d)
        weekend = date.weekday() >= 5
        s = float(sev[d])
        dawn_min = float(rng.uniform(3, 12)) if rng.random() < p["dawn_p"] else 0.0
        rec, mp_true = daily_record(rng, pid, d, date, p, s, sleep_nights[d], sleep_nights[d + 1], dawn_min)
        mood_ar = 0.5 * mood_ar + rng.normal(0, p["mood_sd"])
        mood_latent = p["mood"] - 2.0 * s - 0.8 * g[d] + (0.15 if weekend else 0) + (0.25 if prev_dawn else 0) + mood_ar
        prev_dawn = dawn_min > 0
        p["rt_mu"] = p["rt"] * (1 + 0.06 * math.exp(-d / 6)) + 80 * s + 30 * g[d] + rng.normal(0, p["rt_day_sd"])
        u = rng.random()
        miss_p = p["miss_p"] + (0.04 if weekend else 0) + 0.3 * s
        if u < 0.03:
            rec["declined"] = True
            sessions.append(declined_session(pid, d, date, p["session_h"]))
            rec["session_ids"] = [sessions[-1]["session_id"]]
        elif u < 0.03 + miss_p:
            rec["missed"] = True
        else:
            session, adaptive = make_session(rng, pid, d, date, p, s, float(g[d]), mood_latent, mp_true, rates,
                                             bandit_weights(counts), sessions)
            add_task_extra(extra_rng, session, p, s)
            sessions.append(session)
            for t in adaptive:
                if t["helped"] is not None and (t["mode"], t["id"]) in counts:
                    counts[(t["mode"], t["id"])][0 if t["helped"] else 1] += 1
            rec["played"] = True
            rec["session_time_h"] = session["local_hour"]
            rec["session_ids"] = [session["session_id"]]
        daily.append(rec)
    patient = {"id": pid, "display_name": name, "kind": kind, "simulated": True, "tms_end_date": start.isoformat(),
               "now_day": days, "clinic_contact": dict(CLINIC)}
    truth = {"kind": kind, "onset_day": onset, "severity": [round(float(x), 3) for x in sev],
             "best_arm": best_arms(rates), "arm_rates": {k: round(v, 3) for k, v in rates.items()},
             "dawn_light_next_day_mood": 0.25, "simulated": True}
    return {"patient": patient, "sessions": sessions, "daily": daily, "truth": truth}


def demo_roster(seed: int = 7, today: dt.date | None = None) -> list[dict]:
    today = today or dt.date.today()
    days = 56
    start = today - dt.timedelta(days=days)
    out = []
    for i, (pid, name, kind, onset, clock, pick) in enumerate(ROSTER):
        out.append(generate_patient(kind, days, seed * 1000 + i + pick * 10, patient_id=pid, display_name=name,
                                    onset_day=onset, start_date=start, clock=clock))
    return out
