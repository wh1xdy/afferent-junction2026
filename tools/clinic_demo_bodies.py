import datetime as dt
import json
import sys
import tempfile
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "hub"))

from afferent_hub import modules, synthetic, views
from afferent_hub.service import Hub
from afferent_hub.settings import Settings

TMS_END = {"anna": "2026-09-17", "juha": "2026-09-15", "mikko": "2026-09-11", "leena": "2026-09-08", "sofia": "2026-09-01"}
EXPORTS = [
    ("anna", "2026-11-12T09:42:00+02:00"),
    ("juha", "2026-11-10T14:05:00+02:00"),
    ("mikko", "2026-11-06T11:20:00+02:00"),
    ("leena", "2026-11-03T15:31:00+02:00"),
    ("anna", "2026-10-29T10:16:00+02:00"),
    ("sofia", "2026-10-27T09:07:00+02:00"),
]


def frozen(at: dt.datetime):
    class D(dt.date):
        @classmethod
        def today(cls):
            return at.date()

    class T(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return at if tz is None else at.astimezone(tz)

    return types.SimpleNamespace(date=D, datetime=T, timedelta=dt.timedelta, timezone=dt.timezone)


def patient(pid: str, seed: int, at: dt.datetime) -> list[dict]:
    i, (_, name, kind, onset, clock, pick) = next((i, r) for i, r in enumerate(synthetic.ROSTER) if r[0] == pid)
    start = dt.date.fromisoformat(TMS_END[pid])
    days = (at.date() - start).days
    return [synthetic.generate_patient(kind, days, seed * 1000 + i + pick * 10, patient_id=pid, display_name=name,
                                       onset_day=onset, start_date=start, clock=clock)]


def main():
    real, roster = views.dt, modules.fn["demo_roster"]
    out = []
    try:
        for pid, iso in EXPORTS:
            at = dt.datetime.fromisoformat(iso)
            views.dt = frozen(at)
            modules.fn["demo_roster"] = lambda seed: patient(pid, seed, at)
            with tempfile.TemporaryDirectory() as tmp:
                hub = Hub(Settings(db=str(Path(tmp) / "t.db"), bedside="off", validation=False))
                hub.seed(hub.settings.seed)
                name = hub.patient(pid)["display_name"]
                out.append({"label": name, "initial": name[0], "exported_iso": iso, "body": hub.qr_body(pid)})
    finally:
        views.dt, modules.fn["demo_roster"] = real, roster
    json.dump(out, sys.stdout)


if __name__ == "__main__":
    main()
