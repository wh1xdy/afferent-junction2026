"""FastAPI service — the on-demand trigger surface.

Runs lightweight (no model resident). Two ways to start a batch:
- POST /analyze        — manual/API trigger, returns 202 while running
- the nightly loop     — fires inside schedule.window when the vision app
                         is idle/unreachable (see scheduler.py)

Endpoints:
    GET  /                  dashboard (web/index.html)
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
import json
import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .backend import make_backend
from .config import load
from .models import ModelFetcher
from .pipeline import Runner
from .scheduler import nightly_loop
from .store import Store
from . import transcript

logger = logging.getLogger(__name__)

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


class AnalyzeRequest(BaseModel):
    rescore: bool = False


def create_app(cfg_path: str | None = None) -> FastAPI:
    cfg = load(cfg_path or os.environ.get("ANALYZER_CONFIG"))
    app = FastAPI(title="afferent transcript analyzer", version="0.1.0")
    fetcher = ModelFetcher(cfg.model) if cfg.model.backend == "llamaserver" else None
    runner = Runner(cfg, make_backend(cfg.model), fetcher=fetcher)
    app.state.cfg = cfg
    app.state.runner = runner
    app.state.fetcher = fetcher

    @app.on_event("startup")
    async def _startup() -> None:
        if (fetcher is not None and cfg.model.auto_fetch
                and not fetcher.ready):
            fetcher.fetch()
        app.state.scheduler_task = asyncio.create_task(
            nightly_loop(cfg, runner))

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        app.state.scheduler_task.cancel()

    @app.get("/", include_in_schema=False)
    async def index_page() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

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
        reason = runner.preflight()
        if reason:
            raise HTTPException(409, reason)
        asyncio.get_running_loop().create_task(
            asyncio.to_thread(runner.run_batch_locked, req.rescore))
        return {"status": "started", "rescore": req.rescore}

    @app.post("/models/fetch")
    async def fetch_model() -> JSONResponse:
        if fetcher is None:
            raise HTTPException(409, "model fetching requires llamaserver backend")
        state = fetcher.status()["state"]
        if state == "downloading":
            raise HTTPException(409, "model download is already running")
        if fetcher.ready:
            return JSONResponse({"model": fetcher.status()}, status_code=200)
        if not fetcher.fetch():
            raise HTTPException(409, "model download is already running")
        return JSONResponse({"model": fetcher.status()}, status_code=202)

    @app.post("/transcripts")
    async def ingest_transcripts(request: Request) -> dict:
        content_type = request.headers.get("content-type", "")
        media_type = content_type.split(";", 1)[0].strip().lower()
        body = await request.body()
        entries: list[tuple[int, object, str | None]] = []
        if media_type == "application/json":
            try:
                payload = json.loads(body)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                entries.append((0, None, str(exc)))
            else:
                if isinstance(payload, dict):
                    entries = [(0, payload, None)]
                elif isinstance(payload, list):
                    entries = [(i, row, None) for i, row in enumerate(payload)]
                else:
                    entries = [(0, payload, "body must be a JSON object or list")]
        elif media_type in ("text/plain", "application/x-ndjson"):
            for i, line in enumerate(body.decode("utf-8", "replace").splitlines()):
                if line.strip():
                    try:
                        entries.append((i, json.loads(line), None))
                    except json.JSONDecodeError as exc:
                        entries.append((i, None, str(exc)))
        else:
            raise HTTPException(415, "use application/json or JSONL content type")

        accepted: list[object] = []
        rejected: list[dict[str, object]] = []
        for index, row, parse_error in entries:
            if parse_error is not None:
                rejected.append({"index": index, "reason": parse_error})
                continue
            try:
                transcript.parse_record(row, index)
            except Exception as exc:
                rejected.append({"index": index, "reason": str(exc)})
            else:
                accepted.append(row)

        if accepted:
            destination = (cfg.transcripts_dir
                           / f"ingest-{datetime.now().date().isoformat()}.jsonl")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("a", encoding="utf-8") as output:
                for row in accepted:
                    output.write(json.dumps(row, ensure_ascii=False) + "\n")
        return {"accepted": len(accepted), "rejected": rejected}

    @app.get("/scores")
    async def scores(day: str, persona: str | None = None) -> dict:
        with Store(cfg.db_path) as store:
            out = store.day_scores(day, persona)
        if out is None:
            raise HTTPException(404, f"no aggregates for day {day!r}")
        return out

    @app.get("/days")
    async def days(persona: str | None = None) -> dict:
        with Store(cfg.db_path) as store:
            return {"days": store.days(persona)}

    @app.get("/index")
    async def index(day: str | None = None,
                    persona: str | None = None) -> dict:
        with Store(cfg.db_path) as store:
            d = day or (store.days(persona, limit=1) or [None])[0]
            if d is None:
                raise HTTPException(404, "no scored days yet")
            out = store.drift_index(d, persona, cfg.baseline_days)
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
