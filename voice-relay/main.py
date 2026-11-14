"""Voice relay for Afferent: phone <-> Gemini Live on Vertex AI.

The phone cannot hold Google Cloud credentials, and a browser WebSocket cannot send the
`Authorization` header Vertex needs. This service holds the identity (Cloud Run's service
account), opens the Vertex session with a fixed setup and system prompt, and relays audio
and transcripts. The phone only proves it knows RELAY_CODE.
"""
import asyncio
import hmac
import json
import os
import re

import google.auth
import google.auth.transport.requests
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

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
    "Chat about light, ordinary things and follow the person's lead: pets and animals, food and cooking — a dish",
    " they are proud of, a meal they loved — nature and trees, seasons, music, small daily moments. These are",
    " examples, not a script: pick topics freely and vary them, and never return to a question or a subject",
    " already covered in this conversation.",
    "Practise active listening in the spirit of Carl Rogers: reflect back what you hear, name the feeling",
    " underneath it, ask short open questions, and give the person room to answer.",
    "Always speak English, whatever language you hear.",
    "Be warm, calm and brief: one to three short sentences, then let the person talk. Ask one question at a time.",
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
