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
        self.last_error: str | None = None
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
               meta: dict | None = None, source: str | None = None):
        if not self.enabled or value is None:
            return
        item = {"metric": metric, "value": value, "ts": ts if ts is not None else time.time(),
                "source": source or self.source}
        if quality is not None:
            item["quality"] = quality
        if meta:
            item["meta"] = meta
        self._samples.append(item)
        if len(self._samples) >= self.batch_size:
            self._wake.set()

    def interval(self, kind: str, start, end=None, value: float | None = None, id: str | None = None,
                 meta: dict | None = None, source: str | None = None):
        if not self.enabled:
            return
        item = {"kind": kind, "start": start, "end": end, "source": source or self.source}
        if value is not None:
            item["value"] = value
        if id is not None:
            item["id"] = str(id)
        if meta:
            item["meta"] = meta
        self._events.append(item)
        self._wake.set()

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
        return {"enabled": self.enabled, "url": self.url, "queued_samples": len(self._samples), "queued_events": len(self._events),
                "sent": dict(self.sent), "last_error": self.last_error, "last_rejected": self._last_reject[:3]}

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
                    self.url = f"http://{addrs[0]}:{info.port}"
                    log.info("data manager found at %s", self.url)

        try:
            self._zc = Zeroconf(interfaces=self.mdns_interfaces) if self.mdns_interfaces else Zeroconf()
            ServiceBrowser(self._zc, "_http._tcp.local.", handlers=[on_change])
        except Exception as e:
            self.last_error = f"mDNS: {e}"

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(self.url + path, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        with urllib.request.urlopen(req, timeout=self.timeout_s) as r:
            return json.loads(r.read().decode())

    def _send_queue(self, q: collections.deque, path: str, key: str) -> bool:
        with self._lock:
            batch = [q.popleft() for _ in range(min(self.batch_size, len(q)))]
        if not batch:
            return True
        try:
            res = self._post(path, {key: batch})
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code not in (401, 408, 429):
                # the batch itself is bad: retrying will not help
                self.last_error = f"HTTP {e.code}: {e.read()[:200]!r}"
                log.warning("data manager refused a batch: %s", self.last_error)
                return True
            self._requeue(q, batch, f"HTTP {e.code}")
            return False
        except Exception as e:
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
