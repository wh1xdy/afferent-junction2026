"""Processing pipeline: frame -> pose -> identity -> smoothing ->
situation -> angles/gait/face -> minute aggregates.

FrameProcessor is source-agnostic (live camera or video file);
Pipeline adds the capture thread, preview frame and status for the API.
Raw keypoints never touch disk — only derived aggregates are stored.
"""
from __future__ import annotations

import json
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from . import geometry as geo
from . import gait as gait_mod
from . import keypoints as kp
from .aggregator import MinuteAggregator, VisageAggregator
from .capture import Capture, Frame
from .config import Config
from .face import FaceModule, smile_score
from .filters import KeypointSmoother
from .floor import FloorMap
from .identity import IdentityTracker, STATE_LOCKED
from .pose import PoseEstimator
from .situation import (EpisodeTracker, FrameSituation, SituationTracker)
from .storage import Storage

# Halpe-26 skeleton links (rtmlib skeleton_info, mmpose order).
SKELETON_LINKS = [
    (15, 13), (13, 11), (11, 19), (16, 14), (14, 12), (12, 19),
    (17, 18), (18, 19), (18, 5), (5, 7), (7, 9), (18, 6), (6, 8), (8, 10),
    (1, 2), (0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 6),
    (15, 20), (15, 22), (15, 24), (16, 21), (16, 23), (16, 25),
]


class StepDetector:
    """Counts gait steps from mid-hip image-y bounce cycles.

    One step = one full bounce oscillation: armed when the signal dips
    below baseline - hysteresis, fires on the rise back above
    baseline + hysteresis. Hysteresis scales with the observed range.
    """

    def __init__(self, window_s: float = 1.5, min_step_s: float = 0.3):
        self.window_s = window_s
        self.min_step_s = min_step_s
        self._buf: deque[tuple[float, float]] = deque(maxlen=256)
        self._trunk_hist: deque[float] = deque(maxlen=128)
        self._last_step_t = -10.0
        self._armed = False

    def update(self, t: float, hip_y: float | None,
               trunk_len_px: float | None = None) -> bool:
        """Returns True when a new step (bounce cycle) is detected.

        `trunk_len_px` scales the minimum bounce range: a fixed pixel
        threshold is unreachable for a person far from the camera, so the
        required range is 2% of the median recent trunk length (floor of
        1.5 px, and of 2 px while no trunk length is known yet)."""
        if hip_y is None or not np.isfinite(hip_y):
            return False
        if (trunk_len_px is not None and np.isfinite(trunk_len_px)
                and trunk_len_px > 0):
            self._trunk_hist.append(float(trunk_len_px))
        self._buf.append((t, float(hip_y)))
        cutoff = t - self.window_s
        while self._buf and self._buf[0][0] < cutoff:
            self._buf.popleft()
        if len(self._buf) < 8:
            return False
        ys = np.array([y for _, y in self._buf])
        rng = float(ys.max() - ys.min())
        if self._trunk_hist:
            min_range = max(1.5, 0.02 * float(np.median(self._trunk_hist)))
        else:
            min_range = 2.0
        if rng < min_range:  # no visible bounce -> cannot count steps
            return False
        hyst = 0.25 * rng
        base = float(np.median(ys))
        d = float(hip_y) - base
        if t - self._last_step_t < self.min_step_s:
            return False
        if not self._armed and d < -hyst:
            self._armed = True
        elif self._armed and d > hyst:
            self._armed = False
            self._last_step_t = t
            return True
        return False


