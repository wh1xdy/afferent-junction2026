"""Voice-companion transcripts from the phone app, kept as plain files.

Each `transcript` message over /ws/app appends one JSON line to the current file in `dir`
(default `hub/data/transcripts/`, next to afferent.db, both on the hub's persistent storage).

A ring buffer: files rotate at `file_max` bytes and the oldest are removed once the
directory passes `total_max` — 500 MB of 10 MB files by default, so the hub never fills.
Lines are self-contained records carrying `transcript_id`, so consumers can dedupe a
message that was written twice (resent after a lost ack across a hub restart).
"""
import json
import logging
import threading
from collections import deque
from pathlib import Path

log = logging.getLogger("afferent.transcripts")

FILE_MAX = 10 * 1024 * 1024     # rotate one file past ~10 MB
TOTAL_MAX = 500 * 1024 * 1024   # keep at most ~500 MB over all files
RECORD_MAX = 4 * 1024 * 1024    # a single transcript bigger than this is rejected
SEEN_MAX = 512                  # resent transcript_ids deduped within this window


class TranscriptLog:
    def __init__(self, dir, file_max: int = FILE_MAX, total_max: int = TOTAL_MAX):
        self.dir = Path(dir)
        self.file_max = file_max
        self.total_max = total_max
        self._lock = threading.Lock()
        self._seen = deque(maxlen=SEEN_MAX)
        self._seen_set: set = set()
        self.dir.mkdir(parents=True, exist_ok=True)

    def _files(self) -> list[Path]:
        return sorted(self.dir.glob("transcript-*.jsonl"))

    def _current(self) -> Path:
        files = self._files()
        if files and files[-1].stat().st_size < self.file_max:
            return files[-1]
        try:
            seq = int(files[-1].stem.rsplit("-", 1)[1]) + 1 if files else 1
        except ValueError:
            seq = len(files) + 1
        return self.dir / f"transcript-{seq:06d}.jsonl"

    def write(self, record: dict) -> bool:
        """Append the record as one JSONL row. False if this transcript_id was already stored."""
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n"
        if len(line) > RECORD_MAX:
            raise ValueError("transcript too large")
        tid = record.get("transcript_id")
        with self._lock:
            if tid and tid in self._seen_set:
                return False
            path = self._current()
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
            if tid:
                if len(self._seen) == self._seen.maxlen:
                    self._seen_set.discard(self._seen[0])
                self._seen.append(tid)
                self._seen_set.add(tid)
            self._prune()
        return True

    def _prune(self):
        files = self._files()
        total = sum(f.stat().st_size for f in files)
        for f in files[:-1]:                    # the newest file is never removed
            if total <= self.total_max:
                break
            try:
                size = f.stat().st_size
                f.unlink()
                total -= size
            except OSError:
                log.warning("could not remove old transcript file %s", f)
