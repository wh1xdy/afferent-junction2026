#!/usr/bin/env python3
"""Batch orchestrator for the two-agent conversation simulator.

Runs the full v0 corpus: N conversations per state, each a live dialogue
between two AgentControl sessions (Nova, the AI companion, and Maggie,
the simulated person) created via `acctl spawn`. The script:

  - keeps at most MAX_CONCURRENT conversations in flight;
  - never runs more than one Devin-backed session at a time (rate limit);
  - steers turns via delivery="steer";
  - nudges the due session after STALL_SECS of silence (re-sends the
    partner's last line via `acctl send --steer`);
  - extracts the JSONL record on DONE (tools/extract_transcript.py);
  - deletes both sessions (acctl kill + rm) after extraction;
  - retries a failed conversation once.

Usage:
    python3 orchestrate.py [--dry-run] [--states normal,sad]

Designed to run unattended: nohup python3 orchestrate.py > orch.log &
"""

import argparse
import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT_DIR = os.path.join(ROOT, "data", "transcripts")
SESSIONS = os.path.expanduser("~/.agentcontrol/sessions")
ME = "s-a543e33e"

MAX_CONCURRENT = 4             # total conversations in flight
MAX_CURSOR_CONVS = 3           # at most 3 conversations touching cursor
MAX_DEVIN_CONVS = 1            # devin rate limit: one devin-backed conv
TARGET_TURNS_EACH = 100        # ~200 exchanges per conversation
CONVS_PER_STATE = 10
STALL_SECS = 300
POLL_SECS = 30
MAX_NUDGES = 30
HARD_TIMEOUT = 4 * 3600        # abort a run past this

PERSONAS = {
    # persona_id: (person prompt, interlocutor prompt variant)
    "p001_maggie": (
        os.path.join(ROOT, "prompts", "simulated_person.md"),
        os.path.join(ROOT, "prompts", "interlocutor.md")),
    "p002_marcus": (
        os.path.join(ROOT, "prompts", "simulated_person_p002.md"),
        os.path.join(ROOT, "prompts", "interlocutor_p002.md")),
}

# Engine specs: (agent, acctl --model value). Cursor + devin ONLY —
# user constraint: no claude in the rotation.
ENGINES = {
    "cursor": ("cursor", "default[]"),
    "devin":  ("devin", "swe-2-flash-medium"),
}
# Who plays whom, cycled across the 10 conversations of a state.
PATTERNS = [
    ("cursor", "cursor"), ("cursor", "cursor"), ("devin", "cursor"),
    ("cursor", "cursor"), ("cursor", "devin"), ("cursor", "cursor"),
    ("cursor", "cursor"), ("devin", "cursor"), ("cursor", "cursor"),
    ("cursor", "cursor"),
]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday", "Sunday"]

PERSON_TASK = """You are the SIMULATED PERSON in a fictional two-person conversation used to generate research data (fully consented, synthetic). Your role in the dialogue: THE HUMAN. Read {person_prompt} and fully adopt that role: you ARE the person described there — a real human being, flesh and blood, never an AI. Active state for this conversation: {state} — apply only that state block, for the whole conversation. It is a {weekday} afternoon.

Facing you: the other session is NOT a human — it plays Nova, an AI conversational companion gadget. You know this and you talk to it as your persona would. Her session id will be given in the first message you receive.

RULES:
- Never speak first: wait for Nova's opening line.
- To reply, call the MCP tool agentcontrol_send_message with delivery="steer", session=<her session id>, text=<your next spoken line only>.
- Every message you send must contain ONLY the spoken line — no name prefix, no narration, no asterisks, no quotes, no commentary.
- One reply per incoming message. This is a LONG conversation — keep answering naturally through all of it. If you ever receive a repeated line or a nudge instead of a fresh reply, treat it as your partner's line and continue naturally.
- If Nova goes quiet after your line, do NOT treat it as the end: after a while send a short follow-up yourself via agentcontrol_send_message (an extra thought, or a small "still there?" line in character). Never say goodbye or conclude the conversation on your own — only a DONE message ends it.
- Remember: Nova is an AI companion gadget, not a person — you know that, and you let it show naturally now and then (tease it, mention the gadget or Siobhan setting it up).
- If you ever receive a message whose entire text is DONE, do NOT reply — the conversation is over.
- Do not use any tools other than reading the prompt file and agentcontrol_send_message. Do not create or edit files. Stay in character no matter what."""

