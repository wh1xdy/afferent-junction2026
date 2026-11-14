import importlib.util
import sys
import threading
from pathlib import Path

TEAM = Path(__file__).resolve().parents[1] / "team"
ALEX = TEAM / "alex_hub"
DM_CLIENT = TEAM / "data_manager" / "client" / "data_manager_client.py"

_lock = threading.Lock()
_cache: dict = {}

def _exec(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def alex() -> dict:
    with _lock:
        if "alex" not in _cache:
            saved = sys.modules.get("store")
            try:
                store = _exec("afferent_team_alex_store", ALEX / "store.py")
                sys.modules["store"] = store
                mods = {n: _exec(f"afferent_team_alex_{n}", ALEX / f"{n}.py") for n in ("fhir", "report", "grounding")}
            finally:
                if saved is None:
                    sys.modules.pop("store", None)
                else:
                    sys.modules["store"] = saved
            _cache["alex"] = {"store": store, **mods}
        return _cache["alex"]

def dm_client():
    with _lock:
        if "dm_client" not in _cache:
            _cache["dm_client"] = _exec("afferent_team_dm_client", DM_CLIENT)
        return _cache["dm_client"]
