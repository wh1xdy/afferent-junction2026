# Transcription Analyzer

Speech-pattern drift detection from conversation transcripts, running an NVIDIA
Nemotron model on the Jetson Orin Nano 8GB — a third marker channel alongside
`posture-analysis` (movement / expressivity) and `presence` (home occupancy).

## 1. Goal

Given a stream of timestamped, speaker-diarized conversation transcripts, track
how a target person speaks **relative to their own baseline** and flag drift:

- responsiveness: longer turn-taking gaps, shorter and thinner answers,
  more prompting needed before replying;
- engagement: fewer topic initiations, more passive echoing, flatter affect;
- fluency: more hesitations, fillers, abandoned and repeated phrases;
- coherence: more off-topic or tangential turns.

Following the convention in `docs/plan_posture_depression.md`: the output is an
**index of conversational engagement and responsiveness, expressed as a
deviation from the person's baseline** — never a "depression score" or a
diagnosis. Confounders (fatigue, illness, medication, time of day, who they are
talking to) are logged, not claimed away.

## 2. Model choice on the Jetson 8GB

Everything runs on-device: transcripts are among the most sensitive data we
touch, so no cloud inference in production (same stance as the rest of the
repo).

**Scheduling premise: the analyzer is a nightly batch job.** The vision app
(YOLO on the C920) is useless in the dark anyway, so the two workloads are
complementary by nature, not rivals — during the night window the analyzer
gets essentially the whole ~7 GB of usable unified memory for weights + KV
cache. That moves the model tier up from 4B to the 8–9B class, raises the
quantization sweet spot to Q5_K_M, and makes slow generation acceptable.

Candidates (measured on Orin Nano 8GB via llama.cpp unless noted):

| Model | Footprint | tok/s | Context | Verdict |
|---|---|---|---|---|
| `Qwen3-8B` | 5.0 GB Q4 / 5.7 GB Q5 | ~12.6 | 32K (YaRN→128K) | Best quality/speed balance; dense arch → vanilla QLoRA |
| `nvidia/Llama-3.1-Nemotron-Nano-8B-v1` | ~5.5 GB Q5 | ~13–14 | 128K | Nemotron family, dense Llama arch, reasoning-tuned |
| `nvidia/Nemotron-Nano-9B-v2` | ~5.5 GB Q4 | ~3.7 (Jetson AI Lab) | 128K | Best benchmarks in class (beats Qwen3-8B incl. RULER long-ctx); hybrid Mamba → slow here, fine-tune path less paved |
| `nvidia/Nemotron-3-Nano-4B` | ~4.5 GB Q8 | ~12.7 (Jetson AI Lab) | 256K | Official NVIDIA GGUF, day-0 llama.cpp on Orin; headroom option |
| `Qwen3-4B-Instruct-2507` | ~4.3 GB Q8 | ~19.5 | 256K | Fallback if memory pressure surprises us |

**Default pick: an 8B-class dense model at Q5_K_M** (`Qwen3-8B` or
`Llama-3.1-Nemotron-Nano-8B-v1` — the P2 benchmark decides). The model is
fine-tuned anyway, and dense architectures are the painless path for QLoRA
(unsloth / TRL / axolotl). `Nemotron-Nano-9B-v2` is the quality ceiling and
stays in the race only if its long-context edge proves real *and* a viable
fine-tune path for the hybrid Mamba-Transformer arch exists (support to be
verified — llama.cpp `nemotronh` support itself only landed Aug 2025 and has
already seen one regression).

Runtime: **llama.cpp** GGUF first (mature on Orin), TensorRT-LLM as the
optimisation pass if needed. First milestone is a memory + tok/s +
long-prefill benchmark on the real board.

### Teacher / student split — where Nemotron 3.5 Super VL fits

The aspiration is `NVIDIA-Nemotron-3.5-Super-VL-120B-A12B` — but it cannot
run on the board: 120B total / 12B active parameters, ~65–70 GB of weights
even in NVFP4, reference deployment 4× H100 or 2× GB200. An order of
magnitude beyond the Orin Nano.

