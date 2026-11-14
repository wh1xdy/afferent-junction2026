"""Voice relay for Afferent: phone <-> Gemini Live on Vertex AI.

The phone cannot hold Google Cloud credentials, and a browser WebSocket cannot send the
`Authorization` header Vertex needs. This service holds the identity (Cloud Run's service
account), opens the Vertex session with a fixed setup and system prompt, and relays audio
and transcripts. The phone only proves it knows RELAY_CODE.

It also keeps locked dashboards for "Show to my doctor" (POST /share, GET /d/<id>): see the
section "Shared dashboards" below.
"""
import asyncio
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from collections import deque
from pathlib import Path

import google.auth
import google.auth.transport.requests
import websockets
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response

LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
MODEL = os.environ.get("VERTEX_MODEL", "gemini-3.8-live")
VOICE = os.environ.get("VOICE_NAME", "Kore")
RELAY_CODE = os.environ.get("RELAY_CODE", "")
MAX_SECONDS = int(os.environ.get("MAX_SESSION_SECONDS", "900"))
AUTH_TIMEOUT = 10

PROMPT = " ".join([
    "You are the voice companion inside Afferent, an app that supports a person who may be living with depression.",
    "Your whole job is friendly, everyday conversation. You are not an assistant: no research, no fact-checking,",
    " no code, no task lists, no advice beyond listening. If the person asks for those, gently steer back to talking.",
    "Choose the conversational approach that fits the moment; do not announce modes or follow a questionnaire.",
    "When the person shares an experience or feeling, prefer active listening in the spirit of Carl Rogers:",
    " be empathetic, accepting and non-judgmental. Briefly reflect something specific they said in natural words.",
    " Acknowledge feelings tentatively rather than claiming to know what they feel. Do not analyse them,",
    " repeat their words mechanically, or turn every reflection into a question. Most listening replies should",
    " contain no question at all. Let a short acknowledgement stand, then leave room for them to continue.",
    "When the person wants light conversation or needs a starting point, offer one everyday topic:",
    " food or cooking, sport, hobbies, outings or visits, animals, nature, or another interest they mention.",
    " Vary topics naturally rather than cycling through a fixed list. Start with a small observation or a gentle",
    " invitation, not a string of questions. Stay with a topic they enjoy instead of jumping to the next one.",
    "Questions are occasional invitations, not the engine of the conversation. Never ask questions on successive",
    " replies, stack several questions, or routinely end a reply with a question. If they explicitly say they do",
    " not know what to say, or after a genuine conversational pause with no response, one gentle invitation is",
    " enough. A brief answer is not permission to probe. Silence is allowed: do not fill it with repeated prompts.",
    " Do not infer silence from a missing audio chunk or a transcription delay.",
    "Remember what has already been said in this session: do not repeat answered questions, rephrase an ignored",
    " question, restart an exhausted topic, or loop through the same reassurance. If an invitation gets no uptake,",
    " let it go. Follow the person's lead if they choose to return to an earlier topic. Do not invent personal",
    " memories or pretend to have real-life experiences to keep the conversation going.",
    "Always speak English, whatever language you hear.",
    "Be warm, calm and brief: usually one or two short sentences, then let the person talk.",
    "Do not diagnose, do not give medical or medication advice, and do not claim to be a therapist.",
    "If the person mentions wanting to die, hurting themselves or being in danger, say you are glad they told you,"
    " tell them to tap the support button at the top right of the screen or to call 112,"
    " and encourage them to reach a person they trust right now.",
])

INDICATORS = ("ok", "watch", "bad")
CTX_FACT_MAX, CTX_FACT_LEN = 8, 160


def clean_context(v) -> dict | None:
    """The phone may pass the hub's daily wellbeing read as `context` in the auth message.
    It is validated and reshaped here, so the phone can colour today's session — never
    rewrite the prompt itself."""
    if not isinstance(v, dict):
        return None
    ind = v.get("indicator")
    raw = v.get("facts")
    facts = [f.strip()[:CTX_FACT_LEN] for f in raw
             if isinstance(f, str) and f.strip()][:CTX_FACT_MAX] if isinstance(raw, list) else []
    ctx = {"indicator": ind if ind in INDICATORS else None,
           "date": str(v.get("date") or v.get("day") or "")[:10] or None,
           "facts": facts,
           "suggest_doctor": v.get("suggest_doctor") is True}
    return ctx if ctx["indicator"] or facts else None


