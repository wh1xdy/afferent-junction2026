"""CLI: `python -m analyzer.cli ...` — the non-HTTP trigger path (cron, ssh)."""
from __future__ import annotations

import argparse
import json
import logging
import sys

from .backend import make_backend
from .config import load
from .pipeline import Runner
from .store import Store


def main() -> None:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser(prog="analyzer")
    p.add_argument("--config", help="YAML config path")
    sub = p.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run-once",
                         help="load the model, score pending windows, unload")
    run.add_argument("--rescore", action="store_true",
                     help="re-score windows already in the DB")

    sub.add_parser("metrics-only",
                   help="extract deterministic metrics, no model needed")

    idx = sub.add_parser("index", help="print the drift index for a day")
    idx.add_argument("--day", help="default: latest scored day")

    args = p.parse_args()
    cfg = load(args.config)

    if args.cmd == "run-once":
        result = Runner(cfg, make_backend(cfg.model)).run_batch_locked(
            rescore=args.rescore)
        print(json.dumps(result, indent=2))
        return

    if args.cmd == "metrics-only":
        from . import metrics, transcript
        for path in sorted(cfg.transcripts_dir.glob("*.jsonl")):
            for rec in transcript.load_jsonl(path, cfg.target_speaker):
                m = metrics.extract(rec, cfg.target_speaker)
                print(json.dumps({"record_id": rec.record_id,
                                  "day": rec.day, "metrics": m}))
        return

    if args.cmd == "index":
        with Store(cfg.db_path) as store:
            d = args.day or (store.days(limit=1) or [None])[0]
            if d is None:
                sys.exit("no scored days yet")
            out = store.drift_index(d, cfg.baseline_days)
        print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
