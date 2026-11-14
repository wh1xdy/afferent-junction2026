from analyzer.transcript import (Turn, expand_windows, format_for_prompt,
                                 load_jsonl, parse_record, slice_turns)


def test_load_jsonl(transcript_file):
    wins = load_jsonl(transcript_file)
    assert len(wins) == 1
    w = wins[0]
    assert w.persona_id == "p001"
    assert w.day == "1"
    assert w.trajectory == "normal"
    assert w.n_turns == 6
    assert len(w.target_turns()) == 3
    assert w.labels["responsiveness"] == 80


def test_slice_short_conversation_is_single_window(simple_window):
    assert len(slice_turns(simple_window.turns, 120, 20)) == 1


def test_slice_overlap():
    turns = [Turn(i * 5.0, "target" if i % 2 else "interlocutor",
                  f"turn {i}") for i in range(200)]
    chunks = slice_turns(turns, 120, 20)
    assert len(chunks) == 2
    assert chunks[0][-1].text == "turn 119"
    assert chunks[1][0].text == "turn 100"   # 20-turn overlap


def test_expand_windows_sets_seq(transcript_file):
    wins = expand_windows(load_jsonl(transcript_file)[0], 120, 20)
    assert len(wins) == 1 and wins[0].seq == 0


def test_format_for_prompt(simple_window):
    text = format_for_prompt(simple_window.turns)
    assert "[t+" in text and "interlocutor: How was your day" in text
    assert "target: Pretty good" in text


# ── hub capture format (feat/voice-transcript rows) ──────────────────────────

HUB_ROW = {
    "transcript_id": "3f6b1c", "patient_id": "anna",
    "t_iso": "2026-11-14T15:30:00.000Z",
    "received_iso": "2026-11-14T17:36:43+02:00",
    "turns": [{"role": "user", "text": "I feel a bit tired today"},
              {"role": "agent", "text": "I hear you. Did you sleep alright?"},
              {"role": "user", "text": "Not really, no."}],
}


def test_load_hub_row(tmp_path):
    """Rows written by hub/afferent_hub/transcripts.py parse into windows."""
    import json
    path = tmp_path / "transcript-000001.jsonl"
    path.write_text(json.dumps(HUB_ROW) + "\n")
    w = load_jsonl(path)[0]
    assert w.record_id == "3f6b1c"               # phone dedupe key wins
    assert w.persona_id == "anna"                # patient_id -> persona_id
    assert w.day == "2026-11-14"                 # t_iso date part
    assert w.ts_iso == "2026-11-14T15:30:00.000Z"  # real conversation end
    assert w.trajectory == "real"
    assert [t.speaker for t in w.turns] == ["target", "interlocutor", "target"]
    assert all(t.t is None for t in w.turns)     # no per-turn timestamps
    assert len(w.target_turns()) == 2


def test_hub_rows_and_bad_lines(tmp_path):
    """A malformed line is skipped, not fatal to the rest of the file."""
    import json
    path = tmp_path / "transcript-000002.jsonl"
    path.write_text(json.dumps(HUB_ROW) + "\n"
                    + '{"transcript_id": "bad"}\n'          # no turns
                    + "not json{\n"
                    + json.dumps({**HUB_ROW, "transcript_id": "ok2"}) + "\n")
    wins = load_jsonl(path)
    assert [w.record_id for w in wins] == ["3f6b1c", "ok2"]


def test_empty_turn_is_skipped_without_dropping_record():
    row = {
        "persona_id": "maggie", "day": 2, "trajectory": "sad",
        "turns": [{"speaker": "target", "text": ""},
                  {"speaker": "interlocutor", "text": "Are you okay?"},
                  {"speaker": "target", "text": "I'm tired."}],
    }
    win = parse_record(row)
    assert len(win.turns) == 2
    assert win.trajectory == "sad"


def test_expand_windows_respects_chars_and_makes_progress():
    row = {
        "persona_id": "p", "day": 1, "trajectory": "normal",
        "turns": [{"speaker": "target", "text": f"turn {i} xx"}
                  for i in range(8)],
    }
    record = parse_record(row)
    wins = expand_windows(record, max_turns=5, overlap=3, max_chars=45)
    assert len(wins) > 1
    assert all(len(format_for_prompt(w.turns)) <= 45 for w in wins)
    assert all(a.turns[-1] is b.turns[0]
               for a, b in zip(wins, wins[1:]))


def test_one_overlong_turn_forms_its_own_window():
    record = parse_record({
        "persona_id": "p", "day": 1, "trajectory": "normal",
        "turns": [{"speaker": "target", "text": "x" * 100},
                  {"speaker": "target", "text": "short"}],
    })
    wins = expand_windows(record, max_turns=5, overlap=2, max_chars=20)
    assert [len(w.turns) for w in wins] == [1, 1]
