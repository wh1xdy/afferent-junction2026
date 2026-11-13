"""Face-identity lock on the target person (plan: three states).

SEARCH  -> no locked target; scan faces against the gallery.
LOCKED  -> target person tracked; face re-verified when visible, else the
           person bbox is tracked by IoU/centroid.
LOST    -> no track for LOST_AFTER_S; back to SEARCH.

Embeddings of other people are compared in memory and never stored.
Enrollment collects 10-20 embeddings of the single largest face while
active, rejecting near-duplicates.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import numpy as np

from . import keypoints as kp

STATE_SEARCH = "recherche"
STATE_LOCKED = "verrouille"
STATE_LOST = "perdu"
STATES = (STATE_SEARCH, STATE_LOCKED, STATE_LOST)


@dataclass
class FaceObs:
    bbox: tuple[float, float, float, float]   # x1,y1,x2,y2
    embedding: np.ndarray                       # L2-normalised
    score: float = 1.0                          # detector score
    t: float = 0.0


@dataclass
class PersonTrack:
    track_id: int
    bbox: tuple[float, float, float, float]
    kpts: np.ndarray
    last_seen: float
    face: FaceObs | None = None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def iou(a: tuple[float, float, float, float],
        b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    return inter / max(1e-9, area_a + area_b - inter)


def centroid(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)


class PersonTracker:
    """Minimal IoU tracker giving stable ids to person detections."""

    def __init__(self, iou_thr: float = 0.3):
        self.iou_thr = iou_thr
        self.tracks: dict[int, PersonTrack] = {}
        self._next_id = 1

    def update(self, persons: list[dict], t: float) -> list[PersonTrack]:
        """persons: [{bbox, kpts}]. Returns tracks matched to detections."""
        dets = [(p["bbox"], p["kpts"]) for p in persons]
        # greedy IoU matching, highest IoU first
        pairs = []
        for tid, tr in self.tracks.items():
            for di, (bb, _) in enumerate(dets):
                v = iou(tr.bbox, bb)
                if v >= self.iou_thr:
                    pairs.append((v, tid, di))
        pairs.sort(reverse=True)
        used_t, used_d = set(), set()
        out: list[PersonTrack] = []
        for v, tid, di in pairs:
            if tid in used_t or di in used_d:
                continue
            used_t.add(tid)
            used_d.add(di)
            bb, kpts = dets[di]
            self.tracks[tid].bbox = bb
            self.tracks[tid].kpts = kpts
            self.tracks[tid].last_seen = t
            out.append(self.tracks[tid])
        # unmatched detections -> new tracks
        for di, (bb, kpts) in enumerate(dets):
            if di in used_d:
                continue
            tr = PersonTrack(track_id=self._next_id, bbox=bb, kpts=kpts,
                             last_seen=t)
            self._next_id += 1
            self.tracks[tr.track_id] = tr
            out.append(tr)
        # drop stale tracks
        stale = [tid for tid, tr in self.tracks.items()
                 if t - tr.last_seen > 2.0]
        for tid in stale:
            del self.tracks[tid]
        return out


class IdentityTracker:
    """SEARCH/LOCKED/LOST state machine + enrollment."""

    def __init__(self, storage, threshold: float = 0.45,
                 lost_after_s: float = 3.0,
                 enroll_min: int = 10, enroll_max: int = 20,
                 dedupe_cosine: float = 0.985):
        self.storage = storage
        self.threshold = threshold
        self.lost_after_s = lost_after_s
        self.enroll_min = enroll_min
        self.enroll_max = enroll_max
        self.dedupe_cosine = dedupe_cosine

        self.state = STATE_SEARCH
        self.target: PersonTrack | None = None
        self.last_match_score: float | None = None
        self._locked_since = 0.0
        self._last_seen_t = 0.0
        self._tracker = PersonTracker()
        self._pending_lock: int | None = None

        # enrollment
        self.enrolling = False
        self._enroll_buf: list[np.ndarray] = []
        self._last_adapt = 0.0

        # latest face detections (may be stale between detect runs)
        self.faces: list[FaceObs] = []

    # -- gallery ---------------------------------------------------------------
    def _gallery(self) -> list[np.ndarray]:
        import numpy as np  # local: storage returns raw bytes
        out = []
        for blob in self.storage.gallery_embeddings():
            arr = np.frombuffer(blob, dtype=np.float32)
            if arr.size:
                out.append(arr.astype(np.float64))
        return out

    # -- public API -------------------------------------------------------------
    def start_enrollment(self) -> None:
        self.enrolling = True
        self._enroll_buf = []

    def stop_enrollment(self) -> int:
        self.enrolling = False
        # Keep _enroll_buf: it is the record of accepted embeddings and is
        # reset by start_enrollment(). Clearing it here would lose the count
        # when enrollment auto-stops at enroll_max inside update().
        return len(self._enroll_buf)

    def set_faces(self, faces: list[FaceObs]) -> None:
        self.faces = faces

    def update(self, t: float, persons: list[dict]) -> PersonTrack | None:
        """Advance the state machine. Returns the locked target track."""
        tracks = self._tracker.update(persons, t)

        if self.enrolling:
            self._collect_enrollment(tracks, t)

        if self.state == STATE_LOCKED and self.target is not None:
            tid = self.target.track_id
            self.target = next((tr for tr in tracks if tr.track_id == tid),
                               None)
            if self.target is not None:
                self._last_seen_t = t
                self._verify_locked(tracks, t)
                return self.target
            if t - self._last_seen_t <= self.lost_after_s:
                # brief occlusion: keep the last target, do not re-search yet
                return self.target
            self._transition(STATE_LOST, t, self.last_match_score)
            self.target = None
            return None

        # SEARCH / LOST: try to lock
        locked = self._try_lock(tracks, t)
        if locked is not None:
            self._transition(STATE_LOCKED, t, self.last_match_score)
            self.target = locked
            self._locked_since = t
            self._last_seen_t = t
            return locked
        return None

    # -- internals ---------------------------------------------------------------
    def _transition(self, new_state: str, t: float,
                    score: float | None) -> None:
        if new_state != self.state:
            self.state = new_state
            self.storage.add_identite(new_state, score)

    def _face_in_person(self, face: FaceObs,
                        track: PersonTrack) -> bool:
        """Face center inside the upper part of the person bbox."""
        fx = (face.bbox[0] + face.bbox[2]) / 2
        fy = (face.bbox[1] + face.bbox[3]) / 2
        x1, y1, x2, y2 = track.bbox
        h = y2 - y1
        # upper ~65% of the bbox, with a small horizontal margin
        return (x1 - 0.05 * (x2 - x1) <= fx <= x2 + 0.05 * (x2 - x1)
                and y1 - 0.1 * h <= fy <= y1 + 0.65 * h)

    def _best_gallery_match(self, emb: np.ndarray) -> tuple[float, int]:
        gal = self._gallery()
        if not gal:
            return 0.0, -1
        scores = [cosine(emb, g) for g in gal]
        i = int(np.argmax(scores))
        return scores[i], i

    def _try_lock(self, tracks: list[PersonTrack], t: float
                  ) -> PersonTrack | None:
        if not self.faces or not tracks:
            return None
        gallery_empty = self.storage.gallery_count() == 0
        best: tuple[float, FaceObs, PersonTrack] | None = None
        for face in self.faces:
            if gallery_empty:
                continue
            score, _ = self._best_gallery_match(face.embedding)
            if score < self.threshold:
                continue
            for tr in tracks:
                if self._face_in_person(face, tr):
                    if best is None or score > best[0]:
                        best = (score, face, tr)
                    break
        if best is None:
            return None
        self.last_match_score = best[0]
        best[2].face = best[1]
        return best[2]

    def _verify_locked(self, tracks: list[PersonTrack], t: float) -> None:
        """Re-verify the locked target when a fresh face is visible."""
        if self.target is None:
            return
        best_score = 0.0
        for face in self.faces:
            if not self._face_in_person(face, self.target):
                continue
            score, _ = self._best_gallery_match(face.embedding)
            best_score = max(best_score, score)
        if best_score > 0:
            self.last_match_score = best_score
            # Adaptive gallery update: at most ~1 sample per 30 s of lock.
            if (self.last_match_score >= self.threshold
                    and self.storage.gallery_count() < 200
                    and t - self._last_adapt > 30):
                for face in self.faces:
                    if self._face_in_person(face, self.target):
                        self.storage.add_gallery(
                            face.embedding, "adaptative", time.time())
                        self._last_adapt = t
                        break
        # If faces are present but none match the target inside its bbox,
        # and this persists, the lock is stale -> re-search.
        relevant = [f for f in self.faces
                    if self._face_in_person(f, self.target)]
        if relevant and best_score < self.threshold * 0.8:
            # strong mismatch evidence; require persistence via LOST path
            pass  # keep simple: LOST only via track loss for POC

    def _collect_enrollment(self, tracks: list[PersonTrack],
                            t: float) -> None:
        """Collect embeddings of the single largest face."""
        if not self.faces or not tracks:
            return
        if len(self._enroll_buf) >= self.enroll_max:
            self.stop_enrollment()
            return
        # largest face by bbox area
        face = max(self.faces,
                   key=lambda f: (f.bbox[2] - f.bbox[0])
                   * (f.bbox[3] - f.bbox[1]))
        # must fall inside some person bbox (upper part)
        owner = next((tr for tr in tracks
                      if self._face_in_person(face, tr)), None)
        if owner is None:
            return
        emb = np.asarray(face.embedding, dtype=np.float64)
        # reject near-duplicates vs buffer and existing gallery
        for prev in self._enroll_buf:
            if cosine(emb, prev) > self.dedupe_cosine:
                return
        for blob in self.storage.gallery_embeddings():
            g = np.frombuffer(blob, dtype=np.float32).astype(np.float64)
            if cosine(emb, g) > self.dedupe_cosine:
                return
        self._enroll_buf.append(emb)
        self.storage.add_gallery(emb, "enrolement", time.time())
