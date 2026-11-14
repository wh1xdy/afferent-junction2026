"""Mirror presence state into afferent-data-manager as intervals.

  presence.home         patient at home: from the moment state became HOME until it left
                        HOME (AWAY is back-dated to the outing start; UNKNOWN = we could
                        not look, so that time counts as neither home nor away)
  presence.outing       every outing, open while away
  presence.guest_visit  every visit, value = peak number of guests

Stateless by design: each tick re-derives the recent intervals from the trackers and
sends only those that changed since the last send. Every interval has a stable id
(`home-<start>`, `outing-<start>`, `visit-<start>`), and the data manager upserts on
(source, kind, id), so a restart, a retry or a re-send never creates duplicates.
"""
from __future__ import annotations

from core import HOME

RECENT = 5   # outings / visits re-checked every tick (older ones never change)


class PresenceSync:
    def __init__(self, client, source: str = "afferent-presence"):
        self.client = client
        self.source = source
        self._sent: dict[tuple[str, str], tuple] = {}   # (kind, id) -> (start, end, value)
        self._home_start: float | None = None

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

    def update(self, presence, guests, now: float) -> int:
        """Call once per tick, after presence.update() / guests.update(). Returns items sent."""
        sent = 0
        # ── home interval ─────────────────────────────────────────────
        if presence.state == HOME and presence.since is not None:
            if self._home_start is not None and abs(self._home_start - presence.since) > 1:
                # a new HOME period started without us seeing the end of the previous
                # one (app restart): close the old one at its last known point
                sent += self._send("presence.home", f"home-{int(self._home_start)}",
                                   self._home_start, presence.since)
            self._home_start = presence.since
            sent += self._send("presence.home", f"home-{int(presence.since)}", presence.since, None)
        elif self._home_start is not None:
            end = presence.since if presence.since is not None else now
            end = max(end, self._home_start)
            sent += self._send("presence.home", f"home-{int(self._home_start)}",
                               self._home_start, end, meta={"ended_by": presence.state})
            self._home_start = None
        # ── outings and visits ───────────────────────────────────────
        for o in presence.outings[-RECENT:]:
            sent += self._send("presence.outing", f"outing-{int(o.start)}", o.start, o.end)
        for v in guests.visits[-RECENT:]:
            sent += self._send("presence.guest_visit", f"visit-{int(v.start)}", v.start, v.end,
                               value=v.peak_guests)
        return sent

    def restore(self, presence):
        """After loading saved state: resume the open home interval with the same id."""
        if presence.state == HOME and presence.since is not None:
            self._home_start = presence.since
