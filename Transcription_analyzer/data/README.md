# Synthetic conversation transcripts — v0

First batch of synthetic two-person dialogues for the transcription
analyzer (see `Transcription_analyzer/README.md` §5). Labels are correct
by construction: each conversation was generated with a known target
state, so the ground truth is the state we injected.

## Protocol

- **Two agents, one dialogue.** Each conversation is a live exchange
  between two independent AgentControl sessions:
  - *conversational agent* — "Nova", an AI companion, driven by
    `prompts/interlocutor.md`. It proposes everyday topics (dog breeds,
    cooking, telly, memories), follows up, and does light active
    listening — never an interrogation. Its behaviour is **identical in
    all four conversations** (fixed partner → comparable signal, the
    same reason the DAIC-WOZ "Ellie" interviews standardise questions).
  - *simulated person* — "Maggie", 70, retired teacher, widowed, driven by
    `prompts/simulated_person.md` with exactly one active **state** per
    conversation.
- Turns travel through `agentcontrol_send_message` between the two
  sessions (true two-agent dialogue, not a single model talking to
  itself). The orchestrator does not sit in the loop: after the opening
  line the sessions ping-pong autonomously for ~100 turns each (~200
  total), then the interlocutor emits a `DONE` sentinel.
- **Engines** (different configurations on purpose, to vary generator
  style and cross agents): three engines are rotated over who plays
  whom — `devin/swe-2-flash-medium` (the available Flash tier; the
  originally requested `swe-2-flash-max` is absent from the model
  catalogue and the daemon falls back to `swe-2-flash-medium`),
  `cursor/auto`, `claude/haiku`. At most
  one Devin session is alive at any time (rate limit), and at most three
  conversations run in parallel. Recorded per file under `meta.engine`.
- **Scale**: target is 10 conversations per state (`day` = conversation
  index). `tools/orchestrate.py` drives the whole batch unattended:
  queue → `acctl spawn` pairs → stall nudges → extract → delete
  sessions.
- Turns are delivered with `delivery="steer"` (mid-turn injection —
  keeps the ping-pong inside one live turn per side and avoids the
  rate-limit stalls of queue-per-turn delivery).
- `tools/dialogue_watchdog.py` monitors each pair's journal and re-sends
  the last line (steer) to the due session after 5 min of silence —
  rate-limit stalls no longer kill a run.
- Transcripts are extracted from the daemon journals
  (`~/.agentcontrol/sessions/<sid>/events.jsonl`, `peer_message` events)
  by `tools/extract_transcript.py`. Sim sessions are deleted
  (`acctl rm <sid>`) right after extraction.

## The four states

| file | trajectory | intended behaviour | labels |
|---|---|---|---|
| `*_normal.jsonl` | baseline | full answers, anecdotes, initiates topics, balanced affect | resp 82 / eng 80 / flu 84 / coh 88 / drift=false |
| `*_joyful.jsonl` | elevated | livelier, longer, more positive words, more initiative | resp 88 / eng 92 / flu 82 / coh 88 / drift=false |
| `*_sad.jsonl` | low day | thinner answers, less initiative, negative lean — but partly re-engageable | resp 55 / eng 48 / flu 70 / coh 78 / drift=true |
| `*_depressed.jsonl` | depressed stretch | short/monosyllabic replies, long response gaps, self-focused + absolutist wording, flat affect, anhedonia, perseveration, no initiations | resp 28 / eng 22 / flu 55 / coh 72 / drift=true |

The state instructions are grounded in
`research/depression_conversation_markers.md` (verbosity ↓, response
latency ↑, first-person pronouns ↑, absolutist words ↑, negative-emotion
words ↑, initiations ↓, flat affect, perseveration; filled pauses do
*not* increase — the slowing is silent).

## Format

One JSON object per `.jsonl` file, README §5.3 schema:

```json
{"persona_id": "p001_maggie", "day": 1, "trajectory": "sad",
 "turns": [{"t": 2.4, "speaker": "interlocutor", "text": "..."},
           {"t": 8.9, "speaker": "target", "text": "..."}],
 "labels": {...}, "meta": {...}}
```

- `speaker` is `interlocutor` (Nova, the AI companion) or `target`
  (Maggie, the person).
- `t` is in **simulated** seconds from conversation start — wall-clock
  send times would encode agent round-trip latency, not the persona's
  response latency. Gaps are drawn from per-state distributions
  (`tools/extract_transcript.py`): target ~1.5–5 s (normal), 1–4 s
  (joyful), 4–10 s (sad), 8–22 s plus a long tail (depressed);
  interlocutor 1–3.5 s. `meta.timestamp_seed` makes them reproducible.
- `day` is 1 for all four files: these are parallel snapshots of the same
  persona under different states, not successive days of one timeline.
- `drift_flag` is true for below-baseline deviations (sad, depressed);
  `joyful` is a deviation too but upward, so it is labelled false —
  revisit if the analyzer should score any deviation.

## How to regenerate

The orchestrator (any AgentControl session) repeats this recipe:

1. Create the *person* session first
   (`agentcontrol_create_session`, task = role rules +
   `prompts/simulated_person.md` + active state, delivery `steer`).
   Note its session id.
2. Create the *interlocutor* session with the partner's id in its task
   (`prompts/interlocutor.md` + send/turn/DONE rules, `steer`). It opens
   the conversation immediately.
3. Start `tools/dialogue_watchdog.py <nova-sid> <maggie-sid>` for stall
   recovery, and wait for the `DONE` sentinel in the person session's
   journal (`grep '"text":"DONE"'
   ~/.agentcontrol/sessions/<person>/events.jsonl`, or an `ac-wait`
   condition).
4. Extract:

   ```
   python3 tools/extract_transcript.py \
       --nora <interlocutor sid> --maggie <person sid> \
       --state <normal|joyful|sad|depressed> --day 1 \
       --engine "nova=<agent>/<model>,maggie=<agent>/<model>" \
       --out data/transcripts/
   ```

5. Delete both sessions (`acctl rm <sid>`) — keep at most two
   conversations in flight; devin rate-limits under heavier parallelism.

Fallback without AgentControl: `tools/simulate.py` runs the same prompts
through the `claude` CLI (`claude -p`), one subprocess call per turn
(single-machine harness — the two roles are separate LLM calls but the
same engine; timestamps are simulated the same way). Requires an
authenticated `claude` CLI; never put credentials in the script.

## Quarantined first batch

`data/transcripts_v0_no-ai-awareness/` holds 13 transcripts generated
before the prompts made Nova's AI nature visible in dialogue. They read
as human–human small talk (0–2 AI references per ~200-turn file), which
mislabels the intended human↔AI-companion framing. They are kept as an
ablation/control set but must NOT be mixed into the training corpus —
`build_dataset.py` must read only `data/transcripts/`.

## Known limitations (v0)

- Single persona, single interlocutor, one conversation per state — this
  batch proves the pipeline; the §5.1 generator still needs persona
  diversity and multi-day trajectories (`gradual_decline`, `recovery`, …).
- Labels are hand-set targets, not measured from the output; a scorer
  pass (teacher LLM, §5.2) is the planned upgrade.
- Text-only turns: fillers/pauses exist only where the models wrote
  them; the acoustic channels (speech rate, silence) are simulated
  solely through `t` gaps.
- Different engines per state is a confound if states are compared
  across engines — treat `meta.engine` as a covariate, or regenerate
  all states on one engine for a clean comparison.
