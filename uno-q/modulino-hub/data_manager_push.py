"""Hands the UNO Q's readings to the data manager on the Jetson (afferent-data-manager).

data_manager_client.py next to this file is an unchanged copy of
jetson/data_manager/client/data_manager_client.py at commit c4301f8 (branch data_manager,
git blob f79b7d4). It queues values and sends them from its own thread, so nothing here waits
for the network.

The readings go from the UNO Q to the Jetson and stay in the patient's home.

app.py calls Push.tick() once a second from period_loop. What is handed over (source
"modulino-hub"):

  vitals.heart_rate_bpm           the fused finger pulse, quality = fused rhythm quality (0..1)
  vitals.hrv_rmssd_ms             RMSSD over the last 60 s, a number in ms
  vitals.breathing_rate_per_min   breaths per minute, derived from the heart rhythm
  env.temperature_c, env.humidity_pct   mean of the Modulino Thermo readings over one minute

Pulse, HRV and breathing only while the hub is sensing, the value exists and both clips are on
one person. A missing reading is not sent: never 0, never an older number in its place.

The server comes from DATA_MANAGER_URL (else mDNS, role=data-manager) and the token from
DATA_MANAGER_TOKEN, both read from the environment by the client. If the client file, the
server or the token is missing, the hub works as before: tick() never raises, a problem is
logged once and nothing is retried here.
"""
import math

try:
    from data_manager_client import DataManagerClient
    _import_error = None
except Exception as e:                # the file is not in the image: the hub runs without it
    DataManagerClient = None
    _import_error = str(e)

SOURCE = "modulino-hub"
SENSOR = "finger_ppg"         # what measured the vitals (the label of the session contract)
LIVE_S = 3.0                  # a reading counts as live for this long
WINDOW_EVERY_S = 10.0         # HRV (60 s window) and breathing (40 s window) move slowly
CLIMATE_EVERY_S = 60.0        # one mean per minute (the Thermo reports every 2 s)
TWO_HEARTS_HOLD_S = 60.0      # after two people: the HRV / breathing windows still hold the
                              # other person's beats for this long


def _reading(v):
    """A number that is a reading: not missing, not 0 (= no reading), not NaN."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 0


def _number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


class Push:
    def __init__(self, client=None, log=None):
        self.client = client          # None until start(): tick() then hands over nothing
        self.log = log or (lambda msg: print(msg, flush=True))
        self.error = None             # last problem (logged once, shown in GET /state)
        self._last = {}               # metric -> time of the last value handed over
        self._hold_until = 0.0
        self._climate = []            # (t, celsius, humidity) since the last minute mean
        self._climate_t = None        # "t" of the newest Thermo reading already counted

    def start(self, mdns_interfaces=None):
        """Create the client (it starts its own sender thread). Called once from main()."""
        if DataManagerClient is None:
            return self.problem(f"client not available ({_import_error})")
        try:
            self.client = DataManagerClient(source=SOURCE, mdns_interfaces=mdns_interfaces)
        except Exception as e:
            self.problem(f"client did not start: {e}")

    def tick(self, now, sensing, two_hearts, rhythms_apart=False, bpm=None, quality=None,
             rmssd_ms=None, breaths_per_min=None, climate=None):
        """One call per second with this second's readings. Never raises.

        two_hearts: the clips are on two people. rhythms_apart: the two fingers disagree right
        now, which is how two people look before two_hearts is decided (it takes 3 s).
        """
        if self.client is None:
            return
        try:
            if two_hearts:
                self._hold_until = now + TWO_HEARTS_HOLD_S
            if sensing and not two_hearts and not rhythms_apart:
                if _reading(bpm):
                    self._send("vitals.heart_rate_bpm", round(bpm), now,
                               quality=round(quality, 2) if _number(quality) else None,
                               meta={"sensor": SENSOR})
                if now >= self._hold_until:
                    if _reading(rmssd_ms) and self._due("vitals.hrv_rmssd_ms", now, WINDOW_EVERY_S):
                        self._send("vitals.hrv_rmssd_ms", round(rmssd_ms, 1), now,
                                   meta={"sensor": SENSOR, "window_s": 60})
                    if _reading(breaths_per_min) and self._due("vitals.breathing_rate_per_min", now,
                                                               WINDOW_EVERY_S):
                        self._send("vitals.breathing_rate_per_min", round(breaths_per_min), now,
                                   meta={"sensor": SENSOR, "method": "pulse_rhythm"})
            self._climate_tick(climate, now)
        except Exception as e:
            self.problem(f"push failed: {e}")

    def status(self):
        """For GET /state: where the readings go and how many are waiting. No token in it."""
        try:
            out = self.client.status() if self.client is not None else {"enabled": False}
        except Exception as e:
            out = {"enabled": False, "status_error": str(e)}
        return {**out, "push_error": self.error}

    def close(self):
        try:
            if self.client is not None:
                self.client.close()
        except Exception as e:
            self.problem(f"close failed: {e}")

    def problem(self, msg):
        """One log line per problem, not one per second."""
        if msg != self.error:
            self.log(f"data manager: {msg} (the hub goes on without it)")
        self.error = msg

    # ── internals ───────────────────────────────────────────────────────────
    def _due(self, key, now, every_s):
        last = self._last.get(key)
        return last is None or now - last >= every_s or now < last     # now < last: clock was set back

    def _send(self, metric, value, ts, quality=None, meta=None):
        """One value into the client's queue. A failure costs that value: it is not retried."""
        self._last[metric] = ts
        try:
            self.client.sample(metric, value, ts=ts, quality=quality, meta=meta)
        except Exception as e:
            self.problem(f"a reading was not handed over: {e}")

    def _climate_tick(self, climate, now):
        """Count every new Thermo reading once; hand over the mean of a minute."""
        t = (climate or {}).get("t")
        if _number(t) and t != self._climate_t and 0 <= now - t <= LIVE_S:
            self._climate_t = t
            if _number(climate.get("celsius")) and _number(climate.get("humidity")):
                self._climate.append((t, climate["celsius"], climate["humidity"]))
        if not self._climate or 0 <= now - self._climate[0][0] < CLIMATE_EVERY_S:
            return
        rows, self._climate = self._climate, []
        n = len(rows)
        ts = sum(r[0] for r in rows) / n                  # the mean belongs to when it was measured
        self._send("env.temperature_c", round(sum(r[1] for r in rows) / n, 2), ts, meta={"n": n})
        self._send("env.humidity_pct", round(sum(r[2] for r in rows) / n, 1), ts, meta={"n": n})
