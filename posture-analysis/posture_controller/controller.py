#!/usr/bin/env python3
"""Local laptop controller for the afferent-posture app running on the Jetson.

The Jetson app is reached through `wendy net forward 8000:8000` (cloud
tunnel). The tunnel handles short HTTP requests fine but chokes on
continuous streams, so this site does NO live streaming: it proxies the
recording control API, downloads finished recordings once and caches
them locally for instant replay, and enrolls faces from an uploaded
video by posting sampled frames to the Jetson enroll endpoint.

Run:
    ~/Documents/junction/capture/.venv/bin/python jetson_controller.py
Then open http://localhost:8099
"""

import os
import time
import urllib.request
import urllib.error
import threading
from pathlib import Path

import cv2
from flask import Flask, jsonify, request, send_file, send_from_directory, abort

JETSON = os.environ.get("JETSON_URL", "http://localhost:8000")
CACHE = Path(__file__).parent / "jetson_downloads"
CACHE.mkdir(exist_ok=True)
REQ_TIMEOUT = 30          # cloud tunnel latency (healthy ~2-3s, flaky 10s+)
DL_TIMEOUT = 600          # mp4 download through the tunnel

app = Flask(__name__)


def jetson(path: str, method: str = "GET", body: bytes | None = None,
           headers: dict | None = None, timeout: int = REQ_TIMEOUT,
           retries: int = 1):
    """Call the Jetson posture API, return (status, content_type, payload).

    The cloud tunnel randomly drops connections — retry once on transport
    errors (a duplicate record/start is idempotent server-side anyway).
    """
    last_err = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(JETSON + path, data=body, method=method)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.headers.get_content_type(), r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers.get_content_type(), e.read()
        except Exception as e:
            last_err = e
            time.sleep(0.5)
    return 502, "text/plain", f"jetson unreachable: {last_err}".encode()


def proxy(path: str, method: str = "GET"):
    code, ctype, payload = jetson(path, method)
    if ctype == "application/json":
        return app.response_class(payload, status=code, content_type=ctype)
    return app.response_class(payload, status=code, content_type="text/plain")


# ---------------------------------------------------------------- status ----
@app.get("/")
def index():
    return send_from_directory(Path(__file__).parent / "static",
                               "index.html")


@app.get("/api/status")
def status():
    return proxy("/api/status")


@app.get("/snapshot.jpg")
def snapshot():
    """One annotated frame, fetched on demand only (no continuous stream)."""
    code, ctype, payload = jetson("/frame.jpg", timeout=45)
    return app.response_class(payload, status=code,
                              content_type="image/jpeg")


# -------------------------------------------------------------- recording ---
_downloads: dict[str, dict] = {}   # name -> state of background download
_dl_lock = threading.Lock()


def _jetson_still_recording() -> bool:
    code, _, payload = jetson("/api/status", timeout=15)
    try:
        import json
        return bool(json.loads(payload).get("recording"))
    except Exception:
        return True          # tunnel error: assume still writing, keep waiting


def _jetson_size(name: str) -> int:
    code, _, payload = jetson("/api/recordings")
    try:
        import json
        for r in json.loads(payload).get("recordings", []):
            if r.get("name") == name:
                return int(r.get("size") or 0)
    except Exception:
        pass
    return -1


def _pull_and_clean(name: str) -> int:
    """Wait for the Jetson file to be FINAL (recording stopped, size stable),
    download it whole, verify the size, transcode, then DELETE it on the
    Jetson — recordings must not stay there. Returns local size."""
    import json
    last, stable = -1, 0
    for _ in range(300):                       # up to ~10 min
        if not _jetson_still_recording():
            size = _jetson_size(name)
            if size > 0:
                with _dl_lock:
                    _downloads[name]["state"] = "downloading"
                    _downloads[name]["jetson_size"] = size
                if size == last:
                    stable += 1
                else:
                    stable, last = 0, size
                if stable >= 2:                # same size 3 polls in a row
                    break
        time.sleep(2)
    expected = last
    if expected <= 0:
        raise RuntimeError("file never became final on the Jetson")
    for attempt in range(3):                   # whole file, size-verified
        code, _, payload = jetson(f"/api/recordings/{name}", timeout=DL_TIMEOUT)
        if code == 200 and len(payload) >= expected:
            break
        if attempt == 2:
            raise RuntimeError(f"download incomplete: {len(payload)}/{expected} B")
        time.sleep(2)
    tmp = CACHE / (name + ".part")
    tmp.write_bytes(payload)
    tmp.replace(CACHE / name)                  # atomic: never a truncated file
    _to_h264(CACHE / name)
    jetson(f"/api/recordings/{name}", "DELETE")  # nothing stays on the Jetson
    return len(payload)


def _auto_download(name: str) -> None:
    with _dl_lock:
        _downloads[name] = {"state": "waiting"}
    try:
        size = _pull_and_clean(name)
        with _dl_lock:
            _downloads[name] = {"state": "ready", "size": size}
    except Exception as e:
        with _dl_lock:
            _downloads[name] = {"state": "error", "detail": str(e)}


@app.post("/api/record/start")
def rec_start():
    return proxy("/api/record/start", "POST")


