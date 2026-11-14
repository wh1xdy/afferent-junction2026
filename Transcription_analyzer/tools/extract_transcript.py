#!/usr/bin/env python3
"""Extract a simulated dialogue from AgentControl session journals.

The two simulator sessions (interlocutor + simulated person) exchange
spoken lines through `agentcontrol_send_message`; the daemon records every
peer_message in both sessions' `events.jsonl`. This script rebuilds the
ordered transcript from one journal, drops the DONE sentinel, assigns
*simulated* inter-turn timestamps (so the response-latency signal matches
the intended state rather than agent/LLM round-trip time) and writes the
JSONL record described in README §5.3.

Usage:
    python3 extract_transcript.py --nora s-3814a9fc --maggie s-e6c36d49 \
        --state normal --day 1 --engine "devin/swe-2-max" \
        --out ../data/transcripts/
"""

import argparse
import json
import os
import random
import re
import sys

SESSIONS = os.path.expanduser("~/.agentcontrol/sessions")
INTERLOCUTOR = "interlocutor"
TARGET = "target"
WORDS_PER_SEC = 3.0

GAP_TARGET = {
    "normal":    (1.5, 5.0),
    "joyful":    (1.0, 4.0),
    "sad":       (4.0, 10.0),
    "depressed": (8.0, 22.0),
}
GAP_INTERLOCUTOR = (1.0, 3.5)
LONG_TAIL_PROB = {"normal": 0.03, "joyful": 0.02, "sad": 0.08, "depressed": 0.15}
LONG_TAIL_EXTRA = {"normal": (5, 10), "joyful": (4, 8),
                   "sad": (8, 16), "depressed": (12, 30)}

STATE_LABELS = {
    "normal":    {"responsiveness": 82, "engagement": 80, "fluency": 84,
                  "coherence": 88, "drift_flag": False},
    "joyful":    {"responsiveness": 88, "engagement": 92, "fluency": 82,
                  "coherence": 88, "drift_flag": False},
    "sad":       {"responsiveness": 55, "engagement": 48, "fluency": 70,
                  "coherence": 78, "drift_flag": True},
    "depressed": {"responsiveness": 28, "engagement": 22, "fluency": 55,
                  "coherence": 72, "drift_flag": True},
}


def clean_line(text):
    text = text.strip()
    text = re.sub(r"^(Nova|Maggie|Margaret|interlocutor|target)\s*[:\-–]\s*",
                  "", text, flags=re.IGNORECASE)
    if len(text) > 1 and text[0] in '"\u201c' and text[-1] in '"\u201d':
        text = text[1:-1].strip()
    return text


def read_turns(journal_path, nora_sid, maggie_sid):
    """Ordered (speaker, text) from peer_messages exchanged between the pair."""
    turns = []
    seen_done = False
    with open(journal_path, encoding="utf-8") as f:
        for line in f:
            ev = json.loads(line)
            if ev.get("type") != "peer_message":
                continue
            src, dst = ev.get("from_session"), ev.get("to_session")
            pair = {src, dst}
            if pair != {nora_sid, maggie_sid}:
                continue
            text = clean_line(ev.get("text", ""))
            if text.strip() == "DONE":
                seen_done = True
                continue
            # Each exchange is logged in BOTH journals; when reading one
            # journal, a message appears once. Dedupe defensively on
            # consecutive duplicates anyway.
            speaker = INTERLOCUTOR if src == nora_sid else TARGET
            if turns and turns[-1] == (speaker, text):
                continue
            turns.append((speaker, text))
    return turns, seen_done


def assign_timestamps(turns, state, seed):
    rng = random.Random(seed)
    records, t = [], 0.0
    for speaker, text in turns:
        lo, hi = (GAP_INTERLOCUTOR if speaker == INTERLOCUTOR
                  else GAP_TARGET[state])
        gap = rng.uniform(lo, hi)
        if speaker == TARGET and rng.random() < LONG_TAIL_PROB[state]:
            gap += rng.uniform(*LONG_TAIL_EXTRA[state])
        t += gap
        records.append({"t": round(t, 1), "speaker": speaker, "text": text})
        t += max(0.8, len(text.split()) / WORDS_PER_SEC)
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nora", required=True)
    ap.add_argument("--maggie", required=True)
    ap.add_argument("--state", required=True, choices=sorted(STATE_LABELS))
    ap.add_argument("--day", type=int, default=1)
    ap.add_argument("--engine", required=True,
                    help="e.g. 'devin/swe-2-max' or 'cursor/auto'")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--persona", default="p001_maggie")
    args = ap.parse_args()

    journal = os.path.join(SESSIONS, args.maggie, "events.jsonl")
    turns, seen_done = read_turns(journal, args.nora, args.maggie)
    if not turns:
        sys.exit(f"no turns found in {journal}")
    if not seen_done:
        print(f"warning: DONE sentinel not seen in {journal} "
              f"({len(turns)} turns so far)", file=sys.stderr)

    records = assign_timestamps(turns, args.state, args.seed)
    doc = {
        "persona_id": args.persona,
        "day": args.day,
        "trajectory": args.state,
        "turns": records,
        "labels": STATE_LABELS[args.state],
        "meta": {
            "generator": "agentcontrol two-agent dialogue v0",
            "engine": args.engine,
            "interlocutor_session": args.nora,
            "person_session": args.maggie,
            "interlocutor_prompt": "prompts/interlocutor.md",
            "person_prompt": "prompts/simulated_person.md",
            "simulated_timestamps": True,
            "timestamp_seed": args.seed,
            "done_sentinel": seen_done,
        },
    }
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(
        args.out, f"{args.persona}_day{args.day:02d}_{args.state}.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, ensure_ascii=False) + "\n")
    n_target = sum(1 for r in records if r["speaker"] == TARGET)
    print(f"saved {path} — {len(records)} turns "
          f"({n_target} target, done={seen_done})")


if __name__ == "__main__":
    main()
