"""Nightly-window scheduling + vision-idle probe.

Two trigger paths share the same Runner:
- the async loop below fires inside cfg.schedule.window when the vision app
  is idle (or unreachable — stopped means free memory);
- POST /analyze on the API fires immediately, whatever the schedule.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, time as dtime

import httpx

from .config import Config
from .pipeline import Runner
from .store import Store

logger = logging.getLogger(__name__)


def _parse_hhmm(s: str) -> dtime:
    return dtime(int(s[:2]), int(s[3:5]))


def in_window(now: dtime, spec: str) -> bool:
    """`spec` = 'HH:MM-HH:MM', may wrap midnight ('22:00-06:00')."""
    start_s, _, end_s = spec.partition("-")
    start, end = _parse_hhmm(start_s), _parse_hhmm(end_s)
    if start <= end:
        return start <= now < end
    return now >= start or now < end


async def vision_idle(urls: list[str], timeout: float = 3.0) -> bool:
    """True when no probe URL reports an active app. An unreachable app means
    stopped — which is exactly when the analyzer may take the memory."""
    if not urls:
        return True
    async with httpx.AsyncClient(timeout=timeout) as client:
        for url in urls:
            try:
                r = await client.get(url)
                if r.status_code < 500:
                    logger.info("vision probe %s alive (HTTP %d) — deferring",
                                url, r.status_code)
                    return False
            except httpx.HTTPError:
                continue        # unreachable = stopped = idle
    return True


def _today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


async def nightly_loop(cfg: Config, runner: Runner) -> None:
    """Fire-and-forget scheduler task; exits only if the app does."""
    if not cfg.schedule.window:
        logger.info("schedule.window empty — nightly loop disabled")
        return
    logger.info("nightly loop armed: window=%s once_per_day=%s",
                cfg.schedule.window, cfg.schedule.once_per_day)
    while True:
        now = datetime.now()
        try:
            if not in_window(now.time(), cfg.schedule.window):
                await asyncio.sleep(cfg.schedule.poll_seconds)
                continue
            if runner.running:
                await asyncio.sleep(cfg.schedule.poll_seconds)
                continue
            if cfg.schedule.once_per_day:
                with Store(cfg.db_path) as store:
                    if store.get_meta("last_scheduled_day") == _today():
                        await asyncio.sleep(cfg.schedule.poll_seconds)
                        continue
            if not await vision_idle(cfg.schedule.vision_probe_urls):
                await asyncio.sleep(cfg.schedule.poll_seconds)
                continue
            logger.info("night window + vision idle: starting scheduled batch")
            result = await asyncio.to_thread(runner.run_batch_locked)
            with Store(cfg.db_path) as store:
                store.set_meta("last_scheduled_day", _today())
            logger.info("scheduled batch done: %s", result)
        except Exception:
            logger.exception("nightly loop iteration failed")
        await asyncio.sleep(cfg.schedule.poll_seconds)