def _context_text(ctx: dict) -> str:
    bits = ["Context for this conversation, reported by the person's home hub"
            + (f" (dated {ctx['date']})" if ctx.get("date") else "") + "."]
    if ctx["facts"]:
        bits.append("Recent observations: " + "; ".join(ctx["facts"]) + ".")
    if ctx["indicator"] == "bad" or ctx["suggest_doctor"]:
        bits.append("The person's wellbeing indicators suggest they may not be doing well lately."
                    " When it fits the conversation, gently acknowledge how things have been — it is"
                    " not easy — remind them this app and their care team are here exactly for that,"
                    " and kindly suggest they think about contacting their doctor. Raise it once,"
                    " warmly; do not insist, do not repeat it, and never sound alarmed or annoyed.")
    elif ctx["indicator"] == "watch":
        bits.append("The person's wellbeing indicators look slightly off;"
                    " keep an extra gentle ear on how they sound.")
    return " ".join(bits)

app = FastAPI(title="Afferent voice relay")
_creds = None
_project = os.environ.get("GOOGLE_CLOUD_PROJECT", "")


def _refresh():
    global _creds, _project
    if _creds is None:
        _creds, found = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        _project = _project or found or ""
    if not _creds.valid:
        _creds.refresh(google.auth.transport.requests.Request())
    return _creds.token


async def access_token() -> str:
    return await asyncio.to_thread(_refresh)


def setup_message(context: dict | None = None) -> dict:
    prompt = PROMPT if not context else PROMPT + " " + _context_text(context)
    return {"setup": {
        "model": f"projects/{_project}/locations/{LOCATION}/publishers/google/models/{MODEL}",
        "generation_config": {
            "response_modalities": ["AUDIO"],
            "speech_config": {"voice_config": {"prebuilt_voice_config": {"voice_name": VOICE}}},
        },
        "system_instruction": {"parts": [{"text": prompt}]},
        "input_audio_transcription": {},
        "output_audio_transcription": {},
    }}


def open_upstream(token: str):
    url = f"wss://{LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent"
    return websockets.connect(url, additional_headers={"Authorization": f"Bearer {token}"}, max_size=None)


_SNAKE = re.compile(r"_([a-z0-9])")


def camel(v):
    """Vertex may answer in snake_case; the app reads camelCase (setupComplete, serverContent...)."""
    if isinstance(v, dict):
        return {_SNAKE.sub(lambda m: m.group(1).upper(), k): camel(x) for k, x in v.items()}
    if isinstance(v, list):
        return [camel(x) for x in v]
    return v


def _authorised(code) -> bool:
    return bool(RELAY_CODE) and isinstance(code, str) and hmac.compare_digest(code.encode(), RELAY_CODE.encode())


@app.get("/health")
async def health():
    return {"ok": True, "configured": bool(RELAY_CODE)}


# --- Shared dashboards ------------------------------------------------------------------------
# "Show to my doctor" builds the patient's dashboard on the phone and locks it there (AES-GCM under
# a fresh random 256-bit key, demo/js/handover.js). Only the locked bytes come here. The QR code
# holds https://<relay>/d/<id>#<key>: a browser never sends the part after '#', so this service
# never sees the key or anything readable. The viewer page (viewer.html) fetches the locked bytes
# and unlocks them in the doctor's browser.
#
# Kept in memory, which is enough for the hackathon: a restart, a redeploy or a scale-down to zero
# loses every share, and a second instance does not know the first one's shares. Deploy with
# exactly one instance (README). A share ends after SHARE_TTL_SECONDS or when the patient takes it
# back with the revoke token it got at upload.

