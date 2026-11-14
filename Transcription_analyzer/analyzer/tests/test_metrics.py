from analyzer.metrics import extract
from analyzer.transcript import Turn, Window


def test_latency_and_lengths(simple_window):
    m = extract(simple_window)
    # target replies at +4.0s, +4.5s, +8.0s after each interlocutor turn
    lat = m["response_latency_s"]
    assert lat["n"] == 3
    assert lat["median"] == 4.5
    assert lat["max"] == 8.0
    assert m["utterance_words"]["median"] == 9.0   # 19, 9, 9 words
    assert m["n_turns_target"] == 3
    assert m["talk_share"] is not None


def test_depressed_style_scores_differently(simple_window):
    degraded = Window(
        record_id="d:0", persona_id="p001", day="2",
        trajectory="depressed", seq=0,
        turns=[
            Turn(0.0, "interlocutor", "How was your day, Maria?"),
            Turn(60.0, "target", "Fine."),
            Turn(90.0, "interlocutor", "Anything nice happen?"),
            Turn(150.0, "target", "Um. No."),
            Turn(180.0, "interlocutor", "Did you call your daughter?"),
            Turn(260.0, "target", "No."),
        ])
    a, b = extract(simple_window), extract(degraded)
    assert b["response_latency_s"]["median"] > a["response_latency_s"]["median"]
    assert b["utterance_words"]["mean"] < a["utterance_words"]["mean"]
    assert b["short_answer_rate"] > a["short_answer_rate"]
    assert b["talk_share"] < a["talk_share"]


def test_fillers_and_first_person(simple_window):
    m = extract(simple_window)
    # "um" + "well" (well is a discourse filler) in 37 target words -> 5.41
    assert m["fillers_per_100w"] == 5.41
    assert m["first_person_per_100w"] > 0


def test_no_timestamps_still_extracts(simple_window):
    turns = [Turn(None, t.speaker, t.text) for t in simple_window.turns]
    w = Window(record_id="x:0", persona_id="p", day="1",
               trajectory="normal", seq=0, turns=turns)
    m = extract(w)
    assert m["response_latency_s"] is None
    assert m["span_seconds"] is None
    assert m["utterance_words"]["n"] == 3
