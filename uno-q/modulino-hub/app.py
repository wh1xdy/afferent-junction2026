"""Modulino-hub (Linux-sidan på UNO Q).

Tar emot Knob/Thermo-värden från sketchen via Arduino Bridge och publicerar dem
som HTTP-tjänst i Wendy Net (mDNS _http._tcp, TXT role=modulino-hub).

  GET  /state                      -> knob, climate, modulinos, finger (fused reading of both sensors;
                                      finger.held = a value held back by PulseGuard and why),
                                      beat (= fused, for the Jetson), fingers[0..1], pulses[0..1],
                                      breathing, hrv, presence, now (device clock, for staleness)
  GET  /ppg?ch=0|1                 -> raw 30 s of finger 1 (A1) / finger 2 (A2)
  POST /presence?auto=0|1          -> sensor LEDs off until a finger is detected (default on)
  POST /sensor?ch=0|1&on=0|1       -> manual sensor power (D2 / D3)
  POST /buzz?freq=880&ms=200       -> plays a tone on the Buzzer
  POST /heartbeat?on=0|1           -> mute / unmute the beep on every heartbeat (sketch default: muted)
  POST /led?r=0&g=255&b=0&ms=500   -> KY-016 colour for ms (ms=0 holds; r=g=b=0 back to auto)
  POST /led/beat?on=0|1            -> red flash on every heartbeat (default off: it fakes camera rPPG)

Once a second the readings are also handed to the data manager on the Jetson, inside the home
(data_manager_push.py: fused pulse, HRV, breathing while one person wears the clips; room
climate once a minute). GET /state shows how that is going under "data_manager".
"""
import collections
import json
import math
import os
import signal
import socket
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from arduino.router_bridge import Bridge
from zeroconf import IPVersion, ServiceInfo, Zeroconf

from network import interface_ipv4
from ble import HeartRateBroadcaster
import data_manager_push

PORT = 8080
lock = threading.Lock()
state = {"knob": None, "climate": None, "beat": None, "fingers": [None, None],
         "modulinos": None, "bridge": "connecting"}
CHANNELS = 2   # finger 1 = A1, finger 2 = A2


def _set(key, value):
    with lock:
        state[key] = {**value, "t": time.time()}


def on_knob(position, pressed):
    _set("knob", {"position": int(position), "pressed": bool(pressed)})
    print(f"knob {position} {'pressed' if pressed else ''}", flush=True)


def on_climate(celsius, humidity):
    _set("climate", {"celsius": round(float(celsius), 2), "humidity": round(float(humidity), 1)})


ppgs = [collections.deque(maxlen=3200) for _ in range(CHANNELS)]  # ~70 s at 45 Hz each (HRV window)
ppg = ppgs[0]
last_ppg = 0.0                # time.time() of the newest sample from the STM32


def on_ppg(t_ms, *values):
    global last_ppg
    last_ppg = time.time()
    for c, v in enumerate(values[:CHANNELS]):
        ppgs[c].append((int(t_ms), int(v)))


def stream_live(now):
    """True while the STM32 delivers samples. When it stops, the buffers keep their last
    seconds and the rhythm computed from them stays clear, but nothing is being measured."""
    return now - last_ppg <= data_manager_push.LIVE_S


