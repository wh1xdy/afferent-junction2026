"""Optional push of posture minute aggregates to afferent-data-manager (jetson/data_manager).

Off unless DATA_MANAGER_URL is set (this is a laptop POC; nothing leaves the machine
by default). The values are the runtime's own: MinuteAggregator calls on_minute() with
the per-context percentiles of geometry.compute_frame_angles(), the same numbers it
writes to the local `minute` table — no parallel angle implementation here.

  trunk_inclination  -> posture.trunk_inclination_deg   trunk vs vertical
                                                        (valid: profile, ~3/4)
  head_trunk_angle   -> posture.head_trunk_angle_deg    head vs trunk
                                                        (valid: face, profile, ~3/4)

Standing filter: only minutes whose activity is standing or walking are sent. The
runtime's SituationTracker calls a frame sitting when a knee bends below 120 deg; the
hip-ankle span test is only a fallback when the knees are not visible (same rule as
capture/dataset/render_video.py).

The source encodes site and context, e.g. `posture/living-room/standing-profile`, so the
data manager keeps one daily aggregate per (room, activity, orientation): an angle is
only ever compared with itself in the same situation (plan §16-17, review P1).
p10 / p90 / n / versions travel in `meta`.
"""
from __future__ import annotations

import logging
import re
from typing import Callable

from .data_manager_client import DataManagerClient

_log = logging.getLogger("afferent.datasink")

METRICS = {
    "trunk_inclination": "posture.trunk_inclination_deg",
    "head_trunk_angle": "posture.head_trunk_angle_deg",
}
# Off-chair only: sitting, transition and unknown minutes stay local.
STANDING_ACTIVITIES = frozenset({"standing", "walking"})
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _slug(s: str | None) -> str:
    return _SAFE.sub("-", s or "unknown").strip("-")[:20] or "unknown"


class DataSink:
    def __init__(self, client, site_fn: Callable[[], str],
                 extractor_version: str = "", model_version: str = ""):
        self.client = client
        self.site_fn = site_fn
        self.extractor_version = extractor_version
        self.model_version = model_version

    @classmethod
    def from_config(cls, cfg, site_fn: Callable[[], str]) -> "DataSink | None":
        url = (getattr(cfg, "data_manager_url", "") or "").strip()
        if not url or url.lower() == "off":
            return None
        client = DataManagerClient(source="posture", url=url,
                                   token=getattr(cfg, "data_manager_token", "") or None)
        _log.info("posture minutes -> data manager at %s", url)
        return cls(client, site_fn, cfg.extractor_version, cfg.model_version)

    def source(self, activity: str, orientation: str) -> str:
        return f"posture/{_slug(self.site_fn())}/{_slug(activity)}-{_slug(orientation)}"

    def on_minute(self, ts_ms: int, activity: str, orientation: str, n_valid: int,
                  angles: dict) -> int:
        """Called by MinuteAggregator.flush for every context row. Returns samples queued."""
        if activity not in STANDING_ACTIVITIES:
            return 0
        src = self.source(activity, orientation)
        sent = 0
        for name, metric in METRICS.items():
            a = angles.get(name)
            if not a or a.get("med") is None:
                continue
            self.client.sample(
                metric, round(float(a["med"]), 2), ts=ts_ms + 30_000, source=src,
                meta={"p10": round(float(a["p10"]), 2), "p90": round(float(a["p90"]), 2),
                      "n": int(a.get("n", n_valid)), "activity": activity,
                      "orientation": orientation, "site": self.site_fn(),
                      "extractor": self.extractor_version, "model": self.model_version[:80]})
            sent += 1
        return sent

    def close(self):
        try:
            self.client.close()
        except Exception as e:
            _log.warning("data manager client close failed: %s", e)