@app.post("/api/record/stop")
def rec_stop():
    code, ctype, payload = jetson("/api/record/stop", "POST")
    if code == 200:
        try:
            import json
            path = json.loads(payload).get("path") or ""
            name = path.rsplit("/", 1)[-1]
            if name.endswith(".mp4"):
                threading.Thread(target=_auto_download, args=(name,),
                                 daemon=True).start()
        except Exception:
            pass
    return app.response_class(payload, status=code,
                              content_type="application/json")


@app.get("/api/local_recordings")
def local_recordings():
    """What the laptop already has (or is pulling) — instant, no tunnel."""
    import json
    out = []
    names = {p.name for p in CACHE.glob("*.mp4") if not p.name.endswith(".web.mp4")}
    names |= set(_downloads)
    for name in sorted(names, reverse=True):
        local = CACHE / name
        st = _downloads.get(name, {"state": "ready" if local.exists() else "waiting"})
        out.append({"name": name,
                    "state": st.get("state"),
                    "detail": st.get("detail"),
                    "size": local.stat().st_size if local.exists() else st.get("jetson_size"),
                    "url": f"/local/recordings/{name}"})
    return jsonify(recordings=out)


@app.get("/local/recordings/<name>")
def local_file(name):
    """Serve the laptop-cached (H.264 if available) file — no tunnel needed."""
    if "/" in name or name.startswith(".") or not name.endswith(".mp4"):
        abort(400)
    web = (CACHE / name).with_suffix(".web.mp4")
    src = web if web.exists() else CACHE / name
    if not src.exists():
        abort(404)
    return send_file(src, mimetype="video/mp4")


@app.get("/api/recordings")
def recordings():
    return proxy("/api/recordings")


@app.delete("/api/recordings/<name>")
def rec_delete(name):
    if "/" in name or name.startswith("."):
        abort(400)
    CACHE.joinpath(name).unlink(missing_ok=True)
    CACHE.joinpath(name).with_suffix(".web.mp4").unlink(missing_ok=True)
    return proxy(f"/api/recordings/{name}", "DELETE")


def _to_h264(src: Path) -> Path | None:
    """Jetson recordings are FMP4/mpeg4 — browsers need H.264. Transcode once."""
    import subprocess
    dst = src.with_suffix(".web.mp4")
    if dst.exists():
        return dst
    r = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-crf", "23", str(dst)],
        capture_output=True, text=True, timeout=300)
    return dst if r.returncode == 0 and dst.exists() else None


@app.get("/api/recordings/<name>")
def rec_download(name):
    """Pull the finished mp4 to the laptop, then serve it locally.

    In-progress recordings are refused (the mp4 is still being written);
    after a successful pull the file is deleted on the Jetson.
    """
    if "/" in name or name.startswith(".") or not name.endswith(".mp4"):
        abort(400)
    local = CACHE / name
    if not local.exists():
        if _jetson_still_recording():
            return jsonify(error="still recording — download only after stop"), 409
        try:
            with _dl_lock:
                _downloads[name] = {"state": "downloading"}
            _pull_and_clean(name)
        except Exception as e:
            with _dl_lock:
                _downloads[name] = {"state": "error", "detail": str(e)}
            return jsonify(error=str(e)), 502
        with _dl_lock:
            _downloads[name] = {"state": "ready", "size": local.stat().st_size}
    if request.args.get("raw"):
        return send_file(local, mimetype="video/mp4")
    web = _to_h264(local)
    if web:
        return send_file(web, mimetype="video/mp4")
    return send_file(local, mimetype="video/mp4")  # fallback: raw file


# -------------------------------------------------------------- enrolment ---
def _enroll_frame(jpeg: bytes, face_index: int = 0) -> dict:
    code, ctype, payload = jetson(
        f"/api/enroll/face-image?mode=enroll&face_index={face_index}",
        method="POST", body=jpeg,
        headers={"Content-Type": "image/jpeg"}, timeout=45)
    try:
        import json
        return {"http": code, **json.loads(payload)}
    except Exception:
        return {"http": code, "detail": payload[:200].decode("utf-8", "replace")}


@app.post("/api/enroll_video")
def enroll_video():
    """Upload a video; sample frames evenly and enroll each face found."""
    f = request.files.get("video")
    if not f:
        return jsonify(ok=False, error="missing video file"), 400
    n_frames = int(request.form.get("frames", 10))
    tmp = CACHE / "_enroll_tmp.mp4"
    f.save(tmp)
    cap = cv2.VideoCapture(str(tmp))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        return jsonify(ok=False, error="unreadable video"), 400
    idx = [int(total * (i + 0.5) / n_frames) for i in range(n_frames)]
    results = []
    for i in idx:
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, frame = cap.read()
        if not ok:
            continue
        ok, buf = cv2.imencode(".jpg", frame,
                               [cv2.IMWRITE_JPEG_QUALITY, 90])
        if ok:
            r = _enroll_frame(buf.tobytes())
            r["frame_idx"] = i
            results.append(r)
    cap.release()
    enrolled = sum(1 for r in results if r.get("enrolled"))
    gallery = max((r.get("gallery_size") or 0 for r in results), default=0)
    return jsonify(ok=True, enrolled_frames=enrolled,
                   tried=len(results), gallery_size=gallery,
                   results=results)


if __name__ == "__main__":
    print(f"Jetson API via {JETSON}  (wendy net forward 8000:8000)")
    print("controller on http://localhost:8099")
    app.run(host="127.0.0.1", port=8099, threaded=True)