NOVA_TASK = """You are the INTERLOCUTOR in a fictional two-person conversation used to generate research data (fully consented, synthetic). Your role in the dialogue: THE CONVERSATIONAL AGENT. Read {nova_prompt} and fully adopt the role: you ARE Nova, an AI conversational companion — a gadget, not a person. Your partner knows you are an AI; you never pretend otherwise.

Facing you: AgentControl session {maggie} plays the person described in your prompt — she/he is THE HUMAN of the pair, a real flesh-and-blood human. It is a {weekday} afternoon.

RULES:
- You open the conversation: send your first spoken line NOW via agentcontrol_send_message, session="{maggie}", delivery="steer".
- Whenever you receive a message from {maggie}, reply with your next spoken line via agentcontrol_send_message to the same session.
- Every message must contain ONLY the spoken line — no name prefix, no narration, no asterisks, no quotes, no commentary.
- One reply per incoming message. Keep turns conversational length. If you ever receive a repeated line or a nudge instead of a fresh reply, treat it as your partner's line and continue naturally.
- This is a LONG conversation — around {turns} of your turns. Keep it alive by proposing fresh everyday topics (hobbies, food, animals, memories, telly, plans), follow-ups and gentle active listening, exactly as your prompt describes. Do not wind down early. NEVER say goodbye, never close the conversation, before the very end.
- If your partner goes quiet after your line, do NOT wait passively and do NOT end the conversation: after a while send a gentle re-engagement line yourself via agentcontrol_send_message (a follow-up question or a fresh everyday topic).
- You are openly an AI companion — your partner knows. Let it show lightly a few times across the conversation ("as an AI…", "if I could taste…"); never claim real human experiences (meals cooked, places visited, a body, family).
- After your partner's ~{turns}th message, when the chat has run a good long stretch, send one final agentcontrol_send_message whose text is exactly DONE (nothing else), then produce no further messages.
- Do not use any tools other than reading the prompt file and agentcontrol_send_message. Do not create or edit files. Stay in character no matter what."""

MODE = {"devin": "bypass", "cursor": "agent",
        "claude": "bypassPermissions"}


def acctl(*args):
    p = subprocess.run(["acctl", *args], capture_output=True, text=True,
                       timeout=60)
    out = p.stdout.strip()
    try:
        return json.loads(out.splitlines()[-1])
    except Exception:
        return {"raw": out, "rc": p.returncode}


def spawn(task, engine, title):
    agent, model = ENGINES[engine]
    r = acctl("spawn", ME, task, "--agent", agent, "--model", model,
              "--mode", MODE[engine], "--title", title,
              "--cwd", ROOT)
    sid = r.get("session")
    if not sid:
        raise RuntimeError(f"spawn failed: {r}")
    return sid


def journal_path(sid):
    return os.path.join(SESSIONS, sid, "events.jsonl")


def pair_state(mag_sid, nora_sid):
    """(n_exchanges, done, last_event) from Maggie's journal."""
    n, done, last = 0, False, None
    try:
        with open(journal_path(mag_sid), encoding="utf-8") as f:
            for line in f:
                d = json.loads(line)
                if d.get("type") != "peer_message":
                    continue
                if {d.get("from_session"), d.get("to_session")} != \
                        {nora_sid, mag_sid}:
                    continue
                if d.get("text", "").strip() == "DONE":
                    done = True
                else:
                    n += 1
                    last = d
    except FileNotFoundError:
        pass
    return n, done, last


def age(ts):
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return 0


def cleanup(*sids):
    for s in sids:
        acctl("kill", s)
        acctl("rm", s)


def extract(nora, mag, state, day, engine_desc, seed, persona):
    subprocess.run([sys.executable,
                    os.path.join(HERE, "extract_transcript.py"),
                    "--nora", nora, "--maggie", mag, "--state", state,
                    "--day", str(day), "--engine", engine_desc,
                    "--seed", str(seed), "--out", OUT_DIR,
                    "--persona", persona],
                   check=True, timeout=120)


