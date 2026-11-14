import asyncio
import json

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


def test_camel_converts_nested_keys():
    assert main.camel({"server_content": {"model_turn": {"parts": [{"inline_data": {"mime_type": "x"}}]}}}) == \
        {"serverContent": {"modelTurn": {"parts": [{"inlineData": {"mimeType": "x"}}]}}}
