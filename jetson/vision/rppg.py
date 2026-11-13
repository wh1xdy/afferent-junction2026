"""Remote photoplethysmography (rPPG): heart rate from the webcam.

Each heartbeat changes skin colour very slightly (mostly green). We average the skin
pixels of the face (forehead + cheeks), then use the POS algorithm (Wang et al. 2017,
"Algorithmic Principles of Remote PPG") on the last 10 s and take the dominant
frequency in 0.7-3.0 Hz (42-180 BPM).

feed() is called from the camera thread with every JPEG and only keeps the latest one;
a worker thread samples at up to SAMPLE_HZ, so the camera pipeline never waits on us.
"""
import logging
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
BAND = (0.7, 3.0)
FACE_EVERY_S = 0.5


def _pose_model():
    """YOLOv8n-pose (COCO keypoints: 0 nose, 1 left eye, 2 right eye) locates the face.
    OpenCV 5 in this image has no Haar cascades, and the pose model runs on the GPU."""
    from ultralytics import YOLO
    p = Path(__file__).parent / "yolov8n-pose.pt"
    return YOLO(str(p) if p.exists() else "yolov8n-pose.pt")


class RPPG:
    def __init__(self):
        self._lock = threading.Lock()
        self._latest: bytes | None = None
        self._event = threading.Event()
        self._samples: deque = deque(maxlen=int(SAMPLE_HZ * 20))  # (t, r, g, b)
        self._face = None            # (cx, cy, d): point between the eyes + eye distance, decoded-frame px
        self._face_t = 0.0
        self._face_seen = 0.0
        self._result = {"bpm": None, "snr": None, "face": False, "window_s": 0.0}
        self._pose = None
        try:
            self._pose = _pose_model()
            logger.info("rPPG face locator: YOLOv8n-pose")
        except Exception as e:
            logger.error("face locator unavailable: %s", e)
        threading.Thread(target=self._sample_loop, daemon=True).start()
        threading.Thread(target=self._estimate_loop, daemon=True).start()

    # called from the camera thread
    def feed(self, jpeg: bytes):
        self._latest = jpeg
        self._event.set()

    def status(self) -> dict:
        with self._lock:
            return dict(self._result)

    # ── sampling ──────────────────────────────────────────────────────
    def _sample_loop(self):
        period = 1.0 / SAMPLE_HZ
        next_t = time.monotonic()
        while True:
            self._event.wait(timeout=1.0)
            self._event.clear()
            now = time.monotonic()
            if now < next_t:
                time.sleep(next_t - now)
            next_t = max(next_t + period, time.monotonic())
            jpeg = self._latest
            if jpeg is None or self._pose is None:
                continue
            try:
                self._sample(jpeg)
            except Exception as e:
                logger.warning("rppg sample failed: %s", e)

    def _sample(self, jpeg: bytes):
        t = time.monotonic()
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_REDUCED_COLOR_2)
        if frame is None:
            return
        if t - self._face_t > FACE_EVERY_S or self._face is None:
            self._face_t = t
            found = None
            res = self._pose.predict(frame, imgsz=320, conf=0.4, verbose=False)
            kp = res[0].keypoints if res else None
            if kp is not None and kp.xy is not None and len(kp.xy):
                xy = kp.xy.cpu().numpy()
                cf = kp.conf.cpu().numpy() if kp.conf is not None else np.ones(xy.shape[:2])
                best = None
                for pts, c in zip(xy, cf):
                    if c[1] < 0.5 or c[2] < 0.5:      # both eyes visible
                        continue
                    d = float(np.linalg.norm(pts[1] - pts[2]))
                    if d < 12 or (best and d <= best[2]):
                        continue
                    mid = (pts[1] + pts[2]) / 2
                    best = (float(mid[0]), float(mid[1]), d)
                found = best
            if found:
                if self._face is not None:            # smooth so ROI jitter doesn't modulate the signal
                    a = 0.3
                    found = tuple(p + a * (f - p) for p, f in zip(self._face, found))
                self._face = found
                self._face_seen = t
            elif t - self._face_seen > 2.0:
                self._face = None
        if self._face is None:
            return
        cx, cy, d = self._face
        H, W = frame.shape[:2]

        def box(x0, y0, x1, y1):
            x0, x1 = int(max(0, cx + x0 * d)), int(min(W, cx + x1 * d))
            y0, y1 = int(max(0, cy + y0 * d)), int(min(H, cy + y1 * d))
            return frame[y0:y1, x0:x1]

        rois = [
            box(-0.55, -1.10, 0.55, -0.45),   # forehead, above the eyes
            box(-0.95, 0.35, -0.35, 0.95),    # cheek below one eye
            box(0.35, 0.35, 0.95, 0.95),      # cheek below the other
        ]
        pix = np.concatenate([r.reshape(-1, 3) for r in rois if r.size], axis=0)
        if len(pix) < 50:
            return
        # keep skin-coloured pixels only (YCrCb box), drops hair/eyebrows/background
        ycc = cv2.cvtColor(pix.reshape(-1, 1, 3), cv2.COLOR_BGR2YCrCb).reshape(-1, 3)
        skin = (ycc[:, 1] > 133) & (ycc[:, 1] < 173) & (ycc[:, 2] > 77) & (ycc[:, 2] < 127)
        if skin.sum() > 50:
            pix = pix[skin]
        b, g, r = pix.mean(axis=0)
        self._samples.append((t, r, g, b))

    # ── estimation ────────────────────────────────────────────────────
    def _estimate_loop(self):
        while True:
            time.sleep(1.0)
            try:
                res = self._estimate()
            except Exception as e:
                logger.warning("rppg estimate failed: %s", e)
                res = None
            with self._lock:
                if res:
                    self._result = res
                else:
                    self._result = {**self._result, "face": self._face is not None}

    def _estimate(self):
        pts = list(self._samples)
        face = self._face is not None
        if len(pts) < 2:
            return {"bpm": None, "snr": None, "face": face, "window_s": 0.0}
        t_end = pts[-1][0]
        pts = [p for p in pts if p[0] >= t_end - WINDOW_S]
        span = pts[-1][0] - pts[0][0]
        if span < MIN_WINDOW_S or not face:
            return {"bpm": None, "snr": None, "face": face, "window_s": round(span, 1)}

        arr = np.array(pts)
        ts, rgb = arr[:, 0], arr[:, 1:4]
        # resample to a uniform grid (camera frames arrive unevenly)
        grid = np.arange(ts[0], ts[-1], 1.0 / SAMPLE_HZ)
        c = np.stack([np.interp(grid, ts, rgb[:, k]) for k in range(3)], axis=1)  # (N, 3) RGB

        # POS: per 1.6 s window, temporally normalise, project onto the plane orthogonal to skin tone
        n = len(c)
        L = int(1.6 * SAMPLE_HZ)
        h = np.zeros(n)
        P = np.array([[0, 1, -1], [-2, 1, 1]])
        for i in range(n - L + 1):
            win = c[i:i + L]
            cn = win / (win.mean(axis=0) + 1e-9)
            s = P @ cn.T
            hh = s[0] + (s[0].std() / (s[1].std() + 1e-9)) * s[1]
            h[i:i + L] += hh - hh.mean()

        h = h - h.mean()
        h *= np.hanning(n)
        nfft = 1 << int(np.ceil(np.log2(n * 8)))  # zero-pad for finer BPM resolution
        spec = np.abs(np.fft.rfft(h, nfft)) ** 2
        freqs = np.fft.rfftfreq(nfft, 1.0 / SAMPLE_HZ)
        band = (freqs >= BAND[0]) & (freqs <= BAND[1])
        if not band.any():
            return None
        fb, sb = freqs[band], spec[band]
        k = int(np.argmax(sb))
        f0 = fb[k]
        # SNR: power within +-0.1 Hz of the peak (and its harmonic) vs the rest of the band, in dB
        sig = (np.abs(fb - f0) <= 0.1) | (np.abs(fb - 2 * f0) <= 0.1)
        snr = 10 * np.log10(sb[sig].sum() / (sb[~sig].sum() + 1e-12))
        return {"bpm": round(f0 * 60), "snr": round(float(snr), 1), "face": True,
                "window_s": round(span, 1), "fps": round(len(pts) / span, 1)}