Its role here is the **teacher** (§5.2), not the deployed model: generate and
naturalise synthetic dialogues, produce gold labels and scores, and judge
realism — all off-device (NIM endpoint or rented GPU), dev-time only, on
synthetic data that carries no privacy risk. The on-device student is then
fine-tuned on Super VL's outputs — the same distillation pattern NVIDIA uses
to build the Nano line from the Super line (Minitron / MOPD). Extras:
strong multilingual quality (incl. French, ~86 Global-MMLU) matters if the
real transcripts are non-English; 1M-token context lets it score a whole
multi-day corpus in one pass; the VL side stays unused unless a future
off-device pass scores video clips. `Nemotron 3.5 Lightning` (30B/3B, text)
is the middle option for the teacher if Super is overkill — still far beyond
on-device range.

Nightly budget check: a 4k-token transcript window prefills in ~12 s at
~350 tok/s; a ~300-token JSON score at ~12 tok/s takes ~25 s → under a minute
per window, so a full day of conversations digests in minutes, not hours.
Even the 3.7 tok/s Nemotron-9B-v2 is usable overnight — its Mamba-hybrid
prefill is actually strong on long inputs.

## 3. Signals

Two tiers — cheap deterministic metrics computed in Python, and LLM-scored
semantic judgements from Nemotron:

| Signal | Tier | Drift direction of interest |
|---|---|---|
| Response latency (turn-gap, needs timestamps) | metric | ↑ slower |
| Utterance length, words per turn, talk share | metric | ↓ shorter |
| Lexical diversity (MATTR) | metric | ↓ narrower vocabulary |
| Filler / hesitation / repair rate | metric | ↑ |
| Topic initiations vs. passive replies | LLM | ↓ fewer initiations |
| On-topic coherence of each reply | LLM | ↓ more drift/tangents |
| Engagement / affect flatness | LLM | ↓ flatter |
| Repetition, perseveration | LLM + metric | ↑ |

## 4. Pipeline

```
daytime:                    night window (vision app idle — dark anyway):
ASR + diarization ──┐    ┌─► window slicer ──► metric extractor
(Whisper-class,     │    │         │
 scheduled or       ├────┘         ▼
 continuous)        │       prompt builder ──► LLM scorer (JSON out)
        │           │                              │
        ▼           │        per-window scores + evidence
 timestamped turns ─┘                  ▼
                    temporal aggregator (SQLite, same pattern as
                    posture-analysis)
                                   ▼
                    baseline-deviation index + sub-indices
                    (responsiveness / engagement / fluency)
```

If ASR also needs the GPU, the night window sequences it: transcribe the day's
audio first, unload, then run the LLM pass — both fit the same budget, just
not simultaneously.

- Nemotron is constrained to a fixed JSON schema (per-dimension score 0–100,
  confidence, quoted evidence spans). Free-text output is not consumed.
- Raw transcripts are processed then discarded or encrypted; only aggregates
  are kept — matching the posture pipeline's SQLite-aggregates approach.
- Baseline: rolling 4-week personal baseline with day-of-week effects, same
  convention as the posture plan.

### 4.1 Data-manager integration

