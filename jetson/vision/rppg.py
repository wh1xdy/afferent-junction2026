"""Remote photoplethysmography (rPPG): heart rate from webcams, two cameras fused.

Each heartbeat changes skin colour very slightly (mostly green). Per camera we locate
the face with YOLOv8n-pose (eyes), average the skin pixels of forehead + cheeks at
SAMPLE_HZ, then run POS (Wang et al. 2017, "Algorithmic Principles of Remote PPG") on
the last 10 s and take the dominant frequency in 45-180 BPM.

Sources
  cam1  the C920 that also feeds YOLO: frames arrive through feed() from its pipeline
  cam2  a second UVC camera (Arduino USB Camera) opened directly by this module

Fusion: each camera's band spectrum is normalised and weighted by its SNR, then summed;
the fused peak is the combined estimate. A camera with a clearly worse signal barely counts.

Diagnostics per camera (skin pixels, brightness, face size) explain *why* a camera fails,
and frame_jpeg() returns the latest frame with the ROIs drawn on it.
"""
import logging
import subprocess
import threading
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger("rppg")

SAMPLE_HZ = 20.0
WINDOW_S = 10.0
MIN_WINDOW_S = 6.0
BAND = (0.75, 3.0)          # 45-180 BPM
FACE_EVERY_S = 0.5
FUSE_GRID = np.arange(BAND[0], BAND[1], 0.005)

# Every auto-adjustment changes skin colour far more than a heartbeat, so lock them.
# 50 Hz mains here; 30 ms exposure (300 x 100 us) = 3 full flicker cycles.
LOCKS = {
    "/dev/video0": [  # Logitech C920
        ("power_line_frequency", 1), ("white_balance_automatic", 0),
        ("focus_automatic_continuous", 0), ("exposure_dynamic_framerate", 0),
        ("auto_exposure", 1), ("exposure_time_absolute", 300), ("white_balance_temperature", 4100),
    ],
    "default": [      # generic UVC (Arduino USB Camera): same idea, controls that exist get set
        ("power_line_frequency", 1), ("white_balance_automatic", 0),
        ("focus_automatic_continuous", 0), ("auto_exposure", 1),
        ("exposure_time_absolute", 300), ("white_balance_temperature", 4500),
    ],
}


def v4l2_set(device, name, value):
    r = subprocess.run(["v4l2-ctl", "-d", device, "-c", f"{name}={value}"],
                       capture_output=True, text=True, timeout=5)
    return r.returncode == 0


def v4l2_get(device, name):
    r = subprocess.run(["v4l2-ctl", "-d", device, "-C", name], capture_output=True, text=True, timeout=5)
    try:
        return int(r.stdout.split(":")[-1].strip())
    except ValueError:
        return None


def lock_camera(device):
    ok = [n for n, v in LOCKS.get(device, LOCKS["default"]) if v4l2_set(device, n, v)]
    logger.info("%s: locked %s", device, ", ".join(ok) or "nothing")


def _pose_model():
    """YOLOv8n-pose (COCO keypoints: 0 nose, 1 left eye, 2 right eye) locates the face.
    OpenCV 5 in this image has no Haar cascades, and the pose model runs on the GPU."""
    from ultralytics import YOLO
    p = Path(__file__).parent / "yolov8n-pose.pt"
    return YOLO(str(p) if p.exists() else "yolov8n-pose.pt")


def pos_spectrum(ts, rgb):
    """POS on unevenly sampled RGB means -> (band freqs, band power, f0 Hz, SNR dB)."""
    grid = np.arange(ts[0], ts[-1], 1.0 / SAMPLE_HZ)            # uniform resampling
    c = np.stack([np.interp(grid, ts, rgb[:, k]) for k in range(3)], axis=1)
    n, L = len(c), int(1.6 * SAMPLE_HZ)
    h = np.zeros(n)
    P = np.array([[0, 1, -1], [-2, 1, 1]])
    for i in range(n - L + 1):                                   # per 1.6 s window
        cn = c[i:i + L] / (c[i:i + L].mean(axis=0) + 1e-9)       # temporal normalisation
        s = P @ cn.T                                             # plane orthogonal to skin tone
        hh = s[0] + (s[0].std() / (s[1].std() + 1e-9)) * s[1]
        h[i:i + L] += hh - hh.mean()
    k = int(SAMPLE_HZ)                                           # detrend: 1 s moving average
    h = h - np.convolve(h, np.ones(k) / k, mode="same")
    h = (h - h.mean()) * np.hanning(n)
    nfft = 1 << int(np.ceil(np.log2(n * 8)))
    spec = np.abs(np.fft.rfft(h, nfft)) ** 2
    freqs = np.fft.rfftfreq(nfft, 1.0 / SAMPLE_HZ)
    band = (freqs >= BAND[0]) & (freqs <= BAND[1])
    fb, sb = freqs[band], spec[band]
    f0 = fb[int(np.argmax(sb))]
    sig = (np.abs(fb - f0) <= 0.1) | (np.abs(fb - 2 * f0) <= 0.1)
    snr = 10 * np.log10(sb[sig].sum() / (sb[~sig].sum() + 1e-12))
    return fb, sb, float(f0), float(snr)


