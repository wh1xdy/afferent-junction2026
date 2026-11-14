import asyncio
import json
import os

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import main


class FakeVertex:
    """Stands in for the Vertex WebSocket: records what it receives, replies with canned messages."""

    def __init__(self, replies):
        self.sent, self.replies, self.closed = [], replies, False
        self.close_rcvd = None

    async def send(self, msg):
        self.sent.append(json.loads(msg))

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for r in self.replies:
            yield r
        await asyncio.sleep(3600)

    async def close(self):
        self.closed = True


@pytest.fixture()
def vertex(monkeypatch):
    monkeypatch.setattr(main, "RELAY_CODE", "s3cret")
    monkeypatch.setattr(main, "_project", "demo-project")

    async def token():
        return "tok"

    monkeypatch.setattr(main, "access_token", token)
    fake = FakeVertex([
        json.dumps({"setup_complete": {}}).encode(),
        json.dumps({"server_content": {"input_transcription": {"text": "hi"}, "turn_complete": True}}),
    ])

    async def opener(t):
        assert t == "tok"
        return fake

    monkeypatch.setattr(main, "open_upstream", opener)
    return fake


def test_wrong_code_is_refused(vertex):
    with TestClient(main.app) as c, c.websocket_connect("/live") as ws:
        ws.send_text(json.dumps({"auth": "nope"}))
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_text()
    assert e.value.code == 4401
    assert vertex.sent == []


def test_relay_sets_up_vertex_and_forwards_audio_only(vertex):
    with TestClient(main.app) as c, c.websocket_connect("/live") as ws:
        ws.send_text(json.dumps({"auth": "s3cret"}))
        assert json.loads(ws.receive_text()) == {"setupComplete": {}}
        assert json.loads(ws.receive_text()) == {"serverContent": {"inputTranscription": {"text": "hi"}, "turnComplete": True}}
        ws.send_text(json.dumps({"setup": {"model": "evil"}}))
        ws.send_text(json.dumps({"realtimeInput": {"audio": {"data": "AAA=", "mimeType": "audio/pcm;rate=16000"}}}))
        for _ in range(50):
            if len(vertex.sent) >= 2:
                break
            ws.send_text("not json")
    setup = vertex.sent[0]["setup"]
    assert setup["model"] == f"projects/demo-project/locations/{main.LOCATION}/publishers/google/models/{main.MODEL}"
    assert "English" in setup["system_instruction"]["parts"][0]["text"]
    assert setup["input_audio_transcription"] == {} and setup["output_audio_transcription"] == {}
    assert vertex.sent[1:] == [{"realtimeInput": {"audio": {"data": "AAA=", "mimeType": "audio/pcm;rate=16000"}}}]


def test_relay_refuses_everything_when_no_code_is_configured(vertex, monkeypatch):
    monkeypatch.setattr(main, "RELAY_CODE", "")
    with TestClient(main.app) as c, c.websocket_connect("/live") as ws:
        ws.send_text(json.dumps({"auth": ""}))
        with pytest.raises(WebSocketDisconnect) as e:
            ws.receive_text()
    assert e.value.code == 4401


def test_clean_context():
    assert main.clean_context(None) is None
    assert main.clean_context("bad") is None
    assert main.clean_context({}) is None
    assert main.clean_context({"indicator": "bogus"}) is None          # nothing usable
    assert main.clean_context({"facts": []}) is None
    ctx = main.clean_context({"indicator": "bad", "date": "2026-11-15", "suggest_doctor": 1,
                              "facts": ["a" * 300, "  ", 42, "ok"]})
    assert ctx["indicator"] == "bad" and ctx["suggest_doctor"] is False
    assert ctx["date"] == "2026-11-15" and ctx["facts"] == ["a" * 160, "ok"]
    assert main.clean_context({"indicator": "watch", "day": "2026-11-15"})["date"] == "2026-11-15"


def test_context_colours_the_setup(vertex):
    with TestClient(main.app) as c, c.websocket_connect("/live") as ws:
        ws.send_text(json.dumps({"auth": "s3cret", "context": {
            "indicator": "bad", "date": "2026-11-15", "suggest_doctor": True,
            "facts": ["went outside on 0 of the last 5 days"]}}))
        assert json.loads(ws.receive_text()) == {"setupComplete": {}}
    text = vertex.sent[0]["setup"]["system_instruction"]["parts"][0]["text"]
    assert "went outside on 0 of the last 5 days" in text
    assert "doctor" in text and "home hub" in text and "English" in text


