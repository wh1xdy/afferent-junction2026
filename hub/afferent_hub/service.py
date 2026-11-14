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

from . import export, modules, views
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
    if mode.startswith("unoq:"):
        # UNO Q HTTP API through `wendy net forward 18081:18080 --device 169.254.3.42:50052`
        from .bedside.unoq_http import UnoQHttp

        return UnoQHttp(mode.split(":", 1)[1])
    return NullSource("ws" if mode == "ws" else "off")


class Hub:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.store = Store(settings.db)
        self.rooms = Rooms()
        self.session_v = _validator("session.v3.schema.json")
        self.daily_v = _validator("daily.v1.schema.json")
        self.checkin_v = _validator("checkin.v1.schema.json")
        self.live: dict[str, str] = {}
        self.locks: dict[str, asyncio.Lock] = {}
        self.summaries: dict[tuple, dict] = {}
        self.validation: dict | None = None
        self.validation_status = "idle"
        self._gemma: tuple[float, dict] | None = None
        self._tasks: list[asyncio.Task] = []
        self._jobs: set[asyncio.Task] = set()
        self.bedside = Bedside(make_source(settings), self._to_bound_app, self.to_clinic, self._to_devices,
                               pulse_allowed=self._pulse_allowed)
        self.bedside.patient_id = settings.bound_patient

    def _pulse_allowed(self) -> bool:
        return bool(self.privacy(self.settings.bound_patient).get("sensors", {}).get("pulse_stone", True))

    async def _set_pulse_source(self, on: bool):
        # a source that can really switch the finger sensors off does so (I14); others only drop the data
        set_enabled = getattr(self.bedside.source, "set_enabled", None)
        if set_enabled is None:
            return
        try:
            await set_enabled(on)
        except Exception:
            log.exception("bedside source could not switch the pulse sensor %s", "on" if on else "off")

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
        if not self._pulse_allowed():
            await self._set_pulse_source(False)
        await self.bedside.start()
        if self.settings.validation:
            self._tasks.append(asyncio.create_task(self._run_validation()))

    async def stop(self):
        for t in self._tasks + list(self._jobs):
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
        privacy = self.store.privacy(pid) or copy.deepcopy(views.DEFAULT_PRIVACY)
        # `presence` is bed presence and no bed sensor exists (Alex A9): a row stored before that stays off too.
        privacy.setdefault("sensors", {})["presence"] = False
        return privacy

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

    def daily(self, pid: str) -> list[dict]:
        p = self.patient(pid)
        sessions, daily, pauses = self.store.sessions(pid), self.store.daily(pid), p.get("pauses") or []
        return views.annotate_daily(daily, views.streak(sessions, daily, views.now_day(p), pauses), pauses, p)

    def recompute(self, pid: str) -> dict:
        p = self.patient(pid)
        args = (self.store.sessions(pid), self.daily(pid), views.now_day(p))
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
        checkins = self.store.checkins(pid)
        return {
            "patient": {**p, "now_day": views.now_day(p)},
            "privacy": self.privacy(pid),
            "latest_session": sessions[-1] if sessions else None,
            "sessions": [views.compact_session(s) for s in sessions],
            "daily": self.daily(pid),
            "checkins": checkins,
            "phq": views.phq_block(p, checkins, views.now_day(p)),
        }

    def export(self, pid: str) -> tuple[str, bytes]:
        p = self.patient(pid)
        return export.build(p, self.store.sessions(pid), self.daily(pid), self.analytics(pid), self.store.checkins(pid))

    async def set_pause(self, pid: str, body: dict) -> dict:
        p = self.patient(pid)
        nd = views.now_day(p)
        source = body.get("source", "patient")
        if source not in views.PAUSE_SOURCES:
            raise HubError(400, "bad_request", f"source must be one of {', '.join(views.PAUSE_SOURCES)}")
        try:
            from_day = views.day_index(p, body["from"]) if body.get("from") else nd
            until_day = views.day_index(p, body["until"]) if body.get("until") else None
        except (TypeError, ValueError):
            raise HubError(400, "bad_request", "from and until must be dates YYYY-MM-DD")
        pauses = [q for q in p.get("pauses") or [] if q["source"] != source or q["until_day"] < from_day]
        for q in p.get("pauses") or []:
            if q["source"] == source and q["from_day"] < from_day <= q["until_day"]:
                pauses.append({**q, "until_day": from_day - 1})
        if until_day is not None:
            if until_day < from_day:
                raise HubError(400, "bad_request", "until is before from")
            if source == "patient":
                until_day = min(until_day, from_day + views.PATIENT_PAUSE_MAX_DAYS - 1)
            pauses.append({"source": source, "from_day": from_day, "until_day": until_day,
                           "set_iso": views.now_iso()})
        async with self.lock(pid):
            self.store.put_patient({**p, "pauses": sorted(pauses, key=lambda q: q["from_day"])})
            analytics = await asyncio.to_thread(self.recompute, pid)
        pause = views.current_pause(self.patient(pid), nd)
        await self.to_clinic({"type": "pause", "patient_id": pid, "pause": pause})
        await self.rooms.broadcast("app", {"type": "pause", "pause": pause}, patient_id=pid)
        await self.broadcast_analytics(pid, analytics)
        return {"ok": True, "pause": pause,
                "pauses": [{"source": q["source"], "from": views.day_date(p, q["from_day"]).isoformat(),
                            "until": views.day_date(p, q["until_day"]).isoformat()} for q in pauses]}

    def patient_view(self, pid: str) -> dict:
        p = self.patient(pid)
        return views.patient_view(p, self.privacy(pid), self.store.sessions(pid), self.daily(pid),
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

    async def add_flag(self, pid: str, ftype: str, source: str, session_id: str | None = None, t_iso=None,
                       extra: dict | None = None):
        flags = self.store.flags(pid)
        checkin_id = (extra or {}).get("checkin_id")
        if checkin_id and any(f.get("checkin_id") == checkin_id for f in flags):
            return
        if session_id and any(f.get("session_id") == session_id and f["type"] == ftype for f in flags):
            return
        if not checkin_id and not session_id and flags and flags[0]["type"] == ftype and flags[0].get("_t", 0) > time.time() - 60:
            return
        if session_id and any(f["type"] == ftype and not f.get("session_id") and f.get("_t", 0) > time.time() - 900
                              for f in flags):
            return
        flag = {"type": ftype, "t_iso": t_iso or views.now_iso(), "source": source, **(extra or {})}
        stored = {**flag, "_t": time.time(), **({"session_id": session_id} if session_id else {})}
        self.store.add_flag(pid, stored)
        await self.to_clinic({"type": "crisis_flag", "patient_id": pid, "flag_type": ftype,
                              **{k: v for k, v in flag.items() if k != "type"}})
        await self.to_clinic({"type": "analytics_updated", "patient_id": pid, "row": self.row(pid),
                              "analytics": self.analytics(pid)})

    async def ingest_checkin(self, doc: dict) -> dict:
        if not isinstance(doc, dict):
            raise HubError(400, "bad_request", "checkin must be a JSON object")
        errs = schema_errors(self.checkin_v, doc)
        if errs:
            raise HubError(422, "schema_invalid", "; ".join(errs))
        pid = doc["patient_id"]
        p = self.patient(pid)
        async with self.lock(pid):
            if self.store.checkin(doc["checkin_id"]) is not None:
                return {"ok": True, "duplicate": True, "checkin_id": doc["checkin_id"], "patient_id": pid}
            try:
                day = views.day_index(p, doc["started_iso"][:10])
            except (TypeError, ValueError):
                day = views.now_day(p)
            stored = {**doc, "day_index": day, "received_iso": views.now_iso()}
            self.store.add_checkin(stored)
        flag = views.safety_flag(stored)
        if flag:
            await self.add_flag(pid, flag["type"], flag["source"], t_iso=flag["t_iso"],
                                extra={k: flag[k] for k in ("checkin_id", "label", "screen") if k in flag})
        await self.to_clinic({"type": "checkin_added", "patient_id": pid, "checkin_id": doc["checkin_id"],
                              "status": doc.get("status"), "phq9_total": (doc.get("phq9") or {}).get("total")})
        return {"ok": True, "duplicate": False, "checkin_id": doc["checkin_id"], "patient_id": pid,
                "safety_flag": flag["type"] if flag else None}

    def flags(self, pid: str) -> list[dict]:
        keep = ("type", "t_iso", "source", "label", "checkin_id", "screen")
        return views.sort_flags([{k: v for k, v in f.items() if k in keep} for f in self.store.flags(pid)])

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
            if change.get("sensor") == "pulse_stone":
                on = bool(change.get("on"))
                if not on:
                    await self.bedside.clear_pulse()
                # the data stops here and now; the device is switched in the background because it
                # takes about a second and must not hold up the patient's toggle
                job = asyncio.create_task(self._set_pulse_source(on))
                self._jobs.add(job)
                job.add_done_callback(self._jobs.discard)
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
        analytics, patient = views.strip_safety(analytics), views.strip_safety(patient)
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
        elif t == "pause":
            try:
                await self.set_pause(msg.get("patient_id") or pid, {**msg, "source": "patient"})
            except HubError as e:
                log.warning("pause rejected: %s", e.detail)
        elif t == "checkin":
            doc = msg.get("checkin") if isinstance(msg.get("checkin"), dict) else {}
            cid = doc.get("checkin_id")
            if doc and not doc.get("patient_id"):
                doc = {**doc, "patient_id": msg.get("patient_id") or pid}
            try:
                res = await self.ingest_checkin(doc)
                ack = {"type": "ack", "checkin_id": cid, "ok": True, "duplicate": res["duplicate"], "error": None}
            except HubError as e:
                log.warning("checkin rejected: %s", e.detail)
                ack = {"type": "ack", "checkin_id": cid, "ok": False, "duplicate": False,
                       "error": f"{e.code}: {e.detail}"}
            await self.rooms.send(client, ack)
        elif t == "crisis":
            await self.add_flag(msg.get("patient_id") or pid, "talk_request", msg.get("source") or "talk_button",
                                session_id=msg.get("session_id"), t_iso=msg.get("t_iso"))

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
