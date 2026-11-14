from analyzer.transcript import (Turn, expand_windows, format_for_prompt,
                                 load_jsonl, slice_turns)


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
