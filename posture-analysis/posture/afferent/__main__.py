"""`python -m afferent` -> uvicorn server on 0.0.0.0:8000."""
from __future__ import annotations

import os
import sys


def main() -> int:
    import uvicorn
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("afferent.server:app", host=host, port=port,
                log_level=os.environ.get("LOG_LEVEL", "info"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