class FrameProcessor:
    """All per-frame logic, independent of the frame source."""

    def __init__(self, cfg: Config, storage: Storage):
        self.cfg = cfg
        self.storage = storage
        self.pose: PoseEstimator | None = None
        self.face: FaceModule | None = None
        self.identity = IdentityTracker(
            storage, threshold=cfg.face_match_threshold,
            lost_after_s=cfg.lost_after_s,
            enroll_min=cfg.enroll_min, enroll_max=cfg.enroll_max,
            dedupe_cosine=cfg.enroll_dedupe_cosine,
            mismatch_unlock_s=cfg.mismatch_unlock_s,
            face_max_age_s=cfg.face_max_age_s)
        self.smoother = KeypointSmoother(
            kp.N_KEYPOINTS, cfg.one_euro_min_cutoff, cfg.one_euro_beta,
            cfg.kpt_conf_threshold)
        self.situation = SituationTracker()
        self.episodes = EpisodeTracker(on_episode=self._on_episode)
        self.minute_agg = MinuteAggregator(
            storage, cfg.min_valid_frames,
            cfg.extractor_version, cfg.model_version)
        self.visage_agg = VisageAggregator(
            storage, cfg.min_valid_frames,
            cfg.extractor_version, cfg.model_version)
        self.session: "GuidedSession | None" = None  # set by caller
        self._load_site_calibration()

        self._step_detector = StepDetector()
        self._gait_buf: list[gait_mod.GaitSample] = []
        self._gait_buf_start = 0.0
        self._last_gait: dict[str, Any] | None = None
        self._face_frame_idx = 0
        self._processed = 0
        self._persons_seen = 0
        self._frames_with_target = 0
        self._last_had_persons = False  # read by process() from frame 0
        self.last_result: dict[str, Any] = {}
        # Per-episode posture angle buffer: list of {angle_name: value}
        self._episode_angles: list[dict[str, float | None]] = []

    # -- site (room) ------------------------------------------------------------
    def _load_site_calibration(self) -> None:
        """(Re)load the active site's floor homography + upright refs."""
        self.floor = FloorMap.from_json(
            self.storage.get_config("floor_homography"))
        self.ref_shoulder_hip_px = self.storage.get_config(
            "ref_shoulder_hip_px")
        self.ref_trunk_len_px = self.storage.get_config("ref_trunk_len_px")
        self.ref_trunk_angle_deg = self.storage.get_config(
            "ref_trunk_angle_deg")

    def set_site(self, site: str) -> None:
        """Switch the active site (room). Pending minute buffers are flushed
        under the OLD site first so aggregates never mix across sites, then
        the new site's scoped calibration is loaded — symmetric with
        __init__; set_floor()/calibrate_upright() keep working and now write
        under the new site. Persists via storage `active_site`."""
        site = (site or "").strip()
        if not site:
            raise ValueError("empty site id")
        if site == self.storage.site:
            return
        self.flush()
        self.storage.set_site(site)
        self.cfg.site = site
        self._load_site_calibration()

    # -- model attach (called once models are ensured) -------------------------
    def attach_models(self) -> None:
        if self.pose is None:
            self.pose = PoseEstimator(
                mode=self.cfg.pose_mode, device=self.cfg.device,
                models_dir=self.cfg.models_dir, det_every=self.cfg.det_every,
                pose_model_path=self.cfg.pose_model_path)
        if self.face is None:
            self.face = FaceModule(self.cfg, self.storage)

    # -- per-frame --------------------------------------------------------------
    def process(self, image: np.ndarray, t: float) -> dict[str, Any]:
        """Run the full chain on one frame; returns a result dict."""
        res: dict[str, Any] = {"t": t, "persons": 0, "target": False,
                               "frame_w": int(image.shape[1]),
                               "frame_h": int(image.shape[0]),
                               "identity": self.identity.state,
                               "activity": "unknown", "orientation": "unknown",
                               "angles": {}, "face": None}
        if self.pose is None:
            res["error"] = "models not loaded"
            return res

        # Detector skipping: full YOLOX detection every frame while the
        # target is not locked or no person was seen; otherwise the pose
        # wrapper reuses expanded boxes between DET_EVERY detections.
        force_detect = (self.identity.state != STATE_LOCKED
                        or not self._last_had_persons)
        persons_raw = self.pose(image, force_detect=force_detect)
        self._last_had_persons = bool(persons_raw)
        res["persons"] = len(persons_raw)
        self._persons_seen += 1 if persons_raw else 0

        if self.face is not None:
            faces = self.face.detect_faces(image, t)
            if faces is not None:
                self.identity.set_faces(faces)

        target = self.identity.update(t, persons_raw)
        res["identity"] = self.identity.state
        res["match_score"] = self.identity.last_match_score
        if target is None:
            self.smoother.reset()
            self._gait_buf.clear()
            self.last_result = res
            return res

        res["target"] = True
        self._frames_with_target += 1

        # During brief occlusion the identity tracker returns a cached
        # track with stale keypoints. Keep the lock but skip all
        # measurements so duplicate data never enters the aggregates.
        if target.occluded:
            res["occluded"] = True
            self.last_result = res
            return res

        kpts = self.smoother.update(target.kpts, t)
        bbox = target.bbox
        self.recent_kpts(kpts)
        res["_persons"] = [
            {"bbox": tuple(float(v) for v in p["bbox"]),
             "kpts": p["kpts"]} for p in persons_raw]

        # ground position: mid-ankle -> floor (fallback mid-hip)
        ground = geo.mid_ankle(kpts)
        if ground is None or not np.all(np.isfinite(ground)):
            ground = geo.mid_hip(kpts)
        floor_pos = (self.floor.image_to_floor(ground)
                     if ground is not None else None)

        fs = self.situation.update(t, kpts, floor_pos, self.floor.calibrated)
        res["activity"] = fs.activity
        res["orientation"] = fs.orientation
        res["speed"] = fs.speed

        angles = geo.compute_frame_angles(kpts, fs.orientation,
                                          self.ref_shoulder_hip_px,
                                          self.ref_trunk_angle_deg)
        res["angles"] = angles
        self.minute_agg.add(t, fs.activity, fs.orientation, angles,
                            angles.get("slump_index"))

        # Face metrics on the target crop: MediaPipe landmarker every
        # FACE_EVERY processed frames (blendshapes + head pose); the heavier
        # HSEmotion pass only every EMOTION_EVERY of those.
        face_metrics = None
        self._face_frame_idx += 1
        if (self.face is not None
                and (self._face_frame_idx - 1) % max(1, self.cfg.face_every)
                == 0):
            with_emotion = ((self._face_frame_idx - 1)
                            % max(1, self.cfg.emotion_every) == 0)
            face_metrics = self.face.analyze_target(
                image, bbox, t, with_emotion=with_emotion)
        if face_metrics is not None:
            res["face"] = {
                "pitch": face_metrics.pitch_deg, "yaw": face_metrics.yaw_deg,
                "roll": face_metrics.roll_deg,
                "emotion": face_metrics.emotion,
                "valence": face_metrics.valence,
                "arousal": face_metrics.arousal,
                "face_px": face_metrics.face_px,
                "smile": smile_score(face_metrics.blendshapes),
            }
            self.visage_agg.add(
                t, face_metrics.blendshapes, face_metrics.pitch_deg,
                face_metrics.emotion, face_metrics.valence,
                face_metrics.arousal,
                smile_score(face_metrics.blendshapes))

        # gait buffer + step detection while walking
        gait_sample = self._make_gait_sample(kpts, t, fs.orientation)
        if fs.activity == "walking":
            if not self._gait_buf:
                self._gait_buf_start = t
            self._gait_buf.append(gait_sample)
            mh = geo.mid_hip(kpts)
            if mh is not None and self._step_detector.update(
                    t, float(mh[1]), fs.trunk_len_px):
                self.episodes.note_step()
        else:
            self._close_gait(t)

        self.episodes.update(fs)
        # Append angles AFTER episodes.update so that _on_episode (called
        # on episode boundary) sees only frames from the ended episode,
        # not the first frame of the new one.
        self._episode_angles.append(angles)
        if self.session is not None:
            self.session.update(t, kpts, fs, target)

        res["kpts"] = kpts
        res["bbox"] = bbox
        res["floor_pos"] = floor_pos
        self._processed += 1
        self.last_result = res
        return res

    # -- gait -------------------------------------------------------------------
    def _make_gait_sample(self, kpts: np.ndarray, t: float,
                          orientation: str = "unknown") -> gait_mod.GaitSample:
        mh = geo.mid_hip(kpts)
        head = geo._pt(kpts, kp.HEAD)
        # hip floor position for speed (homography ground-plane approx)
        hip_floor = (self.floor.image_to_floor(mh)
                     if mh is not None else None)
        la, ra = gait_mod.arm_swing_angle(kpts)
        return gait_mod.GaitSample(
            t=t,
            mid_hip_img=(float(mh[0]), float(mh[1])) if mh is not None
            else (float("nan"), float("nan")),
            head_img=(float(head[0]), float(head[1])) if head is not None
            else None,
            trunk_len=geo.trunk_length(kpts),
            trunk_inclination=geo.trunk_inclination_deg(kpts),
            arm_angles=(la, ra),
            floor_pos=hip_floor,
            orientation=orientation)

    def _close_gait(self, t: float) -> None:
        if len(self._gait_buf) >= 10:
            result = gait_mod.analyze_gait(
                self._gait_buf, min_fps=self.cfg.gait_min_fps)
            self._last_gait = {
                "start": self._gait_buf_start, "end": t,
                "result": result,
            }
        self._gait_buf = []

    @staticmethod
    def _posture_stats(angle_buf: list[dict[str, float | None]]
                       ) -> dict[str, Any]:
        """Median / p10 / p90 of each angle across an episode's frames."""
        out: dict[str, Any] = {}
        if not angle_buf:
            return out
        keys = angle_buf[0].keys()
        for k in keys:
            vals = [f[k] for f in angle_buf if f.get(k) is not None]
            if not vals:
                continue
            arr = np.array(vals)
            out[k] = {
                "median": round(float(np.median(arr)), 2),
                "p10": round(float(np.percentile(arr, 10)), 2),
                "p90": round(float(np.percentile(arr, 90)), 2),
                "n": len(vals),
            }
        return out

    def _on_episode(self, ep: dict) -> None:
        variables: dict[str, Any] = {}
        gait_res = None
        lg = self._last_gait
        if lg is not None and ep["type"] == "walk" and \
                abs(lg["start"] - ep["start"]) < 2.0:
            gait_res = lg["result"]
            variables.update({
                "speed_m_s": gait_res.speed_m_s,
                "cadence_steps_min": gait_res.cadence_steps_min,
                "step_length_m": gait_res.step_length_m,
                "bounce_mid_hip": gait_res.bounce_mid_hip,
                "bounce_head": gait_res.bounce_head,
                "bounce_over_step": gait_res.bounce_over_step,
                "mean_trunk_inclination_deg":
                    gait_res.mean_trunk_inclination_deg,
                "arm_swing_amp_deg": gait_res.arm_swing_amp_deg,
                "distance_m": gait_res.distance_m,
                "calibrated": gait_res.calibrated,
                "effective_fps": gait_res.effective_fps,
                "undersampled": gait_res.undersampled,
            })

        # Posture stats for every episode type (walk, stand, sit)
        posture = self._posture_stats(self._episode_angles)
        if posture:
            variables["posture"] = posture
        self._episode_angles = []

        self.storage.add_episode(
            ep, variables=variables or None,
            extractor_version=self.cfg.extractor_version,
            model_version=self.cfg.model_version)

    # -- calibration helpers -----------------------------------------------------
    def set_floor(self, img_pts, floor_pts) -> bool:
        fm = FloorMap(img_pts, floor_pts)
        if not fm.calibrated:
            return False
        self.floor = fm
        self.storage.set_config("floor_homography", fm.to_json())
        return True

    def calibrate_upright(self) -> dict | None:
        """Compute upright references from recent smoothed samples."""
        # Uses the session upright buffer if present, else recent history.
        if self.session is not None and self.session.upright_samples:
            samples = self.session.upright_samples
        else:
            samples = getattr(self, "_recent_kpts", None) or []
        trunks, shd, angles = [], [], []
        for k in samples:
            tl = geo.trunk_length(k)
            ms, mh = geo.mid_shoulder(k), geo.mid_hip(k)
            if tl:
                trunks.append(tl)
            if ms is not None and mh is not None:
                shd.append(abs(float(ms[1] - mh[1])))
            a = geo.trunk_inclination_deg(k)
            if a is not None:
                angles.append(a)
        if len(trunks) < 5:
            return None
        ref_tl = float(np.median(trunks))
        ref_sh = float(np.median(shd)) if shd else None
        ref_angle = float(np.median(angles)) if angles else None
        self.ref_trunk_len_px = ref_tl
        if ref_sh:
            self.ref_shoulder_hip_px = ref_sh
            self.storage.set_config("ref_shoulder_hip_px", ref_sh)
        if ref_angle is not None:
            self.ref_trunk_angle_deg = ref_angle
            self.storage.set_config("ref_trunk_angle_deg", ref_angle)
        self.storage.set_config("ref_trunk_len_px", ref_tl)
        return {"ref_trunk_len_px": ref_tl, "ref_shoulder_hip_px": ref_sh,
                "ref_trunk_angle_deg": ref_angle,
                "n_samples": len(trunks)}

    def recent_kpts(self, kpts: np.ndarray) -> None:
        if not hasattr(self, "_recent_kpts"):
            self._recent_kpts = deque(maxlen=300)
        self._recent_kpts.append(kpts)

    # -- flush ------------------------------------------------------------------
    def flush(self, end_t: float | None = None) -> None:
        self.minute_agg.flush()
        self.visage_agg.flush()
        if end_t is not None:
            self.episodes.finalize(end_t)

    def refresh_day(self, day_ts: float | None = None) -> dict | None:
        """Aggregate the current day's minute rows into `jour` (sec. 16)."""
        from .aggregator import daily_aggregate
        import datetime as _dt
        ts = day_ts if day_ts is not None else time.time()
        day = _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
        day0 = _dt.datetime.fromtimestamp(ts).replace(
            hour=0, minute=0, second=0, microsecond=0).timestamp()
        # several context rows can share one minute -> headroom over 1440
        rows = self.storage.minutes_since(int(day0 * 1000), limit=6000)
        if not rows:
            return None
        agg = daily_aggregate(rows)
        self.storage.add_day(day, agg, agg.get("coverage", 0.0),
                             extractor_version=self.cfg.extractor_version,
                             model_version=self.cfg.model_version)
        return agg

    def stats(self) -> dict[str, Any]:
        return {
            "site": self.storage.site,
            "processed_frames": self._processed,
            "persons_frames": self._persons_seen,
            "target_frames": self._frames_with_target,
            "identity": self.identity.state,
            "match_score": self.identity.last_match_score,
            "gallery_size": self.storage.gallery_count(),
            "floor_calibrated": self.floor.calibrated,
            "ref_shoulder_hip_px": self.ref_shoulder_hip_px,
            "ref_trunk_len_px": self.ref_trunk_len_px,
            "last_gait_undersampled": (
                self._last_gait["result"].undersampled
                if self._last_gait is not None else None),
        }


