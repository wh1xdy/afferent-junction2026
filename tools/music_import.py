import argparse
import array
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLAN = ROOT / "art" / "music_plan.json"
SR = 48000
FADE_IN_S = 0.005
XFADE_MAX_S = 1.0


def die(msg):
    sys.exit(msg)


def run(cmd, data=None):
    p = subprocess.run(cmd, input=data, capture_output=True)
    if p.returncode:
        die(f"{cmd[0]} failed:\n{p.stderr.decode(errors='replace')[-2000:]}")
    return p


def decode(path, channels):
    out = run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", str(channels), "-ar", str(SR), "-f", "f32le", "-"]).stdout
    a = array.array("f")
    a.frombytes(out)
    return a


def measure(path):
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"]).stderr.decode()
    m = json.loads(err[err.rindex("{"):err.rindex("}") + 1])
    return float(m["input_i"]), float(m["input_tp"])


def write_wav(path, samples, channels):
    run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", str(channels), "-i", "-", str(path)], samples.tobytes())


def encode(src, dst, channels, gain_db, kbps, limit_db=None):
    af = f"volume={gain_db:.3f}dB"
    if limit_db is not None:
        af += f",alimiter=limit={10 ** (limit_db / 20):.4f}:attack=5:release=200:level=false"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-c:a", "aac", "-b:a", f"{kbps}k",
         "-ar", str(SR), "-ac", str(channels), "-movflags", "+faststart", str(dst)])


def frames(a, ch, f0, f1):
    return a[f0 * ch:f1 * ch]


def ramp(a, ch, f0, n, up):
    for i in range(n):
        x = (i + 0.5) / n
        g = math.sin(x * math.pi / 2) if up else math.cos(x * math.pi / 2)
        for c in range(ch):
            a[(f0 + i) * ch + c] *= g


