"""Tests for live/server.py (stdlib unittest). Run: python3 -m unittest live/test_server.py -v

Every upstream document here is a fake shaped like the real one (uno-q/modulino-hub/app.py state_snapshot,
hub bedside snapshot and patient_detail). No number in this file is a measurement.
"""
import contextlib
import copy
import io
import json
import socket
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import server  # noqa: E402

TOKEN = "tok-SECRET-1234567890abcdef"
NOW = 1_800_000_000.0


def box_doc(now=NOW, finger_on=True, locked=True, quality=0.62, beat_t=None, clip_q=(0.7, 0.1), two=False,
            mode="active", since=None, fingers_key=True):
    beat_t = now - 0.2 if beat_t is None else beat_t
    doc = {
        "now": now,
        "knob": None,
        "climate": {"celsius": 25.237, "humidity": 44.44, "t": now - 5},
        "beat": {"bpm_live": 72 if finger_on else None, "t": now - 0.5, "fused": True},
        "fingers": [{"bpm_live": 72, "locked": locked, "ibi_ms": 830, "peak_slope": 300, "locked_count": 12, "t": beat_t},
                    {"bpm_live": None, "locked": False, "ibi_ms": 301, "peak_slope": 99, "locked_count": 0, "t": now - 0.9}],
        "modulinos": {"knob": False, "thermo": True, "buzzer": True, "t": now - 30},
        "bridge": "connected",
        "pulse": {"samples": 464, "fs": 46.3, "raw_min": 1568, "raw_max": 8104, "beats": 8, "bpm": 56, "quality": 0.0,
                  "last_beat_age_s": 0.4, "period": {"period_ms": 830, "quality": clip_q[0], "signal": 0.8}},
        "pulses": [{"samples": 464, "bpm": 72, "quality": 0.5, "last_beat_age_s": 0.4,
                    "period": {"period_ms": 830, "quality": clip_q[0], "signal": 0.8}},
                   {"samples": 464, "bpm": None, "quality": None, "last_beat_age_s": 1.5,
                    "period": {"period_ms": None, "quality": clip_q[1], "signal": 0.1}}],
        "finger": {"bpm": 72 if finger_on else None, "period_ms": 830, "quality": quality, "sources": [0],
                   "fingers": [72 if finger_on else None, None], "two_hearts": two, "held": None, "untrusted": [],
                   "clips": [{"clean": True, "trusted": True, "reason": None}, {"clean": False, "trusted": True, "reason": "no rhythm"}]},
        "breathing": {"per_minute": 13.46, "snr": 4.0, "channel": 0},
        "hrv": {"rmssd_ms": 41.6, "sdnn_ms": 50, "mean_bpm": 72, "pairs": 40, "channel": 0, "baseline_rmssd_ms": 45.2,
                "vs_baseline": 0.92},
        "presence": {"auto": True, "mode": mode, "since": now - 60 if since is None else since, "last_probe_range": 5410},
        "ble": "advertising",
        "data_manager": {"enabled": True, "url": "http://10.99.0.1:8100", "last_error": TOKEN},
    }
    if not fingers_key:
        del doc["fingers"]
    return doc


def bedside_doc(reason="idle", rgb="#000000", level=0, simulated=False, pid="anna"):
    return {"source": "unoq_http", "connected": True, "simulated": simulated, "updated_iso": "2026-11-15T05:42:19+02:00",
            "light": {"rgb": rgb, "level": level, "fade_ms": 2000, "reason": reason},
            "knob": {"level": 15, "last_press_iso": None},
            "presence": {"in_bed": None, "since_iso": None, "motion_events_tonight": 0},
            "thermo": {"temp_c": 25.16, "humidity_pct": 44.7}, "camera_on": False, "patient_id": pid,
            "note": TOKEN}


def view_doc(mornings=1, sid="s5", simulated=False):
    return {"patient": {"id": "anna", "display_name": "Anna Secret-Name"}, "simulated": simulated, "date": "2026-11-15",
            "today": {"played": True, "session_id": sid, "session_time_h": 3.9}, "week": [], "mornings_lit": mornings,
            "streak": None, "crisis": {"text": "free text"}, "privacy": {"note": TOKEN}}


