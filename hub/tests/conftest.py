import pytest
from fastapi.testclient import TestClient

from afferent_hub.main import create_app
from afferent_hub.settings import Settings


@pytest.fixture()
def client(tmp_path):
    app = create_app(Settings(db=str(tmp_path / "t.db"), bedside="ws", validation=False))
    with TestClient(app) as c:
        yield c