def seamless(raw, ch, start, n):
    x = min(int(XFADE_MAX_S * SR), n // 4)
    if (start + n + x) * ch > len(raw):
        die(f"raw too short: need {(start + n + x) / SR:.2f} s from the start of the file, have {len(raw) / ch / SR:.2f} s")
    body = frames(raw, ch, start, start + n)
    tail = frames(raw, ch, start + n, start + n + x)
    ramp(body, ch, 0, x, True)
    ramp(tail, ch, 0, x, False)
    for i in range(x * ch):
        body[i] += tail[i]
    return body


def oneshot(raw, ch, start, n):
    if (start + n) * ch > len(raw):
        die(f"raw too short: need {(start + n) / SR:.2f} s from the start of the file, have {len(raw) / ch / SR:.2f} s")
    a = frames(raw, ch, start, start + n)
    ramp(a, ch, 0, int(FADE_IN_S * SR), True)
    tail = min(int(1.0 * SR), n // 4)
    ramp(a, ch, n - tail, tail, False)
    return a


def find_track(plan, tid, fname):
    track = next((t for t in plan["tracks"] if t["id"].lower() == tid.lower()), None)
    if not track:
        die(f"unknown track {tid}; known: {', '.join(t['id'] for t in plan['tracks'])}")
    files = track["files"]
    if fname:
        spec = next((f for f in files if f["file"] in (fname, fname + ".m4a")), None)
        if not spec:
            die(f"{track['id']} has no file {fname}; files: {', '.join(f['file'] for f in files)}")
    elif len(files) == 1:
        spec = files[0]
    else:
        die(f"{track['id']} has several files, pass --file: {', '.join(f['file'] for f in files)}")
    return track, spec


def describe(track, spec):
    stem = spec["file"].rsplit(".", 1)[0]
    key = re.sub(r"^mu_", "", stem)
    bpm = track.get("tempo")
    meter = track.get("meter") or ""
    beats = int(meter.split("/")[0]) if "/" in meter else None
    e = {}
    if stem.startswith("st_"):
        e["role"] = "stinger"
    elif "group" in track:
        e.update(role="colour", group=track["group"])
    elif "hit_s" in spec:
        e.update(role="oneshot", mode=track.get("mode"), hit_s=spec["hit_s"])
    else:
        layer = key.split("_", 1)[1] if "_" in key else "pad"
        e.update(role="bed", mode=track["mode"], layer="pad" if layer in ("pad", "rise") else layer)
    if bpm:
        e["bpm"] = bpm
    if beats:
        e["meter"] = beats
    return key, e, bpm, beats


def main():
    ap = argparse.ArgumentParser(description="Cut, normalize and encode a raw Suno file into demo/audio/music and update its manifest.")
    ap.add_argument("raw", nargs="?")
    ap.add_argument("track", nargs="?", help="track id from art/music_plan.json, e.g. G3 or st_open")
    ap.add_argument("--file", help="output file from the plan when the track has several, e.g. mu_flow_motion.m4a")
    ap.add_argument("--start", type=float, default=0.0, help="seconds into the raw file where the loop or one-shot begins")
    ap.add_argument("--dur", type=float, help="one-shot length in seconds, needed when the plan gives a range")
    ap.add_argument("--gain-db", type=float, help="mix gain_db written to the manifest; existing value is kept otherwise")
    ap.add_argument("--out", type=pathlib.Path, help="output directory, defaults to the plan's out_dir")
    ap.add_argument("--remove", metavar="KEY", help="remove a manifest entry and its file, then exit")
    ap.add_argument("--list", action="store_true", help="list the plan's tracks and files")
    a = ap.parse_args()

    plan = json.loads(PLAN.read_text())
    out_dir = a.out or ROOT / plan["out_dir"]
    man_path = out_dir / "manifest.json"
    man = json.loads(man_path.read_text()) if man_path.exists() else {"v": 1, "key": plan["key"], "pad_s": 0.5, "tracks": {}}

    if a.list:
        for t in plan["tracks"]:
            for f in t["files"]:
                key = describe(t, f)[0]
                print(f"{t['id']:8} {f['file']:22} {'imported' if key in man['tracks'] else '-'}")
        return

    if a.remove:
        e = man["tracks"].pop(a.remove, None)
        if e is None:
            die(f"no entry {a.remove}")
        (out_dir / e["files"]["m4a"]).unlink(missing_ok=True)
        man_path.write_text(json.dumps(man, indent=1) + "\n")
        print(f"removed {a.remove}")
        return

    if not (a.raw and a.track):
        ap.error("raw and track are required")
    if not shutil.which("ffmpeg"):
        die("ffmpeg not found. Install it with: sudo apt-get install -y ffmpeg")

    track, spec = find_track(plan, a.track, a.file)
    key, entry, bpm, beats = describe(track, spec)
    ch = spec["channels"]
    pad_s = man.get("pad_s", 0.5)
    target = spec.get("target_lufs", plan["encoding"]["target_lufs"])
    tp_max = plan["encoding"]["true_peak_dbtp"]
    kbps = 128 if ch == 2 else 80

    raw = decode(a.raw, ch)
    start = round(a.start * SR)
    loop = "one_shot_s" not in spec
    if loop:
        bars = spec.get("loop_bars")
        n = round(bars * beats * 60 / bpm * SR) if bars and bpm and beats else round(spec["loop_s"] * SR)
        body = seamless(raw, ch, start, n)
        if entry["role"] == "colour":
            data = body
        else:
            p = round(pad_s * SR)
            data = frames(body, ch, n - p, n) + body + frames(body, ch, 0, p)
        entry["len_s"] = round(n / SR, 6)
        if bars:
            entry["bars"] = bars
    else:
        rng = spec["one_shot_s"]
        lo, hi = (rng, rng) if isinstance(rng, (int, float)) else rng
        dur = a.dur if a.dur is not None else hi
        if not lo <= dur <= hi:
            die(f"--dur {dur} outside the plan's range {lo} to {hi} s")
        n = round(dur * SR)
        body = data = oneshot(raw, ch, start, n)

    out_dir.mkdir(parents=True, exist_ok=True)
    dst = out_dir / spec["file"]
    with tempfile.TemporaryDirectory() as tmp:
        probe, full = pathlib.Path(tmp) / "body.wav", pathlib.Path(tmp) / "full.wav"
        write_wav(probe, body, ch)
        write_wav(full, data, ch)
        lufs, tp = measure(probe)
        if not math.isfinite(lufs) or lufs < -70:
            die("input is silent at the chosen start")
        gain, limit = target - lufs, None
        if tp + gain > tp_max:
            limit = tp_max - 1.0
        for _ in range(6):
            encode(full, dst, ch, gain, kbps, limit)
            got_i, got_tp = measure(dst)
            if got_tp <= tp_max + 0.05:
                break
            if limit is None:
                limit = tp_max - 1.0
            else:
                limit -= got_tp - tp_max + 0.2

    old = man["tracks"].get(key, {})
    if a.gain_db is not None:
        entry["gain_db"] = a.gain_db
    elif "gain_db" in old:
        entry["gain_db"] = old["gain_db"]
    entry.update(channels=ch, lufs=round(got_i, 1), true_peak=round(got_tp, 1), files={"m4a": spec["file"]},
                 src={"raw": pathlib.Path(a.raw).name, "start_s": a.start, "plan": track["id"]})
    man["tracks"][key] = {k: v for k, v in entry.items() if v is not None}
    man_path.write_text(json.dumps(man, indent=1) + "\n")
    short = got_i < target - 0.5
    print(f"{key}: {dst.relative_to(ROOT) if dst.is_relative_to(ROOT) else dst}  {len(data) / ch / SR:.3f} s  "
          f"{got_i:.1f} LUFS  {got_tp:.1f} dBTP{'  (peak-limited below target ' + str(target) + ')' if short else ''}")


if __name__ == "__main__":
    main()