def patient_doc(n_extra=0, simulated=False):
    sessions = [
        {"session_id": "s1", "started_iso": "2026-11-14T22:18:23+02:00", "status": "declined", "simulated": False},
        {"session_id": "s2", "started_iso": "2026-11-15T00:45:15+02:00", "status": "partial", "simulated": False},
        {"session_id": "s3", "started_iso": "2026-11-15T03:28:14+02:00", "status": "completed", "simulated": False},
        {"session_id": "s4", "started_iso": "2026-11-15T04:10:00+02:00", "status": "completed", "simulated": True},
        {"session_id": "s5", "started_iso": "2026-11-15T03:56:27+02:00", "status": "fell_asleep", "simulated": False},
    ] + [{"session_id": f"x{i}", "started_iso": "2026-11-15T05:00:00+02:00", "status": "declined"} for i in range(n_extra)]
    return {"patient": {"id": "anna", "display_name": "Anna Secret-Name", "simulated": simulated, "tms_end_date": "2026-09-20"},
            "privacy": {}, "latest_session": {"session_id": "s5", "patient_id": "anna", "note": TOKEN},
            "sessions": sessions, "daily": [], "checkins": [{"text": "free text"}], "phq": {}}


class Clock:
    def __init__(self):
        self.wall, self.mono = NOW, 1000.0

    def tick(self, s):
        self.wall += s
        self.mono += s


class Fake:
    """Upstream answers by URL; records every URL and header set it was asked for."""

    def __init__(self):
        self.box, self.bed, self.pat, self.view = box_doc(), bedside_doc(), patient_doc(), view_doc()
        self.calls, self.down = [], set()

    def __call__(self, url, headers=None):
        self.calls.append((url, dict(headers or {})))
        if url.startswith("http://box"):
            if "box" in self.down:
                raise urllib.error.URLError("refused")
            return copy.deepcopy(self.box)
        if "hub" in self.down:
            raise urllib.error.URLError("refused")
        if (headers or {}).get("Authorization") != "Bearer " + TOKEN:
            raise urllib.error.HTTPError(url, 401, "unauthorized", {}, None)
        if url.endswith("/api/bedside/state"):
            return copy.deepcopy(self.bed)
        if url.endswith("/api/patients/anna"):
            return copy.deepcopy(self.pat)
        if url.endswith("/api/patients/anna/patient-view"):
            return copy.deepcopy(self.view)
        raise urllib.error.HTTPError(url, 404, "not found", {}, None)


def make(fake=None, clock=None):
    fake, clock = fake or Fake(), clock or Clock()
    live = server.Live(fetch=fake, token=lambda: TOKEN, clock=lambda: clock.wall, mono=lambda: clock.mono,
                       lights=server.MODE_LIGHTS_FALLBACK, box_url="http://box", hub_url="http://hub")
    return live, fake, clock


def poll_all(live):
    live.poll_box()
    live.poll_bedside()
    live.poll_patient()