def pulse_summary(window_ms=10000, ch=0):
    """Beat detection on the last 10 s of A1 samples.

    1 s moving-average detrend -> 5-sample smoothing -> peaks above 0.5*std with a
    0.33 s refractory period -> BPM from the median inter-beat interval.
    quality = autocorrelation at that interval (0..1); below ~0.2 treat as no signal.
    """
    pts = list(ppgs[ch])
    if len(pts) < 100:
        return {"samples": len(pts), "bpm": None}
    t_end = pts[-1][0]
    pts = [p for p in pts if p[0] >= t_end - window_ms]
    t = [p[0] for p in pts]
    v = [p[1] for p in pts]
    n = len(v)
    fs = (n - 1) / max((t[-1] - t[0]) / 1000, 1e-3)
    half = max(1, int(fs) // 2)
    hp = []
    for i in range(n):
        seg = v[max(0, i - half):i + half + 1]
        hp.append(v[i] - sum(seg) / len(seg))
    sm = []
    for i in range(n):
        seg = hp[max(0, i - 2):i + 3]
        sm.append(sum(seg) / len(seg))
    sd = math.sqrt(sum(x * x for x in sm) / n) or 1.0
    thr = 0.5 * sd
    refractory = int(0.33 * fs)
    beats = []
    for i in range(1, n - 1):
        if sm[i] > thr and sm[i] >= sm[i - 1] and sm[i] > sm[i + 1]:
            if beats and i - beats[-1] < refractory:
                if sm[i] > sm[beats[-1]]:
                    beats[-1] = i
                continue
            beats.append(i)
    ibis = [(t[b] - t[a]) / 1000 for a, b in zip(beats, beats[1:])]
    ibis = [x for x in ibis if 0.33 <= x <= 1.8]
    bpm = quality = None
    if len(ibis) >= 3:
        med = sorted(ibis)[len(ibis) // 2]
        bpm = round(60 / med)
        lag = int(round(med * fs))
        e = sum(x * x for x in sm) or 1.0
        quality = round(max(0.0, sum(sm[i] * sm[i + lag] for i in range(n - lag)) / e), 2)
    return {"samples": n, "fs": round(fs, 1), "raw_min": min(v), "raw_max": max(v),
            "beats": len(beats), "bpm": bpm, "quality": quality,
            "last_beat_age_s": round((t_end - t[beats[-1]]) / 1000, 2) if beats else None}


beats = [collections.deque(maxlen=90) for _ in range(CHANNELS)]  # (t_ms, ibi_ms), locked beats (~60 s)
last_locked = [0.0] * CHANNELS    # time.time() of each finger's newest locked beat that gave a BPM
sent_bpm = [0] * CHANNELS         # each finger's BPM as last handed to Bluetooth (0 = no reading)


# ── a pulse that has not earned trust yet ─────────────────────────────────────────
# Seen in the data manager (2026-11-14 19:08:25-29): 164 BPM four times at quality 0.36-0.38,
# right after a finger went on, nothing stored for minutes before or after; 19:20:36 a single
# 171. Most likely beats counted twice while the finger settled into the clip. One way that
# happens (reproduced in tests/test_pulse_guard.py): the second (dicrotic) wave of each beat is
# as tall as the first, the rhythm repeats every half beat, the STM32 detector gets half the
# period as its refractory time and counts every beat twice. Quality cannot tell (a doubled
# rhythm is a clean rhythm), so the number itself is held back:
#   - right after a finger is detected (or GUARD_FORGET_S without a trusted value) nothing is
#     known yet: a value goes out once it has stayed steady for GUARD_HOLD_S;
#   - a jump to about double or half of the last trusted value is held the same way.
# Every other value goes out at once, and a held value that stays steady goes out after
# GUARD_HOLD_S, so a real change is delayed by a few seconds at most, never blocked.
# The same rule holds back the fused pulse (2A37, /state finger.bpm, the data manager) and each
# finger's own number (AFF1 bytes 0-1, /state finger.fingers).
GUARD_HOLD_S = 6.0            # seconds a held value must stay steady before it goes out
                              # (the 164s lasted 4 s; a finger's median of 8 beats lags ~2 s)
GUARD_STEADY = 0.12           # steady = the held values of those seconds are within 12 % (max/min)
GUARD_HARMONIC = 0.15         # about double / half = a ratio within 15 % of 2 (as TWO_HEARTS_HARMONIC)
GUARD_FORGET_S = 10.0         # a trusted value older than this is no reference: settling again
GUARD_GAP_S = 3.0             # a held run ends after this long without a usable value
GUARD_MIN_VALUES = 3          # ...and needs at least this many values


def harmonic(a, b):
    """True when a is about double or half of b."""
    hi, lo = max(a, b), min(a, b)
    return lo > 0 and abs(hi / lo - 2) <= 2 * GUARD_HARMONIC


class PulseGuard:
    """Decides whether a pulse may leave the box. One per stream (the fused pulse, each finger).
    offer() returns the value to send and store, or None while it is held back. usable=False:
    a value that does not count as a measurement (quality below the limit, nothing live behind
    it). It cannot make a held value go out or become the reference, but it passes when it is
    not a jump, as before."""

    def __init__(self, hold_s=GUARD_HOLD_S):
        self.hold_s = hold_s
        self.reset()

    def reset(self):
        """A finger was put on or taken off: nothing is known about this wearing yet."""
        self.trusted = None        # last value that went out as a measurement
        self.trusted_t = None
        self.run = []              # (t, bpm): the steady usable values held so far
        self.reason = None         # why the newest value is held: settling / double / half
        self.held_bpm = None

    def offer(self, bpm, now, usable=True):
        if not bpm or bpm <= 0:
            return None
        if self.trusted is not None and not 0 <= now - self.trusted_t <= GUARD_FORGET_S:
            self.trusted = None                      # too long ago (or the clock was set back)
        if self.trusted is not None and not harmonic(bpm, self.trusted):
            self.run, self.reason, self.held_bpm = [], None, None
            if usable:
                self.trusted, self.trusted_t = bpm, now
            return bpm
        self.reason = "settling" if self.trusted is None else ("double" if bpm > self.trusted else "half")
        self.held_bpm = bpm
        if not usable:
            return None
        if self.run and now - self.run[-1][0] > GUARD_GAP_S:
            self.run = []
        self.run.append((now, bpm))
        while len(self.run) > 1 and max(b for _, b in self.run) > (1 + GUARD_STEADY) * min(b for _, b in self.run):
            self.run.pop(0)                          # keep the newest values that agree
        if len(self.run) >= GUARD_MIN_VALUES and self.run[-1][0] - self.run[0][0] >= self.hold_s:
            self.trusted, self.trusted_t = bpm, now
            self.run, self.reason, self.held_bpm = [], None, None
            return bpm
        return None

    def held(self):
        """For GET /state: what is held back and why, None when nothing is."""
        if self.held_bpm is None:
            return None
        steady = self.run[-1][0] - self.run[0][0] if self.run else 0.0
        return {"bpm": self.held_bpm, "reason": self.reason, "steady_s": round(steady, 1)}


pulse_guard = PulseGuard()                              # the fused pulse
finger_guards = [PulseGuard() for _ in range(CHANNELS)]  # each finger's own number


def reset_guards(chans=range(CHANNELS), fused_too=True):
    with lock:
        for c in chans:
            finger_guards[c].reset()
        if fused_too:
            pulse_guard.reset()


ble = HeartRateBroadcaster()
dm = data_manager_push.Push()     # started in main(); until then nothing is handed over


def on_beat(c, t_ms, ibi_ms, peak, locked):
    c = int(c)
    if locked:
        beats[c].append((int(t_ms), int(ibi_ms)))
    ibis = [b for _, b in beats[c]][-8:]
    # drop intervals that disagree with the autocorrelation period (double/missed beats)
    per, q = period_state[c].get("period_ms"), period_state[c].get("quality") or 0
    if per and q >= 0.3:
        ibis = [b for b in ibis if 0.75 * per <= b <= 1.35 * per]
    bpm = round(60000 / sorted(ibis)[len(ibis) // 2]) if len(ibis) >= 3 else None
    now = time.time()
    info = {"bpm_live": bpm, "locked": bool(locked), "ibi_ms": int(ibi_ms),
            "peak_slope": int(peak), "locked_count": len(beats[c]), "t": now}
    with lock:
        state["fingers"][c] = info
    if locked and bpm:
        last_locked[c] = now
        with lock:
            # a measurement for the guard: the rhythm behind these beats (this finger's own, or
            # both fingers' together) is clear enough for the data manager. A finger left out of
            # the fused pulse (judge_clips) shows no number: the fused rhythm is the other's.
            if clip_state[c]["trusted"]:
                clear = max(q, fused.get("quality") or 0) >= data_manager_push.MIN_QUALITY
                shown = finger_guards[c].offer(bpm, now, clear) or 0
            else:
                shown = 0
        if shown or sent_bpm[c]:            # a held value: the byte says "no reading" once
            sent_bpm[c] = shown
            ble.update_finger(c, shown)


period_state = [{"period_ms": None, "quality": None, "signal": None} for _ in range(CHANNELS)]


def autocorr(ch=0, window_ms=6000):
    """Normalised autocorrelation of the last 6 s of one finger -> (lags_ms, r) or None."""
    pts = list(ppgs[ch])
    if len(pts) < 150:
        return None
    t_end = pts[-1][0]
    v = [p[1] for p in pts if p[0] >= t_end - window_ms]
    n = len(v)
    fs = (n - 1) / (window_ms / 1000)
    m = sum(v) / n
    x = [a - m for a in v]
    e = sum(a * a for a in x) or 1.0
    lags = range(int(0.33 * fs), int(1.6 * fs))
    return [lag / fs * 1000 for lag in lags], [sum(x[i] * x[i + lag] for i in range(n - lag)) / e for lag in lags]


def rhythm_peak(lags, r):
    """(period_ms, quality, signal) from one autocorrelation curve.
    signal is the highest value anywhere in the 0.33-1.6 s range: something structured is on the
    sensor. period and quality count only when that maximum is a peak inside the range. A drifting
    signal (a finger settling in the clip) correlates most at the shortest lag, which is the edge
    of the range and not a heartbeat: measured on the board as "317 ms, quality 0.5-0.7", sent on
    as 188 BPM for the first seconds after the clips went on."""
    k = max(range(len(r)), key=r.__getitem__)
    signal = max(r[k], 0.0)
    if r[k] <= 0 or k == 0 or k == len(r) - 1:
        return None, 0.0, signal
    return round(lags[k]), signal, signal


def pulse_period(ch=0, window_ms=6000):
    """Dominant period 0.33-1.6 s of one finger and its strength."""
    ac = autocorr(ch, window_ms)
    if not ac:
        return None, 0.0
    ms, q, _ = rhythm_peak(*ac)
    return ms, q


def fused_period(curves, qualities):
    """Both fingers see the same heart: add their autocorrelation curves, weighted by quality."""
    acc = {}
    for (lags, r), q in zip(curves, qualities):
        if q <= 0:
            continue
        for lag, val in zip(lags, r):
            key = round(lag / 10) * 10           # 10 ms bins, channels sample at slightly different times
            acc[key] = acc.get(key, 0.0) + q * val
    if not acc:
        return None, 0.0
    lag = max(acc, key=acc.get)
    if lag in (min(acc), max(acc)):              # edge of the range: a drift, not a rhythm
        return None, 0.0
    wsum = sum(q for q in qualities if q > 0) or 1.0
    return lag, max(acc[lag] / wsum, 0.0)


# ── which clip to trust ──────────────────────────────────────────────────────────────
# Seen on Alex's phone (2026-11-14, new printed case): clip 1 showed a false 131-139 BPM (light
# into the clip or a bad seat), clip 2 a plausible 87-99. The combined rhythm averaged clip 2's
# clean curve with clip 1's noise, so the fused quality fell to 0.08-0.35, mostly below the 0.3
# the app and the data manager need, and no pulse went out; clip 2 alone gave 87 at 0.63. A
# weighted average of two curves is never clearer than the clearer one, so a noisy clip only
# ever drags the good one down. Each clip is therefore judged on its own every second:
#   clean = a real rhythm peak inside 0.33-1.6 s (rhythm_peak's edge rule), quality >= 0.5,
#           a pulse swing of at least CLIP_MIN_AMP, samples not stuck at the rails, DC on scale,
#           and the clip's own beat detector following that rhythm (most of its last locked
#           intervals within 20 % of the period), all of it for CLIP_CLEAN_S seconds in a row
#           with a period that stays within 12 %. Noise with a periodic part (light, a loose
#           seat) can reach a rhythm quality of 0.4 at 135 BPM, but its period wanders and the
#           detector on it fires off the rhythm every few seconds: that is what tells it from a
#           second person's pulse. A clip stops being clean at once.
# One clean clip next to one that is not: only the clean one is trusted. The fused rhythm, the
# fused pulse and its quality then come from that clip alone, and the other is named in /state
# finger.untrusted (AFF1 flag bits 1-2, its BPM byte 0). Both clean: both trusted, as before (the
# same rhythm is fused, two different rhythms are two people). Neither clean: both used, as
# before (two weak curves of one heart still add up).
CLIP_CLEAN_Q = 0.5            # rhythm quality of a clean clip. A finger on its own: 0.6-0.9 (data
                              # manager, 2026-11-14; clip 2 alone 0.63); the false rhythm: ~0.4
CLIP_MIN_AMP = 200            # p5-p95 of the detrended signal (raw counts): a pulse, not the
                              # noise of an empty clip (measured: empty ~50-150, finger 1500-3000)
CLIP_RAIL_LO, CLIP_RAIL_HI = 200, 13500   # beyond these the amplifier is saturated
CLIP_MAX_RAILED = 0.05        # more than 5 % of the samples at a rail = saturated
CLIP_DC_LO, CLIP_DC_HI = 1000, 14500      # mean outside this = off scale (amp stuck, sensor off)
CLIP_BEATS_N = 8              # the last this many locked intervals of the clip's own detector...
CLIP_BEATS_S = 8.0            # ...from the last this many seconds
CLIP_BEATS_MIN = 4            # fewer intervals than this: not (yet) clean
CLIP_BEATS_ON = 0.75          # at least this share within CLIP_BEATS_TOL of the period (6 of 8)
CLIP_BEATS_TOL = 0.2
CLIP_CLEAN_S = 3              # seconds in a row a clip must pass before it counts as clean
CLIP_STEADY = 0.12            # ...with its period within 12 % (max/min) over those seconds


def clip_signal(ch=0, window_ms=6000):
    """Amplitude, saturation and DC level of one finger over the same 6 s as autocorr().
    amplitude = p5-p95 of the signal minus its 1 s moving mean; railed = share of samples at a
    rail; dc = mean. None when there are too few samples."""
    pts = list(ppgs[ch])
    if len(pts) < 150:
        return None
    t_end = pts[-1][0]
    v = [p[1] for p in pts if p[0] >= t_end - window_ms]
    n = len(v)
    half = max(1, int((n - 1) / (window_ms / 1000)) // 2)
    cs = [0]
    for x in v:
        cs.append(cs[-1] + x)
    hp = sorted(v[i] - (cs[min(n, i + half + 1)] - cs[max(0, i - half)]) / (min(n, i + half + 1) - max(0, i - half))
                for i in range(n))
    railed = sum(1 for x in v if x < CLIP_RAIL_LO or x > CLIP_RAIL_HI) / n
    return {"amplitude": round(hp[int(0.95 * (n - 1))] - hp[int(0.05 * (n - 1))]),
            "railed": round(railed, 2), "dc": round(sum(v) / n)}


def clip_beats(ch, period_ms):
    """Share of one finger's last locked beat intervals that follow its own rhythm, or None when
    it has fewer than CLIP_BEATS_MIN of them."""
    b = list(beats[ch])
    if not b or not period_ms:
        return None
    ibis = [i for t, i in b if t >= b[-1][0] - CLIP_BEATS_S * 1000 and i > 0][-CLIP_BEATS_N:]
    if len(ibis) < CLIP_BEATS_MIN:
        return None
    return round(sum(1 for i in ibis if abs(i - period_ms) <= CLIP_BEATS_TOL * period_ms) / len(ibis), 2)


def clip_clean(period, sig, beats_on=None):
    """(clean, reason): is one finger's own signal a pulse one can trust on its own?
    period = period_state[c] (period_ms, quality); sig = clip_signal(); beats_on = clip_beats()."""
    if not sig:
        return False, "no samples"
    if sig["railed"] > CLIP_MAX_RAILED:
        return False, "saturated"
    if not CLIP_DC_LO <= sig["dc"] <= CLIP_DC_HI:
        return False, "off scale"
    if not period.get("period_ms"):
        return False, "no rhythm"                # incl. the edge of the range: a drift
    if (period.get("quality") or 0) < CLIP_CLEAN_Q:
        return False, "weak rhythm"
    if sig["amplitude"] < CLIP_MIN_AMP:
        return False, "flat"
    if beats_on is None:
        return False, "no beats"
    if beats_on < CLIP_BEATS_ON:
        return False, "beats off rhythm"
    return True, None


def clip_trust(cleans):
    """Per finger: may it go into the fused pulse? Only when exactly the other one is clean is
    a finger left out; otherwise both are used as before."""
    if any(cleans) and not all(cleans):
        return [bool(c) for c in cleans]
    return [True] * len(cleans)


clip_state = [{"clean": None, "trusted": True, "reason": None, "amplitude": None, "railed": None, "dc": None,
               "beats_on_rhythm": None} for _ in range(CHANNELS)]
clip_passes = [collections.deque(maxlen=CLIP_CLEAN_S) for _ in range(CHANNELS)]  # period_ms of the
                                                                                 # last passes in a row


def untrusted_fingers():
    return [c for c in range(CHANNELS) if not clip_state[c]["trusted"]]


def reset_clips():
    with lock:
        for s in clip_state:
            s.update(clean=None, trusted=True, reason=None, amplitude=None, railed=None, dc=None,
                     beats_on_rhythm=None)
        for p in clip_passes:
            p.clear()


def judge_clips():
    """Once a second from period_loop, after period_state is updated: judge each finger, store
    it in clip_state (/state finger.clips) and return which fingers are trusted."""
    judged = []
    for c in range(CHANNELS):
        try:
            sig = clip_signal(c)
        except Exception as e:
            print(f"clip signal failed (ch {c}): {e}", flush=True)
            sig = None
        per = period_state[c].get("period_ms")
        on = clip_beats(c, per)
        ok, why = clip_clean(period_state[c], sig, on)
        passes = clip_passes[c]
        if ok:
            passes.append(per)
            if len(passes) < CLIP_CLEAN_S:
                ok, why = False, "settling"
            elif max(passes) > (1 + CLIP_STEADY) * min(passes):
                ok, why = False, "rhythm unsteady"
        else:
            passes.clear()
        judged.append((sig, on, ok, why))
    trusted = clip_trust([ok for _, _, ok, _ in judged])
    with lock:
        for c, (sig, on, ok, why) in enumerate(judged):
            clip_state[c].update(clean=ok, trusted=trusted[c], reason=why, beats_on_rhythm=on, **(sig or
                                 {"amplitude": None, "railed": None, "dc": None}))
    return trusted


# ── one person or two? ───────────────────────────────────────────────────────────
# Everything above assumes both clips sit on one person. In the Heart Duel game each clip is on
# a different person. Two clear rhythms that stay apart for a few seconds mean two hearts; a
# ratio near 2 is one heart with a sensor counting double or half, and is left to the fusion.
TWO_HEARTS_MIN_Q = 0.3        # both rhythms must be this clear
TWO_HEARTS_APART = 0.12       # periods more than 12 % apart
TWO_HEARTS_HARMONIC = 0.15    # ...unless the ratio is within 15 % of 2
TWO_HEARTS_ON_S, TWO_HEARTS_OFF_S, TWO_HEARTS_UNKNOWN_S = 3, 3, 10   # seconds (one tick = 1 s)
FINGER_STALE_S = 4.0          # a finger's BPM leaves the Bluetooth packet after this long without
                              # a locked beat of its own (the other finger's beats do not count)
two_hearts = {"on": False, "apart": 0, "same": 0, "unknown": 0}


def periods_apart(per):
    """True: both fingers have a clear rhythm and the rhythms differ. False: both clear and the
    same heart (equal, or half/double). None: cannot tell (a finger has no clear rhythm)."""
    p = [x.get("period_ms") for x in per]
    q = [x.get("quality") or 0 for x in per]
    if len(p) != 2 or not all(p) or min(q) < TWO_HEARTS_MIN_Q:
        return None
    ratio = max(p) / min(p)
    if ratio <= 1 + TWO_HEARTS_APART:
        return False
    return abs(ratio - 2) > 2 * TWO_HEARTS_HARMONIC


def update_two_hearts(apart):
    """One call per second with periods_apart(); returns whether the clips are on two people.
    Switches on after TWO_HEARTS_ON_S s apart, off after TWO_HEARTS_OFF_S s the same or
    TWO_HEARTS_UNKNOWN_S s without a second clear rhythm."""
    t = two_hearts
    if apart is True:
        t.update(apart=t["apart"] + 1, same=0, unknown=0)
        if t["apart"] >= TWO_HEARTS_ON_S:
            t["on"] = True
    elif apart is False:
        t.update(same=t["same"] + 1, apart=0, unknown=0)
        if t["same"] >= TWO_HEARTS_OFF_S:
            t["on"] = False
    else:
        t.update(unknown=t["unknown"] + 1, apart=0, same=0)
        if t["unknown"] >= TWO_HEARTS_UNKNOWN_S:
            t["on"] = False
    return t["on"]


def reset_two_hearts():
    two_hearts.update(on=False, apart=0, same=0, unknown=0)


def detector_period(own, fp, fq, two):
    """Period and quality for one finger's beat detector on the STM32. One person: the combined
    rhythm when it is at least as clear as the finger's own. Two people: always its own, the
    other person's rhythm would set the wrong refractory time."""
    oq = own.get("quality") or 0
    if two or fq < oq:
        return own.get("period_ms"), oq
    return fp, fq


def stale_fingers(now):
    """Fingers whose BPM is still in the Bluetooth packet although their own detector has had
    no locked beat for FINGER_STALE_S: one clip came off while the other is still worn."""
    return [c for c in range(CHANNELS) if sent_bpm[c] and now - last_locked[c] > FINGER_STALE_S]


fused = {"bpm": None, "period_ms": None, "quality": None, "sources": [], "fingers": [None, None],
         "two_hearts": False, "held": None, "untrusted": []}


def fuse():
    """One finger reading from both sensors.
    Agree within 10 % -> quality-weighted mean; disagree -> the one closest to the fused period;
    one valid -> that one; none -> fused period itself if it is strong.
    A finger that is not trusted (judge_clips: noisy next to a clean one) is never a candidate."""
    with lock:
        f = [dict(state["fingers"][c] or {}) for c in range(CHANNELS)]
        per = [dict(period_state[c]) for c in range(CHANNELS)]
        fp, fq = fused["period_ms"], fused["quality"] or 0
        untrusted = untrusted_fingers()
    now = time.time()
    cands = []
    for c in range(CHANNELS):
        bpm = f[c].get("bpm_live")
        fresh = f[c].get("t") and now - f[c]["t"] < 5
        q = per[c].get("quality") or 0
        if bpm and fresh and q >= 0.2 and c not in untrusted:
            cands.append((c, bpm, q))
    period_bpm = 60000 / fp if fp and fq >= 0.3 else None
    if len(cands) == 2 and abs(cands[0][1] - cands[1][1]) <= 0.1 * max(cands[0][1], cands[1][1]):
        bpm = sum(b * q for _, b, q in cands) / sum(q for _, _, q in cands)
        sources = [0, 1]
    elif cands:
        best = min(cands, key=lambda c: abs(c[1] - period_bpm)) if period_bpm else max(cands, key=lambda c: c[2])
        bpm, sources = best[1], [best[0]]
    elif period_bpm and fq >= 0.5:
        bpm, sources = period_bpm, []
    else:
        bpm, sources = None, []
    with lock:
        # per finger: its candidate, as far as that finger's own number is out (finger_guards)
        fused.update(bpm=round(bpm) if bpm else None, sources=sources, untrusted=untrusted,
                     fingers=[c[1] if c and sent_bpm[c[0]] else None for c in
                              [next((x for x in cands if x[0] == ch), None) for ch in range(CHANNELS)]])
        state["beat"] = {**(state["beat"] or {}), "bpm_live": fused["bpm"], "fused": True, "t": time.time()}
    return fused["bpm"]


def guard_pulse(bpm, now):
    """The fused pulse as it leaves the box (2A37, /state finger.bpm and beat.bpm_live, the data
    manager), after PulseGuard. A value counts as a measurement for the guard when the data
    manager would take it: quality at least MIN_QUALITY and a live finger behind it."""
    with lock:
        quality = fused.get("quality") or 0
        sources = list(fused.get("sources") or [])
    usable = bool(bpm) and quality >= data_manager_push.MIN_QUALITY and fingers_live(sources, now)
    with lock:
        out = pulse_guard.offer(bpm, now, usable)
        fused.update(bpm=out, held=pulse_guard.held() if bpm and out is None else None)
        state["beat"] = {**(state["beat"] or {}), "bpm_live": out, "fused": True, "t": now}
    return out


def ble_status(tick):
    """Fused quality + presence mode + two people on the clips -> AFF1 bytes 4..6. keepalive every
    other tick: a notify at least every 2 s lets the phone see that the link is alive, also while
    idle. The two-people flag lets the phone keep Heart Duel readings out of the patient's data."""
    on = sensing()
    ble.update_status(fused.get('quality') if on else None, presence['mode'],
                      keepalive=(tick % 2 == 0), two_hearts=on and fused.get('two_hearts') is True,
                      untrusted=untrusted_fingers() if on else ())


def period_loop(stopped):
    tick = 0
    while not stopped.wait(1.0):
        tick += 1
        curves, quals = [None] * CHANNELS, [0.0] * CHANNELS
        for c in range(CHANNELS):
            try:
                ac = autocorr(c)
                if ac:
                    ms, q, sig = rhythm_peak(*ac)
                    curves[c], quals[c] = ac, q
                else:
                    ms, q, sig = None, 0.0, 0.0
                with lock:
                    period_state[c].update(period_ms=ms, quality=round(q, 2), signal=round(sig, 2))
            except Exception as e:
                print(f"period failed (ch {c}): {e}", flush=True)
        trusted = judge_clips()
        # the combined rhythm only from the clips that are trusted (a noisy clip only drags it down)
        use = [(curves[c], quals[c]) for c in range(CHANNELS) if curves[c] and trusted[c]]
        fp, fq = fused_period([u for u, _ in use], [q for _, q in use]) if use else (None, 0.0)
        if sensing():
            # two people = two CLEAN clips at different rhythms; a noisy clip next to a clean
            # one cannot tell (periods_apart: None)
            per = [dict(period_state[c]) if clip_state[c]["clean"] else {**period_state[c], "quality": 0}
                   for c in range(CHANNELS)]
            two = update_two_hearts(periods_apart(per))
        else:
            reset_two_hearts()
            two = False
        with lock:
            fused.update(period_ms=fp, quality=round(fq, 2), two_hearts=two)
        if state.get("bridge") == "connected":
            for c in range(CHANNELS):
                try:
                    # each detector gets the fused period when it's stronger than its own,
                    # unless the two clips are on two people
                    ms, q = detector_period(period_state[c], fp, fq, two)
                    if not sensing():
                        ms, q = 0, 0.0                 # sensors off or settling: never lock/beep
                    bridge.call("pulse_period", c, int(ms or 0), int(q * 100), timeout=2)
                except Exception as e:
                    print(f"period update failed (ch {c}): {e}", flush=True)
        br = update_breathing() if sensing() else None
        rm = update_hrv() if sensing() else None
        if presence["mode"] == "idle":
            # the finger may have left while the two updates above were running: their late
            # result must not survive the reset done by presence_loop
            reset_live_metrics()
            br = rm = None
        ble.update_breathing(br or 0)
        ble.update_hrv(rm or 0)
        bpm = guard_pulse(fuse(), time.time()) if sensing() else None
        for c in stale_fingers(time.time()):
            sent_bpm[c] = 0
            reset_guards([c], fused_too=False)   # put back on, it settles again
            ble.update_finger(c, 0)            # that clip came off; 0 = no reading
        for c in untrusted_fingers():
            if sent_bpm[c]:                    # left out of the fused pulse: its number goes too
                sent_bpm[c] = 0
                reset_guards([c], fused_too=False)
                ble.update_finger(c, 0)
        if not sensing():
            with lock:
                fused.update(bpm=None, sources=[], fingers=[None, None], held=None, untrusted=[])
                state["beat"] = {**(state["beat"] or {}), "bpm_live": None, "t": time.time()}
        ble_status(tick)
        if bpm:
            ble.update(0, bpm)        # standard Heart Rate Measurement = the fused finger reading
        push_readings(bpm, br, rm, two)


def fingers_live(chans, now):
    """True while samples arrive and every finger a number was computed from had a locked beat
    of its own in the last LIVE_S seconds. HRV and breathing are computed from a finger's stored
    beats, so they outlive a clip that came off; the pulse can come from the rhythm of both
    buffers (no finger named), which outlives a sample stream that stopped. Such a number does
    not go to the data manager."""
    if chans is None or not stream_live(now):
        return False
    chans = range(CHANNELS) if chans == "both" else [chans] if isinstance(chans, int) else chans
    return all(now - last_locked[c] <= data_manager_push.LIVE_S for c in chans)


def push_readings(bpm, br, rm, two):
    """Once a second from period_loop: this second's readings to the data manager on the Jetson.
    dm.tick() only queues them (data_manager_push.py). Nothing here may stop the sensor loop:
    a problem is logged once and that second's values are dropped."""
    try:
        now = time.time()
        with lock:
            climate = state.get("climate")
            quality, sources = fused.get("quality"), list(fused.get("sources") or [])
            hrv_ch, breath_ch = hrv.get("channel"), breathing.get("channel")
        dm.tick(now, sensing(), two, rhythms_apart=two_hearts["apart"] > 0,
                bpm=bpm if fingers_live(sources, now) else None, quality=quality,
                rmssd_ms=rm if fingers_live(hrv_ch, now) else None,
                breaths_per_min=br if fingers_live(breath_ch, now) else None, climate=climate)
    except Exception as e:
        dm.problem(f"push failed: {e}")


# ── finger presence: LEDs off until a hand is in the holders ─────────────────────────
# Sensor + is wired to D2/D3, so the sketch can power them (call "sensor_power").
# Measured: after power-on a sensor needs ~1.5 s to settle; finger 1 then varies < ~130
# (14-bit, per 250 ms) without a finger and swings ~2500-3000 with one. Finger 2's lead
# picks up spikes of 800-4000 even without a finger, so finger 1 decides for both.
PROBE_OFF_S, PROBE_SETTLE_MS, PROBE_LOOK_MS = 4.0, 1250, 1000   # flash = 2.25 s (amp settles ~1.25 s)
WARMUP_S = 4.0               # after switching on: no readings until the pulse has re-locked
PRESENCE_RANGE = 800          # max 250 ms range in the look window above this = finger
                              # (measured: no finger 90-445, finger ~1600-3000)
LEAVE_AFTER_S = 5.0           # pulse quality below 0.3 this long = hand gone
presence = {"auto": True, "mode": "active", "since": time.time(), "last_probe_range": None}


def _sensor_power(on):
    for c in range(CHANNELS):
        try:
            bridge.call("sensor_power", c, on, timeout=2)
        except Exception as e:
            print(f"sensor_power failed (ch {c}): {e}", flush=True)


def _last_t(ch=0):
    return ppgs[ch][-1][0] if ppgs[ch] else None


def _probe_range(t_on):
    w = [(t, v) for t, v in list(ppgs[0]) if t_on + PROBE_SETTLE_MS <= t < t_on + PROBE_SETTLE_MS + PROBE_LOOK_MS]
    if len(w) < 20:
        return None
    if any(v < 200 or v > 13500 for _, v in w):
        return 0                            # railed = power-on transient, never seen with a finger
    best, i = 0, 0
    while i < len(w):                       # 250 ms windows
        seg = [v for t, v in w if w[i][0] <= t < w[i][0] + 250]
        best = max(best, max(seg) - min(seg))
        i += max(1, len(seg))
    return best


def sensing():
    """True while the sensors are on, settled and warmed up (readings count)."""
    return presence["mode"] == "active" and time.time() - presence["since"] >= WARMUP_S


def _forget_beats():
    with lock:
        for c in range(CHANNELS):
            beats[c].clear()
            state["fingers"][c] = None
            sent_bpm[c] = 0
    reset_guards()            # a new wearing: no pulse goes out until it is steady (PulseGuard)
    reset_clips()             # ...and no clip is judged yet
    ble.clear_readings()      # AFF1 kept the last per-finger numbers after the finger left


def reset_live_metrics():
    """No finger: forget the live breathing and HRV numbers. update_breathing / update_hrv run
    only while sensing, so without this /state kept the last values for as long as nobody wore
    the clip. The running RMSSD median (and the history behind it) is kept."""
    with lock:
        breathing.update(per_minute=None, snr=None, channel=None)
        hrv.update(rmssd_ms=None, sdnn_ms=None, mean_bpm=None, pairs=0, channel=None, vs_baseline=None)


def _go_idle():
    presence.update(mode="idle", since=time.time())
    reset_live_metrics()


def presence_loop(stopped):
    weak_since = None
    while not stopped.wait(0.5):
        if state.get("bridge") != "connected":
            continue
        if not presence["auto"]:
            if presence["mode"] != "active":
                _sensor_power(True)
                presence.update(mode="active", since=time.time())
            continue
        if presence["mode"] == "active":
            if time.time() - presence["since"] < WARMUP_S:
                continue
            # "is something on the sensor": the raw signal strength, also when it is not (yet) a
            # heartbeat, so a finger that takes a few seconds to settle does not switch the sensors off
            q = max([period_state[c].get("signal") or period_state[c].get("quality") or 0 for c in range(CHANNELS)]
                    + [fused.get("quality") or 0])
            if q >= 0.3:
                weak_since = None
            elif weak_since is None:
                weak_since = time.time()
            elif time.time() - weak_since > LEAVE_AFTER_S:
                _sensor_power(False)
                _forget_beats()
                _go_idle()
                weak_since = None
                print("presence: no finger -> sensors off", flush=True)
        elif presence["mode"] == "idle" and time.time() - presence["since"] >= PROBE_OFF_S:
            _sensor_power(True)
            presence.update(mode="probing", since=time.time(), t_on=_last_t())
        elif presence["mode"] == "probing":
            t_on = presence.get("t_on") or 0
            if (_last_t() or 0) < t_on + PROBE_SETTLE_MS + PROBE_LOOK_MS:
                continue
            r = _probe_range(t_on)
            presence["last_probe_range"] = r
            if r is not None and r > PRESENCE_RANGE:
                _forget_beats()
                presence.update(mode="active", since=time.time())
                weak_since = time.time()       # give the pulse a few seconds to lock
                print(f"presence: finger detected (range {r}) -> sensors on", flush=True)
            else:
                _sensor_power(False)
                _go_idle()


# ── breathing from heart-rate rhythm (respiratory sinus arrhythmia) ─────────────────
# Heart rate rises on the in-breath and falls on the out-breath, so the beat-to-beat
# interval series oscillates at the breathing rate. Seen on this sensor: 78<->102 BPM
# over ~10 s. Dominant frequency 0.07-0.5 Hz (4-30/min) over the last 40 s; the band starts
# below 6/min so slow paced breathing (5 s in, 5 s out) isn't at the edge.
breathing = {"per_minute": None, "snr": None, "channel": None}


def rsa_breathing(c, window_ms=40000):
    per = period_state[c].get("period_ms")
    pts = [(t, i) for t, i in list(beats[c]) if i > 0]
    if per:                                   # same plausibility filter as the BPM
        pts = [(t, i) for t, i in pts if 0.7 * per <= i <= 1.4 * per]
    if len(pts) < 20:
        return None
    t_end = pts[-1][0]
    pts = [(t, i) for t, i in pts if t >= t_end - window_ms]
    if len(pts) < 20 or (pts[-1][0] - pts[0][0]) < 25000:
        return None
    # resample the interval series at 4 Hz
    fs = 4.0
    ts = [t / 1000 for t, _ in pts]
    xs = [float(i) for _, i in pts]
    grid, g = [], ts[0]
    while g <= ts[-1]:
        grid.append(g)
        g += 1 / fs
    y, j = [], 0
    for g in grid:
        while j < len(ts) - 2 and ts[j + 1] < g:
            j += 1
        a = (g - ts[j]) / (ts[j + 1] - ts[j]) if ts[j + 1] > ts[j] else 0
        y.append(xs[j] + (xs[j + 1] - xs[j]) * min(max(a, 0), 1))
    n = len(y)
    k = int(20 * fs)                         # remove trends slower than ~20 s (keeps 6/min = 10 s period)
    hp = []
    for i in range(n):
        seg = y[max(0, i - k // 2):i + k // 2 + 1]
        hp.append(y[i] - sum(seg) / len(seg))
    hp = [v * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i, v in enumerate(hp)]
    freqs, power = [], []
    f = 0.07
    while f <= 0.5 + 1e-9:
        re = sum(v * math.cos(2 * math.pi * f * i / fs) for i, v in enumerate(hp))
        im = sum(v * math.sin(2 * math.pi * f * i / fs) for i, v in enumerate(hp))
        freqs.append(f)
        power.append(re * re + im * im)
        f += 0.005
    kmax = max(range(len(power)), key=power.__getitem__)
    if kmax <= 1 or kmax >= len(power) - 2:  # peak at the band edge = drift/noise, not breathing
        return None
    f0 = freqs[kmax]
    sig = sum(p for fi, p in zip(freqs, power) if abs(fi - f0) <= 0.03)
    rest = sum(p for fi, p in zip(freqs, power) if abs(fi - f0) > 0.03)
    return round(f0 * 60), round(10 * math.log10(sig / (rest + 1e-12)), 1)


_last_breath_log = 0.0


def rsa_debug(c):
    """why there is / isn't a reading (logged every 5 s while sensing)"""
    per = period_state[c].get("period_ms")
    allp = [(t, i) for t, i in list(beats[c]) if i > 0]
    kept = [(t, i) for t, i in allp if not per or 0.7 * per <= i <= 1.4 * per]
    span = (kept[-1][0] - kept[0][0]) / 1000 if len(kept) > 1 else 0
    ibis = [i for _, i in kept]
    return f"ch{c}: beats {len(allp)} kept {len(kept)} span {span:.0f}s period {per} ibi {min(ibis) if ibis else '-'}-{max(ibis) if ibis else '-'}"


# ── heart-rate variability (HRV) ─────────────────────────────────────────────────────
# RMSSD (root mean square of successive beat-interval differences) over the last 60 s: a
# short-term HRV number, read relative to one's own baseline.
# The sensor samples at ~45 Hz, so a beat time is only known to +-11 ms, while RMSSD is typically
# 20-80 ms. Each beat is therefore re-timed at the steepest point of its upstroke in the raw signal,
# with parabolic sub-sample interpolation. Artefacts: intervals off the pulse period, or > 30 % off
# the local median of their neighbours (missed / double beats), are dropped.
hrv = {"rmssd_ms": None, "sdnn_ms": None, "mean_bpm": None, "pairs": 0, "channel": None,
       "baseline_rmssd_ms": None, "vs_baseline": None}
_hrv_history = collections.deque(maxlen=600)          # (t, rmssd), ~10 min, for the running median
                                                      # (of this sensor, whoever wears it: not per person)


def refine_beat(c, t_ms):
    """time of the steepest upstroke near a detected beat, sub-sample (ms)"""
    w = [(t, v) for t, v in list(ppgs[c]) if t_ms - 150 <= t <= t_ms + 80]
    if len(w) < 5:
        return float(t_ms)
    d = [(w[i][0] + w[i - 1][0]) / 2 for i in range(1, len(w))]           # slope time stamps
    s_ = [(w[i][1] - w[i - 1][1]) / max(w[i][0] - w[i - 1][0], 1) for i in range(1, len(w))]
    k = max(range(len(s_)), key=s_.__getitem__)
    if 0 < k < len(s_) - 1:
        a, b, cc = s_[k - 1], s_[k], s_[k + 1]
        den = a - 2 * b + cc
        off = 0.5 * (a - cc) / den if den else 0.0          # parabola vertex, in samples
        off = max(-0.5, min(0.5, off))
        step = (d[k + 1] - d[k - 1]) / 2
        return d[k] + off * step
    return d[k]


def compute_hrv(c, window_ms=60000):
    pts = list(beats[c])
    if len(pts) < 12:
        return None
    t_end = pts[-1][0]
    times = [refine_beat(c, t) for t, _ in pts if t >= t_end - window_ms]
    if len(times) < 12:
        return None
    ibis = [b - a for a, b in zip(times, times[1:])]
    per = period_state[c].get("period_ms")
    ok = []
    for j, i in enumerate(ibis):
        # missed / double beats sit at ~2x / ~0.5x: drop intervals > 30 % off the local median of
        # their neighbours. (A "> 20 % change from the previous interval" rule also removed real
        # large variations and under-read high HRV: 86 -> 61 ms on a synthetic test.)
        nb = sorted(ibis[max(0, j - 3):j] + ibis[j + 1:j + 4])
        med = nb[len(nb) // 2] if nb else i
        plausible = (0.6 * per <= i <= 1.6 * per) if per else (330 <= i <= 1800)
        ok.append(plausible and abs(i - med) <= 0.3 * med)
    diffs = [ibis[j] - ibis[j - 1] for j in range(1, len(ibis)) if ok[j] and ok[j - 1]]
    good = [i for i, o in zip(ibis, ok) if o]
    if len(diffs) < 20 or len(good) < 20:
        return None
    rmssd = math.sqrt(sum(x * x for x in diffs) / len(diffs))
    m = sum(good) / len(good)
    sdnn = math.sqrt(sum((i - m) ** 2 for i in good) / len(good))
    return {"rmssd_ms": round(rmssd, 1), "sdnn_ms": round(sdnn, 1), "mean_bpm": round(60000 / m),
            "pairs": len(diffs), "channel": c}


def update_hrv():
    res = [r for r in (compute_hrv(c) for c in range(CHANNELS)) if r]
    best = max(res, key=lambda r: r["pairs"]) if res else None
    if best and len(res) == 2 and abs(res[0]["rmssd_ms"] - res[1]["rmssd_ms"]) <= 0.25 * max(res[0]["rmssd_ms"], res[1]["rmssd_ms"]):
        best = {**best, "rmssd_ms": round((res[0]["rmssd_ms"] + res[1]["rmssd_ms"]) / 2, 1), "channel": "both"}
    with lock:
        if best:
            _hrv_history.append((time.time(), best["rmssd_ms"]))
            hist = [v for _, v in _hrv_history]
            base = sorted(hist)[len(hist) // 2] if len(hist) >= 120 else None    # >= 2 min of readings
            hrv.update(best, baseline_rmssd_ms=base,
                       vs_baseline=round(best["rmssd_ms"] / base - 1, 2) if base else None)
        else:
            hrv.update(rmssd_ms=None, sdnn_ms=None, mean_bpm=None, pairs=0, channel=None, vs_baseline=None)
    return hrv["rmssd_ms"]


def update_breathing():
    global _last_breath_log
    best = None
    results = []
    for c in range(CHANNELS):
        r = rsa_breathing(c)
        results.append(r)
        if r and (best is None or r[1] > best[1]):
            best = (r[0], r[1], c)
    if time.time() - _last_breath_log > 5:
        _last_breath_log = time.time()
        print(f"breathing: {results} | " + " | ".join(rsa_debug(c) for c in range(CHANNELS)), flush=True)
    with lock:
        if best and best[1] > 0:
            breathing.update(per_minute=best[0], snr=best[1], channel=best[2])
        else:
            breathing.update(per_minute=None, snr=best[1] if best else None, channel=None)
    return breathing["per_minute"]


def on_modulinos(knob_ok, thermo_ok, buzzer_ok):
    _set("modulinos", {"knob": bool(knob_ok), "thermo": bool(thermo_ok), "buzzer": bool(buzzer_ok)})


bridge = Bridge(os.environ["APP_SOCKET"])


def bridge_loop(stopped):
    while not stopped.is_set():
        try:
            if bridge.connect(timeout=5):
                bridge.provide("knob", on_knob)
                bridge.provide("climate", on_climate)
                bridge.provide("modulinos", on_modulinos)
                bridge.provide("ppg", on_ppg)
                bridge.provide("beat", on_beat)
                with lock:
                    state["bridge"] = "connected"
                print("bridge connected", flush=True)
                return
        except Exception as e:  # router not up yet
            print(f"bridge connect failed: {e}", flush=True)
        stopped.wait(2)


def state_snapshot() -> dict:
    """Body of GET /state."""
    with lock:
        out = dict(state)
    out["pulse"] = pulse_summary(ch=0)
    out["pulse"]["period"] = dict(period_state[0])
    out["pulses"] = []
    for c in range(CHANNELS):
        ps = pulse_summary(ch=c)
        ps["period"] = dict(period_state[c])
        out["pulses"].append(ps)
    out["finger"] = dict(fused)     # the one combined finger reading
    with lock:                      # each clip as judged (judge_clips): clean, trusted, why not
        out["finger"]["clips"] = [dict(s) for s in clip_state]
    out["breathing"] = dict(breathing)
    out["hrv"] = dict(hrv)
    out["presence"] = {k: v for k, v in presence.items() if k != "t_on"}
    out["ble"] = ble.status
    out["data_manager"] = dm.status()
    # device clock: every "t" / "since" in this document is on the same clock, so an HTTP
    # consumer can judge staleness as now - t without comparing its own clock to the board's
    out["now"] = time.time()
    return out


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/state"):
            self._json(200, state_snapshot())
        elif path == "/ppg":
            c = int(parse_qs(urlparse(self.path).query).get("ch", ["0"])[0])
            self._json(200, {"samples": list(ppgs[c % CHANNELS])})
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/heartbeat":
            on = q.get("on", ["1"])[0] not in ("0", "false", "off")
            try:
                return self._json(200, {"heartbeat_sound": bool(bridge.call("heartbeat_sound", on, timeout=3))})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path == "/presence":
            presence["auto"] = q.get("auto", ["1"])[0] not in ("0", "false", "off")
            return self._json(200, {"auto": presence["auto"]})
        if url.path == "/sensor":
            c = int(q.get("ch", ["0"])[0]) % CHANNELS
            on = q.get("on", ["1"])[0] not in ("0", "false", "off")
            try:
                return self._json(200, {"ch": c, "on": bool(bridge.call("sensor_power", c, on, timeout=3))})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path == "/led/beat":
            on = q.get("on", ["1"])[0] not in ("0", "false", "off")
            try:
                return self._json(200, {"led_beat": bool(bridge.call("led_beat", on, timeout=3))})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path == "/led":
            try:
                r, g, b, ms = (int(q.get(k, [d])[0]) for k, d in (("r", "0"), ("g", "0"), ("b", "0"), ("ms", "500")))
                return self._json(200, {"ok": bool(bridge.call("led", r, g, b, ms, timeout=3)), "rgb": [r, g, b], "ms": ms})
            except Exception as e:
                return self._json(503, {"error": str(e)})
        if url.path != "/buzz":
            return self._json(404, {"error": "not found"})
        try:
            freq = int(q.get("freq", ["880"])[0])
            ms = int(q.get("ms", ["200"])[0])
            ok = bridge.call("buzz", freq, ms, timeout=3)
            self._json(200, {"ok": bool(ok), "freq": freq, "ms": ms})
        except Exception as e:
            self._json(503, {"ok": False, "error": str(e)})

    def log_message(self, *_):
        pass


def _mdns_interfaces():
    """the mesh interface, for finding the data manager when DATA_MANAGER_URL is not set"""
    try:
        return [interface_ipv4()]
    except Exception:
        return None


def main():
    stopped = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stopped.set())

    threading.Thread(target=bridge_loop, args=(stopped,), daemon=True).start()
    threading.Thread(target=period_loop, args=(stopped,), daemon=True).start()
    threading.Thread(target=presence_loop, args=(stopped,), daemon=True).start()
    dm.start(mdns_interfaces=_mdns_interfaces())

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    zc = info = None
    try:
        address = interface_ipv4()
        zc = Zeroconf(interfaces=[address], ip_version=IPVersion.V4Only)
        info = ServiceInfo(
            "_http._tcp.local.",
            "modulino-hub._http._tcp.local.",
            addresses=[socket.inet_aton(address)],
            port=PORT,
            properties={"role": "modulino-hub", "path": "/state"},
            server=f"modulino-hub-{uuid.uuid4().hex[:6]}.local.",
        )
        zc.register_service(info, allow_name_change=True)
        print(f"advertising {info.name} at {address}:{PORT}", flush=True)
    except Exception as e:
        print(f"mDNS disabled: {e}", flush=True)

    try:
        stopped.wait()
    finally:
        if zc:
            if info:
                zc.unregister_service(info)
            zc.close()
        server.shutdown()
        bridge.disconnect()
        dm.close()


if __name__ == "__main__":
    main()
