"""The hub as the patient's home box (jetson/home_hub): one real patient next to the demo roster.

    python -m uvicorn afferent_hub.home:create_home_app --factory --host 0.0.0.0 --port 8000

The patient the bedside is bound to (AFFERENT_BEDSIDE_PATIENT) is real here: created empty with
simulated false, and never given generated sessions or days. The demo roster is still seeded so the
clinic view has something to show, every one of them marked simulated; a roster patient with the
same id as the real one is left out. AFFERENT_HOME_DEMO_ROSTER=0 keeps the real patient only and
removes simulated patients that an earlier start left in the database.

Nothing about the real patient goes to the clinic view: the patient list, the clinic WebSocket and
every live message leave that patient out. The clinic sees the real patient only when the patient
shows the QR code. Who may reach the hub at all is in home_guard.py (hub token, origins, hosts).

Before the first session there is nothing to say about the real patient, so the analytics report
"Not enough data yet" instead of a state, the QR body carries no state, and no baseline pulse is
sent until one was measured. A list row counts as simulated when any of the patient's data is.

AFFERENT_DATA_MANAGER_URL=auto finds the data manager over mDNS on the Wendy Net mesh
(role=data-manager); until one is found the sensor routes answer that the module is off. A data
manager that answers is kept; another advert never replaces it. AFFERENT_DATA_MANAGER_DEVICE pins
the device (the first label of the advert's host name, device-<id>).
"""
import asyncio
import datetime as dt
import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from . import modules, views
from .analytics.features import PLAYED
from .db import TABLES, Store
from .home_guard import HomeGuard
from .main import create_app
from .service import Hub
from .settings import Settings
from .synthetic import demo_roster
from .team_adapters import Team

log = logging.getLogger("afferent.home")

DM_ROLE = "data-manager"
DM_AUTO = "auto"
DM_SEARCH_S = 2.0
DM_RECHECK_S = 15.0
DM_FAILS = 2

NO_DATA = "no_data"
NO_DATA_LABEL = "Not enough data yet"
NO_DATA_TEXT = "No session has been recorded yet, so there is nothing to compare."


def real_patient(settings: Settings, env=None, today: dt.date | None = None) -> dict:
    env = os.environ if env is None else env
    pid = settings.bound_patient
    start = env.get("AFFERENT_HOME_TMS_END") or (today or dt.date.today()).isoformat()
    dt.date.fromisoformat(start)
    return {"id": pid, "display_name": env.get("AFFERENT_HOME_PATIENT_NAME") or pid.capitalize(),
            "simulated": False, "tms_end_date": start}


def with_demo_roster(env=None) -> bool:
    env = os.environ if env is None else env
    return env.get("AFFERENT_HOME_DEMO_ROSTER", "1") != "0"


def home_roster(settings: Settings, env=None):
    with_demo = with_demo_roster(env)

    def roster(seed: int = 7, today: dt.date | None = None) -> list[dict]:
        real = {"patient": real_patient(settings, env, today), "sessions": [], "daily": []}
        demo = demo_roster(seed=seed, today=today) if with_demo else []
        return [real] + [r for r in demo if r["patient"]["id"] != settings.bound_patient]

    return roster


def drop_simulated(store: Store, keep: str) -> list[str]:
    gone = [p["id"] for p in store.patients() if p.get("simulated", True) and p["id"] != keep]
    for pid in gone:
        for table in TABLES:
            store._write(f"DELETE FROM {table} WHERE {'id' if table == 'patients' else 'patient_id'} = ?", (pid,))
    return gone


def ensure_real_patient(settings: Settings, env=None) -> None:
    store = Store(settings.db)
    try:
        if not store.patients():
            return
        if not with_demo_roster(env):
            gone = drop_simulated(store, settings.bound_patient)
            if gone:
                log.info("AFFERENT_HOME_DEMO_ROSTER=0: removed the simulated patients %s", ", ".join(gone))
        p = store.patient(settings.bound_patient)
        if p is None:
            store.put_patient(real_patient(settings, env))
            log.info("added the real patient %r to the existing database", settings.bound_patient)
        elif p.get("simulated", True):
            log.warning("patient %r in %s is a simulated one: what the bedside and the phone record for it "
                        "stays labelled simulated", settings.bound_patient, settings.db)
    finally:
        store.close()


def measured_rest_pulse(sessions: list[dict]) -> bool:
    for s in sessions:
        rest = (s.get("core") or {}).get("rest") or {}
        if rest.get("pulse_bpm") is not None and (rest.get("pulse_quality") or 0) >= 0.5:
            return True
    return False


def honest_analytics(analyze):
    """Nothing is claimed that was not measured: no state before the first played session, and no
    baseline pulse before a rest pulse of usable quality."""
    if getattr(analyze, "home_hub", False):
        return analyze

    def analyze_patient(sessions: list[dict], daily: list[dict], now_day: int) -> dict:
        a = analyze(sessions, daily, now_day)
        played = [s for s in sessions or [] if isinstance(s, dict) and s.get("status") in PLAYED]
        if not played:
            a["state"], a["state_label"] = NO_DATA, NO_DATA_LABEL
            a["suggestion"] = {"state": NO_DATA, "text": NO_DATA_TEXT, "reasons": []}
            a["cusum"] = {**(a.get("cusum") or {}), "state": NO_DATA, "state_label": NO_DATA_LABEL,
                          "value": None, "since_day": None, "history": []}
        if not measured_rest_pulse(played):
            a["director"] = {**(a.get("director") or {}), "baseline_pulse_bpm": None}
        return a

    analyze_patient.home_hub = True
    return analyze_patient