def walk_keys(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield prefix + k
            yield from walk_keys(v, prefix + k + ".")
    elif isinstance(obj, list):
        for v in obj:
            yield from walk_keys(v, prefix + "[].")


ALLOWED = {
    "v", "t", "time", "box", "box.online", "box.last_seen", "box.sensors", "room", "room.celsius", "room.humidity",
    "clips", "clips.[].on", "clips.[].bpm", "pulse", "pulse.bpm", "pulse.quality", "pulse.two_people", "pulse.hrv_ms",
    "pulse.hrv_own_ms", "pulse.breaths_per_min", "pulse.beat_seq", "pulse.beat_age_ms", "modulinos", "hub",
    "hub.online", "hub.last_seen", "hub.box_linked", "hub.simulated", "light", "light.rgb", "light.level",
    "light.reason", "light.mode", "presence", "presence.in_bed", "session", "session.running", "session.mode",
    "session.phase", "patient", "patient.mornings", "patient.last_morning",
}


class Sanitizing(unittest.TestCase):
    def test_only_whitelisted_facts_and_no_secret_leaves(self):
        live, fake, _ = make()
        log = io.StringIO()
        with contextlib.redirect_stderr(log):
            poll_all(live)
            snap = live.snapshot()
        out = json.dumps(snap)
        self.assertEqual(set(walk_keys(snap)) - ALLOWED, set())
        for secret in (TOKEN, "anna", "Anna", "Secret-Name", "10.99.0.1", "8100", "free text", "s5", "http://"):
            self.assertNotIn(secret, out)
            self.assertNotIn(secret, server.sse_frame("snapshot", snap).decode())
        self.assertNotIn(TOKEN, log.getvalue())

    def test_values_are_rounded_and_typed(self):
        live, _, _ = make()
        poll_all(live)
        s = live.snapshot()
        self.assertEqual(s["room"], {"celsius": 25.2, "humidity": 44})
        self.assertEqual(s["clips"], [{"on": True, "bpm": 72}, {"on": False, "bpm": None}])
        self.assertEqual((s["pulse"]["bpm"], s["pulse"]["quality"]), (72, 0.62))
        self.assertEqual((s["pulse"]["hrv_ms"], s["pulse"]["hrv_own_ms"], s["pulse"]["breaths_per_min"]), (42, 45, 13.5))
        self.assertEqual(s["modulinos"], ["thermo", "buzzer"])
        self.assertEqual(s["box"]["sensors"], "on")
        self.assertEqual(s["patient"], {"mornings": 1, "last_morning": "2026-11-15T03:56+02:00"})
        self.assertTrue(s["hub"]["online"] and s["box"]["online"])

    def test_token_only_as_bearer_header_to_the_hub(self):
        live, fake, _ = make()
        poll_all(live)
        for url, headers in fake.calls:
            self.assertNotIn(TOKEN, url)
            if url.startswith("http://box"):
                self.assertNotIn("Authorization", headers)
            else:
                self.assertEqual(headers.get("Authorization"), "Bearer " + TOKEN)

    def test_no_token_means_hub_offline_not_a_crash(self):
        live, fake, _ = make()
        live.token = lambda: None
        with contextlib.redirect_stderr(io.StringIO()):
            poll_all(live)
        s = live.snapshot()
        self.assertFalse(s["hub"]["online"])
        self.assertIsNone(s["light"])
        self.assertTrue(s["box"]["online"])

    def test_read_token_from_file(self):
        p = Path(self._tmp()) / "t"
        p.write_text(TOKEN + "\n")
        self.assertEqual(server.read_token(str(p)), TOKEN)
        self.assertIsNone(server.read_token(str(p) + ".missing"))

    def _tmp(self):
        import tempfile
        d = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(d, ignore_errors=True))
        return d

    def test_offline_after_ten_seconds(self):
        live, fake, clock = make()
        poll_all(live)
        fake.down = {"box", "hub"}
        with contextlib.redirect_stderr(io.StringIO()):
            clock.tick(9)
            poll_all(live)
            self.assertTrue(live.snapshot()["box"]["online"])
            clock.tick(2)
            poll_all(live)
        s = live.snapshot()
        self.assertFalse(s["box"]["online"])
        self.assertFalse(s["hub"]["online"])
        self.assertIsNone(s["room"])
        self.assertIsNone(s["pulse"]["bpm"])
        self.assertEqual(s["clips"], [{"on": False, "bpm": None}, {"on": False, "bpm": None}])
        self.assertIsNone(s["light"])
        self.assertIsNone(s["patient"])
        self.assertEqual(s["box"]["last_seen"], server.iso(NOW))

    def test_simulated_bedside_is_not_shown_as_real(self):
        live, fake, _ = make()
        fake.bed = bedside_doc(reason="mode", rgb="#FFD9A0", level=8, simulated=True)
        poll_all(live)
        s = live.snapshot()
        self.assertIsNone(s["light"])
        self.assertFalse(s["session"]["running"])
        self.assertTrue(s["hub"]["simulated"])

    def test_simulated_patient_gives_no_mornings(self):
        self.assertIsNone(server.patient_view(view_doc(), patient_doc(simulated=True)))
        self.assertIsNone(server.patient_view(view_doc(simulated=True), patient_doc()))
        self.assertIsNone(server.patient_view(view_doc(), {"patient": {"id": "x"}}))

    def test_full_record_only_when_the_view_changes(self):
        live, fake, _ = make()
        poll_all(live)
        poll_all(live)
        poll_all(live)
        records = [u for u, _ in fake.calls if u.endswith("/api/patients/anna")]
        self.assertEqual(len(records), 1, "the heavy record once, then the light view")
        fake.view = view_doc(mornings=2, sid="s9")
        poll_all(live)
        self.assertEqual(len([u for u, _ in fake.calls if u.endswith("/api/patients/anna")]), 2)
        self.assertEqual(live.snapshot()["patient"]["mornings"], 2)

    def test_brief_failures_are_not_logged(self):
        live, fake, clock = make()
        poll_all(live)
        fake.down = {"box"}
        log = io.StringIO()
        with contextlib.redirect_stderr(log):
            live.poll_box()
            clock.tick(5)
            live.poll_box()
            fake.down = set()
            live.poll_box()
        self.assertEqual(log.getvalue(), "")
        fake.down = {"box"}
        with contextlib.redirect_stderr(log):
            live.poll_box()
            clock.tick(11)
            live.poll_box()
            fake.down = set()
            live.poll_box()
        self.assertIn("box: not answering for 10 s", log.getvalue())
        self.assertIn("box: answering again", log.getvalue())


