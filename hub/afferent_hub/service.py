import asyncio
import copy
import hashlib
import json
import logging
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import httpx
from jsonschema import Draft202012Validator

from . import modules, views
from .bedside.controller import Bedside
from .bedside.simulator import BedsideSimulator
from .bedside.source import NullSource
from .db import Store
from .settings import ROOT, Settings
from .ws.manager import Client, Rooms

log = logging.getLogger("afferent.hub")

VERSION = "0.3.0"
CONTRACTS = ROOT / "contracts"
RELAYED = ("mode", "game", "task_end", "core_trial", "mood")
SHARING = ("summary", "nothing_tonight", "paused")
SENSOR_IDS = [s[0] for s in views.SENSORS]
DISCLAIMER = "Written on the hub from the numbers shown. Rephrasing only: no advice, no diagnosis."


class HubError(Exception):
    def __init__(self, status: int, code: str, detail: str):
        super().__init__(detail)
        self.status, self.code, self.detail = status, code, detail


def _validator(name):
    schema = json.loads((CONTRACTS / name).read_text())
    return Draft202012Validator(schema)


def schema_errors(validator, doc, limit=5) -> list[str]:
    errs = sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path))
    return [f"{e.json_path}: {e.message}"[:300] for e in errs[:limit]]


def make_source(settings: Settings):
    mode = settings.bedside
    if mode == "sim":
        return BedsideSimulator(seed=settings.seed, speed=settings.sim_speed, pulse=settings.sim_pulse)
    if mode.startswith("serial:"):
        from .bedside.unoq import UnoQSerial

        return UnoQSerial(mode.split(":", 1)[1])
    return NullSource("ws" if mode == "ws" else "off")


