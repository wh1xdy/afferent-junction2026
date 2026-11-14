"""Drop-in client for afferent-data-manager. Copy this single file into a producer app.

Stdlib only. Never blocks the caller and never raises on network trouble: values are
queued in memory and sent in batches by a background thread, with retries. If the
data manager is down, up to `max_queue` items are kept (oldest dropped first).

    from data_manager_client import DataManagerClient

    dm = DataManagerClient(source="modulino-hub")          # URL from DATA_MANAGER_URL,
                                                           # else mDNS (role=data-manager) if zeroconf is installed
    dm.sample("env.temperature_c", 21.4)                   # ts defaults to now
    dm.sample("vitals.heart_rate_bpm", 74, quality=0.62, source="modulino-hub/finger1")

    # intervals: send the start, later re-send with the same id and an end
    dm.interval("presence.home", start=t_arrived, id="home-1731590000")
    dm.interval("presence.home", start=t_arrived, end=t_left, id="home-1731590000")

    dm.close()                                             # flush on shutdown

    # reading (synchronous, raises DataManagerError on failure)
    days = dm.get("/api/v1/daily", metric="presence.home", **{"from": "-14d"})["days"]

    # high-rate signal -> one value per window (mean or median)
    hr = Downsampler(window_s=10, how="median")
    out = hr.add(bpm)                                      # None until the window closes
    if out: dm.sample("vitals.heart_rate_bpm", out.value, ts=out.ts, meta={"n": out.n})

Timestamps: epoch seconds (float), epoch ms (int) or ISO 8601 strings.
Set DATA_MANAGER_URL=off to disable sending entirely (calls become no-ops).

The master copy lives in jetson/data_manager/client/; producers carry a copy because
each Wendy app is built from its own directory. Keep the copies in sync.
"""
from __future__ import annotations

import collections
import json
import logging
import math
import os
import socket
import threading
import time
import urllib.error
import urllib.request

log = logging.getLogger("data_manager_client")


class DataManagerError(Exception):
    """A read failed: unreachable server, HTTP error (status in .status), or bad JSON."""

    def __init__(self, msg: str, status: int | None = None):
        super().__init__(msg)
        self.status = status


CLOCK_SKEW_WARN_S = 60     # warn when this device's clock is further off the server's
MDNS_FAILOVER_AFTER = 3    # consecutive connection failures before trying another advert


def _num(v, what: str) -> float:
    if isinstance(v, bool):
        raise ValueError(f"{what} must be a number, not a bool")
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{what} must be a number, got {type(v).__name__}") from None
    if not math.isfinite(x):
        raise ValueError(f"{what} must be finite")
    return x


def _ts(v):
    """Keep ISO strings as they are, coerce everything else to a finite number."""
    return v if isinstance(v, str) else _num(v, "timestamp")


def _meta(m) -> dict:
    if not isinstance(m, dict):
        raise ValueError("meta must be a dict")
    try:
        json.dumps(m, allow_nan=False)
    except (TypeError, ValueError) as e:
        raise ValueError(f"meta is not JSON-serialisable: {e}") from None
    return m


class Window:
    __slots__ = ("value", "ts", "n")

    def __init__(self, value: float, ts: float, n: int):
        self.value, self.ts, self.n = value, ts, n

    def __repr__(self):
        return f"Window(value={self.value}, ts={self.ts}, n={self.n})"


class Downsampler:
    """Collects values and returns one aggregate per `window_s` (mean or median).

    The aggregate is stamped at the mean time of its values. Not thread-safe:
    use one per producer thread / channel.
    """

    def __init__(self, window_s: float, how: str = "mean", min_n: int = 1):
        self.window_s, self.how, self.min_n = window_s, how, min_n
        self._vals: list[float] = []
        self._ts: list[float] = []
        self._start: float | None = None

    def add(self, value: float, now: float | None = None) -> Window | None:
        now = time.time() if now is None else now
        out = None
        if self._start is not None and now - self._start >= self.window_s:
            out = self.flush()
        if self._start is None:
            self._start = now
        self._vals.append(float(value))
        self._ts.append(now)
        return out

    def flush(self) -> Window | None:
        vals, ts = self._vals, self._ts
        self._vals, self._ts, self._start = [], [], None
        if len(vals) < self.min_n:
            return None
        if self.how == "median":
            s = sorted(vals)
            m = len(s) // 2
            v = s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2
        else:
            v = sum(vals) / len(vals)
        return Window(v, sum(ts) / len(ts), len(vals))