SHARE_TTL = int(os.environ.get("SHARE_TTL_SECONDS", str(7 * 24 * 3600)))
SHARE_MAX_BYTES = int(os.environ.get("SHARE_MAX_BYTES", str(2 * 1024 * 1024)))
SHARE_TOTAL_BYTES = int(os.environ.get("SHARE_TOTAL_BYTES", str(64 * 1024 * 1024)))
SHARE_MAX_COUNT = int(os.environ.get("SHARE_MAX_COUNT", "500"))
SHARE_UPLOADS_PER_HOUR = int(os.environ.get("SHARE_UPLOADS_PER_HOUR", "30"))
SHARE_READS_PER_MINUTE = int(os.environ.get("SHARE_READS_PER_MINUTE", "120"))
SHARE_MIN_BYTES = 1 + 12 + 16          # format byte, AES-GCM nonce, AES-GCM tag
SHARE_ID = re.compile(r"[A-Za-z0-9_-]{22}")
VIEWER = Path(__file__).with_name("viewer.html").read_text(encoding="utf-8")
# The viewer runs its own inline script and shows the dashboard in a sandboxed srcdoc frame, which
# inherits this policy: the dashboard's inline script runs, but it can reach nothing except this
# service, cannot submit forms and cannot be framed by another site.
VIEWER_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
                               "img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
                               "frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
}


def now() -> float:
    return time.time()


def _iso(t: float) -> str:
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _digest(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


class Shares:
    """Locked dashboards by id, each with its end time and the hash of its revoke token."""

    def __init__(self):
        self.items: dict[str, dict] = {}
        self.total = 0

    def _drop(self, sid: str):
        s = self.items.pop(sid, None)
        if s:
            self.total -= len(s["blob"])

    def purge(self, t: float):
        for sid in [k for k, v in self.items.items() if v["expires"] <= t]:
            self._drop(sid)

    def put(self, blob: bytes, t: float):
        self.purge(t)
        if len(self.items) >= SHARE_MAX_COUNT or self.total + len(blob) > SHARE_TOTAL_BYTES:
            return None
        sid, revoke = secrets.token_urlsafe(16), secrets.token_urlsafe(24)
        self.items[sid] = {"blob": blob, "expires": t + SHARE_TTL, "revoke": _digest(revoke)}
        self.total += len(blob)
        return sid, revoke, t + SHARE_TTL

    def get(self, sid: str, t: float):
        s = self.items.get(sid)
        if s and s["expires"] <= t:
            self._drop(sid)
            return None
        return s

    def revoke(self, sid: str, token: str, t: float):
        """True when taken back, False for a wrong token, None when there is no such share (any more)."""
        s = self.get(sid, t)
        if s is None:
            return None
        if not hmac.compare_digest(_digest(token), s["revoke"]):
            return False
        self._drop(sid)
        return True


class Limiter:
    """At most `limit()` requests per client address in a sliding window of `window` seconds."""

    def __init__(self, limit, window: float):
        self.limit, self.window, self.hits = limit, window, {}

    def allow(self, key: str, t: float) -> bool:
        if len(self.hits) > 10_000:
            self.hits = {k: q for k, q in self.hits.items() if q and q[-1] > t - self.window}
        q = self.hits.setdefault(key, deque())
        while q and q[0] <= t - self.window:
            q.popleft()
        if len(q) >= self.limit():
            return False
        q.append(t)
        return True


shares = Shares()
upload_limit = Limiter(lambda: SHARE_UPLOADS_PER_HOUR, 3600)
read_limit = Limiter(lambda: SHARE_READS_PER_MINUTE, 60)


def client_address(request: Request) -> str:
    # Cloud Run puts the caller's address last in X-Forwarded-For (anything before it came from the caller).
    fwd = request.headers.get("x-forwarded-for", "")
    last = fwd.split(",")[-1].strip() if fwd else ""
    return last or (request.client.host if request.client else "unknown")


def _refuse(status: int, error: str, detail: str, headers: dict | None = None):
    return JSONResponse({"error": error, "detail": detail}, status_code=status,
                        headers={"Cache-Control": "no-store", **(headers or {})})


async def _read_capped(request: Request, cap: int) -> bytes | None:
    size = request.headers.get("content-length", "")
    if size.isdigit() and int(size) > cap:
        return None
    buf = bytearray()
    async for chunk in request.stream():
        buf += chunk
        if len(buf) > cap:
            return None
    return bytes(buf)


app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "DELETE"],
                   allow_headers=["Content-Type", "X-Afferent-Code", "X-Revoke-Token"],
                   expose_headers=["X-Expires"], max_age=600)