def trust_score(snr, region_bpms, bpm, history, motion, luma, clipped):
    """0-100 reliability of one camera's reading, plus the reasons it isn't higher.

    Works with a single camera (the phone game): instead of two cameras agreeing, the
    forehead and both cheeks are three independent measurements of the same pulse.
      signal     SNR -2 dB -> 0 ... +6 dB -> 1
      regions    share of face regions within 6 BPM of the reading
      stability  spread of the last readings (0 BPM -> 1, 8+ BPM -> 0)
      stillness  eye-midpoint movement over the window, relative to eye distance
      exposure   face not too dark / clipped (multiplies the rest)
    """
    reasons = []
    sig = min(max((snr + 2) / 8, 0), 1)
    if sig < 0.5:
        reasons.append("weak pulse signal")
    valid = [x for x in region_bpms if x is not None]
    agree = sum(1 for x in valid if abs(x - bpm) <= 6)
    reg = agree / len(valid) if valid else 0.0
    if reg < 0.67:
        reasons.append(f"face regions disagree ({agree}/{len(valid)})")
    if len(history) >= 3:
        spread = float(np.std(history[-5:]))
        stab = min(max(1 - spread / 8, 0), 1)
        if stab < 0.5:
            reasons.append(f"reading jumping (±{spread:.0f} BPM)")
    else:
        stab = 0.3
        reasons.append("still settling")
    still = min(max(1 - motion / 0.15, 0), 1)
    if still < 0.5:
        reasons.append("head moving")
    expo = 1.0
    if clipped > 0.05 or luma > 215:
        expo, _ = 0.5, reasons.append("face overexposed")
    elif luma < 50:
        expo, _ = 0.5, reasons.append("face too dark")
    score = round(100 * expo * (0.30 * sig + 0.30 * reg + 0.20 * stab + 0.20 * still))
    label = "reliable" if score >= 70 else "uncertain" if score >= 40 else "unreliable"
    return {"score": score, "label": label, "reasons": reasons,
            "parts": {"signal": round(sig, 2), "regions": round(reg, 2), "stability": round(stab, 2),
                      "stillness": round(still, 2), "exposure": expo}}