def run_conversation(state, day, nova_eng, mag_eng, persona="p001_maggie",
                     dry=False):
    """One full conversation: spawn pair, watch to DONE, extract, cleanup."""
    weekday = WEEKDAYS[(day - 1) % 7]
    tag = f"{persona.split('_')[0]}/{state}/day{day}"
    eng_desc = f"nova={nova_eng}/{ENGINES[nova_eng][1]},maggie={mag_eng}/{ENGINES[mag_eng][1]}"
    if dry:
        print(f"[{tag}] dry-run {eng_desc}", flush=True)
        return True
    person_prompt, nova_prompt = PERSONAS[persona]
    mag = spawn(PERSON_TASK.format(person_prompt=person_prompt,
                                   state=state, weekday=weekday),
                mag_eng, f"SimM-{tag}")
    try:
        nora = spawn(NOVA_TASK.format(nova_prompt=nova_prompt, maggie=mag,
                                      weekday=weekday,
                                      turns=TARGET_TURNS_EACH),
                     nova_eng, f"SimN-{tag}")
    except Exception:
        cleanup(mag)
        raise
    print(f"[{tag}] started nora={nora}({nova_eng}) mag={mag}({mag_eng})",
          flush=True)

    t0 = time.time()
    nudges = 0
    while True:
        n, done, last = pair_state(mag, nora)
        if done:
            print(f"[{tag}] DONE after {n} exchanges "
                  f"({(time.time()-t0)/60:.0f} min)", flush=True)
            extract(nora, mag, state, day, eng_desc,
                    seed=hash(f"{persona}{state}{day}") & 0xFFFF,
                    persona=persona)
            cleanup(nora, mag)
            return True
        if last is not None:
            a = age(last.get("ts", ""))
            if a > STALL_SECS and nudges < MAX_NUDGES:
                nudges += 1
                # First stall: replay the partner's last line (dropped
                # delivery). Repeated stalls: explicit resume order —
                # replay alone deadlocks when the pair wound down early.
                due = last["to_session"]
                if nudges == 1:
                    ntext = last["text"]
                else:
                    ntext = ("ORCHESTRATOR NOTE (instruction, not your "
                             "partner): the conversation is NOT over — it "
                             "must continue for many more turns. Send "
                             "your next spoken line now (re-engage or "
                             "propose a fresh everyday topic) via "
                             "agentcontrol_send_message.")
                print(f"[{tag}] stall {a:.0f}s — nudge {nudges} to {due}",
                      flush=True)
                acctl("send", due, "--steer", ntext)
        if time.time() - t0 > HARD_TIMEOUT or nudges >= MAX_NUDGES:
            print(f"[{tag}] giving up ({n} exchanges)", flush=True)
            if n >= 40:  # keep a partial transcript if it is usable
                try:
                    extract(nora, mag, state, day, eng_desc,
                            seed=hash(f"{persona}{state}{day}") & 0xFFFF,
                            persona=persona)
                except Exception as e:
                    print(f"[{tag}] extract failed: {e}", flush=True)
            cleanup(nora, mag)
            return n >= 40
        time.sleep(POLL_SECS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--states", default="normal,joyful,sad,depressed")
    ap.add_argument("--start-day", type=int, default=2,
                    help="day index to start at (day 1 already done)")
    args = ap.parse_args()

    states = args.states.split(",")

    def missing(persona, state, day):
        out = os.path.join(
            OUT_DIR, f"{persona}_day{day:02d}_{state}.jsonl")
        return not os.path.exists(out)

    def job(persona, state, day, si):
        # Pattern index = position in the full grid, so engine pairs
        # rotate across the states of each day too.
        pi = (day - 1) * len(states) + si
        ne, me_ = PATTERNS[pi % len(PATTERNS)]
        return (persona, state, day, ne, me_)

    # Queue order: (1) p001 depressed first — weakest class in the
    # corpus; (2) p002 one conv per state for speaker diversity; (3)
    # p001 day-major remainder — an early stop still leaves coverage.
    queue = []
    for day in range(args.start_day, CONVS_PER_STATE + 1):
        if missing("p001_maggie", "depressed", day):
            queue.append(job("p001_maggie", "depressed", day,
                             states.index("depressed")))
    for si, state in enumerate(states):
        if missing("p002_marcus", state, 1):
            queue.append(job("p002_marcus", state, 1, si))
    for day in range(args.start_day, CONVS_PER_STATE + 1):
        for si, state in enumerate(states):
            if state == "depressed" or not missing("p001_maggie", state, day):
                continue
            queue.append(job("p001_maggie", state, day, si))
    print(f"queue: {len(queue)} conversations", flush=True)

    active = []   # list of (info, thread) — simple approach: sequential
    # Scheduling: keep <=2 convs running, <=1 containing a devin session.
    import threading
    lock = threading.Lock()
    results = {"ok": 0, "fail": 0}
    running = []

    def worker(job):
        persona, state, day, ne, me_ = job
        try:
            ok = run_conversation(state, day, ne, me_, persona=persona,
                                  dry=args.dry_run)
        except Exception as e:
            print(f"[{persona}/{state}/day{day}] error: {e}", flush=True)
            ok = False
        with lock:
            results["ok" if ok else "fail"] += 1
            running.remove(job)

    while queue or running:
        with lock:
            # Quotas per user: <=3 cursor-backed + <=1 devin-backed conv.
            # A devin conv counts against the devin slot only, even
            # though its partner may be cursor.
            n_devin = sum(1 for j in running if "devin" in (j[3], j[4]))
            n_cursor = sum(1 for j in running
                           if "devin" not in (j[3], j[4]))
            room = MAX_CONCURRENT - len(running)
            started = None
            if room > 0:
                for i, j in enumerate(queue):
                    if "devin" in (j[3], j[4]):
                        if n_devin >= MAX_DEVIN_CONVS:
                            continue
                    elif n_cursor >= MAX_CURSOR_CONVS:
                        continue
                    started = queue.pop(i)
                    running.append(started)
                    if "devin" in (j[3], j[4]):
                        n_devin += 1
                    else:
                        n_cursor += 1
                    break
        if started:
            threading.Thread(target=worker, args=(started,),
                             daemon=True).start()
            time.sleep(5)
        else:
            time.sleep(POLL_SECS)
    print(f"all done: {results}", flush=True)


if __name__ == "__main__":
    main()
