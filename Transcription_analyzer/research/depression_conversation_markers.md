# Depression and low mood — conversational markers & partner behaviour

Literature synthesis for the two-agent conversation simulator
(`Transcription_analyzer/`). Two questions:

1. What does depression / low mood do to the *observable conversational
   behaviour* of a person (the signals our analyzer must catch)?
2. How should a fixed, non-clinical conversational companion behave so the
   signal is comparable across days?

All claims carry a source. Where the literature disagrees, both sides are
kept — we need realism, not caricature.

---

## 1. Markers of depression observable in dialogue

### 1.1 Verbal productivity: less speech, shorter turns

- Acute depression is associated with "decreased speech, slow speech,
  delays in delivery, and long silent pauses" (Hall et al., 1995, cited in
  DeVault et al., 2013).
  https://aclanthology.org/W13-4032.pdf
- In DAIC-WOZ interviews, depressed participants answered with
  **shorter speech length** specifically on rapport-building questions
  ("Where are you originally from?", "What do you do to relax?").
  Yu, Scherer, DeVault et al., 2013.
  https://www.justinecassell.com/publications/Yu-Scherer-Devault-Gratch-Stratou-Morency-Cassell_2013.pdf
- Clinical description of melancholic/psychomotor-retarded depression:
  patients are "physically and verbally slowed, monosyllabic in speech,
  [show] latency in responding to questions".
  Parker, "Defining melancholia", *Curr Opin Psychiatry* / Melbourne UP.
  https://minerva-access.unimelb.edu.au/server/api/core/bitstreams/6d2024b4-985c-56f3-b07a-c3d0ef82e966/content
- Phenomenology of "empty silence": in severe episodes the person loses
  access to words, manages "monosyllables, sometimes … a nod … a mumble"
  (Haig 2021; Solomon 2015, analysed by Degerman 2024).
  https://link.springer.com/article/10.1007/s11229-025-04933-8
- Depressed speakers "use less words in communication and avoid the use of
  verbal language"; unstructured sentences are present.
  https://doi.org/10.26744/rrttlc.2022.8.1.10

**Simulation consequence:** depressed state → mean utterance length drops
to a fraction of baseline, with stretches of one-word answers; sad state →
moderate reduction (~50–70 % of baseline).

### 1.2 Timing: slower response onset, longer pauses

- Speech latency / pause behaviour is among "the most consistent and
  important measures" of depression across speaking tasks (meta-reviews:
  Cummins et al., 2015; Ettore et al., 2023; Bennabi et al., 2013; Low
  et al., 2020). Turn latency and word latency both rise; distribution is
  ex-Gaussian.
  https://www.sciencedirect.com/science/article/abs/pii/S0165178124003895
- Depressed participants insert longer pauses (>500 ms) while speaking.
  "Identifying Mood Episodes Using Dialogue Features from Clinical
  Interviews", arXiv:1910.05115. https://arxiv.org/pdf/1910.05115
- Speaker-switch (turn-taking) duration is increased in depressed dyads
  (Cohn et al., 2009; confirmed in DAIC-WOZ: speech onset time is a
  depression predictor — Yu et al. 2013 above; dyadic turn-pair timing
  alone reaches competitive macro-F1 on DAIC-WOZ dev).
  https://arxiv.org/html/2607.03744
- ASR-extractable timing features (speech rate ↓, pause time ↑, response
  time ↑) correlate with depression severity.
  PLOS One 10.1371/journal.pone.0238726.
  https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0238726
- Depressed participants in DAIC-WOZ were "slower to begin speaking" and —
  counter-intuitively — used **fewer filled pauses** than non-distressed
  participants (DeVault et al., 2013; Gratch et al., 2014). The slowing is
  mostly *silent* pausing, not "um/uh" stalling.
  http://www.lrec-conf.org/proceedings/lrec2014/pdf/508_Paper.pdf

**Simulation consequence:** depressed state → turn-gap distribution shifts
up several-fold; hesitation expressed as silent pauses / trailing
"..." rather than verbal fillers (fillers do **not** rise — this corrects
the naive "depressed = more ums" assumption).

### 1.3 Lexical style: self-focus, absolutist words, negative affect