def test_garbage_context_changes_nothing(vertex):
    with TestClient(main.app) as c, c.websocket_connect("/live") as ws:
        ws.send_text(json.dumps({"auth": "s3cret", "context": {"indicator": {"bad": True}, "facts": "yes"}}))
        assert json.loads(ws.receive_text()) == {"setupComplete": {}}
    text = vertex.sent[0]["setup"]["system_instruction"]["parts"][0]["text"]
    assert "home hub" not in text and "English" in text


def test_camel_converts_nested_keys():
    assert main.camel({"server_content": {"model_turn": {"parts": [{"inline_data": {"mime_type": "x"}}]}}}) == \
        {"serverContent": {"modelTurn": {"parts": [{"inlineData": {"mimeType": "x"}}]}}}


# --- Shared dashboards (POST /share, GET /d/<id>, GET /d/<id>/blob, DELETE /d/<id>) ---

CODE = {"X-Afferent-Code": "s3cret"}


def locked(n=300):
    """What the phone uploads: format byte 1, then nonce, ciphertext and tag (opaque to the relay)."""
    return bytes([1]) + os.urandom(n)


@pytest.fixture()
def relay(monkeypatch):
    monkeypatch.setattr(main, "RELAY_CODE", "s3cret")
    monkeypatch.setattr(main, "shares", main.Shares())
    monkeypatch.setattr(main, "upload_limit", main.Limiter(lambda: main.SHARE_UPLOADS_PER_HOUR, 3600))
    monkeypatch.setattr(main, "read_limit", main.Limiter(lambda: main.SHARE_READS_PER_MINUTE, 60))
    clock = {"t": 1_800_000_000.0}
    monkeypatch.setattr(main, "now", lambda: clock["t"])
    with TestClient(main.app) as c:
        c.clock = clock
        yield c


def test_share_keeps_the_locked_bytes_and_serves_the_viewer(relay):
    blob = locked()
    r = relay.post("/share", content=blob, headers={**CODE, "Content-Type": "application/octet-stream"})
    assert r.status_code == 201 and r.headers["cache-control"] == "no-store"
    out = r.json()
    assert set(out) == {"id", "expires", "revoke"}
    assert main.SHARE_ID.fullmatch(out["id"]) and len(out["revoke"]) >= 32
    assert out["expires"] == main._iso(relay.clock["t"] + 7 * 24 * 3600)

    got = relay.get(f"/d/{out['id']}/blob")
    assert got.status_code == 200 and got.content == blob
    assert got.headers["content-type"] == "application/octet-stream"
    assert got.headers["cache-control"] == "no-store" and got.headers["x-expires"] == out["expires"]

    page = relay.get(f"/d/{out['id']}")
    assert page.status_code == 200 and page.text == main.VIEWER
    csp = page.headers["content-security-policy"]
    assert "default-src 'none'" in csp and "connect-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert page.headers["referrer-policy"] == "no-referrer" and page.headers["cache-control"] == "no-store"


def test_viewer_unlocks_in_the_browser_and_never_logs_the_key():
    v = main.VIEWER
    assert v.count("location.hash") == 1, "the key is read once"
    for leak in ("console.", "localStorage", "sessionStorage", "indexedDB", "sendBeacon", "XMLHttpRequest", "location.href"):
        assert leak not in v, leak
    assert "fetch('/d/' + m[1] + '/blob'" in v, "the only request is for the locked bytes, by path"
    assert "setAttribute('sandbox', 'allow-scripts')" in v and "allow-same-origin" not in v
    assert "AES-GCM" in v and "afferent.dashboard/1" in v


def test_share_needs_the_access_code(relay, monkeypatch):
    for headers in ({}, {"X-Afferent-Code": "nope"}, {"X-Afferent-Code": ""}):
        assert relay.post("/share", content=locked(), headers=headers).status_code == 401
    monkeypatch.setattr(main, "RELAY_CODE", "")
    assert relay.post("/share", content=locked(), headers={"X-Afferent-Code": ""}).status_code == 401
    assert main.shares.items == {}


def test_share_size_limits(relay, monkeypatch):
    monkeypatch.setattr(main, "SHARE_MAX_BYTES", 1000)
    assert relay.post("/share", content=locked(1000), headers=CODE).status_code == 413, "1001 bytes"
    assert relay.post("/share", content=iter([locked(500), os.urandom(600)]), headers=CODE).status_code == 413, \
        "a body without Content-Length is counted while it streams"
    assert relay.post("/share", content=locked(999), headers=CODE).status_code == 201, "exactly the limit"
    assert relay.post("/share", content=locked(10), headers=CODE).status_code == 400, "shorter than nonce and tag"
    assert relay.post("/share", content=b"{\"html\": \"<p>plain</p>\"}" + bytes(40), headers=CODE).status_code == 400, \
        "not a locked dashboard"
    assert len(main.shares.items) == 1


