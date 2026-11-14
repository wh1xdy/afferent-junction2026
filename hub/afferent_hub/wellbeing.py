"""Daily wellbeing read for the voice companion.

Once a day the phone asks the hub (ws `voice_context`, or GET /api/patients/{pid}/wellbeing)
how its patient seems to be doing. The hub answers with a level — ok / watch / bad — derived
from its own analytics and questionnaire check-ins. When the level is bad it also gathers
short facts from the data manager (presence at home, outings, visitors), so the companion
can gently raise them and suggest the person talks to their doctor — facts, not diagnoses.
"""
import logging

log = logging.getLogger("afferent.wellbeing")

BAD_STATES = {"check_in", "booster"}
WATCH_STATES = {"watch"}
BAD_BANDS = {"moderate", "moderately_severe", "severe"}
WATCH_BANDS = {"mild"}

FACT_MAX = 8          # at most this many facts reach the companion
WINDOW_DAYS = 14      # trends and visitors are read over two weeks
RECENT_DAYS = 7       # daily coverage counts over one week


def indicator(analytics: dict, phq: dict) -> str:
    """ok / watch / bad from the hub's own data — works with the sensors off."""
    if analytics.get("state") in BAD_STATES or phq.get("band") in BAD_BANDS:
        return "bad"
    if (analytics.get("state") in WATCH_STATES or phq.get("band") in WATCH_BANDS
            or phq.get("overdue")):
        return "watch"
    return "ok"


def hub_facts(analytics: dict, phq: dict) -> list[str]:
    """Facts the hub already holds: practice attendance and the last questionnaire."""
    facts = []
    missed = (analytics.get("completeness") or {}).get("missed_7d")
    if isinstance(missed, (int, float)) and missed >= 3:
        facts.append(f"skipped the morning practice on {int(missed)} of the last 7 days")
    if phq.get("band") in BAD_BANDS:
        facts.append("their last check-in questionnaire suggested they have been having a harder time lately")
    return facts


def _safe(call, *args):
    try:
        return call(*args)
    except Exception as e:
        log.info("data manager read skipped: %s", e)
        return None


def _daily(get, metric: str, days: int) -> list[dict]:
    res = _safe(get, "daily", {"metric": metric, "from": f"-{days}d"})
    return (res or {}).get("days") or []


def _trend(get, metric: str, days: int) -> str | None:
    res = _safe(get, "trend", {"metric": metric, "from": f"-{days}d"})
    return ((res or {}).get("mann_kendall") or {}).get("trend")


def sensor_facts(get) -> list[str]:
    """Facts read from the data manager: time at home, outings, visitors.

    `get` is SensorSource.get(endpoint, params). Every read is best-effort: a sensor
    that is off or down only means fewer facts, never an error for the phone.
    """
    facts = []
    outings = [d for d in _daily(get, "presence.outing", RECENT_DAYS) if not d.get("partial_day")]
    home = [d for d in _daily(get, "presence.home", RECENT_DAYS) if not d.get("partial_day")]
    if len(outings) >= 3:
        quiet = sum(1 for d in outings if not d.get("occurrences"))
        if quiet:
            facts.append(f"went outside on {len(outings) - quiet} of the last {len(outings)} days")
    if _trend(get, "presence.outing", WINDOW_DAYS) == "decreasing":
        facts.append("outings have been getting shorter over the last two weeks")
    if len(home) >= 3:
        inside = sum(1 for d in home if (d.get("share_of_day") or 0) >= 0.95)
        if inside:
            facts.append(f"stayed home nearly all day on {inside} of the last {len(home)} days")
    res = _safe(get, "events", {"kind": "presence.guest_visit", "from": f"-{WINDOW_DAYS}d"})
    if res is not None and not res.get("events") and (outings or home):
        facts.append("no visitors recorded in the last two weeks")
    return facts[:FACT_MAX]
