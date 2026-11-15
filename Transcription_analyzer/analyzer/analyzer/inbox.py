"""Claim and settle transcript files shared with afferent-home-hub."""
from __future__ import annotations

import ctypes
import errno
import logging
import os
import time
from pathlib import Path

logger = logging.getLogger(__name__)

_AT_FDCWD = -100
_RENAME_NOREPLACE = 1


def _rename_noreplace(source: Path, destination: Path) -> None:
    try:
        renameat2 = ctypes.CDLL(None, use_errno=True).renameat2
    except AttributeError:
        renameat2 = None
    if renameat2 is not None:
        renameat2.argtypes = [
            ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p,
            ctypes.c_uint,
        ]
        renameat2.restype = ctypes.c_int
        result = renameat2(
            _AT_FDCWD, os.fsencode(source), _AT_FDCWD,
            os.fsencode(destination), _RENAME_NOREPLACE)
        if result == 0:
            return
        code = ctypes.get_errno()
        if code == errno.EEXIST:
            raise FileExistsError(code, os.strerror(code), str(destination))
        if code not in (errno.ENOSYS, errno.EINVAL, errno.ENOTSUP):
            raise OSError(code, os.strerror(code), str(source), str(destination))
    try:
        os.link(source, destination)
    except FileExistsError:
        raise
    else:
        source.unlink()


def _rename_unique(source: Path, suffix: str,
                   base_name: str | None = None) -> Path:
    base_name = base_name or source.name
    while True:
        destination = source.with_name(
            f"{base_name}.{time.time_ns()}.{suffix}")
        try:
            _rename_noreplace(source, destination)
            return destination
        except FileExistsError:
            continue


def claim(directory: str | Path) -> list[Path]:
    """Move new hub JSONL files aside and include claims left by a crash."""
    directory = Path(directory)
    if not directory.is_dir():
        return []

    stale = sorted(path for path in directory.glob("*.analyzing")
                   if path.is_file())
    claimed = []
    for source in sorted(directory.glob("transcript-*.jsonl")):
        if not source.is_file():
            continue
        try:
            claimed.append(_rename_unique(source, "analyzing"))
        except FileNotFoundError:
            continue

    new_count = len(claimed)
    claimed.extend(path for path in stale if path.exists())
    logger.info("hub inbox claimed %d file(s): %d new, %d stale",
                len(claimed), new_count, len(claimed) - new_count)
    return claimed


def settle(paths: list[Path], file_errors: dict[str, int]) -> dict[str, int]:
    """Delete clean claims and preserve errored ones for manual inspection."""
    deleted = failed = 0
    for path in paths:
        errors = file_errors.get(str(path), file_errors.get(path.name, 0))
        if errors:
            claimed_name = path.name.removesuffix(".analyzing")
            original, separator, claim_id = claimed_name.rpartition(".")
            if not separator or not claim_id.isdigit():
                original = claimed_name
            _rename_unique(path, "failed", original)
            failed += 1
            logger.info("hub inbox retained one failed file")
        else:
            path.unlink(missing_ok=True)
            deleted += 1
            logger.info("hub inbox deleted one successfully analyzed file")
    logger.info("hub inbox settled %d file(s): %d deleted, %d failed",
                len(paths), deleted, failed)
    return {"deleted": deleted, "failed": failed}
