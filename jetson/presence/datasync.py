"""Mirror presence state into afferent-data-manager as intervals.

  presence.home         patient at home: from the moment state became HOME until it left
                        HOME (AWAY is back-dated to the outing start; UNKNOWN = we could
                        not look, so that time counts as neither home nor away)
  presence.outing       every outing, open while away
  presence.guest_visit  every visit, value = peak number of guests

Stateless by design: each tick re-derives the recent intervals from the trackers and
sends only those that changed since the last send. Every interval has a stable id
(`home-<start>`, `outing-<start>`, `visit-<start>`), and the data manager upserts on
(source, kind, id), so a restart, a retry or a re-send never creates duplicates. Home
periods cannot be re-derived from the trackers, so the open one and the last few closes are
saved with them (to_dict / restore) and sent again after a restart.
"""
from __future__ import annotations

from core import HOME

RECENT = 5   # outings / visits re-checked every tick (older ones never change)
HOME_CLOSES = 5   # closed home periods kept for restore()


class PresenceSync:
    def __init__(self, client, source: str = "afferent-presence"):
        self.client = client
        self.source = source
        self._sent: dict[tuple[str, str], tuple] = {}   # (kind, id) -> (start, end, value)
        self._home_start: float | None = None
        # the last HOME_CLOSES home periods closed, (start, end, ended_by): saved (to_dict) and sent
        # again after a restart with their own end, since a close may have been lost from the queue
        self._closes: list[tuple[float, float, str | None]] = []

    def _send(self, kind: str, ident: str, start: float, end: float | None, value=None, meta=None):
        key, sig = (kind, ident), (round(start, 1), None if end is None else round(end, 1), value)
        if self._sent.get(key) == sig:
            return False
        self.client.interval(kind, start=start, end=end, value=value, id=ident, meta=meta,
                             source=self.source)
        self._sent[key] = sig
        if len(self._sent) > 500:                       # keep the memo small
            for k in list(self._sent)[:250]:
                del self._sent[k]
        return True

    def _close_home(self, start: float, end: float, ended_by: str | None = None) -> bool:
        self._closes = [c for c in self._closes if int(c[0]) != int(start)][-(HOME_CLOSES - 1):]
        self._closes.append((start, end, ended_by))
        return self._send("presence.home", f"home-{int(start)}", start, end,
                          meta={"ended_by": ended_by} if ended_by else None)

    def update(self, presence, guests, now: float) -> int:
        """Call once per tick, after presence.update() / guests.update(). Returns items sent."""
        sent = 0
        # ── home interval ─────────────────────────────────────────────
        if presence.state == HOME and presence.since is not None:
            if self._home_start is not None and abs(self._home_start - presence.since) > 1:
                # a new HOME period started without us seeing the end of the previous
                # one (app restart): close the old one at its last known point
                sent += self._close_home(self._home_start, max(presence.since, self._home_start))
            self._home_start = presence.since
            sent += self._send("presence.home", f"home-{int(presence.since)}", presence.since, None)
        elif self._home_start is not None:
            end = presence.since if presence.since is not None else now
            end = max(end, self._home_start)
            sent += self._close_home(self._home_start, end, presence.state)
            self._home_start = None
        # ── outings and visits ───────────────────────────────────────
        for o in presence.outings[-RECENT:]:
            sent += self._send("presence.outing", f"outing-{int(o.start)}", o.start, o.end)
        for v in guests.visits[-RECENT:]:
            sent += self._send("presence.guest_visit", f"visit-{int(v.start)}", v.start, v.end,
                               value=v.peak_guests)
        return sent

    def to_dict(self) -> dict:
        """Saved with the trackers (app.save): the open home period's start and the recent closes."""
        return {"home_start": self._home_start, "home_closes": [list(c) for c in self._closes]}

    def restore(self, presence, saved: dict | None = None):
        """After loading saved state (app.load). A close lives only in the client's memory queue
        until it is delivered, so a restart can lose it, and the data manager then counts that
        home period as home until now, every day. So every recent close is sent again, with the
        end it had when it was made, never a later one: presence.since may by now be the start
        of an AWAY that came after an UNKNOWN window, which was neither home nor away. The data
        manager upserts on the id, so a close that was delivered is only overwritten by itself.
        An open home period resumes under the same id."""
        saved = saved if isinstance(saved, dict) else {}
        num = lambda x: isinstance(x, (int, float)) and not isinstance(x, bool)
        self._closes = []
        for c in saved.get("home_closes") or []:
            if isinstance(c, (list, tuple)) and len(c) == 3 and num(c[0]) and num(c[1]) and c[1] >= c[0]:
                self._closes.append((float(c[0]), float(c[1]), c[2] if isinstance(c[2], str) else None))
        self._closes = self._closes[-HOME_CLOSES:]
        for start, end, by in self._closes:
            self._send("presence.home", f"home-{int(start)}", start, end,
                       meta={"ended_by": by} if by else None)
        # Saved open: update() resumes it, or closes it at presence.since if the tracker is no
        # longer in that home period (as it would have on the tick it ended). Nothing saved
        # (first start with this format) but home: resume the tracker's period.
        start = saved.get("home_start")
        if num(start):
            self._home_start = float(start)
        elif presence.state == HOME and presence.since is not None:
            self._home_start = presence.since
        else:
            self._home_start = None