class HomeHub(Hub):
    @property
    def real(self) -> str:
        return self.settings.bound_patient

    async def to_clinic(self, msg: dict):
        if msg.get("patient_id") == self.real:
            return
        await super().to_clinic(msg)

    def row(self, pid: str, analytics: dict | None = None) -> dict:
        r = super().row(pid, analytics)
        r["simulated"] = bool(r["simulated"] or (analytics or self.analytics(pid)).get("simulated"))
        return r

    def rows(self) -> list[dict]:
        return views.sort_rows([r for r in super().rows() if r["id"] != self.real])

    def patients_list(self) -> dict:
        ps = [p for p in self.store.patients() if p["id"] != self.real]
        nd = views.now_day(ps[0]) if ps else 0
        return {"now_day": nd, "date": views.day_date(ps[0], nd).isoformat() if ps else None,
                "simulated": any(p.get("simulated", True) for p in ps), "patients": self.rows()}

    def qr_body(self, pid: str) -> dict:
        body = super().qr_body(pid)
        if self.analytics(pid).get("state") == NO_DATA:
            st = body["state"]
            st["cusum"], st["shown"] = None, st.get("phq_state")
            body["cusum"] = {**(body.get("cusum") or {}), "value": None, "history": []}
        return body

    def config(self, pid: str) -> dict:
        msg = super().config(pid)
        if (self.analytics(pid).get("director") or {}).get("baseline_pulse_bpm") is None:
            msg["baseline_pulse_bpm"] = None
        return msg

    def _today_daily(self, pid: str, day: int, session: dict) -> dict:
        rec = super()._today_daily(pid, day, session)
        if session.get("simulated"):
            fields = [f"session.{f}" for f in session.get("simulated_fields") or ["*"]]
            rec["simulated"] = True
            rec["simulated_fields"] = list(rec.get("simulated_fields") or []) + \
                [f for f in fields if f not in (rec.get("simulated_fields") or [])]
        return rec


async def answers(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as c:
            return (await c.get(url.rstrip("/") + "/health")).status_code == 200
    except (httpx.HTTPError, OSError):
        return False


def on_device(advert: dict, device: str) -> bool:
    label, device = str(advert.get("server") or "").lower().split(".")[0], device.lower()
    return not device or label in (device, "device-" + device)


async def follow_data_manager(client, resolver, device: str = "", alive=answers):
    """Sets client.url to a data manager that answers /health and leaves it alone while it does.

    The bearer token goes to whatever this picks, and an mDNS advert is not proof of identity: on a
    mesh with more than one data manager, pin the device.
    """
    device = (device or "").strip().rstrip(".")
    try:
        await resolver.start()
    except Exception as e:
        log.warning("data manager discovery could not start (%s: %s)", type(e).__name__, e)
        return
    fails, warned = 0, None
    try:
        while True:
            try:
                adverts = await resolver.adverts()
            except Exception as e:
                log.warning("data manager discovery failed (%s: %s)", type(e).__name__, e)
                adverts = []
            found = [a for a in adverts if on_device(a, device)]
            seen = sorted(f"{a['url']} on {a.get('server') or 'an unnamed host'}" for a in adverts)
            if (len(adverts) > 1 or len(found) < len(adverts)) and seen != warned:
                warned = seen
                log.warning("data manager adverts on the mesh: %s; %s", "; ".join(seen),
                            f"only {device} is used" if device else
                            "one that answers is kept, set AFFERENT_DATA_MANAGER_DEVICE to pin the device")
            if client.url:
                fails = 0 if await alive(client.url) else fails + 1
                if fails == DM_FAILS:
                    log.warning("data manager at %s does not answer; looking on the mesh again", client.url)
            if not client.url or fails >= DM_FAILS:
                for a in found:
                    url = a["url"].rstrip("/")
                    if url == client.url or not await alive(url):
                        continue
                    log.info("data manager found at %s on %s (mDNS role=%s)%s", url,
                             a.get("server") or "an unnamed host", DM_ROLE, f", was {client.url}" if client.url else "")
                    client.url, fails = url, 0
                    break
            await asyncio.sleep(DM_RECHECK_S if client.url and not fails else DM_SEARCH_S)
    finally:
        await resolver.stop()


def create_home_app(settings: Settings | None = None, env=None, dm_resolver=None) -> FastAPI:
    settings = settings or Settings.from_env()
    env = os.environ if env is None else env
    modules.fn["demo_roster"] = home_roster(settings, env)
    modules.fn["analyze_patient"] = honest_analytics(modules.fn["analyze_patient"])
    ensure_real_patient(settings, env)
    app = create_app(settings)
    dm_auto = settings.data_manager_url.strip().lower() == DM_AUTO

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.hub = HomeHub(settings)
        app.state.team = Team(settings)
        app.state.hub.sensors = app.state.team.sensors
        await app.state.hub.start()
        task = None
        if dm_auto:
            client = app.state.team.sensors.client
            client.url = None
            resolver = dm_resolver
            if resolver is None:
                from .bedside.unoq_auto import MdnsResolver

                resolver = MdnsResolver(DM_ROLE)
            task = asyncio.create_task(follow_data_manager(client, resolver,
                                                           env.get("AFFERENT_DATA_MANAGER_DEVICE") or ""))
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)
            await app.state.hub.stop()
            app.state.team.close()

    app.router.lifespan_context = lifespan
    app.add_middleware(HomeGuard, token=env.get("AFFERENT_HUB_TOKEN"), bedside=settings.bedside,
                       origins=env.get("AFFERENT_HUB_ORIGINS"), hosts=env.get("AFFERENT_HUB_HOSTS"))
    return app