class PulseRules(unittest.TestCase):
    def view(self, **kw):
        facts, _ = server.Box().view(box_doc(**kw))
        return facts

    def test_live_pulse_when_locked_and_quality_ok(self):
        f = self.view()
        self.assertEqual((f["pulse"]["bpm"], f["clips"][0]["bpm"]), (72, 72))

    def test_quality_below_gate_hides_every_number(self):
        f = self.view(quality=0.25, clip_q=(0.2, 0.1))
        self.assertIsNone(f["pulse"]["bpm"])
        self.assertIsNone(f["clips"][0]["bpm"])
        self.assertIsNone(f["pulse"]["hrv_ms"])

    def test_clip_quality_alone_is_enough_for_the_clip(self):
        f = self.view(quality=0.25, clip_q=(0.5, 0.1))
        self.assertIsNone(f["pulse"]["bpm"])
        self.assertEqual(f["clips"][0]["bpm"], 72)

    def test_not_locked_is_no_reading(self):
        f = self.view(locked=False)
        self.assertIsNone(f["clips"][0]["bpm"])
        self.assertIsNone(f["pulse"]["bpm"])

    def test_locked_beat_too_old_is_no_reading(self):
        f = self.view(beat_t=NOW - 3.5)
        self.assertIsNone(f["clips"][0]["bpm"])

    def test_idle_or_warming_up_is_no_reading(self):
        self.assertIsNone(self.view(mode="idle")["pulse"]["bpm"])
        self.assertIsNone(self.view(since=NOW - 2)["pulse"]["bpm"])
        self.assertEqual(self.view(mode="probing")["sensors"], "checking")

    def test_two_people_shows_no_fused_pulse(self):
        f = self.view(two=True)
        self.assertIsNone(f["pulse"]["bpm"])
        self.assertTrue(f["pulse"]["two_people"])

    def test_untrusted_clip_shows_no_number(self):
        doc = box_doc()
        doc["finger"]["clips"][0]["trusted"] = False
        facts, _ = server.Box().view(doc)
        self.assertIsNone(facts["clips"][0]["bpm"])

    def test_implausible_or_wrong_types_are_dropped(self):
        doc = box_doc()
        doc["finger"]["bpm"] = 900
        doc["finger"]["fingers"] = ["72", None]
        doc["fingers"][0]["bpm_live"] = True
        doc["climate"]["celsius"] = float("nan")
        facts, _ = server.Box().view(doc)
        self.assertIsNone(facts["pulse"]["bpm"])
        self.assertIsNone(facts["clips"][0]["bpm"])
        self.assertIsNone(facts["room"])

    def test_garbage_document_does_not_crash(self):
        for doc in ({}, {"finger": [], "fingers": "x", "pulses": None, "presence": 3}, {"now": "soon"}):
            facts, beats = server.Box().view(doc)
            self.assertIsNone(facts["pulse"]["bpm"])
            self.assertEqual(beats, [])