class GuidedSession:
    """Guided calibration/gait session (plan sec. 18, POC subset).

    Phases: 'upright' (10 s standing reference) -> 'walk' (gait passes until
    stop or timeout) -> 'done'. Writes `session` rows with `simulated` flag.
    """

    UPRIGHT_S = 10.0
    WALK_TIMEOUT_S = 60.0

    def __init__(self, processor: FrameProcessor):
        self.p = processor
        self.active = False
        self.simulated = False
        self.phase = "idle"
        self.session_id: int | None = None
        self.phase_start = 0.0
        self.upright_samples: list[np.ndarray] = []
        self.walk_samples: list[gait_mod.GaitSample] = []
        self.walk_start = 0.0
        self.result: dict[str, Any] = {}

    def start(self, simulated: bool = False) -> dict:
        if self.active:
            return {"ok": False, "error": "session already active"}
        self.active = True
        self.simulated = simulated
        self.phase = "upright"
        self.phase_start = time.time()
        self.upright_samples = []
        self.walk_samples = []
        self.result = {}
        self.session_id = self.p.storage.start_session(
            simulated, self.p.cfg.extractor_version, self.p.cfg.model_version)
        return {"ok": True, "phase": self.phase}

    def stop(self) -> dict:
        if not self.active:
            return {"ok": False, "error": "no active session"}
        self._finish(time.time())
        return {"ok": True, "result": self.result}

    def update(self, t: float, kpts: np.ndarray, fs: FrameSituation,
               target) -> None:
        if not self.active:
            return
        if self.phase == "upright":
            self.upright_samples.append(kpts.copy())
            if t - self.phase_start >= self.UPRIGHT_S or \
                    len(self.upright_samples) > 400:
                self._end_upright(t)
        elif self.phase == "walk":
            mh = geo.mid_hip(kpts)
            head = geo._pt(kpts, kp.HEAD)
            hip_floor = (self.p.floor.image_to_floor(mh)
                         if mh is not None else None)
            la, ra = gait_mod.arm_swing_angle(kpts)
            self.walk_samples.append(gait_mod.GaitSample(
                t=t,
                mid_hip_img=(float(mh[0]), float(mh[1]))
                if mh is not None else (float("nan"), float("nan")),
                head_img=(float(head[0]), float(head[1]))
                if head is not None else None,
                trunk_len=geo.trunk_length(kpts),
                trunk_inclination=geo.trunk_inclination_deg(kpts),
                arm_angles=(la, ra),
                floor_pos=hip_floor,
                orientation=fs.orientation))
            if t - self.walk_start > self.WALK_TIMEOUT_S:
                self._finish(t)

    # -- internals ---------------------------------------------------------------
    def _end_upright(self, t: float) -> None:
        # store references then move to walk phase
        self.p.calibrate_upright()
        self.phase = "walk"
        self.walk_start = t
        self.phase_start = t

    def _finish(self, t: float) -> None:
        gait_res = gait_mod.analyze_gait(
            self.walk_samples, min_fps=self.p.cfg.gait_min_fps) \
            if len(self.walk_samples) >= 10 else None
        upright_ref = {
            "ref_trunk_len_px": self.p.ref_trunk_len_px,
            "ref_shoulder_hip_px": self.p.ref_shoulder_hip_px,
            "ref_trunk_angle_deg": self.p.ref_trunk_angle_deg,
            "n_upright_samples": len(self.upright_samples),
        }
        variables = {"upright": upright_ref}
        quality_ok = bool(gait_res and gait_res.n_samples >= 10
                          and not gait_res.undersampled)
        if gait_res is not None:
            variables["gait"] = {
                "n_samples": gait_res.n_samples,
                "duration_s": gait_res.duration_s,
                "distance_m": gait_res.distance_m,
                "speed_m_s": gait_res.speed_m_s,
                "cadence_steps_min": gait_res.cadence_steps_min,
                "cadence_hz": gait_res.cadence_hz,
                "step_length_m": gait_res.step_length_m,
                "bounce_mid_hip": gait_res.bounce_mid_hip,
                "bounce_head": gait_res.bounce_head,
                "bounce_over_step": gait_res.bounce_over_step,
                "mean_trunk_inclination_deg":
                    gait_res.mean_trunk_inclination_deg,
                "arm_swing_amp_deg": gait_res.arm_swing_amp_deg,
                "calibrated": gait_res.calibrated,
                "effective_fps": gait_res.effective_fps,
                "undersampled": gait_res.undersampled,
            }
        if self.session_id is not None:
            self.p.storage.end_session(self.session_id, variables,
                                       quality_ok)
        self.result = variables
        self.active = False
        self.phase = "done"


