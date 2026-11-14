import hashlib
import json
import subprocess
import sys
from pathlib import Path

from .loader import TEAM

MANIFEST = TEAM / "manifest.json"


def blob_id(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def entries(module: str | None = None) -> list[dict]:
    rows = json.loads(MANIFEST.read_text())
    return [r for r in rows if module is None or r["path"].split("/")[0] == module]


def _git(*args) -> bytes:
    return subprocess.run(["git", *args], cwd=TEAM, check=True, capture_output=True).stdout


def resync(module: str | None = None) -> list[str]:
    rows, changed = json.loads(MANIFEST.read_text()), []
    for r in rows:
        if module and r["path"].split("/")[0] != module:
            continue
        data = _git("show", f"{r['branch']}:{r['source']}")
        dest = TEAM / r["path"]
        dest.parent.mkdir(parents=True, exist_ok=True)
        if not dest.exists() or dest.read_bytes() != data:
            dest.write_bytes(data)
            changed.append(r["path"])
        r["tip"] = _git("rev-parse", "--short=7", r["branch"]).decode().strip()
        r["commit"] = _git("log", "-1", "--format=%h", r["branch"], "--", f":(top){r['source']}").decode().strip()
        r["blob"] = blob_id(data)
    MANIFEST.write_text(json.dumps(rows, indent=1) + "\n")
    return changed


if __name__ == "__main__":
    for path in resync(sys.argv[1] if len(sys.argv) > 1 else None):
        print("updated", path)