class DataManagerClient:
    def __init__(self, source: str, url: str | None = None, token: str | None = None,
                 flush_every_s: float = 5.0, batch_size: int = 500, max_queue: int = 50_000,
                 timeout_s: float = 5.0, mdns_interfaces: list[str] | None = None):
        self.source = source
        raw = url if url is not None else os.environ.get("DATA_MANAGER_URL", "")
        self.enabled = raw.strip().lower() not in ("off", "0", "false", "no", "disabled")
        self.url = raw.rstrip("/") if self.enabled and raw.strip() else None
        self.mdns_interfaces = mdns_interfaces
        self.token = token or os.environ.get("DATA_MANAGER_TOKEN") or None
        self.flush_every_s = flush_every_s
        self.batch_size = batch_size
        self.timeout_s = timeout_s
        self._samples: collections.deque = collections.deque(maxlen=max_queue)
        self._events: collections.deque = collections.deque(maxlen=max_queue)
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self.sent = {"samples": 0, "events": 0, "rejected": 0}
        self.dropped = 0                  # items refused at enqueue (not a number, bad meta …)
        self.clock_skew_s: float | None = None   # server clock - local clock, from server_time
        self.last_error: str | None = None
        self._url_from_mdns = False
        self._mdns_seen: dict[str, str] = {}     # service name -> url
        self._conn_failures = 0
        self._last_reject: list = []
        self._zc = None
        self._thread = None
        if not self.enabled:
            log.info("data manager disabled (DATA_MANAGER_URL=off)")
            return
        if not self.url:
            self._discover()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="data-manager-client")
        self._thread.start()

    # ── public API ──────────────────────────────────────────────────────────
    def sample(self, metric: str, value: float, ts=None, quality: float | None = None,
               meta: dict | None = None, source: str | None = None) -> bool:
        """Queue one sample. Returns False (and logs) if it was dropped as invalid.

        Values are coerced to float here (numpy scalars, Decimal …), so nothing that
        cannot be sent as JSON ever enters the queue and blocks the items behind it.
        """
        if not self.enabled or value is None:
            return False
        try:
            item = {"metric": str(metric), "value": _num(value, "value"),
                    "ts": time.time() if ts is None else _ts(ts), "source": str(source or self.source)}
            if quality is not None:
                item["quality"] = _num(quality, "quality")
            if meta:
                item["meta"] = _meta(meta)
        except ValueError as e:
            return self._drop(f"sample {metric!r}: {e}")
        self._samples.append(item)
        if len(self._samples) >= self.batch_size:
            self._wake.set()
        return True

    def interval(self, kind: str, start, end=None, value: float | None = None, id: str | None = None,
                 meta: dict | None = None, source: str | None = None) -> bool:
        """Queue one interval (open if end is None). Returns False if dropped as invalid."""
        if not self.enabled:
            return False
        try:
            item = {"kind": str(kind), "start": _ts(start), "end": None if end is None else _ts(end),
                    "source": str(source or self.source)}
            if value is not None:
                item["value"] = _num(value, "value")
            if id is not None:
                item["id"] = str(id)
            if meta:
                item["meta"] = _meta(meta)
        except ValueError as e:
            return self._drop(f"interval {kind!r}: {e}")
        self._events.append(item)
        self._wake.set()
        return True

    def _drop(self, why: str) -> bool:
        self.dropped += 1
        log.warning("data manager: dropped invalid %s", why)
        return False

    def get(self, path: str, timeout_s: float | None = None, **params) -> dict:
        """GET a read endpoint, e.g. get("/api/v1/stats", metric="env.co2_ppm", source="co2").

        Python keywords can't be used as argument names: pass from/to as **{"from": "-7d"}.
        Waits up to ~5 s for mDNS discovery if no URL is known yet.
        """
        import urllib.parse
        deadline = time.time() + 5
        while not self.url and self.enabled and time.time() < deadline:
            time.sleep(0.2)
        if not self.url:
            raise DataManagerError("data manager URL unknown (set DATA_MANAGER_URL)")
        qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
        req = urllib.request.Request(self.url + path + (f"?{qs}" if qs else ""))
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=timeout_s or self.timeout_s) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode()).get("error", str(e))
            except Exception:
                msg = str(e)
            raise DataManagerError(f"HTTP {e.code}: {msg}", e.code) from None
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise DataManagerError(str(e)) from None

    def flush(self, timeout_s: float = 10.0) -> bool:
        """Try to send everything now. True if the queues are empty afterwards."""
        if not self.enabled:
            return True
        deadline = time.time() + timeout_s
        while (self._samples or self._events) and time.time() < deadline:
            if not self._send_once():
                time.sleep(0.5)
        return not (self._samples or self._events)

    def close(self):
        self._stop.set()
        self._wake.set()
        self.flush(5)
        if self._zc:
            self._zc.close()

    def status(self) -> dict:
        return {"enabled": self.enabled, "url": self.url, "url_from_mdns": self._url_from_mdns,
                "queued_samples": len(self._samples), "queued_events": len(self._events),
                "sent": dict(self.sent), "dropped": self.dropped, "clock_skew_s": self.clock_skew_s,
                "last_error": self.last_error, "last_rejected": self._last_reject[:3]}

    # ── internals ───────────────────────────────────────────────────────────
    def _discover(self):
        try:
            from zeroconf import ServiceBrowser, Zeroconf
        except ImportError:
            self.last_error = "no DATA_MANAGER_URL and zeroconf not installed"
            log.warning(self.last_error)
            return

        def on_change(zeroconf, service_type, name, state_change):
            threading.Thread(target=resolve, args=(zeroconf, service_type, name), daemon=True).start()

        def resolve(zeroconf, service_type, name):
            info = zeroconf.get_service_info(service_type, name, timeout=3000)
            if info and info.properties.get(b"role") == b"data-manager":
                addrs = [socket.inet_ntoa(a) for a in info.addresses if len(a) == 4]
                if addrs:
                    self._on_advert(name, f"http://{addrs[0]}:{info.port}")

        try:
            self._zc = Zeroconf(interfaces=self.mdns_interfaces) if self.mdns_interfaces else Zeroconf()
            ServiceBrowser(self._zc, "_http._tcp.local.", handlers=[on_change])
        except Exception as e:
            self.last_error = f"mDNS: {e}"

    def _on_advert(self, name: str, url: str):
        """First data-manager advert wins. A later or different advert never silently
        replaces a working server (that is what let a stray advert capture the data and,
        with a token set, the token); it is only used after the current one failed
        MDNS_FAILOVER_AFTER times in a row."""
        with self._lock:
            self._mdns_seen[name] = url
            if self.url is None:
                self.url, self._url_from_mdns = url, True
                log.info("data manager found at %s (mDNS)", url)
                if self.token:
                    log.warning("data manager: sending the API token to an mDNS-discovered host; "
                                "set DATA_MANAGER_URL to pin it")
            elif url != self.url:
                log.info("data manager: ignoring other advert %s (using %s)", url, self.url)

    def _note_connection(self, ok: bool):
        if ok:
            self._conn_failures = 0
            return
        self._conn_failures += 1
        if self._url_from_mdns and self._conn_failures >= MDNS_FAILOVER_AFTER:
            with self._lock:
                others = [u for u in self._mdns_seen.values() if u != self.url]
                if others:
                    log.warning("data manager %s unreachable %d times, switching to %s",
                                self.url, self._conn_failures, others[-1])
                    self.url = others[-1]
                    self._conn_failures = 0

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(self.url + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=self.timeout_s) as r:
            res = json.loads(r.read().decode())
        t1 = time.time()
        st = res.get("server_time") if isinstance(res, dict) else None
        if isinstance(st, (int, float)):
            skew = round(st / 1000 - (t0 + t1) / 2, 1)
            if abs(skew) > CLOCK_SKEW_WARN_S and (self.clock_skew_s is None
                                                 or abs(skew - self.clock_skew_s) > CLOCK_SKEW_WARN_S):
                log.warning("data manager: this device's clock is %+.0f s off the server's; "
                            "timestamps will be wrong (check NTP)", -skew)
            self.clock_skew_s = skew
        return res

    def _send_queue(self, q: collections.deque, path: str, key: str) -> bool:
        with self._lock:
            batch = [q.popleft() for _ in range(min(self.batch_size, len(q)))]
        if not batch:
            return True
        try:
            res = self._post(path, {key: batch})
            self._note_connection(True)
        except (TypeError, ValueError) as e:
            # unreachable in practice (items are validated at enqueue), but never let one
            # unserialisable batch sit at the head of the queue forever
            self.last_error = f"unsendable batch dropped: {e}"
            log.error("data manager: %s", self.last_error)
            self.dropped += len(batch)
            return True
        except urllib.error.HTTPError as e:
            self._note_connection(True)
            if 400 <= e.code < 500 and e.code not in (401, 408, 429):
                # the batch itself is bad: retrying will not help
                self.last_error = f"HTTP {e.code}: {e.read()[:200]!r}"
                log.warning("data manager refused a batch: %s", self.last_error)
                return True
            self._requeue(q, batch, f"HTTP {e.code}")
            return False
        except Exception as e:
            self._note_connection(False)
            self._requeue(q, batch, str(e))
            return False
        self.sent[key] += res.get("accepted", 0)
        rej = res.get("rejected") or []
        if rej:
            self.sent["rejected"] += len(rej)
            self._last_reject = rej
            log.warning("%d %s rejected, e.g. %s", len(rej), key, rej[0].get("reason"))
        self.last_error = None
        return True

    def _requeue(self, q, batch, err):
        with self._lock:
            q.extendleft(reversed(batch))
        if err != self.last_error:
            log.warning("data manager unreachable (%s), %d items queued", err, len(q))
        self.last_error = err

    def _send_once(self) -> bool:
        if not self.url:
            return False
        ok = self._send_queue(self._events, "/api/v1/events", "events")
        return self._send_queue(self._samples, "/api/v1/samples", "samples") and ok

    def _loop(self):
        backoff = self.flush_every_s
        while not self._stop.is_set():
            self._wake.wait(backoff)
            self._wake.clear()
            if self._stop.is_set():
                return
            ok = True
            while ok and (self._samples or self._events):
                ok = self._send_once()
            backoff = self.flush_every_s if ok else min(backoff * 2, 60.0)