Scores flow to `afferent-data-manager` (`jetson/data_manager`), the house's
shared store, after each batch — push model, `POST /api/v1/samples`, Bearer
token, mDNS discovery (`role=data-manager`) on Wendy Net. The analyzer carries
a copy of `client/data_manager_client.py` (per that project's convention) and
`analyzer/dm_sink.py` wires it into the pipeline.

| Analyzer output | Data-manager metric | Notes |
|---|---|---|
| per-dimension score 0–100 | `speech.<dim>_score` | `quality` = contract confidence |
| window `drift_flag` | `speech.drift_flag` | 0/1 sample |
| daily composite z (drift index) | `speech.drift_index` | skipped while baseline insufficient |

One series per tracked person: `source = transcription-analyzer/<persona>`.
`meta` carries `record_id`/`seq`/`day` only — evidence spans and transcript
text never leave the device-local store.

The data manager then owns the longitudinal questions (`/baseline`,
`/trend`, `/daily`) **and** the cross-signal ones — `speech.*` scores can be
correlated against `presence.*`, `posture.*`, `vitals.*` in one query. Both
stores keep the same stance: descriptors relative to the person's own
history, never a diagnosis.

## 5. Synthetic data plan

There is no public dataset of longitudinal transcripts annotated for
responsiveness drift, so we generate it. Labels are correct **by construction**:
we inject the drift, so we know the ground truth at every turn.

### 5.1 Generator

A persona-driven conversation simulator:

- **Personas**: age, vocabulary breadth, verbosity, topics of interest, baseline
  filler rate, humour, relationship to the interlocutor.
- **Interlocutor**: family member / caregiver asking questions, sharing news,
  prompting for stories.
- **Drift trajectories** applied over a simulated multi-week timeline:
  `stable`, `gradual_decline` (over days/weeks), `abrupt_drop` (event-like),
  `recovery`, `noisy` (good days / bad days).

Each trajectory modulates the parametric controls: response latency
distribution, utterance length, vocabulary breadth, filler rate, initiation
probability, coherence-error rate, affect range.

### 5.2 Two-layer generation

1. **Procedural layer** — grammar/template engine produces large volumes of
   precisely controlled transcripts (exact label values at every turn).
2. **Teacher-LLM layer** — `Nemotron-3.5-Super-VL` rewrites procedure output
   into naturalistic dialogue, with instructions to preserve the injected
   signal levels; it also produces the gold per-dimension scores used as
   training labels and acts as the realism judge (§5.4). Access via NVIDIA
   NIM (hosted endpoint, simplest) or a rented multi-GPU node (verda
   runbook); the teacher is a data tool, not part of the product, and never
   sees real transcripts.

### 5.3 Labels and format

JSONL, one record per conversation window:

```json
{
  "persona_id": "p017",
  "day": 23,
  "trajectory": "gradual_decline",
  "turns": [{"t": 0.0, "speaker": "interlocutor", "text": "..."},
            {"t": 4.2, "speaker": "target", "text": "..."}],
  "labels": {"responsiveness": 38, "engagement": 41, "fluency": 66,
             "coherence": 70, "drift_flag": true}
}
```

Held-out split by `persona_id` **and** by trajectory type, so the model cannot
memorise either.

### 5.4 Realism check

Before training, compare distributional stats (turn length, gap times, filler
rate) of synthetic output against a small set of real consented recordings or
public dialogue corpora. Synthetic-only training has a known domain-gap risk —
the validation plan below exists partly to measure it.

## 6. Training

- **QLoRA / LoRA** fine-tune of the chosen Nemotron, targeting the JSON scoring
  contract of section 4. Input = transcript window + extracted metrics; output =
  scores + evidence.
- Training is a **distillation**: the student learns on labels and scores
  produced by the Super VL teacher (§5.2), not on the Jetson (8GB unified
  memory cannot hold model + optimiser states). Reuse the rented-GPU
  workflow already documented in `docs/verda_training.md` (validated
  end-to-end on a Verda spot V100).
- Then quantize (GGUF Q5_K_M target, or TensorRT-LLM INT4) and deploy to the
  board.
- Cheaper alternative kept in reserve: skip fine-tuning, prompt a frozen
  quantized Nemotron few-shot. Try this first — it sets the baseline the
  fine-tune must beat.

## 7. Evaluation

| Stage | Question | Metric |
|---|---|---|
| Held-out synthetic | Does it recover injected drift? | Pearson r per dimension; AUROC on `drift_flag` |
| Temporal | How fast does it notice? | Windows-to-detection after drift onset |
| Stability | Does it cry wolf? | False-alarm rate on `stable` + `noisy` personas |
| Real pilot | Does it transfer? | Agreement with human-rated engagement on a few consented real transcripts |

Success gate before any Jetson deployment: beats the frozen few-shot baseline
on held-out personas, and ≥1 analysis per hour sustained within the memory
budget alongside the vision app.

## 8. Risks and limits

- **Domain gap**: synthetic dialogue may not capture real drift phenomenology.
  Mitigation: realism check (5.4), pilot stage in evaluation, keep
  deterministic metrics as a fallback channel that does not depend on the LLM.
- **Throughput**: the nightly window makes this a non-issue at the model level;
  the real constraint becomes total RAM for weights + long-context KV cache.
- **Upstream dependency**: the pipeline assumes ASR + diarization + timestamps
  (e.g. Whisper-class model on the same board). Under the nightly schedule it
  can share the GPU sequentially with the LLM rather than compete with it.
- **Privacy / consent**: continuous speech capture of a person in their home is
  the most invasive channel in the project. Explicit informed consent and
  on-device-only processing are hard requirements, not options.
- **Honest naming**: output is a drift index, not a diagnosis; it cannot
  distinguish depression from fatigue, pain, medication or a bad week.

## 9. Roadmap

- [x] P0 — transcript schema + deterministic metric extractor
      (`analyzer/` — service + CLI, edge & cloud backends)
- [x] P1 — QLoRA pipeline scaffold (`training/` — dataset builder,
      train script, Verda runner adapted from posture's runbook)
- [ ] P0 — procedural generator v0 (personas, 5 trajectories, JSONL labels)
- [ ] P1 — frozen few-shot baseline on synthetic windows
- [ ] P1 — teacher-LLM naturalisation pass + realism check
- [ ] P2 — QLoRA fine-tune on rented GPU (verda runbook)
- [ ] P2 — quantize (Q5_K_M target), benchmark the candidate set on the real Jetson
- [ ] P3 — temporal aggregator, baseline-deviation index, dashboard hook
- [ ] P4 — small consented real-data pilot

## 10. Open questions

- Which model wins the P2 benchmark inside the ~7 GB night budget — a dense 8B
  at Q5, or the 9B hybrid despite its 3.7 tok/s? Long-context **prefill**
  throughput matters more than generation speed here.
- Night-window mechanics: cron/systemd timer, or triggered by the vision app
  going dark-idle? Who owns starting/stopping each service (and what happens
  on a night with activity — does the analysis defer to the next day)?
- Do we get usable turn-gap timestamps from the ASR stage, or do we need audio
  features for latency?
- Should drift detection be per-conversation, per-day, or both granularities?
- Who is the interlocutor in deployment — a device-initiated daily check-in
  conversation, or passive capture of real conversations? The former is far
  easier to standardise (see "standardised task" lesson in the posture plan).

## 11. References

Full annotated synthesis (every claim → source → simulation consequence):
[`research/depression_conversation_markers.md`](research/depression_conversation_markers.md).

### Conversational markers of depression — drives the §3 signal list and the simulator's state definitions

- Gratch et al. (2014) — *The Distress Analysis Interview Corpus (DAIC-WOZ) of
  human and computer interviews*, LREC.
  http://www.lrec-conf.org/proceedings/lrec2014/pdf/508_Paper.pdf
- DeVault et al. (2013) — *Verbal indicators of psychological distress in
  interactive dialogue*, SIGDIAL (onset latency, answer length, silent pauses;
  the "fewer filled pauses" counter-intuitive finding).
  https://aclanthology.org/W13-4032.pdf
- Yu, Scherer, DeVault et al. (2013) — *Multimodal prediction of psychological
  disorders: HMM dialogue features on DAIC* (turn-pair timing; question type
  moderates the signal).
  https://www.justinecassell.com/publications/Yu-Scherer-Devault-Gratch-Stratou-Morency-Cassell_2013.pdf
- Meta-reviews on speech timing: Cummins et al. (2015); Psychiatry Research
  (2024) — speech latency & psychomotor slowing, the most consistent marker.
  https://www.sciencedirect.com/science/article/abs/pii/S0165178124003895
- Tølbøll (2019) — *Linguistic features in depression: a meta-analysis*
  (negative/positive emotion words, I-pronouns).
  https://tidsskrift.dk/lwo/article/view/117798
- Al-Mosaiwi & Johnstone (2018) — absolutist words, *Clinical Psychological
  Science* (~50–80 % elevation; vulnerability marker). https://doi.org/10.1177/2167702617747074
- Tackman et al. (2019) — depression and I-talk, multi-lab synthesis, *JPSP*.
  https://doi.org/10.1037/pspp0000187
- Holtzman (2017) — first-person singular pronouns meta-analysis, *J. Res.
  Personality* (small but reliable effect, r ≈ .13). https://doi.org/10.1016/j.jrp.2017.02.005
- PLOS One 15(10) — ASR-extractable timing features vs depression severity.
  https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0238726
- Dialogue pause features for mood-episode detection, arXiv:1910.05115.
  https://arxiv.org/pdf/1910.05115
- Dyadic turn-pair timing on DAIC-WOZ, arXiv:2607.03744.
  https://arxiv.org/html/2607.03744
- Social-interaction impairments review, PMC8958205.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8958205/
- Depression speech-marker review tables: BMC Med Inform Decis Mak (2024)
  https://doi.org/10.1186/s12911-024-02772-0 and language-in-depressive-disorder
  review (2022) https://doi.org/10.26744/rrttlc.2022.8.1.10

### Interlocutor design — drives `prompts/interlocutor.md`

- DeVault et al. (2014) — *SimSensei Kiosk / "Ellie"* semi-structured
  interviews, AAMAS (standardisation is the feature: identical prompts make
  day-to-day drift comparable — same lesson as the posture plan's standardised
  task). https://ifaamas.org/Proceedings/aamas2014/aamas/p1061.pdf
- Lucas et al. (2014) — disclosure to virtual humans, *Computers in Human
  Behavior* (non-judgmental partner elicits better signal).
  https://multicomp.cs.cmu.edu/wp-content/uploads/2017/09/2014_CHB_Lucas_It.pdf
- E-DAIC manual — the same protocol run fully autonomously (275 interviews).
  https://dcapswoz.ict.usc.edu/wwwedaic/E-DAIC%20Manual.pdf
- Motivational Interviewing OARS (open questions, affirmations, reflective
  listening, summarising): https://motivationalinterviewing.org/understanding-motivational-interviewing
  and ISSUP examples https://www.issup.net/knowledge-share/resources/2019-10/motivational-interviewing-open-questions-affirmation-reflective
- Samaritans SHUSH listening guide (patience, open questions, don't fill
  silences). https://www.samaritans.org/how-we-can-help/support-and-information/worried-about-someone-else/difficult-conversations/tips-helping-someone-open-when-somethings/
- NHS — how to help someone with depression.
  https://www.nhs.uk/mental-health/advice-for-life-situations-and-events/how-to-help-someone-with-depression/
- Right Decisions (NHS Scotland) — good conversations & empathy (don't probe
  beyond what they want to share). https://www.rightdecisions.scot.nhs.uk/infoforwellbeing/module-1-good-conversations-and-empathy/supporting-someone-in-distress/
- Here for Someone — how to talk (ordinary chat is support; no symptom
  interrogation). https://hereforsomeone.org.uk/help/supporting-depression/how-to-talk/

### Models, hardware, and training — drives §2 and §6

- NVIDIA — `NVIDIA-Nemotron-3.5-Super-VL-120B-A12B` model card / tech report
  (120B total / 12B active, Hybrid Mamba-Transformer LatentMoE, ~65–70 GB
  NVFP4 weights, reference deployment 4× H100 / 2× GB200, 1M-token context) —
  the teacher in §5.2. https://huggingface.co/nvidia
- NVIDIA — Minitron / MOPD pruning-and-distillation line (the teacher→Nano
  pattern the §2 student strategy borrows); `Llama-3.1-Nemotron-Nano-8B-v1`
  and `Nemotron-Nano-9B-v2` model cards (hybrid arch; llama.cpp `nemotronh`
  support landed Aug 2025). https://huggingface.co/nvidia
- `nvidia/Nemotron-3-Nano-4B` — official NVIDIA GGUF, day-0 llama.cpp on
  Orin Nano. https://huggingface.co/nvidia
- `Qwen/Qwen3-8B` and `Qwen3-4B-Instruct-2507` model cards (Apache-2.0) —
  the §2 default student candidates. https://huggingface.co/Qwen/Qwen3-8B
- Jetson AI Lab — Orin Nano LLM benchmarks (tok/s figures in the §2 table;
  Nemotron-Nano-9B-v2 measured at 3.7 tok/s, Nemotron-3-Nano-4B at 12.7).
  https://www.jetson-ai-lab.com
- Turing Pi — Orin Nano 8GB LLM benchmark, Sept 2025 (Q4_K_M tok/s for
  Qwen3-8B ≈12.6, Qwen3-4B ≈19.5, Phi-4-mini ≈19.4).
- Dettmers et al. (2023) — *QLoRA: Efficient Finetuning of Quantized LLMs*,
  arXiv:2305.14314 (nf4 4-bit + LoRA = the §6 recipe). https://arxiv.org/abs/2305.14314
- llama.cpp — the Jetson inference runtime (GGUF, Orin support). https://github.com/ggml-org/llama.cpp
- Hugging Face TRL / PEFT — the §6 fine-tune stack. https://github.com/huggingface/trl
- Verda GPU cloud — rented-training provider; our runner pattern adapted
  from `docs/verda_training.md` (branch `poc/laptop-markers`). https://verda.com
