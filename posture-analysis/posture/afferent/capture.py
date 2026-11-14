"""Threaded V4L2/OpenCV capture: always keeps the latest frame.

CAMERA accepts "auto" (first working V4L2 device, /dev/v4l/by-path links
preferred), an integer index, a /dev/videoN path, or a video file path.
For video files, timestamps come from frame index / fps so offline
processing shares the live code path.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass

import cv2
import numpy as np

_VIDEO_EXT = (".mp4", ".avi", ".mov", ".mkv")


def _is_file_source(src) -> bool:
    """True when `src` should be treated as a video file.

    A source is a file only when it exists as a regular file or carries a
    video extension. `/dev/*` paths, bare numbers and `videoN` names are
    camera devices — `/dev/video0` contains "/" but must NOT be treated
    as a file (it would get synthetic idx/fps timestamps)."""
    s = str(src)
    if s.isdigit() or s.startswith("/dev/"):
        return False
    if os.path.isfile(s):
        return True
    return s.lower().endswith(_VIDEO_EXT)


@dataclass
class Frame:
    image: np.ndarray          # BGR
    t: float                   # monotonic seconds
    seq: int                   # capture sequence number
    source_fps: float          # fps reported by the source (may differ)


class Capture:
    """Background thread reading frames; read_latest() never blocks long."""

    def __init__(self, source, width: int = 1920, height: int = 1080,
                 fps: int = 30):
        self.source = source
        self.width, self.height, self.fps = width, height, fps
        self._latest: Frame | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._cap: cv2.VideoCapture | None = None
        self.resolved_source: str | None = None   # actual device for "auto"
        self._is_file = False
        self._file_fps = 30.0
        self._t0_epoch = 0.0
        self.frames_read = 0
        self.error: str | None = None

    # -- lifecycle ------------------------------------------------------------
    def open(self) -> bool:
        src = self.source
        if isinstance(src, str) and _is_file_source(src):
            self._is_file = True
            cap = cv2.VideoCapture(src)
            if not cap.isOpened():
                self.error = f"cannot open video source {self.source!r}"
                return False
            self._cap = cap
            self._file_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        self._t0_epoch = time.time()
        # Cameras are opened lazily inside the thread so `CAMERA=auto` and
        # hot-plug retry work even when no device is present at startup.
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name="capture")
        self._thread.start()
        return True

    def _resolve_source(self):
        """CAMERA=auto picks the first working V4L2 device, preferring
        /dev/v4l/by-path/ links which stay stable when the webcam moves to
        another /dev/videoN index (replug, reboot, other cameras)."""
        if str(self.source).lower() != "auto":
            return self.source
        import glob
        candidates = (sorted(glob.glob("/dev/v4l/by-path/*"))
                      + sorted(glob.glob("/dev/video*")))
        for dev in candidates:
            cap = cv2.VideoCapture(dev)
            ok, img = (False, None)
            if cap.isOpened():
                ok, img = cap.read()
            cap.release()
            if ok and img is not None:
                self.resolved_source = dev
                return dev
        return None

    def _open_camera(self) -> bool:
        src = self._resolve_source()
        if src is None:
            self.error = "no camera device found"
            return False
        cap = cv2.VideoCapture(src)
        if not cap.isOpened():
            # numeric string fallback
            try:
                cap = cv2.VideoCapture(int(src))
            except (ValueError, TypeError):
                pass
        if not cap.isOpened():
            self.error = f"cannot open camera source {self.source!r}"
            return False
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, self.fps)
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        # V4L2 often rejects MJPG at high res/fps combos; retry with
        # lower settings if the read fails.
        self._cap = cap
        self.error = None
        return True

    def close(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2.0)
        if self._cap is not None:
            self._cap.release()

    # -- consumer --------------------------------------------------------------
    def read_latest(self, timeout: float = 0.5) -> Frame | None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                f = self._latest
            if f is not None:
                return f
            time.sleep(0.005)
        return None

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def actual_fps(self) -> float:
        """Measured capture rate (frames / elapsed); falls back to requested."""
        dt = time.time() - self._t0_epoch
        if dt > 1.0 and self.frames_read > 0:
            return self.frames_read / dt
        return float(self.fps if not self._is_file else self._file_fps)

    # -- internals -------------------------------------------------------------
    def _run(self) -> None:
        idx = 0
        empty_reads = 0
        while not self._stop.is_set():
            if self._cap is None:
                if self._is_file or not self._open_camera():
                    if self._is_file:
                        break
                    time.sleep(2.0)     # camera absent: retry until it appears
                    continue
            ok, img = self._cap.read()
            if not ok or img is None:
                empty_reads += 1
                if empty_reads > 50:
                    self._cap.release()
                    self._cap = None
                    empty_reads = 0
                    if self._is_file:
                        self.error = "capture read failed repeatedly"
                        break
                    self.error = "camera lost; reconnecting"
                    continue
                time.sleep(0.01)
                continue
            empty_reads = 0
            idx += 1
            self.frames_read = idx
            # epoch timestamps everywhere so DB rows share one clock
            if self._is_file:
                t = self._t0_epoch + idx / self._file_fps
            else:
                t = time.time()
            with self._lock:
                self._latest = Frame(image=img, t=t, seq=idx,
                                     source_fps=self._file_fps
                                     if self._is_file else self.fps)
