#!/usr/bin/env python3
"""Watchdog for AgentControl dialogue pairs.

Monitors the daemon journal of each person session; if a pair goes silent
for more than STALL_SECS (the last peer_message is older than that), it
re-sends the partner's last line to the session whose turn it is via
`acctl send` — a nudge that keeps the ping-pong alive through rate-limit
stalls and dropped deliveries. Exits when all watched pairs have emitted
the DONE sentinel.

Usage:
    dialogue_watchdog.py s-nora1 s-maggie1 [s-nora2 s-maggie2 ...]
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

SESSIONS = os.path.expanduser("~/.agentcontrol/sessions")
STALL_SECS = 300
POLL_SECS = 60
ME = "s-a543e33e"


def pair_events(mag_sid):
    path = os.path.join(SESSIONS, mag_sid, "events.jsonl")
    evs = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                evs.append(json.loads(line))
    except FileNotFoundError:
        pass
    return evs


def last_exchange(evs, nora, mag):
    last = None
    done = False
    for d in evs:
        if d.get("type") != "peer_message":
            continue
        if {d.get("from_session"), d.get("to_session")} != {nora, mag}:
            continue
        if d.get("text", "").strip() == "DONE":
            done = True
        else:
            last = d
    return last, done


def age(ts):
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return 0


def nudge(target_sid, text):
    subprocess.run(["acctl", "send", target_sid, "--steer", text],
                   capture_output=True, timeout=30)


def main():
    args = sys.argv[1:]
    pairs = [(args[i], args[i + 1]) for i in range(0, len(args), 2)]
    pending = set(range(len(pairs)))
    print(f"watching {len(pairs)} pairs, stall>{STALL_SECS}s", flush=True)
    while pending:
        time.sleep(POLL_SECS)
        for i in list(pending):
            nora, mag = pairs[i]
            evs = pair_events(mag)
            last, done = last_exchange(evs, nora, mag)
            if done:
                print(f"[{i}] {mag} DONE — pair complete", flush=True)
                nudge(ME, f"[watchdog] pair {nora}/{mag} finished")
                pending.discard(i)
                continue
            if last is None:
                continue
            a = age(last.get("ts", ""))
            if a > STALL_SECS:
                # Whose turn? The recipient of the last message.
                due = last["to_session"]
                print(f"[{i}] stalled {a:.0f}s — nudging {due} "
                      f"with last line from {last['from_session']}", flush=True)
                nudge(due, last["text"])
    print("all pairs done", flush=True)


if __name__ == "__main__":
    main()