class Source:
    """One camera: face tracking, skin sampling, POS estimate."""

    def __init__(self, name, device, pose, pose_lock, own_capture=False, size=(1280, 720)):
        self.name, self.device = name, device
        self._pose, self._pose_lock = pose, pose_lock
        self._lock = threading.Lock()
        self._latest_jpeg = None
        self._latest_frame = None
        self._event = threading.Event()
        self._samples: deque = deque(maxlen=int(SAMPLE_HZ * 20))
        self._face = None            # (cx, cy, d): between the eyes + eye distance, frame px
        self._face_t = self._face_seen = 0.0
        self._rois = []
        self._diag = {}
        self._spectrum = None        # (freqs, power) in band, for fusion
        self._result = {"bpm": None, "snr": None, "face": False, "window_s": 0.0}
        self._connected = not own_capture
        self._history = deque(maxlen=8)
        self._gain = None
        self._gain_max = 255
        self._gain_t = 0.0
        if own_capture:
            threading.Thread(target=self._capture_loop, args=(size,), daemon=True).start()
        else:
            threading.Thread(target=self._decode_loop, daemon=True).start()
            threading.Thread(target=self._lock_later, daemon=True).start()
        threading.Thread(target=self._estimate_loop, daemon=True).start()

    # ── input ─────────────────────────────────────────────────────────
    def feed(self, jpeg: bytes):
        """cam1: JPEGs from the YOLO pipeline (latest only, never blocks the caller)."""
        self._latest_jpeg = jpeg
        self._event.set()

    def _lock_later(self):
        time.sleep(8)  # after the GStreamer pipeline has opened the camera
        try:
            lock_camera(self.device)
        except Exception as e:
            logger.warning("%s lock failed: %s", self.name, e)

    def _decode_loop(self):
        period, next_t = 1.0 / SAMPLE_HZ, time.monotonic()
        while True:
            self._event.wait(timeout=1.0)
            self._event.clear()
            now = time.monotonic()
            if now < next_t:
                time.sleep(next_t - now)
            next_t = max(next_t + period, time.monotonic())
            jpeg = self._latest_jpeg
            if jpeg is None:
                continue
            frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
            if frame is not None:
                self._process(frame)

    def _capture_loop(self, size):
        """cam2: own V4L2 capture (MJPEG), reopened if the camera disappears."""
        while True:
            cap = cv2.VideoCapture(self.device, cv2.CAP_V4L2)
            if not cap.isOpened():
                self._connected = False
                time.sleep(3)
                continue
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, size[0])
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, size[1])
            cap.set(cv2.CAP_PROP_FPS, 30)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            ok, _ = cap.read()
            lock_camera(self.device)
            self._connected = ok
            logger.info("%s: %s opened %dx%d", self.name, self.device,
                        int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
            calib_until = time.monotonic() + 6
            last = 0.0
            fails = 0
            while True:
                ok, frame = cap.read()      # keeps draining at camera rate
                if not ok:
                    fails += 1
                    if fails > 30:
                        break
                    continue
                fails = 0
                now = time.monotonic()
                if now < calib_until:
                    self._calibrate_gain(frame)
                if now - last >= 1.0 / SAMPLE_HZ:
                    last = now
                    self._process(frame)
            cap.release()
            self._connected = False
            logger.warning("%s: lost %s, reopening", self.name, self.device)
            time.sleep(2)

    def _calibrate_gain(self, frame):
        """Manual exposure can leave the image dark: nudge gain once at start-up, then hold."""
        mean = float(frame[::8, ::8].mean())
        g = v4l2_get(self.device, "gain")
        if g is None:
            return
        if mean < 80:
            v4l2_set(self.device, "gain", min(g + 4, 64))
        elif mean > 180:
            v4l2_set(self.device, "gain", max(g - 4, 0))

    # ── per frame ─────────────────────────────────────────────────────
    def _process(self, frame):
        t = time.monotonic()
        self._latest_frame = frame
        if t - self._face_t > FACE_EVERY_S or self._face is None:
            self._face_t = t
            self._locate_face(frame, t)
        if self._face is None:
            self._rois = []
            return
        cx, cy, d = self._face
        H, W = frame.shape[:2]
        boxes = [(-0.55, -1.10, 0.55, -0.45),   # forehead, above the eyes
                 (-0.95, 0.35, -0.35, 0.95),     # cheek below one eye
                 (0.35, 0.35, 0.95, 0.95)]       # cheek below the other
        rois, rects = [], []
        for x0, y0, x1, y1 in boxes:
            a, b = int(max(0, cx + x0 * d)), int(min(W, cx + x1 * d))
            c, e = int(max(0, cy + y0 * d)), int(min(H, cy + y1 * d))
            if b > a and e > c:
                rois.append(frame[c:e, a:b]); rects.append((a, c, b, e))
        self._rois = rects
        if not rois:
            return
        pix = np.concatenate([r.reshape(-1, 3) for r in rois], axis=0)
        ycc = cv2.cvtColor(pix.reshape(-1, 1, 3), cv2.COLOR_BGR2YCrCb).reshape(-1, 3)
        # Skin filter that works under any light colour (a fixed YCrCb skin box rejected
        # ~100 % of the face under purple stage light): drop the darkest 15 % (hair, brows,
        # shadows) and brightest 5 % (specular highlights, clipped pixels) by luma.
        y = ycc[:, 0].astype(np.float32)
        lo, hi = np.percentile(y, [15, 95])
        skin = (y >= lo) & (y <= hi) & (pix.max(axis=1) < 250)
        n_skin = int(skin.sum())
        luma = float(ycc[:, 0].mean())
        clipped = float((pix.max(axis=1) >= 250).mean())
        allpix = pix[skin] if n_skin > 50 else pix
        b, g, r = allpix.mean(axis=0)
        # the same filter per region: forehead / cheek / cheek are three independent
        # measurements of one pulse, which is what the trust score checks
        regions = []
        for roi in rois:
            rp = roi.reshape(-1, 3)
            ry = cv2.cvtColor(rp.reshape(-1, 1, 3), cv2.COLOR_BGR2YCrCb).reshape(-1, 3)[:, 0]
            m = (ry >= lo) & (ry <= hi) & (rp.max(axis=1) < 250)
            rb, rg, rr = (rp[m] if m.sum() > 30 else rp).mean(axis=0)
            regions += [rr, rg, rb]
        regions += [np.nan] * (9 - len(regions))
        self._samples.append((t, r, g, b, cx, cy, d, *regions))
        self._diag = {"skin_px": n_skin, "roi_px": int(len(skin)), "brightness": round(luma),
                      "clipped": round(clipped, 3), "eye_dist_px": round(d), "frame": f"{W}x{H}",
                      "gain": self._gain}
        self._face_gain(luma, clipped, t)

    def _face_gain(self, luma, clipped, t):
        """Keep the *face* well exposed (luma ~65-190, nothing clipped). A clipped face has no
        pulse signal; a dark one is all sensor noise. Any change restarts the 10 s window, so
        the step itself can't show up as a heartbeat."""
        if t - self._gain_t < 2.0:
            return
        if self._gain is None:
            self._gain = v4l2_get(self.device, "gain")
            self._gain_max = 255 if self.device == "/dev/video0" else 64
            if self._gain is None:
                self._gain_t = t + 1e9   # camera has no gain control
                return
        step = max(1, self._gain_max // 16)
        new = self._gain
        # wide dead band: every change restarts the window, so only act when clearly off
        if luma > 190 or clipped > 0.03:
            new = max(0, self._gain - step)
        elif luma < 65:
            new = min(self._gain_max, self._gain + step)
        if new != self._gain and v4l2_set(self.device, "gain", new):
            logger.info("%s: face luma %.0f clipped %.1f%% -> gain %d", self.name, luma, clipped * 100, new)
            self._gain = new
            self._samples.clear()
            self._history.clear()
        self._gain_t = t

    def _locate_face(self, frame, t):
        found = None
        with self._pose_lock:
            res = self._pose.predict(frame, imgsz=416, conf=0.4, verbose=False)
        kp = res[0].keypoints if res else None
        if kp is not None and kp.xy is not None and len(kp.xy):
            xy = kp.xy.cpu().numpy()
            cf = kp.conf.cpu().numpy() if kp.conf is not None else np.ones(xy.shape[:2])
            for pts, c in zip(xy, cf):
                if c[1] < 0.5 or c[2] < 0.5:          # both eyes visible
                    continue
                d = float(np.linalg.norm(pts[1] - pts[2]))
                if d < 20 or (found and d <= found[2]):
                    continue
                mid = (pts[1] + pts[2]) / 2
                found = (float(mid[0]), float(mid[1]), d)
        if found:
            if self._face is not None:                # smooth so ROI jitter doesn't modulate the signal
                found = tuple(p + 0.3 * (f - p) for p, f in zip(self._face, found))
            self._face, self._face_seen = found, t
        elif t - self._face_seen > 2.0:
            self._face = None

    # ── estimate ──────────────────────────────────────────────────────
    def _estimate_loop(self):
        while True:
            time.sleep(1.0)
            try:
                res, spec = self._estimate()
            except Exception as e:
                logger.warning("%s estimate failed: %s", self.name, e)
                res, spec = None, None
            with self._lock:
                face = self._face is not None
                base = res or {**self._result, "bpm": None, "snr": None}
                self._result = {**base, "face": face, "connected": self._connected, "diag": dict(self._diag)}
                self._spectrum = spec if (res and res.get("bpm")) else None

    def _estimate(self):
        pts = list(self._samples)
        if len(pts) < 2 or self._face is None:
            return {"bpm": None, "snr": None, "window_s": 0.0}, None
        t_end = pts[-1][0]
        pts = [p for p in pts if p[0] >= t_end - WINDOW_S]
        span = pts[-1][0] - pts[0][0]
        if span < MIN_WINDOW_S:
            return {"bpm": None, "snr": None, "window_s": round(span, 1)}, None
        arr = np.array(pts, dtype=float)
        ts = arr[:, 0]
        fb, sb, f0, snr = pos_spectrum(ts, arr[:, 1:4])
        bpm = round(f0 * 60)
        region_bpms = []
        for k in range(3):
            rgb = arr[:, 7 + 3 * k:10 + 3 * k]
            if np.isnan(rgb).any():
                region_bpms.append(None)
                continue
            region_bpms.append(round(pos_spectrum(ts, rgb)[2] * 60))
        cxs, cys, ds = arr[:, 4], arr[:, 5], arr[:, 6]
        motion = float(np.sqrt(cxs.var() + cys.var()) / max(ds.mean(), 1.0))
        self._history.append(bpm)
        trust = trust_score(snr, region_bpms, bpm, list(self._history), motion,
                            self._diag.get("brightness", 128), self._diag.get("clipped", 0.0))
        res = {"bpm": bpm, "snr": round(snr, 1), "window_s": round(span, 1),
               "fps": round(len(pts) / span, 1), "regions_bpm": region_bpms,
               "motion": round(motion, 3), "trust": trust}
        return res, (fb, sb / (sb.sum() + 1e-12))

    # ── outputs ───────────────────────────────────────────────────────
    def status(self):
        with self._lock:
            return dict(self._result), self._spectrum

    def frame_jpeg(self):
        f = self._latest_frame
        if f is None:
            return None
        f = f.copy()
        for a, c, b, e in self._rois:
            cv2.rectangle(f, (a, c), (b, e), (0, 255, 0), 2)
        if f.shape[1] > 960:
            f = cv2.resize(f, (960, int(f.shape[0] * 960 / f.shape[1])))
        ok, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 80])
        return buf.tobytes() if ok else None


