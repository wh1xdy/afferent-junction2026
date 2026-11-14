from .loader import dm_client

READ = ("info", "metrics", "latest", "samples", "series", "daily", "stats", "trend", "baseline", "profile",
        "correlation", "events", "summary")
ROOM = {"env.temperature_c": "temp_c_mean", "env.humidity_pct": "humidity_pct"}
FINGERS = ("modulino-hub/finger1", "modulino-hub/finger2")


class SensorError(Exception):
    def __init__(self, msg: str, status: int | None = None):
        super().__init__(msg)
        self.status = status


class SensorSource:
    def __init__(self, url: str, token: str | None = None):
        self.client = None
        if url and url.strip().lower() not in ("off", "0", "false", "no", "disabled"):
            self.client = dm_client().DataManagerClient(source="afferent-hub", url=url, token=token)

    @property
    def enabled(self) -> bool:
        return bool(self.client and self.client.enabled and self.client.url)

    def close(self):
        if self.client:
            self.client.close()

    def get(self, name: str, params: dict) -> dict:
        if name not in READ:
            raise SensorError(f"unknown sensor endpoint {name!r}", 404)
        params = {k: v for k, v in params.items() if k not in ("path", "timeout_s")}
        try:
            res = self.client.get(f"/api/v1/{name}", **params)
        except dm_client().DataManagerError as e:
            raise SensorError(str(e), e.status) from None
        if name == "info" and isinstance(res, dict):
            res.pop("path", None)
        return res

    def room_daily(self, days: int) -> dict:
        by_day, tz = {}, None
        for metric, field in ROOM.items():
            res = self.get("daily", {"metric": metric, "from": f"-{days}d"})
            tz = res.get("tz", tz)
            for r in res.get("days") or []:
                day = by_day.setdefault(r["day"], {"date": r["day"], "room": {f: None for f in ROOM.values()},
                                                   "hours_covered": {}})
                day["room"][field] = r.get("mean")
                day["hours_covered"][field] = r.get("hours_covered")
        return {"tz": tz, "days": [by_day[d] for d in sorted(by_day)]}

    def finger_readings(self, days: int) -> list[tuple]:
        out = []
        for source in FINGERS:
            rows = self.get("samples", {"metric": "vitals.heart_rate_bpm", "source": source, "order": "asc",
                                        "limit": 100000, "from": f"-{days}d"}).get("samples") or []
            out += [("finger_bpm", r["value"], r["ts"] / 1000, source) for r in rows]
        return out
