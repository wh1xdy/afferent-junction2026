#!/usr/bin/env python3
"""Two-agent conversation simulator v0.

Drives a dialogue between the interlocutor (Nova) and the simulated person
(Maggie) by calling the `claude` CLI (`claude -p`) once per turn, with the
whole conversation so far replayed as context. Stateless calls keep the
harness simple and deterministic in structure; the behavioural difference
between runs comes entirely from the active state in Maggie's prompt.

Usage:
    python3 simulate.py --state depressed --turns 48 --out ../data/transcripts/

Requires: `claude` on PATH, authenticated (OAuth or ANTHROPIC_API_KEY).
Never hard-code credentials in this file.
"""

import argparse
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PROMPTS = os.path.normpath(os.path.join(HERE, "..", "prompts"))
INTERLOCUTOR_PROMPT = os.path.join(PROMPTS, "interlocutor.md")
PERSON_PROMPT = os.path.join(PROMPTS, "simulated_person.md")

PERSONA_ID = "p001_maggie"
INTERLOCUTOR = "interlocutor"
TARGET = "target"

# Per-state label vectors (0-100 sub-indices + drift flag), following the
# §3 signal table of Transcription_analyzer/README.md. Values are the
# intended ground truth; the generator injects the behaviour that produces
# them.
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

# Simulated turn-gap distributions (seconds between the end of the
# previous turn and the start of this one), per speaker and state.
# Ranges are (min, max); "occasional" long gaps are added via a tail draw.
GAP = {
    INTERLOCUTOR: (1.0, 3.5),
    TARGET: {
        "normal":    (1.5, 5.0),
        "joyful":    (1.0, 4.0),
        "sad":       (4.0, 10.0),
        "depressed": (8.0, 22.0),
    },
}
LONG_TAIL_PROB = {"normal": 0.03, "joyful": 0.02, "sad": 0.08, "depressed": 0.15}
LONG_TAIL_EXTRA = {"normal": (5, 10), "joyful": (4, 8),
                   "sad": (8, 16), "depressed": (12, 30)}
# Rough speaking duration used to advance t within a turn (~3 words/s).
WORDS_PER_SEC = 3.0

CLINICAL_NOTE = ("State note for this conversation: Maggie is in the "
                 "'{state}' state. Apply exactly that state block from "
                 "your instructions.")


def load(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def call_agent(system_prompt, user_msg, scratch_dir, retries=2):
    """One claude -p call; returns the spoken line."""
    with tempfile.NamedTemporaryFile("w", suffix=".md", dir=scratch_dir,
                                     delete=False) as sf:
        sf.write(system_prompt)
        sp_file = sf.name
    cmd = ["claude", "-p", "--system-prompt-file", sp_file,
           "--output-format", "json"]
    last_err = None
    for attempt in range(retries + 1):
        try:
            proc = subprocess.run(
                cmd, input=user_msg, capture_output=True, text=True,
                timeout=180, cwd=scratch_dir)
            if proc.returncode != 0:
                last_err = f"rc={proc.returncode}: {proc.stderr.strip()[:300]}"
                continue
            data = json.loads(proc.stdout)
            if data.get("is_error"):
                last_err = f"is_error: {str(data.get('result'))[:300]}"
                continue
            text = data.get("result", "").strip()
            if text:
                return clean_line(text)
        except (subprocess.TimeoutExpired, json.JSONDecodeError,
                OSError) as e:
            last_err = repr(e)
    raise RuntimeError(f"agent call failed after retries: {last_err}")


def clean_line(text):
    """Strip speaker labels, quotes and stage directions from a reply."""
    text = text.strip()
    text = re.sub(r"^(Nova|Maggie|Margaret)\s*[:\-–]\s*", "", text,
                  flags=re.IGNORECASE)
    if len(text) > 1 and text[0] in '"\u201c' and text[-1] in '"\u201d':
        text = text[1:-1].strip()
    text = re.sub(r"\*[^*]*\*", "", text).strip()
    # Keep only the first paragraph — a single turn.
    return text.split("\n\n")[0].strip()


def format_history(turns, perspective):
    """Render the transcript so far for one agent's eyes."""
    name = {INTERLOCUTOR: "Nova", TARGET: "Maggie"}
    lines = [f"{name[sp]}: {txt}" for sp, txt in turns]
    other = "Maggie" if perspective == INTERLOCUTOR else "Nova"
    instruction = (
        f"It is now {name[perspective]}'s turn. "
        f"Reply with ONLY {name[perspective]}'s next spoken line "
        f"(no name prefix, no narration, no quotation marks).")
    header = f"Conversation with {other} this afternoon so far:\n\n"
    return header + "\n".join(lines) + "\n\n" + instruction


def gap_for(speaker, state, rng):
    lo, hi = (GAP[INTERLOCUTOR] if speaker == INTERLOCUTOR
              else GAP[TARGET][state])
    g = rng.uniform(lo, hi)
    if speaker == TARGET and rng.random() < LONG_TAIL_PROB[state]:
        g += rng.uniform(*LONG_TAIL_EXTRA[state])
    return g


def run_conversation(state, n_turns, seed):
    rng = random.Random(seed)
    nora_sys = load(INTERLOCUTOR_PROMPT)
    maggie_sys = load(PERSON_PROMPT) + "\n\n" + CLINICAL_NOTE.format(state=state)

    scratch = tempfile.mkdtemp(prefix=f"sim-{state}-")
    turns, records = [], []
    t = 0.0
    for i in range(n_turns):
        speaker = INTERLOCUTOR if i % 2 == 0 else TARGET
        t += gap_for(speaker, state, rng)
        history = format_history(turns, speaker)
        sys_p = nora_sys if speaker == INTERLOCUTOR else maggie_sys
        line = call_agent(sys_p, history, scratch)
        turns.append((speaker, line))
        records.append({"t": round(t, 1), "speaker": speaker, "text": line})
        t += max(0.8, len(line.split()) / WORDS_PER_SEC)  # speech duration
        print(f"[{state}] {i+1:02d} {speaker}: {line[:90]}", flush=True)
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", required=True,
                    choices=sorted(STATE_LABELS))
    ap.add_argument("--turns", type=int, default=48)
    ap.add_argument("--day", type=int, default=1)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    seed = args.seed if args.seed is not None else hash(args.state) & 0xFFFF
    records = run_conversation(args.state, args.turns, seed)

    doc = {
        "persona_id": PERSONA_ID,
        "day": args.day,
        "trajectory": args.state,
        "turns": records,
        "labels": STATE_LABELS[args.state],
        "meta": {
            "generator": "two-agent claude-cli simulator v0",
            "interlocutor_prompt": "prompts/interlocutor.md",
            "person_prompt": "prompts/simulated_person.md",
            "seed": seed,
            "simulated_timestamps": True,
        },
    }
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f"{PERSONA_ID}_day{args.day:02d}_{args.state}.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, ensure_ascii=False) + "\n")
    print(f"saved {path} ({len(records)} turns)")


if __name__ == "__main__":
    sys.exit(main())