class Hub:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.store = Store(settings.db)
        self.rooms = Rooms()
        self.session_v = _validator("session.v3.schema.json")
        self.daily_v = _validator("daily.v1.schema.json")
        self.live: dict[str, str] = {}
        self.locks: dict[str, asyncio.Lock] = {}
        self.summaries: dict[tuple, dict] = {}
        self.validation: dict | None = None
        self.validation_status = "idle"
        self._gemma: tuple[float, dict] | None = None
        self._tasks: list[asyncio.Task] = []
        self.bedside = Bedside(make_source(settings), self._to_bound_app, self.to_clinic, self._to_devices)
        self.bedside.patient_id = settings.bound_patient

    async def to_clinic(self, msg: dict):
        await self.rooms.broadcast("clinic", msg)

    async def _to_bound_app(self, msg: dict):
        await self.rooms.broadcast("app", msg, patient_id=self.settings.bound_patient)

    async def _to_devices(self, msg: dict):
        await self.rooms.broadcast("bedside", msg)

    async def start(self):
        if not self.store.patients():
            await asyncio.to_thread(self.seed, self.settings.seed)
        else:
            await asyncio.to_thread(self.recompute_all)
        await self.bedside.start()
        if self.settings.validation:
            self._tasks.append(asyncio.create_task(self._run_validation()))

    async def stop(self):
        for t in self._tasks:
            t.cancel()
        await self.bedside.stop()
        self.store.close()

    def lock(self, pid: str) -> asyncio.Lock:
        return self.locks.setdefault(pid, asyncio.Lock())

    def patient(self, pid: str) -> dict:
        p = self.store.patient(pid)
        if p is None:
            raise HubError(404, "unknown_patient", f"No patient with id {pid!r}")
        return p

    def privacy(self, pid: str) -> dict:
        return self.store.privacy(pid) or copy.deepcopy(views.DEFAULT_PRIVACY)

    def seed(self, seed: int) -> list[str]:
        roster = modules.fn["demo_roster"](seed=seed)
        self.store.reset()
        ids = []
        for item in roster:
            p = dict(item["patient"])
            privacy = p.pop("privacy", None) or copy.deepcopy(views.DEFAULT_PRIVACY)
            self.store.bulk(p, item.get("sessions") or [], item.get("daily") or [], privacy)
            ids.append(p["id"])
        self.summaries.clear()
        self.live.clear()
        self.recompute_all()
        return ids

    def recompute(self, pid: str) -> dict:
        p = self.patient(pid)
        args = (self.store.sessions(pid), self.store.daily(pid), views.now_day(p))
        try:
            analytics = modules.fn["analyze_patient"](*args)
        except Exception as e:
            cached = self.store.analytics(pid)
            if cached is None:
                raise
            log.exception("analyze_patient failed for %s, keeping the cached analytics", pid)
            return {**cached, "engine_error": f"{type(e).__name__}: {e}"}
        self.store.put_analytics(pid, analytics)
        return analytics

    def recompute_all(self):
        for p in self.store.patients():
            try:
                self.recompute(p["id"])
            except Exception:
                log.exception("analytics failed for %s", p["id"])

    def analytics(self, pid: str) -> dict:
        p = self.patient(pid)
        a = self.store.analytics(pid)
        if a is None or a.get("now_day") != views.now_day(p):
            a = self.recompute(pid)
        return a

    def row(self, pid: str, analytics: dict | None = None) -> dict:
        p = self.patient(pid)
        return views.patient_row(p, analytics or self.analytics(pid), self.store.sessions(pid), self.flags(pid),
                                 pid in self.live)

    def rows(self) -> list[dict]:
        out = []
        for p in self.store.patients():
            try:
                out.append(self.row(p["id"]))
            except Exception:
                log.exception("row failed for %s", p["id"])
        return views.sort_rows(out)

    def patients_list(self) -> dict:
        rows = self.rows()
        ps = self.store.patients()
        nd = views.now_day(ps[0]) if ps else 0
        return {"now_day": nd, "date": views.day_date(ps[0], nd).isoformat() if ps else None,
                "simulated": any(p.get("simulated", True) for p in ps), "patients": rows}

    def task_weights(self, pid: str) -> dict:
        try:
            return modules.fn["task_weights"](self.store.sessions(pid))
        except Exception:
            log.exception("task_weights failed for %s", pid)
            return (self.analytics(pid).get("bandit") or {}).get("weights") or {}

    def config(self, pid: str) -> dict:
        p = self.patient(pid)
        return views.config_message(p, self.analytics(pid), self.task_weights(pid), self.privacy(pid),
                                    self.bedside.dawn_level)

    def patient_detail(self, pid: str) -> dict:
        p = self.patient(pid)
        sessions = self.store.sessions(pid)
        return {
            "patient": {**p, "now_day": views.now_day(p)},
            "privacy": self.privacy(pid),
            "latest_session": sessions[-1] if sessions else None,
            "sessions": [views.compact_session(s) for s in sessions],
            "daily": self.store.daily(pid),
        }

    def patient_view(self, pid: str) -> dict:
        p = self.patient(pid)
        return views.patient_view(p, self.privacy(pid), self.store.sessions(pid), self.store.daily(pid),
                                  self.analytics(pid))

    async def broadcast_analytics(self, pid: str, analytics: dict):
        await self.to_clinic({"type": "analytics_updated", "patient_id": pid, "row": self.row(pid, analytics),
                              "analytics": analytics})

    def _today_daily(self, pid: str, day: int, session: dict) -> dict:
        rec = self.store.daily_day(pid, day)
        if rec is None:
            p = self.patient(pid)
            date = views.day_date(p, day)
            bs = self.bedside.state
            bound = pid == self.settings.bound_patient
            temps = self.bedside.counters["temps"]
            sim = bool(session.get("simulated")) or self.bedside.state["simulated"]
            rec = {
                "schema": "afferent.daily/1", "patient_id": pid, "day_index": day, "date": date.isoformat(),
                "weekday": date.weekday(), "simulated": sim,
                "simulated_fields": ["room", "presence", "knob_uses"] if bound and bs["simulated"] else [],
                "day_complete": False,
                "sleep": {"time_in_bed_h": None, "sleep_onset_h": None, "wake_time_h": None,
                          "restlessness_events": bs["presence"]["motion_events_tonight"] if bound else None},
                "morning_pulse_bpm": None, "morning_pulse_quality": None,
                "room": {"temp_c_mean": round(sum(temps) / len(temps), 1) if bound and temps else None,
                         "temp_c_night": None, "humidity_pct": bs["thermo"]["humidity_pct"] if bound else None},
                "knob_uses": self.bedside.counters["knob_uses"] if bound else None,
                "played": False, "declined": False, "missed": False, "session_time_h": None, "session_ids": [],
            }
        rec = copy.deepcopy(rec)
        status = session.get("status")
        if status in views.PLAYED:
            rec["played"] = True
            rec["missed"] = False
        elif status == "declined" and not rec.get("played"):
            rec["declined"] = True
        if session.get("local_hour") is not None:
            rec["session_time_h"] = round(float(session["local_hour"]), 2)
        ids = list(rec.get("session_ids") or [])
        if session["session_id"] not in ids:
            ids.append(session["session_id"])
        rec["session_ids"] = ids
        return rec

    async def ingest_session(self, doc: dict) -> dict:
        if not isinstance(doc, dict):
            raise HubError(400, "bad_request", "Body must be a JSON object")
        doc = {k: v for k, v in doc.items() if k != "type"}
        errs = schema_errors(self.session_v, doc)
        if errs:
            raise HubError(422, "schema_invalid", "; ".join(errs))
        pid = doc["patient_id"]
        self.patient(pid)
        async with self.lock(pid):
            existing = self.store.session(doc["session_id"])
            if existing is not None:
                a = self.store.analytics(pid) or {}
                return {"ok": True, "duplicate": True, "session_id": doc["session_id"], "patient_id": pid,
                        "day_index": existing.get("day_index"), "state": a.get("state"),
                        "composite": (a.get("composite") or {}).get("value"),
                        "composite_before": (a.get("composite") or {}).get("value")}
            if doc.get("day_index") is None:
                doc["day_index"] = views.now_day(self.patient(pid))
            before = ((self.store.analytics(pid) or {}).get("composite") or {}).get("value")
            self.store.add_session(doc)
            rec = self._today_daily(pid, doc["day_index"], doc)
            daily_errs = schema_errors(self.daily_v, rec)
            if daily_errs:
                log.warning("daily record for %s day %s invalid: %s", pid, doc["day_index"], daily_errs)
            self.store.put_daily(rec)
            analytics = await asyncio.to_thread(self.recompute, pid)
        if self.live.get(pid) == doc["session_id"]:
            self.live.pop(pid, None)
        if pid == self.settings.bound_patient:
            await self.bedside.session_ended(doc.get("status"))
        if (doc.get("core") or {}).get("mood_start") == 1 and doc.get("mood_end") == 1:
            await self.add_flag(pid, "low_mood_twice", "mood", session_id=doc["session_id"])
        await self.to_clinic(views.session_added(doc))
        await self.broadcast_analytics(pid, analytics)
        return {"ok": True, "duplicate": False, "session_id": doc["session_id"], "patient_id": pid,
                "day_index": doc["day_index"], "state": analytics.get("state"),
                "composite": (analytics.get("composite") or {}).get("value"), "composite_before": before}

    async def ingest_daily(self, rec: dict) -> dict:
        if not isinstance(rec, dict):
            raise HubError(400, "bad_request", "Body must be a JSON object")
        errs = schema_errors(self.daily_v, rec)
        if errs:
            raise HubError(422, "schema_invalid", "; ".join(errs))
        pid = rec["patient_id"]
        self.patient(pid)
        async with self.lock(pid):
            self.store.put_daily(rec)
            analytics = await asyncio.to_thread(self.recompute, pid)
        await self.to_clinic({"type": "daily_added", "patient_id": pid, "day_index": rec["day_index"]})
        await self.broadcast_analytics(pid, analytics)
        return {"ok": True, "patient_id": pid, "day_index": rec["day_index"], "state": analytics.get("state"),
                "composite": (analytics.get("composite") or {}).get("value")}

    async def add_flag(self, pid: str, ftype: str, source: str, session_id: str | None = None, t_iso=None):
        flags = self.store.flags(pid)
        if session_id and any(f.get("session_id") == session_id and f["type"] == ftype for f in flags):
            return
        if not session_id and flags and flags[0]["type"] == ftype and flags[0].get("_t", 0) > time.time() - 60:
            return
        if session_id and any(f["type"] == ftype and not f.get("session_id") and f.get("_t", 0) > time.time() - 900
                              for f in flags):
            return
        flag = {"type": ftype, "t_iso": t_iso or views.now_iso(), "source": source}
        stored = {**flag, "_t": time.time(), **({"session_id": session_id} if session_id else {})}
        self.store.add_flag(pid, stored)
        await self.to_clinic({"type": "crisis_flag", "patient_id": pid, "flag_type": ftype, "source": source,
                              "t_iso": flag["t_iso"]})
        await self.to_clinic({"type": "analytics_updated", "patient_id": pid, "row": self.row(pid),
                              "analytics": self.analytics(pid)})

    def flags(self, pid: str) -> list[dict]:
        return [{k: v for k, v in f.items() if k in ("type", "t_iso", "source")} for f in self.store.flags(pid)]

    async def clear_flags(self, pid: str):
        self.patient(pid)
        self.store.clear_flags(pid)
        await self.to_clinic({"type": "analytics_updated", "patient_id": pid, "row": self.row(pid),
                              "analytics": self.analytics(pid)})

    async def set_privacy(self, pid: str, change: dict) -> dict:
        self.patient(pid)
        privacy = self.privacy(pid)
        if "sharing" in change:
            if change["sharing"] not in SHARING:
                raise HubError(400, "bad_request", f"sharing must be one of {', '.join(SHARING)}")
            privacy["sharing"] = change["sharing"]
        elif "sensor" in change:
            if change["sensor"] not in SENSOR_IDS:
                raise HubError(400, "bad_request", f"unknown sensor {change['sensor']!r}")
            privacy.setdefault("sensors", {})[change["sensor"]] = bool(change.get("on"))
        else:
            raise HubError(400, "bad_request", "Body needs 'sensor' and 'on', or 'sharing'")
        self.store.put_privacy(pid, privacy)
        if pid == self.settings.bound_patient:
            if change.get("sensor") == "bedside_camera":
                await self.bedside.set_camera(bool(change.get("on")))
            if change.get("sensor") == "bedside_light" and not change.get("on"):
                await self.bedside.set_light("#000000", 0, 1500, "privacy")
        await self.to_clinic({"type": "privacy", "patient_id": pid, "privacy": privacy})
        await self.rooms.broadcast("app", {"type": "privacy", "privacy": privacy}, patient_id=pid)
        return privacy

    async def reset(self, seed: int | None = None) -> dict:
        seed = self.settings.seed if seed is None else int(seed)
        ids = await asyncio.to_thread(self.seed, seed)
        if isinstance(self.bedside.source, BedsideSimulator):
            await self.bedside.replace_source(make_source(self.settings))
        await self.bedside.reset()
        await self.to_clinic({"type": "demo_reset"})
        await self.rooms.broadcast("app", {"type": "demo_reset"})
        for pid in ids:
            await self.broadcast_analytics(pid, self.analytics(pid))
        nd = views.now_day(self.patient(ids[0])) if ids else 0
        return {"ok": True, "patients": ids, "now_day": nd}

    async def send_profile(self, pid: str, profile: str) -> int:
        if profile not in ("good_day", "bad_day", "live"):
            raise HubError(400, "bad_request", "profile must be good_day, bad_day or live")
        self.patient(pid)
        return await self.rooms.broadcast("app", {"type": "profile", "profile": profile}, patient_id=pid)

    async def summary(self, pid: str, refresh: bool = False) -> dict:
        p = self.patient(pid)
        analytics = self.analytics(pid)
        patient = {**p, "now_day": views.now_day(p)}
        try:
            numbers = modules.fn["summary_numbers"](analytics, patient)
        except Exception:
            log.exception("summary_numbers failed")
            numbers = {}
        key = (pid, hashlib.sha1(json.dumps(numbers, sort_keys=True, default=str).encode()).hexdigest())
        if not refresh and key in self.summaries:
            return self.summaries[key]
        try:
            out = await asyncio.to_thread(modules.fn["weekly_summary"], analytics, patient)
        except Exception as e:
            log.exception("weekly_summary failed")
            raise HubError(400, "summary_failed", str(e))
        nd = analytics.get("now_day", patient["now_day"])
        result = {
            "patient_id": pid, "week_start_day": max(0, nd - 6), "week_end_day": nd, "generated_iso": views.now_iso(),
            "text": out.get("text"), "source": out.get("source", "template"), "model": out.get("model"),
            "numbers": numbers, "simulated": bool(p.get("simulated", True)), "disclaimer": DISCLAIMER,
        }
        self.summaries[key] = result
        return result

    async def gemma(self) -> dict:
        if self._gemma and time.monotonic() - self._gemma[0] < 30:
            return self._gemma[1]
        status = {"available": False, "model": None}
        try:
            async with httpx.AsyncClient(timeout=0.8) as c:
                r = await c.get(f"{self.settings.ollama_url}/api/tags")
                names = [m.get("name", "") for m in r.json().get("models", [])]
            pick = self.settings.gemma_model
            if not pick:
                for prefix in ("gemma3n", "gemma3", "gemma"):
                    pick = next((n for n in names if n.startswith(prefix)), None)
                    if pick:
                        break
            status = {"available": bool(pick and (pick in names or self.settings.gemma_model)), "model": pick}
        except Exception:
            pass
        self._gemma = (time.monotonic(), status)
        return status

    async def health(self) -> dict:
        snap = self.bedside.snapshot()
        return {"ok": True, "version": VERSION, "now_iso": views.now_iso(), "patients": len(self.store.patients()),
                "bedside": {"source": snap["source"], "connected": snap["connected"]}, "gemma": await self.gemma()}

    def _validation_key(self) -> str:
        h = hashlib.sha1(str(self.settings.validation_seeds).encode())
        base = Path(__file__).resolve().parent
        for f in sorted(list((base / "analytics").glob("*.py")) + [base / "synthetic.py"]):
            if f.exists():
                h.update(f.read_bytes())
        return h.hexdigest()

    async def _run_validation(self):
        cache = Path(self.settings.db).with_name("validation_cache.json")
        key = self._validation_key()
        try:
            cached = json.loads(cache.read_text())
            if cached.get("key") == key:
                self.validation, self.validation_status = cached["result"], "ready"
                return
        except Exception:
            pass
        self.validation_status = "computing"
        try:
            loop = asyncio.get_running_loop()
            with ProcessPoolExecutor(max_workers=1) as pool:
                result = await loop.run_in_executor(pool, modules.fn["run_validation"], self.settings.validation_seeds)
            self.validation, self.validation_status = result, "ready"
            cache.write_text(json.dumps({"key": key, "result": result}))
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("validation failed")
            self.validation_status = f"failed: {e}"

    async def handle_app(self, client: Client, msg: dict):
        t = msg.get("type")
        pid = client.patient_id or msg.get("patient_id") or self.settings.bound_patient
        if t == "hello":
            client.patient_id = msg.get("patient_id") or client.patient_id or self.settings.bound_patient
            client.role, client.device_id = msg.get("role"), msg.get("device_id")
            await self.rooms.send(client, self.config(client.patient_id))
        elif t == "ping":
            await self.rooms.send(client, {"type": "pong"})
        elif t == "session_start":
            pid = msg.get("patient_id") or pid
            client.patient_id, client.session_id = pid, msg.get("session_id")
            self.patient(pid)
            self.live[pid] = msg.get("session_id")
            if pid == self.settings.bound_patient:
                self.bedside.set_session_active(True)
            await self.to_clinic({"type": "session_started", "patient_id": pid, "session_id": msg.get("session_id"),
                                  "profile": msg.get("profile"), "simulated": msg.get("simulated"),
                                  "t_iso": msg.get("t_iso") or views.now_iso()})
            await self.rooms.send(client, self.config(pid))
        elif t == "live_metrics":
            await self.to_clinic({**msg, "type": "live", "patient_id": msg.get("patient_id") or pid})
        elif t in RELAYED:
            await self.to_clinic({**msg, "patient_id": msg.get("patient_id") or pid})
        elif t == "light":
            if self.privacy(pid).get("sensors", {}).get("bedside_light", True) and pid == self.settings.bound_patient:
                level = msg.get("level") or 0
                hour = self.bedside.clock().hour
                if hour >= 21 or hour < 6:
                    level = min(level, self.bedside.tokens.get("quiet_night_cap", 25))
                await self.bedside.set_light(msg.get("rgb") or "#000000", level,
                                             msg.get("fade_ms") or 0, msg.get("reason") or "mode", hold_s=60)
        elif t == "session_end":
            doc = msg.get("session") if isinstance(msg.get("session"), dict) else msg
            sid = doc.get("session_id")
            try:
                res = await self.ingest_session(doc)
                ack = {"type": "ack", "session_id": sid, "ok": True, "duplicate": res["duplicate"],
                       "day_index": res["day_index"], "error": None}
            except HubError as e:
                ack = {"type": "ack", "session_id": sid, "ok": False, "duplicate": False, "day_index": None,
                       "error": f"{e.code}: {e.detail}"}
            if client.session_id == sid:
                client.session_id = None
            await self.rooms.send(client, ack)
            if ack["ok"]:
                await self.rooms.send(client, self.config(doc.get("patient_id") or pid))
        elif t == "privacy":
            change = {k: msg[k] for k in ("sensor", "on", "sharing") if k in msg}
            await self.set_privacy(msg.get("patient_id") or pid, change)
        elif t == "crisis":
            source = msg.get("source") or "talk_button"
            ftype = {"mood": "low_mood_twice", "weekly_checkin": "weekly_checkin"}.get(source, "talk_request")
            await self.add_flag(msg.get("patient_id") or pid, ftype, source, session_id=msg.get("session_id"),
                                t_iso=msg.get("t_iso"))

    async def app_closed(self, client: Client):
        pid, sid = client.patient_id, client.session_id
        if not sid or self.live.get(pid) != sid:
            return
        if any(c.session_id == sid for c in self.rooms.clients["app"] if c is not client):
            return
        self.live.pop(pid, None)
        if pid == self.settings.bound_patient:
            self.bedside.set_session_active(False)
        await self.to_clinic({"type": "session_interrupted", "patient_id": pid, "session_id": sid})

    async def handle_bedside(self, client: Client, msg: dict):
        t = msg.get("type")
        if t == "hello":
            client.role = msg.get("device")
            if msg.get("device") in ("unoq", "simulator"):
                await self.bedside.on_event(msg)
            await self.rooms.send(client, {"type": "light", **self.bedside.state["light"]})
            await self.rooms.send(client, {"type": "camera", "on": self.bedside.state["camera_on"]})
        elif t == "pose":
            if self.bedside.state["camera_on"]:
                await self.to_clinic({**msg, "patient_id": msg.get("patient_id") or self.settings.bound_patient})
        elif t == "ping":
            await self.rooms.send(client, {"type": "pong"})
        else:
            await self.bedside.on_event(msg)