class Pipeline:
    """Live pipeline: capture thread + FrameProcessor + preview + status."""

    def __init__(self, cfg: Config, storage: Storage):
        self.cfg = cfg
        self.storage = storage
        self.proc = FrameProcessor(cfg, storage)
        self.proc.session = GuidedSession(self.proc)
        self.capture = Capture(cfg.camera, cfg.width, cfg.height, cfg.fps)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._preview_jpeg: bytes | None = None
        self._preview_lock = threading.Lock()
        self._recorder: cv2.VideoWriter | None = None
        self._rec_path: str | None = None
        self._rec_pending = False
        self._models_ready = threading.Event()
        self.models_error: str | None = None
        self._pose_fps_ema = 0.0
        self._last_pose_t = 0.0
        self._burst = False

    # -- lifecycle ----------------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True,
                                        name="pipeline")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self.capture:
            self.capture.close()
        self.stop_recording()
        if self._thread:
            self._thread.join(timeout=3.0)
        self.proc.flush(time.time())
        self.storage.close()

    def _ensure_models(self) -> None:
        from . import download_models
        try:
            download_models.ensure_models(self.cfg)
            self.proc.attach_models()
        except Exception as e:  # models missing + offline, etc.
            self.models_error = f"{type(e).__name__}: {e}"
        finally:
            self._models_ready.set()

    def _run(self) -> None:
        self._ensure_models()
        if not self.capture.open():
            return
        last_seq = -1
        last_proc_t = -10.0
        last_day_refresh = 0.0
        while not self._stop.is_set():
            # refresh the daily aggregate roughly once a minute
            now = time.time()
            if now - last_day_refresh > 60:
                last_day_refresh = now
                try:
                    self.proc.refresh_day(now)
                except Exception:
                    import logging
                    logging.getLogger(__name__).exception("day refresh")
            frame = self.capture.read_latest(timeout=0.2)
            if frame is None:
                if self.capture.error:
                    break
                continue
            if frame.seq == last_seq:
                time.sleep(0.004)
                continue
            last_seq = frame.seq

            # Dev recording captures EVERY captured frame at capture rate,
            # before the pose rate limiter — otherwise the video is
            # frame-dropped and plays back sped up.
            if self._rec_pending or self._recorder is not None:
                self._ensure_recorder(frame)
                if self._recorder is not None:
                    self._recorder.write(frame.image)

            # adaptive pose rate
            burst = (self.proc.last_result.get("activity") in
                     ("walking", "transition")
                     or self.proc.session.active)
            rate = self.cfg.burst_fps if burst else self.cfg.continuous_fps
            if frame.t - last_proc_t < 1.0 / max(rate, 1.0) - 1e-3:
                continue
            last_proc_t = frame.t

            t0 = time.monotonic()
            try:
                res = self.proc.process(frame.image, frame.t)
            except Exception:
                import logging
                logging.getLogger(__name__).exception("process failed")
                continue
            dt = time.monotonic() - t0
            if dt > 0:
                inst = 1.0 / dt
                self._pose_fps_ema = (0.8 * self._pose_fps_ema + 0.2 * inst
                                      if self._pose_fps_ema else inst)
            self._burst = burst
            self._publish_preview(frame.image, res)

    # -- preview -------------------------------------------------------------------
    def _publish_preview(self, image: np.ndarray, res: dict) -> None:
        vis = self._annotate(image, res)
        ok, buf = cv2.imencode(".jpg", vis,
                               [cv2.IMWRITE_JPEG_QUALITY, 70])
        if ok:
            with self._preview_lock:
                self._preview_jpeg = buf.tobytes()

    def _annotate(self, image: np.ndarray, res: dict) -> np.ndarray:
        vis = image.copy()
        h, w = vis.shape[:2]
        for person in res.get("_persons", []):
            x1, y1, x2, y2 = [int(v) for v in person["bbox"]]
            cv2.rectangle(vis, (x1, y1), (x2, y2), (200, 200, 200), 2)
        kpts = res.get("kpts")
        if kpts is not None:
            target = res.get("target", False)
            color = (60, 220, 60) if target else (80, 160, 255)
            for a, b in SKELETON_LINKS:
                pa, pb = kpts[a], kpts[b]
                if np.isfinite(pa[:2]).all() and np.isfinite(pb[:2]).all():
                    cv2.line(vis, tuple(pa[:2].astype(int)),
                             tuple(pb[:2].astype(int)), color, 2)
            for p in kpts:
                if np.isfinite(p[:2]).all():
                    cv2.circle(vis, tuple(p[:2].astype(int)), 3, color, -1)
            if res.get("bbox"):
                x1, y1, x2, y2 = [int(v) for v in res["bbox"]]
                cv2.rectangle(vis, (x1, y1), (x2, y2),
                              (0, 255, 0) if target else (0, 0, 255), 3)
        lines = [
            f"id:{res.get('identity','?')} act:{res.get('activity','?')} "
            f"ori:{res.get('orientation','?')}",
            f"fps:{self._pose_fps_ema:.1f} persons:{res.get('persons',0)}",
        ]
        if res.get("angles"):
            a = res["angles"]
            lines.append(
                "neck:{} trk:{} trkL:{} asym:{} tilt:{} slump:{} ht:{}".format(
                    _fmt(a.get("neck_flexion")), _fmt(a.get("trunk_inclination")),
                    _fmt(a.get("trunk_lateral_inclination")),
                    _fmt(a.get("shoulder_asymmetry")),
                    _fmt(a.get("head_lateral_tilt")), _fmt(a.get("slump_index")),
                    _fmt(a.get("head_trunk_angle"))))
        if res.get("face"):
            f = res["face"]
            lines.append(
                f"face px:{f.get('face_px',0):.0f} pitch:{_fmt(f.get('pitch'))} "
                f"yaw:{_fmt(f.get('yaw'))} emo:{f.get('emotion')}")
        for i, line in enumerate(lines):
            cv2.putText(vis, line, (10, 30 + 26 * i),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        return vis

    def latest_jpeg(self) -> bytes | None:
        with self._preview_lock:
            return self._preview_jpeg

    # -- recording (dev only) --------------------------------------------------------
    def start_recording(self) -> dict:
        if not self.cfg.recording_enabled:
            return {"ok": False, "error": "RECORDING_ENABLED is not set"}
        if self._recorder is not None or self._rec_pending:
            return {"ok": False, "error": "already recording"}
        import os
        os.makedirs(self.cfg.recordings_dir, exist_ok=True)
        self._rec_path = os.path.join(
            self.cfg.recordings_dir,
            f"dev_{time.strftime('%Y%m%d_%H%M%S')}.mp4")
        # The writer is created lazily on the first captured frame so its
        # size/fps match the real camera stream, not the requested config.
        self._rec_pending = True
        return {"ok": True, "path": self._rec_path}

    def _ensure_recorder(self, frame: Frame) -> None:
        if not self._rec_pending or self._recorder is not None:
            return
        self._rec_pending = False
        h, w = frame.image.shape[:2]
        fps = self.capture.actual_fps or float(self.cfg.fps)
        writer = cv2.VideoWriter(self._rec_path,
                                 cv2.VideoWriter_fourcc(*"mp4v"),
                                 fps, (w, h))
        if writer.isOpened():
            self._recorder = writer
        else:
            self._rec_path = None

    def stop_recording(self) -> dict:
        self._rec_pending = False
        if self._recorder is None:
            path = self._rec_path
            self._rec_path = None
            return {"ok": False, "error": "not recording", "path": path}
        self._recorder.release()
        path = self._rec_path
        self._recorder = None
        self._rec_path = None
        return {"ok": True, "path": path}

    # -- status ---------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        st = {
            "models_ready": self._models_ready.is_set(),
            "models_error": self.models_error,
            "capture_error": self.capture.error,
            "capture_frames": self.capture.frames_read,
            "pose_fps": round(self._pose_fps_ema, 2),
            "burst_mode": self._burst,
            "session": {
                "active": self.proc.session.active,
                "phase": self.proc.session.phase,
                "simulated": self.proc.session.simulated,
                "gait_undersampled": (
                    self.proc.session.result.get("gait", {})
                    .get("undersampled")),
            },
            "recording": self._rec_path,
            "frame_w": self.proc.last_result.get("frame_w"),
            "frame_h": self.proc.last_result.get("frame_h"),
            **self.proc.stats(),
        }
        st.update(self.storage.stats())
        return st


def _fmt(v) -> str:
    return f"{v:.1f}" if isinstance(v, (int, float)) else "-"
