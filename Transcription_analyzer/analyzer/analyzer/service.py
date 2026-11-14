"""FastAPI service — the on-demand trigger surface.

Runs lightweight (no model resident). Two ways to start a batch:
- POST /analyze        — manual/API trigger, returns 202 while running
- the nightly loop     — fires inside schedule.window when the vision app
                         is idle/unreachable (see scheduler.py)

Endpoints:
    GET  /health            liveness
    GET  /status            running flag, backend, last run summary
    POST /analyze           start a batch now {"rescore": false}
    GET  /scores?day=       aggregated scores for one day
    GET  /days              days that have aggregates
    GET  /index?day=        baseline-deviation index (the product output)
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .backend import make_backend
from .config import load
from .pipeline import Runner
from .scheduler import nightly_loop
from .store import Store

logger = logging.getLogger(__name__)


class AnalyzeRequest(BaseModel):
    rescore: bool = False


def create_app(cfg_path: str | None = None) -> FastAPI:
    cfg = load(cfg_path or os.environ.get("ANALYZER_CONFIG"))
    app = FastAPI(title="afferent transcript analyzer", version="0.1.0")
    runner = Runner(cfg, make_backend(cfg.model))
    app.state.cfg = cfg
    app.state.runner = runner

    @app.on_event("startup")
    async def _startup() -> None:
        app.state.scheduler_task = asyncio.create_task(
            nightly_loop(cfg, runner))

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        app.state.scheduler_task.cancel()

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/status")
    async def status() -> dict:
        return runner.status()

    @app.post("/analyze", status_code=202)
    async def analyze(req: AnalyzeRequest) -> dict:
        if runner.running:
            raise HTTPException(409, "a batch is already running")
        asyncio.get_running_loop().create_task(
            asyncio.to_thread(runner.run_batch_locked, req.rescore))
        return {"status": "started", "rescore": req.rescore}

    @app.get("/scores")
    async def scores(day: str) -> dict:
        with Store(cfg.db_path) as store:
            out = store.day_scores(day)
        if out is None:
            raise HTTPException(404, f"no aggregates for day {day!r}")
        return out

    @app.get("/days")
    async def days() -> dict:
        with Store(cfg.db_path) as store:
            return {"days": store.days()}

    @app.get("/index")
    async def index(day: str | None = None) -> dict:
        with Store(cfg.db_path) as store:
            d = day or (store.days(limit=1) or [None])[0]
            if d is None:
                raise HTTPException(404, "no scored days yet")
            out = store.drift_index(d, cfg.baseline_days)
        if out is None:
            raise HTTPException(404, f"no aggregates for day {d!r}")
        return out

    return app


app = create_app()


def main() -> None:
    import uvicorn
    p = argparse.ArgumentParser(description="transcript analyzer service")
    p.add_argument("--config", default=os.environ.get("ANALYZER_CONFIG"))
    p.add_argument("--host")
    p.add_argument("--port", type=int)
    args = p.parse_args()
    cfg = load(args.config)
    uvicorn.run(create_app(args.config),
                host=args.host or cfg.host,
                port=args.port or cfg.port)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