class RPPG:
    """cam1 (fed from the YOLO pipeline) + cam2 (own capture), fused by SNR."""

    def __init__(self, second_device="/dev/video2"):
        self._pose = None
        try:
            self._pose = _pose_model()
            logger.info("rPPG face locator: YOLOv8n-pose")
        except Exception as e:
            logger.error("face locator unavailable: %s", e)
        lk = threading.Lock()
        self.sources = {}
        if self._pose is not None:
            self.sources["cam1"] = Source("cam1", "/dev/video0", self._pose, lk)
            if second_device and Path(second_device).exists():
                self.sources["cam2"] = Source("cam2", second_device, self._pose, lk, own_capture=True)

    def feed(self, jpeg: bytes):
        s = self.sources.get("cam1")
        if s:
            s.feed(jpeg)

    def status(self) -> dict:
        out, acc, weights = {}, np.zeros_like(FUSE_GRID), []
        stats = {name: src.status() for name, src in self.sources.items()}
        # if any camera has a real signal (SNR >= 0 dB), ignore the ones that are just noise
        any_good = any(sp is not None and r.get("snr") is not None and r["snr"] >= 0 for r, sp in stats.values())
        for name, (res, spec) in stats.items():
            out[name] = res
            if any_good and (res.get("snr") is None or res["snr"] < 0):
                continue
            if spec is not None and res.get("snr") is not None:
                w = 10 ** (res["snr"] / 10)            # SNR in linear power units
                acc += w * np.interp(FUSE_GRID, spec[0], spec[1])
                weights.append((name, w))
        fused = {"bpm": None, "sources": []}
        if weights:
            fused = {"bpm": round(float(FUSE_GRID[int(np.argmax(acc))]) * 60),
                     "sources": [n for n, _ in weights]}
        trusts = [(out[n].get("trust") or {}) for n, _ in weights]
        if trusts:
            best_t = max(trusts, key=lambda x: x.get("score", 0))
            fused["trust"] = dict(best_t)
            bpms = [out[n]["bpm"] for n, _ in weights if out[n].get("bpm")]
            if len(bpms) >= 2 and max(bpms) - min(bpms) <= 4:
                ft = fused["trust"]
                ft["score"] = min(100, ft.get("score", 0) + 15)
                ft["label"] = "reliable" if ft["score"] >= 70 else "uncertain" if ft["score"] >= 40 else "unreliable"
                ft["reasons"] = list(ft.get("reasons", [])) + ["two cameras agree"]
        out["fused"] = fused
        # backwards compatible top level (= best single camera)
        best = max((r for k, r in out.items() if k != "fused" and r.get("snr") is not None),
                   key=lambda r: r["snr"], default=out.get("cam1", {}))
        return {**{k: best.get(k) for k in ("bpm", "snr", "face", "window_s", "fps")}, **out}

    def frame_jpeg(self, cam="cam1"):
        s = self.sources.get(cam)
        return s.frame_jpeg() if s else None