def test_default_limit_is_about_two_megabytes():
    assert main.SHARE_MAX_BYTES == 2 * 1024 * 1024 and main.SHARE_TTL == 7 * 24 * 3600


def test_share_ends_after_seven_days(relay):
    sid = relay.post("/share", content=locked(), headers=CODE).json()["id"]
    relay.clock["t"] += 7 * 24 * 3600 - 1
    assert relay.get(f"/d/{sid}/blob").status_code == 200
    relay.clock["t"] += 1
    gone = relay.get(f"/d/{sid}/blob")
    assert gone.status_code == 404 and gone.json()["error"] == "gone"
    assert main.shares.items == {} and main.shares.total == 0
    assert relay.get(f"/d/{sid}").status_code == 200, "the viewer still loads and says the share has ended"


def test_patient_takes_a_share_back(relay):
    out = relay.post("/share", content=locked(), headers=CODE).json()
    sid = out["id"]
    assert relay.delete(f"/d/{sid}").status_code == 403
    assert relay.delete(f"/d/{sid}", headers={"X-Revoke-Token": "guess"}).status_code == 403
    assert relay.delete(f"/d/{sid}", headers={"X-Revoke-Token": CODE["X-Afferent-Code"]}).status_code == 403, \
        "the access code is not a revoke token"
    assert relay.get(f"/d/{sid}/blob").status_code == 200
    assert relay.delete(f"/d/{sid}", headers={"X-Revoke-Token": out["revoke"]}).status_code == 204
    assert relay.get(f"/d/{sid}/blob").status_code == 404
    assert relay.delete(f"/d/{sid}", headers={"X-Revoke-Token": out["revoke"]}).status_code == 404


def test_unknown_and_malformed_ids(relay):
    assert relay.get("/d/short").status_code == 404
    assert relay.get("/d/" + "A" * 22 + "/blob").status_code == 404
    assert relay.get("/d/../health/blob").status_code == 404
    assert relay.delete("/d/" + "A" * 22, headers={"X-Revoke-Token": "x"}).status_code == 404


def test_upload_rate_limit_per_address(relay, monkeypatch):
    monkeypatch.setattr(main, "SHARE_UPLOADS_PER_HOUR", 2)
    a, b = {"X-Forwarded-For": "1.2.3.4, 10.0.0.1"}, {"X-Forwarded-For": "10.0.0.2"}
    assert relay.post("/share", content=locked(), headers={**CODE, **a}).status_code == 201
    assert relay.post("/share", content=locked(), headers={"X-Afferent-Code": "wrong", **a}).status_code == 401
    r = relay.post("/share", content=locked(), headers={**CODE, **a})
    assert r.status_code == 429 and r.headers["retry-after"], "wrong codes count too, so the code cannot be guessed here"
    assert relay.post("/share", content=locked(), headers={**CODE, **b}).status_code == 201, "another address"
    relay.clock["t"] += 3600
    assert relay.post("/share", content=locked(), headers={**CODE, **a}).status_code == 201


def test_read_rate_limit(relay, monkeypatch):
    monkeypatch.setattr(main, "SHARE_READS_PER_MINUTE", 3)
    sid = relay.post("/share", content=locked(), headers=CODE).json()["id"]
    assert [relay.get(f"/d/{sid}/blob").status_code for _ in range(4)] == [200, 200, 200, 429]
    relay.clock["t"] += 60
    assert relay.get(f"/d/{sid}").status_code == 200


def test_store_has_a_ceiling(relay, monkeypatch):
    monkeypatch.setattr(main, "SHARE_MAX_COUNT", 2)
    assert [relay.post("/share", content=locked(), headers=CODE).status_code for _ in range(3)] == [201, 201, 503]
    relay.clock["t"] += main.SHARE_TTL
    assert relay.post("/share", content=locked(), headers=CODE).status_code == 201, "ended shares make room"
    monkeypatch.setattr(main, "SHARE_TOTAL_BYTES", 1000)
    assert relay.post("/share", content=locked(990), headers=CODE).status_code == 503


def test_phone_app_may_call_share_from_its_own_origin(relay):
    r = relay.options("/share", headers={"Origin": "capacitor://localhost", "Access-Control-Request-Method": "POST",
                                         "Access-Control-Request-Headers": "content-type,x-afferent-code"})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == "*"
    assert "x-afferent-code" in r.headers["access-control-allow-headers"].lower()
    r = relay.options("/d/" + "A" * 22, headers={"Origin": "https://localhost", "Access-Control-Request-Method": "DELETE",
                                                  "Access-Control-Request-Headers": "x-revoke-token"})
    assert r.status_code == 200 and "DELETE" in r.headers["access-control-allow-methods"]
