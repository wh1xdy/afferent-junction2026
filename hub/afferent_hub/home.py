"""The hub as the patient's home box (jetson/home_hub): one real patient next to the demo roster.

    python -m uvicorn afferent_hub.home:create_home_app --factory --host 0.0.0.0 --port 8000

The patient the bedside is bound to (AFFERENT_BEDSIDE_PATIENT) is real here: created empty with
simulated false, and never given generated sessions or days. The demo roster is still seeded so the
clinic view has something to show, every one of them marked simulated; a roster patient with the
same id as the real one is left out. AFFERENT_HOME_DEMO_ROSTER=0 seeds the real patient only.
POST /api/demo/reset is refused: it would erase what the real patient recorded.

AFFERENT_DATA_MANAGER_URL=auto finds the data manager over mDNS on the Wendy Net mesh
(role=data-manager, mesh publications only) and keeps following it; until one is found the sensor
routes answer that the module is off.
"""
import asyncio
import datetime as dt
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import modules
from .db import Store
from .main import create_app
from .settings import Settings
from .synthetic import demo_roster

log = logging.getLogger("afferent.home")

RESET_PATH = "/api/demo/reset"
DM_ROLE = "data-manager"
DM_AUTO = "auto"
DM_SEARCH_S = 2.0
DM_RECHECK_S = 15.0


def real_patient(settings: Settings, env=None, today: dt.date | None = None) -> dict:
    env = os.environ if env is None else env
    pid = settings.bound_patient
    start = env.get("AFFERENT_HOME_TMS_END") or (today or dt.date.today()).isoformat()
    dt.date.fromisoformat(start)
    return {"id": pid, "display_name": env.get("AFFERENT_HOME_PATIENT_NAME") or pid.capitalize(),
            "simulated": False, "tms_end_date": start}


def home_roster(settings: Settings, env=None):
    env = os.environ if env is None else env
    with_demo = env.get("AFFERENT_HOME_DEMO_ROSTER", "1") != "0"

    def roster(seed: int = 7, today: dt.date | None = None) -> list[dict]:
        real = {"patient": real_patient(settings, env, today), "sessions": [], "daily": []}
        demo = demo_roster(seed=seed, today=today) if with_demo else []
        return [real] + [r for r in demo if r["patient"]["id"] != settings.bound_patient]

    return roster


def ensure_real_patient(settings: Settings, env=None) -> None:
    store = Store(settings.db)
    try:
        if not store.patients():
            return
        p = store.patient(settings.bound_patient)
        if p is None:
            store.put_patient(real_patient(settings, env))
            log.info("added the real patient %r to the existing database", settings.bound_patient)
        elif p.get("simulated", True):
            log.warning("patient %r in %s is a simulated one: what the bedside and the phone record for it "
                        "stays labelled simulated", settings.bound_patient, settings.db)
    finally:
        store.close()


async def follow_data_manager(client, resolver):
    try:
        await resolver.start()
    except Exception as e:
        log.warning("data manager discovery could not start (%s: %s)", type(e).__name__, e)
        return
    try:
        while True:
            try:
                url = await resolver.resolve()
            except Exception as e:
                log.warning("data manager discovery failed (%s: %s)", type(e).__name__, e)
                url = None
            if url and url.rstrip("/") != client.url:
                client.url = url.rstrip("/")
                log.info("data manager found at %s (mDNS role=%s)", client.url, DM_ROLE)
            await asyncio.sleep(DM_RECHECK_S if client.url else DM_SEARCH_S)
    finally:
        await resolver.stop()


def create_home_app(settings: Settings | None = None, env=None, dm_resolver=None) -> FastAPI:
    settings = settings or Settings.from_env()
    modules.fn["demo_roster"] = home_roster(settings, env)
    ensure_real_patient(settings, env)
    app = create_app(settings)

    @app.middleware("http")
    async def keep_real_data(request: Request, call_next):
        if request.url.path.rstrip("/") == RESET_PATH:
            return JSONResponse({"error": "reset_disabled",
                                 "detail": "The home hub holds a real patient's data; the demo reset is off here"},
                                status_code=403)
        return await call_next(request)

    if settings.data_manager_url.strip().lower() == DM_AUTO:
        hub_lifespan = app.router.lifespan_context

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            async with hub_lifespan(app):
                client = app.state.team.sensors.client
                client.url = None
                resolver = dm_resolver
                if resolver is None:
                    from .bedside.unoq_auto import MdnsResolver

                    resolver = MdnsResolver(DM_ROLE)
                task = asyncio.create_task(follow_data_manager(client, resolver))
                try:
                    yield
                finally:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

        app.router.lifespan_context = lifespan

    return app