class Beats(unittest.TestCase):
    def test_a_new_locked_beat_is_seen_once(self):
        b = server.Box()
        _, beats = b.view(box_doc(beat_t=NOW - 0.2))
        self.assertEqual(len(beats), 1)
        self.assertAlmostEqual(beats[0], 0.2, places=3)
        _, beats = b.view(box_doc(now=NOW + 1, beat_t=NOW - 0.2))
        self.assertEqual(beats, [], "the same beat again")
        _, beats = b.view(box_doc(now=NOW + 1, beat_t=NOW + 0.63))
        self.assertEqual(len(beats), 1)
        self.assertEqual(b.beat_seq, 2)

    def test_beat_t_alone_is_not_a_heartbeat(self):
        b = server.Box()
        b.view(box_doc(beat_t=NOW - 0.2))
        doc = box_doc(now=NOW + 1, beat_t=NOW - 0.2)
        doc["beat"]["t"] = NOW + 0.99           # the box rewrites beat.t every second
        _, beats = b.view(doc)
        self.assertEqual(beats, [])

    def test_both_clips_on_one_hand_give_one_beat(self):
        b = server.Box()
        doc = box_doc(beat_t=NOW - 0.3)
        doc["fingers"][1].update(locked=True, t=NOW - 0.2, bpm_live=72)
        doc["finger"]["fingers"] = [72, 72]
        doc["pulses"][1]["period"].update(quality=0.7, signal=0.8)
        _, beats = b.view(doc)
        self.assertEqual(len(beats), 1)

    def test_a_lagging_clip_never_sends_an_older_beat(self):
        b = server.Box()
        doc = box_doc(beat_t=NOW - 0.1)
        b.view(doc)
        doc = box_doc(now=NOW + 1, beat_t=NOW + 0.75)
        doc["fingers"][1].update(locked=True, t=NOW + 0.3, bpm_live=72)   # clip 2's first beat, older than clip 1's
        doc["finger"]["fingers"] = [72, 72]
        doc["pulses"][1]["period"].update(quality=0.7, signal=0.8)
        _, beats = b.view(doc)
        self.assertEqual(len(beats), 2, "clip 2's beat at +0.3 is between the two of clip 1: both are real beats, oldest first")
        self.assertGreater(beats[0], beats[1])
        _, beats = b.view(box_doc(now=NOW + 1.2, beat_t=NOW + 0.9))
        self.assertEqual(beats, [], "older than the newest sent")

    def test_old_first_beat_and_no_pulse_give_no_beat(self):
        _, beats = server.Box().view(box_doc(beat_t=NOW - 2.0))
        self.assertEqual(beats, [], "a stale beat on start")
        _, beats = server.Box().view(box_doc(quality=0.1, clip_q=(0.1, 0.1)))
        self.assertEqual(beats, [], "no live pulse")
        _, beats = server.Box().view(box_doc(two=True))
        self.assertEqual(beats, [], "two people")

    def test_last_beat_age_when_the_box_gives_no_per_clip_beats(self):
        b = server.Box()
        doc = box_doc(fingers_key=False)
        doc["finger"]["fingers"] = [None, None]
        doc["pulses"][0]["last_beat_age_s"] = 0.3
        _, beats = b.view(doc)
        self.assertEqual(len(beats), 0, "without per-clip beats no clip is locked: nothing is live")

    def test_poll_box_returns_beat_payloads(self):
        live, fake, clock = make()
        beats = live.poll_box()
        self.assertEqual(len(beats), 1)
        self.assertEqual(set(beats[0]), {"seq", "age_ms", "bpm"})
        self.assertEqual(beats[0]["bpm"], 72)
        clock.tick(0.3)
        s = live.snapshot()
        self.assertEqual(s["pulse"]["beat_seq"], 1)
        self.assertAlmostEqual(s["pulse"]["beat_age_ms"], 500, delta=5)