@app.post("/share")
async def share(request: Request):
    t = now()
    if not upload_limit.allow(client_address(request), t):
        return _refuse(429, "too_many", "Too many shares from this address; try again later", {"Retry-After": "600"})
    if not _authorised(request.headers.get("x-afferent-code")):
        return _refuse(401, "wrong_code", "Wrong access code")
    blob = await _read_capped(request, SHARE_MAX_BYTES)
    if blob is None:
        return _refuse(413, "too_large", f"A share holds at most {SHARE_MAX_BYTES} bytes")
    if len(blob) < SHARE_MIN_BYTES or blob[0] != 1:
        return _refuse(400, "not_locked", "Expected a locked dashboard (format 1)")
    made = shares.put(blob, t)
    if made is None:
        return _refuse(503, "full", "No room for more shares right now; try again later", {"Retry-After": "3600"})
    sid, revoke, expires = made
    return JSONResponse({"id": sid, "expires": _iso(expires), "revoke": revoke}, status_code=201,
                        headers={"Cache-Control": "no-store"})


@app.get("/d/{sid}")
async def viewer(sid: str, request: Request):
    if not SHARE_ID.fullmatch(sid):
        return _refuse(404, "not_found", "No such share")
    if not read_limit.allow(client_address(request), now()):
        return _refuse(429, "too_many", "Too many requests; try again in a minute", {"Retry-After": "60"})
    return HTMLResponse(VIEWER, headers=VIEWER_HEADERS)


@app.get("/d/{sid}/blob")
async def blob(sid: str, request: Request):
    t = now()
    if not read_limit.allow(client_address(request), t):
        return _refuse(429, "too_many", "Too many requests; try again in a minute", {"Retry-After": "60"})
    s = shares.get(sid, t) if SHARE_ID.fullmatch(sid) else None
    if s is None:
        return _refuse(404, "gone", "This share has ended or was taken back")
    return Response(s["blob"], media_type="application/octet-stream",
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                             "X-Expires": _iso(s["expires"])})


@app.delete("/d/{sid}")
async def take_back(sid: str, request: Request):
    t = now()
    if not read_limit.allow(client_address(request), t):
        return _refuse(429, "too_many", "Too many requests; try again in a minute", {"Retry-After": "60"})
    done = shares.revoke(sid, request.headers.get("x-revoke-token", ""), t) if SHARE_ID.fullmatch(sid) else None
    if done is None:
        return _refuse(404, "gone", "This share has ended or was taken back")
    if done is False:
        return _refuse(403, "wrong_token", "Wrong revoke token")
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@app.websocket("/live")
async def live(ws: WebSocket):
    await ws.accept()
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), AUTH_TIMEOUT))
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await ws.close(4400, "expected an auth message")
        return
    if not _authorised(first.get("auth") if isinstance(first, dict) else None):
        await ws.close(4401, "wrong access code")
        return
    context = clean_context(first.get("context"))

    try:
        token = await access_token()
        upstream = await open_upstream(token)
    except Exception as e:
        await ws.close(1011, f"vertex unavailable: {type(e).__name__}")
        return

    async def to_phone():
        await upstream.send(json.dumps(setup_message(context)))
        async for msg in upstream:
            if isinstance(msg, bytes):
                msg = msg.decode()
            try:
                await ws.send_text(json.dumps(camel(json.loads(msg))))
            except ValueError:
                continue

    async def to_vertex():
        while True:
            try:
                d = json.loads(await ws.receive_text())
            except ValueError:
                continue
            # Only audio goes up: the phone cannot change the model, the prompt or the tools.
            if isinstance(d, dict) and isinstance(d.get("realtimeInput"), dict):
                await upstream.send(json.dumps({"realtimeInput": d["realtimeInput"]}))

    tasks = [asyncio.create_task(to_phone()), asyncio.create_task(to_vertex())]
    code, reason = 1000, "ended"
    try:
        done, _ = await asyncio.wait(tasks, timeout=MAX_SECONDS, return_when=asyncio.FIRST_COMPLETED)
        if not done:
            code, reason = 1000, "session time limit"
        elif tasks[0] in done:
            exc = tasks[0].exception()
            why = getattr(getattr(exc, "rcvd", None), "reason", None) or getattr(upstream, "close_reason", None)
            reason = f"vertex closed: {why}" if why else "vertex closed"
            code = 1011 if exc else 1000
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await upstream.close()
        try:
            await ws.close(code, reason[:120])
        except RuntimeError:
            pass
