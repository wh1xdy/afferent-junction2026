# posture-controller — laptop control room for the Jetson posture app

Local Flask site that drives `afferent-posture` running on the Jetson.
The Jetson app is reached through `wendy net forward` (cloud tunnel),
which handles short HTTP requests but chokes on continuous streams — so
this controller does **no live streaming**:

- **Start/Stop recording** on the Jetson (`POST /api/record/*`)
- After stop, the finished mp4 is **pulled automatically** as soon as it
  is final (recording flag off + size stable), size-verified, written
  atomically, then **deleted on the Jetson** — recordings don't stay there
- FMP4 files are transcoded to H.264 (`ffmpeg`) so browsers can play them
- **Enroll face** by uploading a video: frames are sampled and POSTed to
  `/api/enroll/face-image` on the Jetson
- Status + single-frame snapshot on demand

## Run

```bash
wendy net forward 8000:8000 --device <jetson-selector>
pip install -r requirements.txt   # flask, opencv (enroll), ffmpeg binary for transcode
JETSON_URL=http://localhost:8000 python controller.py
# open http://localhost:8099
```

Downloaded videos land in `jetson_downloads/` (gitignored).