class SessionFromLight(unittest.TestCase):
    def test_mode_light_names_the_game_mode(self):
        live, fake, _ = make()
        fake.bed = bedside_doc(reason="mode", rgb="#ffd9a0", level=8)
        poll_all(live)
        s = live.snapshot()
        self.assertEqual(s["light"], {"rgb": "#FFD9A0", "level": 8, "reason": "mode", "mode": "flow"})
        self.assertEqual(s["session"], {"running": True, "mode": "flow", "phase": "play"})

    def test_dawn_then_recorded_session_ends_it(self):
        live, fake, _ = make()
        fake.bed = bedside_doc(reason="dawn", rgb="#FFF3DC", level=60)
        poll_all(live)
        self.assertEqual(live.snapshot()["session"], {"running": True, "mode": None, "phase": "dawn"})
        fake.pat = patient_doc(n_extra=1)
        fake.view = view_doc(sid="s6")
        poll_all(live)
        self.assertFalse(live.snapshot()["session"]["running"], "the hub has the session: it ended")
        fake.bed = bedside_doc(reason="mode", rgb="#FFC98A", level=8)
        poll_all(live)
        self.assertEqual(live.snapshot()["session"]["mode"], "calm", "a new session")

    def test_idle_and_unknown_reasons(self):
        live, fake, _ = make()
        poll_all(live)
        self.assertEqual(live.snapshot()["session"]["running"], False)
        fake.bed = bedside_doc(reason="<script>", rgb="#FFFFFF")
        poll_all(live)
        self.assertEqual(live.snapshot()["light"]["reason"], "other")
        fake.bed = bedside_doc(reason="mode", rgb="red")
        poll_all(live)
        self.assertIsNone(live.snapshot()["light"])

    def test_engine_modes_match_the_fallback(self):
        self.assertEqual(server.mode_lights(), server.MODE_LIGHTS_FALLBACK)


class SSE(unittest.TestCase):
    def test_frame(self):
        f = server.sse_frame("beat", {"age_ms": 120, "text": "a\nb"})
        self.assertEqual(f, b'event: beat\ndata: {"age_ms":120,"text":"a\\nb"}\n\n')
        self.assertEqual(f.count(b"\n"), 3)

    def test_broadcast_cap_and_ring(self):
        c = server.Broadcast(cap=2, ring=3)
        self.assertTrue(c.join() and c.join())
        self.assertFalse(c.join())
        c.leave()
        self.assertTrue(c.join())
        for i in range(5):
            c.publish(b"%d" % i)
        frames, seq = c.wait(0, timeout=0.01)
        self.assertEqual((frames, seq), ([b"2", b"3", b"4"], 5))
        frames, _ = c.wait(5, timeout=0.01)
        self.assertEqual(frames, [])