- **First-person singular pronouns ↑**: small but reliable effect
  (meta-analysis Holtzman 2017, J. Res. Pers., r ≈ .13;
  https://doi.org/10.1016/j.jrp.2017.02.005). Multi-lab synthesis
  (N=4,754): depression–I-talk r = .10, best read as a marker of general
  negative emotionality, not depression specifically.
  Tackman et al., 2019, *JPSP*. https://doi.org/10.1037/pspp0000187
- **Absolutist words ↑** ("always", "nothing", "completely", "never"):
  ~50 % more frequent in anxiety & depression forums vs controls, ~80 %
  more in suicidal-ideation forums; a *better* marker than negative-emotion
  words, and stays elevated in recovery forums (vulnerability marker).
  Al-Mosaiwi & Johnstone, 2018, *Clin Psychol Sci*.
  https://doi.org/10.1177/2167702617747074
- **Negative emotion words ↑, positive emotion words ↓**: meta-analysis of
  26 papers — Cohen's d = 0.72 (neg), −0.38 (pos); severity correlations
  r = .12 / −.21; I-pronouns d = 0.44.
  Tølbøll, 2019, "Linguistic features in depression: a meta-analysis".
  https://tidsskrift.dk/lwo/article/view/117798
- Depressed writers use more negatively valenced words and "I" more often
  than never-depressed (Rude, Gortner & Pennebaker, 2004; cited in
  DeVault 2013). https://aclanthology.org/W13-4032.pdf
- Thematic markers: negativity, sad themes, hopelessness, lack of
  interest, self-focus (review table).
  https://doi.org/10.1186/s12911-024-02772-0
- Tense/style shift reported: more past tense, less present/future; word
  repetitions (working-memory indicator); reduced verbal fluency.
  https://doi.org/10.26744/rrttlc.2022.8.1.10

**Simulation consequence:** depressed state → "I"-heavy replies,
occasional absolutist framing ("I never sleep properly anyway",
"nothing on TV holds my attention"), more negative-emotion and
past-oriented wording, near-zero positive-emotion words.

### 1.4 Interactional behaviour: withdrawal, passivity, flat affect

- Depressed patients show "reduced motivation to communicate, lack of
  cooperativeness, … dysfunctional interaction behavior"; neutral affect
  dominates (92 % vs 76 % of interaction time in controls) and is
  longer-lasting; less gaze toward partner (Kupferberg et al. review;
  Interact findings).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8958205/
- Quiet, monotone, slow responses with limited content.
  https://www.med.soton.ac.uk/mentalhealth/bmyr3yr5/compendium/depression/speech/s1.aspx
- Observable signs a companion would notice (NHS): lost interest in things
  normally enjoyed, feeling down/hopeless, slower speech, tired/low
  energy, poor concentration.
  https://www.nhs.uk/mental-health/advice-for-life-situations-and-events/how-to-help-someone-with-depression/
- Anhedonia shows up behaviourally as disengagement from routines and
  hobbies rather than (only) as sadness words — "not much point",
  "couldn't be bothered".

**Simulation consequence:** depressed state → almost no topic initiations;
answers only what is asked; echoes rather than elaborates; drops hobbies
("didn't go" to book club) rather than reporting enjoyment.

### 1.5 Repetition / perseveration / rumination

- Repetitive themes and word repetitions are listed among depression
  speech indicators (working-memory impairment, rumination).
  https://doi.org/10.26744/rrttlc.2022.8.1.10 and
  https://doi.org/10.1186/s12911-024-02772-0
- Rumination (repetitive passive focus on distress) is a core cognitive
  feature of depression (Nolen-Hoeksema's response-styles theory) —
  surface-level consequence: the person returns to the same complaint
  (sleep, tiredness) across unrelated prompts.

**Simulation consequence:** depressed state → a small set of recurring
themes (sleep, tiredness, "didn't bother") reappears regardless of topic.

### 1.6 A note on what does NOT change (realism guardrails)

- Depressed ≠ incoherent: participants remain responsive and on-topic in
  structured interviews; the DAIC interviews are 5–20 min of usable
  dialogue. Markers are *distributional* (means, proportions), not
  categorical.
- Sad mood alone is not depression: short-term low mood yields milder,
  partly reversible reductions — the sad/depressed contrast in our data
  should be a matter of degree and breadth (affective flatness, absolutist
  style, anhedonia, withdrawal appear together only in the depressed
  state).
- Question type moderates the signal: onset latency predicts best for
  intimate/personal questions; utterance length for rapport questions
  (Yu et al., 2013). A fixed partner behaviour across days is what makes
  drift comparable — same reason the posture plan prefers a standardised
  task.

---

## 2. How the conversational partner should behave

### 2.1 The DAIC-WOZ / SimSensei "Ellie" model

- Ellie runs a **semi-structured interview**: it opens with
  rapport-building questions ("Where are you originally from?"), moves to
  topical and then more personal questions ("What's something you feel
  guilty about?", "What are you most proud of?").
  DeVault et al., 2014, SimSensei Kiosk.
  https://ifaamas.org/Proceedings/aamas2014/aamas/p1061.pdf
- Delivered empathy and listening behaviour are deliberate: feedback
  statements ("I'm sorry to hear that"), verbal backchannels, nodding —
  designed to build rapport and encourage disclosure.
  https://today.usc.edu/patients-are-more-willing-to-confide-in-computers-not-doctors-usc-study-suggests/
- Standardisation is a feature, not a bug: "the implicit replicability and
  consistency of the spoken questions … allows a more detailed analysis of
  user responses to precisely delivered interview questions."
  (SimSensei Kiosk paper above.) This is the direct precedent for keeping
  our interlocutor constant across the four states.
- People disclose more to a virtual human they believe is automated —
  lower fear of judgment. A companion that is non-judgmental by design
  elicits better signal (Lucas et al., 2014, *Comput Hum Behav*).
  https://multicomp.cs.cmu.edu/wp-content/uploads/2017/09/2014_CHB_Lucas_It.pdf
- E-DAIC: the same protocol ran fully autonomously (AI-controlled Ellie),
  275 interviews, >73 h — an LLM/VA can drive this style end-to-end.
  https://dcapswoz.ict.usc.edu/wwwedaic/E-DAIC%20Manual.pdf

### 2.2 Active / empathic listening (lay-facing guidance)

- Samaritans SHUSH: **S**how you care (full attention), **H**ave patience
  (several attempts may be needed), **U**se open questions ("How are
  things? I've noticed you don't seem quite yourself"), **S**ay it back
  (reflect what you heard), **H**ave courage (don't fear silences or a
  negative response; don't fill pauses).
  https://www.samaritans.org/how-we-can-help/support-and-information/worried-about-someone-else/difficult-conversations/tips-helping-someone-open-when-somethings/
- Don't rush to interpret or advise: "not offering advice, not trying to
  identify what they're going through with your own experiences and not
  trying to solve their problems."
  https://www.samaritans.org/how-we-can-help/if-youre-worried-about-someone-else/how-support-someone-youre-worried-about/what-do-if-you-think-someone-struggling/
- NHS: let them know you care and are there to listen; accept them without
  judging; keep in touch; be patient.
  https://www.nhs.uk/mental-health/advice-for-life-situations-and-events/how-to-help-someone-with-depression/
- "Here for Someone" (UK guidance): conversation ≠ constant symptom
  check — ordinary chat (news, family, TV) is itself support; leave room
  for pauses; if they say little, don't stack more questions; take "stop
  asking" seriously.
  https://hereforsomeone.org.uk/help/supporting-depression/how-to-talk/
- Right Decisions (NHS Scotland): open questions, "tell me more…",
  tolerate silence, **don't probe beyond what they want to share**, and
  remember you are not a counsellor.
  https://www.rightdecisions.scot.nhs.uk/infoforwellbeing/module-1-good-conversations-and-empathy/supporting-someone-in-distress/

### 2.3 Motivational-interviewing skill base (OARS)

- OARS = **O**pen questions, **A**ffirmations, **R**eflective listening,
  **S**ummarising — used "early and often"; reflections range from simple
  rephrasing to deeper guesses; summaries consolidate and invite
  correction ("Did I miss anything?").
  https://motivationalinterviewing.org/understanding-motivational-interviewing
  https://www.issup.net/knowledge-share/resources/2019-10/motivational-interviewing-open-questions-affirmation-reflective
- The MI *spirit* matters more than technique for a companion:
  partnership (not interrogation), acceptance/non-judgment, evocation
  (draw out *their* stories), compassion. A companion borrows OARS minus
  the change-goal agenda — we are not steering anyone to behaviour change.
- Concrete open-question forms: "What can you tell me about …?", "How's
  today been for you?", "Help me understand …", story prompts ("Tell me
  about a time when …").

### 2.4 What the companion should NOT do

- No forced cheerfulness / "cheer up", no minimising ("we all have days
  like that"), no premature advice, no rapid-fire question stacking when
  answers thin out, no filling every silence, no clinical probing or
  diagnosis — companion, not therapist (Samaritans/NHS/Right Decisions
  sources above).
- Do not make every turn about mood: keep normal topics flowing; the
  *contrast* in how the person engages with ordinary topics is the signal.

---

## 3. Design translation — what we encode in the simulator

| Marker family | Baseline (normal) | Joyful | Sad day | Depressed state |
|---|---|---|---|---|
| Utterance length | full sentences, anecdotes | longer, energetic | ~60–70 %, thinner | 1–10 words, monosyllabic stretches |
| Response latency (simulated turn gap) | short | short | +50–100 % | 3–6× baseline, occasional very long gaps |
| First-person pronouns | normal | normal | slightly ↑ | markedly ↑ (self-focus) |
| Absolutist words | rare | rare | occasional | recurrent ("never", "nothing", "always") |
| Emotion words | balanced | strongly positive | negative-leaning | negative + flat/neutral majority |
| Topic initiations | yes | many | few | ~none; passive replies only |
| Fillers / hesitations | normal rate | normal | ↑ slight | *silent* pauses ↑, fillers ~flat (DeVault) |
| Themes | varied | expansive | narrowed | perseverates on sleep/fatigue; anhedonia |
| Affect range | normal | wide/bright | constricted | flat, near-neutral |

References for the marker column choices are the sources in §1; the
interlocutor behaviour is derived from §2 (Ellie's semi-structured style +
OARS + SHUSH), held constant across all four runs.

## Source list

- DeVault, Artstein, Benn et al. (2014) — SimSensei Kiosk, AAMAS'14.
  https://ifaamas.org/Proceedings/aamas2014/aamas/p1061.pdf
- DeVault et al. (2013) — Verbal indicators of psychological distress,
  SIGDIAL. https://aclanthology.org/W13-4032.pdf
- Gratch et al. (2014) — DAIC corpus, LREC.
  http://www.lrec-conf.org/proceedings/lrec2014/pdf/508_Paper.pdf
- Yu, Scherer, DeVault et al. (2013) — HMM dialogue features, DAIC.
  https://www.justinecassell.com/publications/Yu-Scherer-Devault-Gratch-Stratou-Morency-Cassell_2013.pdf
- E-DAIC manual (DeVault et al., 2014).
  https://dcapswoz.ict.usc.edu/wwwedaic/E-DAIC%20Manual.pdf
- Al-Mosaiwi & Johnstone (2018) — absolutist words, *Clin Psychol Sci*.
  https://doi.org/10.1177/2167702617747074
- Tackman et al. (2019) — depression & I-talk, *JPSP*.
  https://doi.org/10.1037/pspp0000187
- Holtzman (2017) — I-pronoun meta-analysis, *J Res Pers*.
  https://doi.org/10.1016/j.jrp.2017.02.005
- Tølbøll (2019) — linguistic features meta-analysis.
  https://tidsskrift.dk/lwo/article/view/117798
- BMC Med Inform Decis Mak (2024) — marker review table.
  https://doi.org/10.1186/s12911-024-02772-0
- Psychiatry Res (2024) — speech latency & psychomotor slowing.
  https://www.sciencedirect.com/science/article/abs/pii/S0165178124003895
- arXiv:1910.05115 — dialogue pause features & mood episodes.
  https://arxiv.org/pdf/1910.05115
- arXiv:2607.03744 — dyadic turn-pair timing on DAIC-WOZ.
  https://arxiv.org/html/2607.03744
- PLOS One 15(10) — timing speech features vs depression severity.
  https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0238726
- PMC8958205 — social interaction impairments in depression.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8958205/
- Parker — defining melancholia / psychomotor disturbance.
  https://minerva-access.unimelb.edu.au/server/api/core/bitstreams/6d2024b4-985c-56f3-b07a-c3d0ef82e966/content
- Degerman (2024) / Synthese — structure of silence in depression.
  https://link.springer.com/article/10.1007/s11229-025-04933-8
- Language in depressive disorder review (2022).
  https://doi.org/10.26744/rrttlc.2022.8.1.10
- Lucas et al. (2014) — disclosure to virtual humans, *Comput Hum Behav*.
  https://multicomp.cs.cmu.edu/wp-content/uploads/2017/09/2014_CHB_Lucas_It.pdf
- Southampton med-ed — depressed speech description.
  https://www.med.soton.ac.uk/mentalhealth/bmyr3yr5/compendium/depression/speech/s1.aspx
- MINT — MI definition & OARS.
  https://motivationalinterviewing.org/understanding-motivational-interviewing
- ISSUP — OARS examples.
  https://www.issup.net/knowledge-share/resources/2019-10/motivational-interviewing-open-questions-affirmation-reflective
- Samaritans — SHUSH listening tips + supporting someone.
  https://www.samaritans.org/how-we-can-help/support-and-information/worried-about-someone-else/difficult-conversations/tips-helping-someone-open-when-somethings/
  https://www.samaritans.org/how-we-can-help/if-youre-worried-about-someone-else/how-support-someone-youre-worried-about/what-do-if-you-think-someone-struggling/
- NHS — how to help someone with depression.
  https://www.nhs.uk/mental-health/advice-for-life-situations-and-events/how-to-help-someone-with-depression/
- Here for Someone — how to talk to someone with depression.
  https://hereforsomeone.org.uk/help/supporting-depression/how-to-talk/
- Right Decisions (NHS Scotland) — good conversations & empathy.
  https://www.rightdecisions.scot.nhs.uk/infoforwellbeing/module-1-good-conversations-and-empathy/supporting-someone-in-distress/
