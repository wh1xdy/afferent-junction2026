"""Deterministic per-window metrics — the channel that does not depend on the LLM.

Everything here is computed in pure Python on the transcript alone and is
both stored (temporal tracking) and injected into the scoring prompt.
"""
from __future__ import annotations

import re
import statistics
from .transcript import Window, DEFAULT_TARGET

_WORD_RE = re.compile(r"[a-zA-Z]+(?:'[a-z]+)*")

FILLERS = frozenset("""
um uh er eh ah hmm mm mhm uhh erm like basically literally actually anyway well
""".split())

FIRST_PERSON = frozenset(
    "i me my mine myself i'm i've i'd i'll im".split())

POSITIVE = frozenset(
    "good great happy glad nice love lovely fun funny enjoy enjoyed excited "
    "wonderful better best laugh".split())
NEGATIVE = frozenset(
    "bad sad tired exhausting awful hate worse worst pain sorry lonely boring "
    "depressed down empty".split())

_INITIATION_GAP_S = 30.0   # a target turn after this silence = new topic attempt


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def _mattr(tokens: list[str], window: int = 50) -> float | None:
    """Moving-average type-token ratio. None if not enough words."""
    if not tokens:
        return None
    if len(tokens) <= window:
        return round(len(set(tokens)) / len(tokens), 4)
    ttrs = [len(set(tokens[i:i + window])) / window
            for i in range(len(tokens) - window + 1)]
    return round(statistics.fmean(ttrs), 4)


def _stats(values: list[float]) -> dict | None:
    if not values:
        return None
    q = statistics.quantiles(values, n=10) if len(values) >= 10 else []
    return {
        "n": len(values),
        "mean": round(statistics.fmean(values), 3),
        "median": round(statistics.median(values), 3),
        "p90": round(q[8], 3) if q else round(max(values), 3),
        "max": round(max(values), 3),
    }


def extract(win: Window, target: str = DEFAULT_TARGET) -> dict:
    tgt = [t for t in win.turns if t.speaker == target]
    all_tokens: list[str] = []
    tgt_tokens: list[str] = []
    tgt_word_counts: list[int] = []
    latencies: list[float] = []
    initiations = 0
    questions = 0
    short_answers = 0

    for i, tr in enumerate(win.turns):
        tokens = _words(tr.text)
        all_tokens.extend(tokens)
        if tr.speaker != target:
            continue
        tgt_tokens.extend(tokens)
        tgt_word_counts.append(len(tokens))
        if "?" in tr.text:
            questions += 1
        if len(tokens) <= 3:
            short_answers += 1

        if tr.t is not None and i > 0:
            prev = win.turns[i - 1]
            if prev.speaker != target and prev.t is not None:
                latencies.append(tr.t - prev.t)
                if tr.t - prev.t > _INITIATION_GAP_S:
                    initiations += 1   # re-opens the floor after a silence

    n_tgt = len(tgt)
    n_tgt_w = sum(tgt_word_counts)
    n_all_w = len(all_tokens)
    span = None
    ts = [t.t for t in win.turns if t.t is not None]
    if len(ts) >= 2:
        span = round(max(ts) - min(ts), 1)

    filler = sum(1 for w in tgt_tokens if w in FILLERS)
    first_person = sum(1 for w in tgt_tokens if w in FIRST_PERSON)
    pos = sum(1 for w in tgt_tokens if w in POSITIVE)
    neg = sum(1 for w in tgt_tokens if w in NEGATIVE)

    return {
        "n_turns_total": len(win.turns),
        "n_turns_target": n_tgt,
        "span_seconds": span,
        "response_latency_s": _stats(latencies),
        "utterance_words": _stats([float(x) for x in tgt_word_counts]),
        "talk_share": round(n_tgt_w / n_all_w, 3) if n_all_w else None,
        "mattr": _mattr(tgt_tokens),
        "fillers_per_100w": round(100 * filler / n_tgt_w, 2) if n_tgt_w else None,
        "first_person_per_100w": round(100 * first_person / n_tgt_w, 2) if n_tgt_w else None,
        "affect": {
            "positive_per_100w": round(100 * pos / n_tgt_w, 2) if n_tgt_w else None,
            "negative_per_100w": round(100 * neg / n_tgt_w, 2) if n_tgt_w else None,
        },
        "question_rate": round(questions / n_tgt, 3) if n_tgt else None,
        "short_answer_rate": round(short_answers / n_tgt, 3) if n_tgt else None,
        "initiation_rate": round(initiations / n_tgt, 3) if n_tgt else None,
    }