class HTTP(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.live, cls.fake, cls.clock = make()
        poll_all(cls.live)
        cls.cast = server.Broadcast(cap=3)
        server.Handler.live, server.Handler.cast = cls.live, cls.cast
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.httpd.daemon_threads = True
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.cast.close()
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def raw(self, request):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as s:
            s.sendall(request.encode())
            data = b""
            while True:
                chunk = s.recv(65536)
                if not chunk:
                    return data
                data += chunk

    def get(self, path, method="GET"):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def test_page_and_security_headers(self):
        code, h, body = self.get("/")
        self.assertEqual(code, 200)
        self.assertIn(b"Afferent, live", body)
        self.assertIn("default-src 'self'", h["Content-Security-Policy"])
        self.assertIn("connect-src 'self' https://*.trycloudflare.com", h["Content-Security-Policy"])
        self.assertEqual(h["X-Content-Type-Options"], "nosniff")
        self.assertEqual(h["Referrer-Policy"], "no-referrer")
        self.assertNotIn("Python", h.get("Server", ""))

    def test_live_json_is_the_snapshot_with_cors(self):
        code, h, body = self.get("/live.json?t=1")
        self.assertEqual(code, 200)
        self.assertEqual(h["Access-Control-Allow-Origin"], "*")
        self.assertEqual(h["Cache-Control"], "no-store")
        snap = json.loads(body)
        self.assertEqual(snap["v"], 1)
        self.assertNotIn(TOKEN.encode(), body)

    def test_health_and_endpoint(self):
        self.assertEqual(json.loads(self.get("/health")[2]), {"ok": True, "box": True, "hub": True})
        self.assertEqual(json.loads(self.get("/endpoint.json")[2]), {"live": "", "sse": True})

    def test_whitelist_and_no_traversal(self):
        for path in ("/nope", "/server.py", "/live/server.py", "/../server.py", "/%2e%2e/server.py",
                     "/fonts/../server.py", "/play/js/../../live/server.py", "/play/js/voice-config.js",
                     "/play/js/main.js", "/test_server.py", "//etc/passwd", "/README.md", "/index.html/"):
            code, _, body = self.get(path)
            self.assertEqual(code, 404, path)
            self.assertNotIn(b"import", body)
        raw = self.raw("GET /../../live/server.py HTTP/1.0\r\n\r\n")
        self.assertTrue(raw.startswith(b"HTTP/1.0 404"), raw[:40])

    def test_engine_scripts_are_served_from_the_list(self):
        code, h, body = self.get("/play/js/engine.js")
        self.assertEqual(code, 200)
        self.assertIn(b"A.MODES", body)
        self.assertTrue(h["Content-Type"].startswith("text/javascript"))

    def test_only_get(self):
        for m in ("POST", "PUT", "DELETE", "OPTIONS"):
            self.assertEqual(self.get("/live.json", m)[0], 405, m)

    def test_stream(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as s:
            s.sendall(b"GET /stream HTTP/1.1\r\nHost: x\r\n\r\n")
            data = b""
            while b"event: snapshot" not in data:
                data += s.recv(65536)
            head, _, rest = data.partition(b"\r\n\r\n")
            self.assertIn(b"Content-Type: text/event-stream", head)
            self.assertIn(b"Access-Control-Allow-Origin: *", head)
            self.assertTrue(rest.startswith(b"retry: 3000\n\nevent: snapshot\ndata: {"), rest[:60])
            self.cast.publish(server.sse_frame("beat", {"seq": 9, "age_ms": 80, "bpm": 72}))
            while b"event: beat" not in data:
                data += s.recv(65536)
            self.assertIn(b'event: beat\ndata: {"seq":9,"age_ms":80,"bpm":72}\n\n', data)
            self.assertNotIn(TOKEN.encode(), data)

    def test_stream_cap(self):
        conns = []
        try:
            for _ in range(3):
                s = socket.create_connection(("127.0.0.1", self.port), timeout=5)
                s.sendall(b"GET /stream HTTP/1.0\r\n\r\n")
                s.recv(100)
                conns.append(s)
            time.sleep(0.1)
            code, h, _ = self.get("/stream")
            self.assertEqual(code, 503)
            self.assertEqual(h["Retry-After"], "10")
        finally:
            for s in conns:
                s.close()
        deadline = time.time() + 5
        while self.cast.clients and time.time() < deadline:
            self.cast.publish(b": ping\n\n")    # a write is how a dead client is found
            time.sleep(0.05)
        self.assertEqual(self.cast.clients, 0, "closed clients are dropped")


if __name__ == "__main__":
    unittest.main()
