# Questions: final decision

Status: final arbiter ruling, 2026-11-14. It replaces the weekly three-item check-in (`WEEKLY_ITEMS` in `demo/js/main.js`) and amends Decisions rows 9, 33, X3, X26 and R15. Inputs were the independent judge's picks and the adversarial reviewer's challenges. Each point was decided on its evidence, not on which side argued harder. Where I checked a source myself, it says "verified by the arbiter" in section 12.

Product rules this file follows: daily use stays effortless and kind. Each question gets its own screen, with nothing else on it (David's rule). Claims are "supportive", "early warning" or "suggests", never "diagnoses" or "treats". The crisis path is triggered only by self-report and uses fixed text, never AI text. The clinician decides; the system suggests.

## 0. What was decided, in one table

| Point | Judge | Reviewer | Ruling | Why |
|---|---|---|---|---|
| Daily lantern (`mood_start`) | Keep, anchored once, momentary, no cut-off | Keep, brightness as the main cue (Night Shift) | **Keep, with the reviewer's brightness change and neutral feedback** | Single-item mood ratings detected concurrent relapse in one small sample; Night Shift warms the display at bedtime |
| `mood_end` | Optional, own screen, exploratory | Off by default, research toggle | **Keep, on by default, own screen, exploratory, patient can switch it off** | One more tap costs little (prompt count does not predict EMA compliance), and the pre/post panel is a product decision (X3). It never enters the composite or the safety channel |
| Low-lantern support offer (X26) | 1 at both check-ins | `mood_start = 1` | **Offer when either lantern is 1, at most once a day, on the end screen only** | An offer on a non-question screen costs little. It must not depend on an optional second tap. It is a low-mood marker, never a safety flag |
| Validated symptom measure | PHQ-9 every 14 days, recall "last 2 weeks" | Keep | **Keep** | Recall matches cadence; verbatim public-domain items; named for monitoring in Käypä hoito |
| Mis-tap correction | OS back gesture | Build swipe-back; re-tap within 600 ms | **Reviewer** | A Capacitor WKWebView has no system back swipe for an in-page flow; a mis-tap on item 9 would skip the safety questions |
| Safety gate | PHQ-9 item 9 >= 1 | Add clinician "always ask" option | **Reviewer** | Most suicides in Louzon 2016 followed a "not at all" on item 9 |
| C-SSRS stop after item 4 or 5 | Stop at once | Ask to the end per the form | **Reviewer** | The form says "If YES, answer all questions 3, 4, 5, and 6". Items 5, 6 and 6b give the clinician the behaviour data. Finishing costs 1 to 3 taps |
| "Since Last Contact" version | Switch to it if supplied | Drop: it is the full clinician scale | **Drop** | Not a screener; intended for trained clinicians |
| C-SSRS licence | Confirm before research or commercial use | Confirm before any real patient use | **Reviewer (stricter)** | Clario holds the exclusive electronic licence; a patient-facing phone app falls clearly under neither route |
| Sharing pause | Recommend keeping safety shared | Safety never paused while the check-in is on | **Reviewer** | Otherwise a positive screen reaches no one while the patient believes it does |
| Crisis contacts | 112, MIELI | 112, MIELI (Finnish, 24 h), 116117, clinic, with language and hours | **Reviewer** | The UI is English; the 24 h MIELI line is Finnish |
| Claims and regulation | "Suggests" wording | Wording does not avoid the MDR | **Reviewer** | Monitoring and prediction are medical purposes under the MDR. Required line: research prototype, not CE-marked |
| Thresholds | PHQ bands, MCID 5, two-consecutive rule | Label the MCID source; residual-symptom marker | **Both** | Löwe 2004 is a late-life sample; Käypä hoito names PHQ-9 < 5 as an example acute-phase goal |

## 1. Screen rule (binding on every question)

1. **One question per screen.** The screen shows the question (and, for the PHQ-9, its stem) plus that question's response options. Nothing else: no second question, no "Talk to someone" icon, no progress bar or step count, no "Later", "Back", "Skip" or "Done" button, no crisis card, no game HUD, no moving scene elements.
2. **The next question follows the answer.** A tap selects an option, and the screen advances 600 ms later. A tap on another option within those 600 ms replaces the answer and restarts the 600 ms. Nothing is ever pre-selected.
3. **Going back.** A swipe from the left edge returns to the previous question with its answer shown, so a mis-tap can be fixed. On iOS this gesture must be built and tested inside the WKWebView, because an in-page flow gets no system back swipe. On Android the system back does the same.
4. **A quiet way to skip or stop, with no extra control on screen.**
   - Lanterns: no tap within 10 s means skipped. It is logged as `skipped`, never as a low score.
   - PHQ-9 and C-SSRS: swipe down (sheet dismissal) stops the check-in, as does closing the app. The intro screen says this once, before the first question. The VoiceOver escape gesture (two-finger Z) does the same. There is no per-item skip; stopping saves what was answered. Section 5 covers what happens to the safety items when someone stops.
   - Every option is an accessible button with a label (for example "Lantern 1 of 5, lowest"). The labels are read by screen readers, never shown.
5. **Support and crisis screens appear only between questions or after the last one,** never next to a question. "Talk to someone" stays on every non-question screen (start, end, settings, intro, thank-you), so help is never more than one screen away.
6. **No answer-dependent feedback.** Every option gets the same acknowledgement. Today the lantern check-in plays a pitch that rises with the choice (`Au.piano(2 + choice)`) and kicks the world harder for higher choices (`kick(0.25 + 0.1 * choice)`, `demo/js/measures.js`). Make both identical for all five lanterns, so no answer feels rewarded.
7. The current build breaks this rule in two places, and both are replaced: `#weekly` (three items plus Later and Done on one card) and `#end` (`#moodEnd` lanterns beside the end text, the offer, Back and the Talk icon).

## 2. Daily mood lantern

**Name and source.** The Afferent mood lantern is in-house: a wordless, single-item, momentary mood rating. It is modelled on single-item mood visual analogue scales (van Rijsbergen et al. 2014; Killgore 1999) and on non-verbal pictorial affect ratings (Self-Assessment Manikin, Bradley and Lang 1994). **The lantern version is not validated.** Do not call it a VAS, the VAMS, the SAM, or "validated". No licence is needed.

**Definition.**
- Five lanterns of the same shape and size, equally spaced in a fixed row: 1 on the left (low) to 5 on the right (high). Nothing is pre-selected and nothing animates towards an answer.
- Ordinal cue: **brightness is primary** and rises strictly from 1 to 5. Hue is secondary, from dim cool blue (1) to warm bright amber (5); lantern 3 is a neutral grey-sand. Current tokens: colours `#34476E, #5A7CA6, #A9A79A, #E8B867, #FFCB5C` with glow alpha `0.35, 0.5, 0.65, 0.82, 1` (`demo/js/measures.js`).
- The order must still read correctly in grayscale, under iOS Night Shift and True Tone, and at the dimmed night brightness. Test all of these before the pilot. If the five steps do not stay clearly ordered in grayscale, widen the brightness steps; do not add words or numbers.
- Behind the lanterns is a plain, still, darkened field: no moving scene, no HUD, no icons, no text.

**Anchor (the only words, on its own onboarding screen, never together with the lanterns).** It is shown once at onboarding and can be reopened from Settings > How it works. `anchor_version = 1`.

> Each time you play, you will see five lanterns. Tap the one that matches how you feel right now. The dimmest, coolest lantern is the lowest you feel. The brightest, warmest lantern is the best you feel. There is no wrong answer, and you can skip by waiting.
>
> [Got it]

**Items.**

| Key | When | Wording | Options | Scoring |
|---|---|---|---|---|
| `mood_start` | Every session, in the fixed core after the 6 s rest | None (wordless) | 1, 2, 3, 4, 5 | Ordinal 1 to 5; `null` with status `skipped` after 10 s without a tap. **The only lantern value in the composite** |
| `mood_end` | After dawn, on its own screen, before the end screen. On by default; the patient can switch it off in Settings | None (wordless), same screen as `mood_start` | 1 to 5 | Ordinal; `null` if skipped or switched off. **Exploratory only**: pre/post panel and next-day association, labelled "association, not effect". Never in the composite, the CUSUM or the safety channel |

**Cadence and recall.** One or two taps per session, never more than two a day. Recall is "right now" (momentary), so it does not clash with any cadence. The timeout is 10 s for both lanterns. That replaces "up to 6 s" for `mood_start` in SessionSchema.md, so that slow responders are not logged as skipped.

**Scoring and use.** Use personal-baseline robust z only: median and MAD x 1.4826, MAD floor 1 lantern, baseline days 0 to 13 with at least 7 values (Statistics.md). There is no absolute cut-off: the VAMS cut-off of 55/100 does not transfer to a 5-point pictorial scale. The composite weight stays 1.5 but is **provisional** until the pilot measures concurrent validity.

**Low-lantern offer (replaces X26's mood rule).** If `mood_start = 1` or `mood_end = 1`, the end screen (a non-question screen) shows the existing quiet line "Would you like someone to talk to?" with a Yes that opens the support screen. It appears at most once per day and is never forced. The hub records a `low_mood` marker (`count` 1 or 2). **It is never a safety flag**: a mood rating is not a suicide screen (Decisions row 32: a dark lantern is honesty, not danger).

**Evidence (and its limits).**
- In 130 remitted recurrent-MDD outpatients (13.8% relapsed during follow-up), a single worded 100-point sad-mood VAMS detected *concurrent* relapse with AUC 0.94 (HAM-D17 0.91, IDS-SR 0.86). At a cut-off of 55 it had no false negatives, but the PPV was 0.53, and a positive screen still needed a diagnostic interview (van Rijsbergen 2014). Say "detected current relapse in a small sample", never "tracks" or "predicts" relapse.
- Killgore 1999 reported that single-item mood VAS classification was comparable to longer scales.
- The SAM rates valence without words (Bradley and Lang 1994).
- Colour and mood: grey goes with anxious or depressed mood and yellow with normal mood in the Manchester Color Wheel study (Carruthers 2010).
- Daily EMA mood ratings correlate only moderately with the PHQ-9, so the lantern complements a validated instrument and does not replace one.
- In EMA studies, prompts per day did not predict compliance (Wrzus and Neubauer 2023; Jones 2019 pooled compliance about 75 to 82%).

**Pilot validation.**
- Concurrent validity: Spearman correlation between the mean `mood_start` in each 14-day window and that window's PHQ-9 total, between and within persons.
- Test-retest on stable days.
- Floor and ceiling shares.
- A night-display check: compare ratings with and without Night Shift.

Report the lantern as "not validated" until then.

## 3. PHQ-9 every 14 days (replaces the weekly check-in)

**Source.** Patient Health Questionnaire-9, Kroenke, Spitzer and Williams 2001. The wording is taken verbatim from the PHQ instruction manual (phqscreeners.com).

**Licensing.** Public domain. The manual says: "No permission is required to reproduce, translate, display or distribute." Keep the wording verbatim and credit: "Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc." Only official translations may be used (see Language below).

**Cadence.**
- Every 14 days, daytime only (06:00 to 21:00, the existing night rule). Never inside the bedtime game.
- First administration at TMS discharge, which gives baseline B. Alternatively, the clinic's discharge PHQ-9 is imported with `source: clinic_import`.
- On the due day:
  - The start screen shows the pill "Check-in".
  - One optional daytime notification, at a time chosen at discharge (default 12:00). Its fixed text has no clinical content on the lock screen: "Your check-in is ready when you are."
  - No further notifications. The pill stays in the daytime until a check-in is completed. The export shows it as overdue from day 17.
- The clinician may request an early check-in, but no sooner than 7 days after the last one. It is flagged `early: true`. The app never brings a check-in forward on its own.

**Recall period.** "Over the last 2 weeks", unchanged. It matches the 14-day cadence, so check-ins neither overlap nor leave gaps. The current build's home-made "Over the last week" stem is withdrawn: changing the recall of validated items makes the scores unvalidated.

**Language.**
- English verbatim (the app UI is English).
- Finnish or Swedish only from the official translations distributed via phqscreeners.com, chosen by the patient at discharge.
- Never translate the PHQ-9 or the C-SSRS ourselves.
- Unresolved: I could not confirm that Finnish and Swedish versions are listed (open risk).

**Screens (each its own screen, per section 1).**

0. **Intro** (not a question; it may carry buttons and the Talk icon).
   - Afferent's own text, used until the clinic signs a review protocol: "Check-in. Nine short questions about the last 2 weeks. Your clinic will see your answers. This is not watched around the clock. You can stop at any time by swiping down."
   - Once a signed protocol commits to it, "Your clinic will see your answers" becomes "Your clinic sees your answers on the next working day."
   - If sharing is paused, this line is added: "Sharing is paused, but answers about your safety still reach your clinic."
   - Buttons: "Start" and "Later". "Later" snoozes for 24 h and exists only here.
1. Items 1 to 9. Each screen shows the stem, then the item, then the four options in a vertical list, top to bottom.

Stem on every item screen: **"Over the last 2 weeks, how often have you been bothered by any of the following problems?"**

Options for every item: **"Not at all" (0), "Several days" (1), "More than half the days" (2), "Nearly every day" (3)**

| Key | Exact item wording |
|---|---|
| `phq9_1` | Little interest or pleasure in doing things |
| `phq9_2` | Feeling down, depressed, or hopeless |
| `phq9_3` | Trouble falling or staying asleep, or sleeping too much |
| `phq9_4` | Feeling tired or having little energy |
| `phq9_5` | Poor appetite or overeating |
| `phq9_6` | Feeling bad about yourself - or that you are a failure or have let yourself or your family down |
| `phq9_7` | Trouble concentrating on things, such as reading the newspaper or watching television |
| `phq9_8` | Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual |
| `phq9_9` | Thoughts that you would be better off dead or of hurting yourself in some way |

Wording notes:
- In items 6 and 8, the official form uses a long dash (Unicode U+2014) where this file shows " - ". The app string uses the official character; the words never change.
- Restore the comma in item 2 and "in some way" in item 9; the current build drops both.
- Item 9 is always last.
- Item 10 (difficulty) is not asked.

**Scoring.**
- Total = sum of items 1 to 9 (0 to 27). PHQ-8 total = items 1 to 8 (0 to 24), exported for comparability.
- A total is computed **only when all 9 items are answered**. Otherwise the record is `incomplete`, with item-level values and totals `null`. No missing-item prorating rule was verified, so none is used.
- Severity bands (manual): 0 to 4 minimal, 5 to 9 mild, 10 to 14 moderate, 15 to 19 moderately severe, 20 to 27 severe. These are severity bands, not diagnoses.
- Item 9 counts in the total AND drives the separate safety channel (section 5).

**Evidence.**
- Cut-offs 5, 10, 15 and 20, and repeated use to monitor outcomes (PHQ manual).
- The Finnish Current Care Guideline (Käypä hoito, depression) recommends questionnaires such as the PHQ-9 to follow treatment response. It gives "< 5 pistettä PHQ-9:ssä" as an example acute-phase goal and names the C-SSRS for assessing suicidal thinking and behaviour.
- Individual MCID of 5 points and 7-day test-retest reliability: Löwe 2004, in 434 late-life depression patients (IMPACT trial). Describe the MCID as transferred from that population.
- PHQ-8 and PHQ-9 are near-equivalent (Wu 2020).
- PHQ-2 alone performs worse: sensitivity 0.72 and specificity 0.85 at >= 3 (Levis 2020).
- Electronic and paper PROs are equivalent (Muehlhausen 2015).
- An app-based PHQ-8 every 2 weeks has been used for relapse monitoring (RADAR-MDD).
- Why monitoring matters after TMS: sustained response among initial rTMS responders is 66.5% at 3 months, 52.9% at 6 months and 46.3% at 12 months, and maintenance treatment predicted higher responder rates (Senova 2019). Residual symptoms predict early relapse (Paykel 1995).

## 4. C-SSRS Screener, Self-Report, Recent (gated)

**Source.** Columbia-Suicide Severity Rating Scale, Screener, Self-Report, Recent version (Columbia Lighthouse Project, 2026 PDF; Posner et al. 2011). The items below were checked verbatim by the arbiter against the PDF text.

**When it is asked.**
- Directly after PHQ-9 item 9, in the same check-in, when **item 9 >= 1**, OR when the clinician set **"Ask safety questions at every check-in"** at discharge. That setting is for patients with a known history of suicidal ideation or attempts; it is off by default and the clinician decides.
- Never daily, never at night, never inside the game.

**Recall.** "In the past month" for items 1 to 5 (the form's column header); item 6 asks "ever", and 6b "the past 3 months". The recall overlaps between 14-day check-ins. That is acceptable, because the screener is triage for the clinician and is never trended, plotted or z-scored.

**Licensing (gate before ANY real patient use).**
- Columbia allows use in clinical and EHR settings without permission, allows organisations to create their own triage next steps, and says the core questions do not vary. It also offers screenshot review.
- Clario holds an exclusive licence for electronic implementations. Its listed fees are a start-up fee, a yearly fee, a fee per language certification and a fee per administration, and it lists "Tablet or Web only".
- A patient-facing phone app falls clearly under neither route. Get **written confirmation from Columbia (or Clario) before any use with real patients.**
- Until then, `cssrs_licensed = false` and the PHQ-9-only fallback in section 5 applies. The demo may show the screener only on SIMULATED patients.

**Screens (each its own screen; options "Yes" and "No").**

| Key | Exact wording (header line, then item) | Logic | Columbia triage colour |
|---|---|---|---|
| `cssrs_intro` | Afferent's own transition screen, not a question: "A few more questions, so your clinic can understand. Answer yes or no." [Continue] | | |
| `cssrs_1` | In the past month: / Have you wished you were dead or wished you could go to sleep and not wake up? | Always asked | Yes = low (yellow) |
| `cssrs_2` | In the past month: / Have you actually had any thoughts of killing yourself? | Always asked. Yes: ask 3, 4, 5 and 6. No: go directly to 6 | Yes = low (yellow) |
| `cssrs_3` | In the past month: / Have you thought about how you might do this? (For example, “I thought about taking an overdose but I never worked out the details about when, where, and how I would do that and I would never act on these thoughts.”) | Only if 2 = Yes | Yes = moderate (orange) |
| `cssrs_4` | In the past month: / Have you had any intention of acting on these thoughts of killing yourself, as opposed to you have the thoughts, but you definitely would not act on them? (For example, “I had the thought of killing myself by taking an overdose and am not sure whether I would do it or not.”) | Only if 2 = Yes | Yes = high (red) |
| `cssrs_5` | In the past month: / Have you started to work out, or actually worked out, the specific details of how to kill yourself and did you actually intend to carry out the details of your plan? (For example, “I am planning to take 3 bottles of my sleep medication this Saturday when no one is around to stop me.”) | Only if 2 = Yes | Yes = high (red) |
| `cssrs_6` | Have you ever done anything, started to do anything, or prepared to do anything to end your life? (For example: Took pills, tried to shoot yourself, cut yourself, tried to hang yourself, took out pills but didn’t swallow any, held a gun but changed your mind about hurting yourself or it was grabbed from your hand, went to the roof to jump but didn’t, collected pills, obtained a gun, gave away valuables, wrote a will or suicide note; etc.) | Always asked | Yes = moderate (orange) |
| `cssrs_6b` | If YES, did this occur in the past 3 months? | Only if 6 = Yes | Yes = high (red) |

Notes on the screens:
- **Do not stop early after a Yes to 4 or 5.** Finish the sequence as the form says ("If YES, answer all questions 3, 4, 5, and 6"), then open the crisis screen immediately.
- The header "In the past month:" is the form's column header, shown above each of items 1 to 5. The "If YES," prefix on 6b is kept verbatim. Ask Columbia during the screenshot review whether it may be dropped, because it is only shown after a Yes.

**Scoring (Columbia triage points, mapping verified on the 2026 triage PDF).**
- `high`: Yes to 4, 5 or 6b.
- `moderate`: Yes to 3, or Yes to 6 with 6b = No.
- `low`: Yes only to 1 and/or 2.
- `none`: all No.
- If item 6 is Yes and 6b is No, and the previous check-in had the same answers, set `cssrs_6_repeat: true`. The tier stays as Columbia defines it (moderate), but the hub labels the flag "known lifetime behaviour, unchanged since last check-in", so it does not read as new every 14 days.

**Evidence.**
- PHQ-9 item 9 alone is a weak suicide screen. Against an electronic C-SSRS (n = 841) it had sensitivity 87.6% and specificity 66.1%, and the authors call it an insufficient assessment tool (Na 2018).
- The PHQ manual says a final decision on self-harm risk requires a clinical interview.
- Item 9 still carries signal. Its hazard ratios rise step by step to 2.85 for "nearly every day" (Louzon 2016; see also Simon 2013). But most suicides in the VA sample followed a "not at all" on the most recent item 9 (Louzon 2016). That is the reason for the clinician's "always ask" option.
- Asking does not raise risk: no iatrogenic effect in 13 prospective studies (DeCou and Schumann 2018, Suicide Life Threat Behav 48(5):531-543).
- Workflow precedent only: Kaiser Permanente Washington's stepped PHQ-9 then C-SSRS workflow came with 25% fewer suicide attempts (4.5 vs 6.0 per 10,000) in a stepped-wedge trial in 19 practices (Angerhofer Richards 2024). That model included same-day safety planning by on-site clinicians, which Afferent does not provide. **Never cite it as evidence that Afferent has a safety effect.**

## 5. Safety flow, step by step

Principles:
- The flow is triggered only by self-report.
- All text is fixed and human-written. No AI text ever, and the safety channel is never sent to Gemma.
- No automated advice beyond the fixed contacts.
- The clinician decides. The clinic protocol (signed before go-live) names the receiver and sets the response time per tier. Without a signed protocol the app promises nothing beyond "your clinic will see your answers".
- The safety channel is separate from the early-warning analytics. It is never z-scored, weighted, delayed by the baseline or the CUSUM, and it works from day 0.
- **Safety answers are always shared while the check-in is on**, even when "sharing" is paused. The intro says so. A patient who does not want this switches the check-in off (R15: on by default in the pilot, agreed at discharge, switchable off).

Flow:

1. The patient opens the check-in in the daytime and sees the intro screen.
2. PHQ-9 items 1 to 9, one per screen.
3. After item 9:
   - **a. Item 9 = 0 and "always ask" is off:** tier `none`. Show the thank-you screen.
   - **b. Item 9 >= 1, or "always ask" is on, and `cssrs_licensed = true`:** show the transition screen, then the C-SSRS (section 4), asked to the end. Then:
     - `high`: the **crisis screen**. Flag `safety_high`.
     - `moderate`: the **support screen**. Flag `safety_moderate`.
     - `low`: the **support screen**. Flag `safety_low`.
     - `none` (only possible with "always ask" and item 9 = 0): the thank-you screen, no flag.
   - **c. Fallback, `cssrs_licensed = false`:**
     - Item 9 = 1: the support screen. Flag `safety_low`.
     - Item 9 >= 2: the crisis screen. Flag `safety_moderate`, labelled "C-SSRS not asked; tier from item 9". HIGH cannot be told apart, so the clinic follows up by phone per protocol and may run the C-SSRS there. The hazard ratios for item 9 rise with each response step (Louzon 2016).
4. Stopping partway (swipe down, closing the app):
   - **Before item 9 was answered:** `safety.tier = not_answered`. Shown in the export as "check-in stopped before the safety item", as information, not a flag. The patient sees the plain screen "Saved." with the Talk icon. The pill returns after 24 h; there are no notifications and no nagging.
   - **After item 9 >= 1, with the C-SSRS unfinished:** flag `safety_incomplete`, handled at least like `low`. The app opens the support screen right away, or the crisis screen if a high answer was already given. There is no reminder on the next open. A refusal is not treated as a positive screen, but it is documented.
5. The fixed screens. All three are non-question screens, so they show the Talk icon. Contacts are tap-to-call buttons in this order, each labelled with language and hours:

| Order | Label | Number | Status |
|---|---|---|---|
| 1 | Emergency | 112 | |
| 2 | MIELI Crisis Helpline, in Finnish, 24 h | 09 2525 0111 | Arbiter verified "suomeksi 24h" on mieli.fi |
| 3 | Medical Helpline, 24 h | 116117 | Arbiter verified it is open 24/7 for urgent health problems, with regional variation |
| 4 | Your clinic, office hours | placeholder | Must be filled before use |

Add the Swedish and English MIELI lines only after their numbers and hours are verified on mieli.fi. The reviewer reported 09 2525 0112 (Swedish) and 09 2525 0116 (English), both with limited hours; the arbiter could not confirm them.

   - **Thank-you screen:** "Thank you." [Close]
   - **Support screen:**
     - Title: "If today is heavy, you do not have to carry it alone."
     - Line: "Your clinic will see your answers. If you need someone now, call 112 or a helpline below." (Once the signed protocol commits to it, "will see your answers" becomes "will see your answers on the next working day".)
     - Contacts as listed above.
     - Footer: "Afferent is not an emergency service and is not watched around the clock."
     - [Close]
   - **Crisis screen:** the same as the support screen, with one fixed line above the title: "If you might act on these thoughts, call 112 now." 112 is first and visually primary. The screen opens immediately after the last C-SSRS item and never promises a call.
6. The export carries the tier, the item 9 score, the C-SSRS answers ("not asked" where the skip logic skipped an item), `cssrs_6_repeat`, which screen was shown, and timestamps. The clinician list sorts `high`, then `moderate`, then `incomplete`, then `low`.
7. Never: suicide items daily or at night, safety flags from lanterns, pulse, eyes, tasks or missed sessions, or AI text anywhere in this flow.

## 6. Analytics thresholds (all are suggestions; the clinician decides)

1. **PHQ-9 against the personal discharge baseline B.**
   - If B >= 5, show the context marker "residual symptoms at discharge (above the Käypä hoito example goal of PHQ-9 < 5)". Residual symptoms predict early relapse (Paykel 1995).
   - **Watch:** the total rises >= 5 above B (an MCID transferred from a late-life depression sample, Löwe 2004), OR crosses from < 10 to >= 10.
   - **Consider a check-in call:** the total is >= 10 AND >= 5 above B, OR the total is >= 15.
   - **Consider discussing a booster session:** two consecutive totals that are each >= 10 and >= 5 above B, OR any total >= 20. Label the "two consecutive" rule "Afferent design choice, not a validated relapse rule".
   - The state shown is the higher of the PHQ-9 state and the composite CUSUM state. Both reasons are shown; the PHQ-9 can raise the state but never lower it.
   - Show the PHQ-8 total beside the PHQ-9 total.
   - Incomplete check-ins give no total and no state change.
   - **Overdue:** no completed check-in 17 days after the last one.
2. **Safety:** the tiers from section 5 only, on their own channel, never in the composite.
3. **Daily lantern (`mood_start`):** robust z against the personal baseline (median, MAD x 1.4826, floor 1 lantern, days 0 to 13, at least 7 values). Composite weight 1.5, provisional. No absolute cut-off. `mood_end` is excluded.
4. **Anhedonia context (exploratory):** a rise of >= 2 points from B on PHQ-9 item 1 is shown next to the reward-bias trend (log b). It changes no state.
5. **Never:**
   - Suicide risk from the composite, mood, pulse, eyes, tasks or missed sessions.
   - A PHQ-2 subscore cut-off when the full PHQ-9 is available.
   - Lantern cut-offs.
   - Any statement that the composite is validated. Early-warning signals in EMA have limited individual accuracy, which is why everything is phrased as "suggests".

## 7. Allowed claims

**Required line** (app About screen, hub footer, pitch): "Research prototype. Not a CE-marked medical device. Not for clinical use."

The MDR covers software meant for monitoring or prediction of disease, and under MDCG 2019-11 information used for diagnostic or therapeutic decisions is at least class IIa. Careful wording does not change that. Any pilot with patients needs the MDR clinical-investigation route.

**Allowed:**
- "Afferent asks the PHQ-9, a widely used and validated depression questionnaire, every two weeks, and shares the answers with your clinic."
- "A one-tap daily mood rating. A similar single-item mood scale detected current relapse in one small study; our lantern version has not been validated."
- "The hub suggests when a clinician may want to check in; the clinician decides."
- "Supports home maintenance after TMS." "Early warning." "A change in these numbers suggests..."
- "Afferent is not an emergency service and is not watched around the clock."
- For clinician-facing material: "Asking about suicidal thoughts does not make them more likely" (DeCou and Schumann 2018).
- As context: "About half of people who respond to rTMS still respond at 12 months" (46.3%, Senova 2019).

**Allowed only once a signed clinic protocol exists:** "Safety answers are reviewed by your clinic on the next working day."

**Not allowed:**
- "diagnoses", "detects relapse", "predicts relapse or suicide", "assesses suicide risk", or "screens for suicide" as a product claim.
- "monitors you 24/7".
- "the lantern measures depression".
- "validated" about the lanterns, game tasks, reward bias or the composite.
- "clinically proven", "treats", "prevents relapse".
- Any promised response time or call.
- Citing the Kaiser trial as evidence that Afferent has a safety effect.
- Calling PHQ-9 bands diagnoses (they are severity bands; the manual calls its diagnoses provisional).

## 8. Rejected, and why

- **The weekly check-in as built:** PHQ items under a home-made "Over the last week" stem (an unvalidated recall), item 9 missing "in some way", and three questions plus Later and Done on one card (breaks the screen rule).
- **"Past 2 weeks" items asked weekly:** consecutive answers overlap by half. Replaced by the 14-day cadence. A clinician-requested early check-in (at least 7 days, `early: true`) is the only exception.
- **PHQ-2 alone:** sensitivity 0.72 and specificity 0.85 at >= 3. The full PHQ-9 every 14 days costs about a minute.
- **PHQ-8 as the only instrument:** it drops item 9 and leaves no self-report safety screen. It is exported alongside the PHQ-9 instead.
- **Daily PHQ or EMA symptom lists:** app scores ran higher than paper in a tiny study (Torous 2015, n = 13, tentative), daily item lists break "effortless and kind", and the validated recall is 2 weeks.
- **Suicide items daily:** ideation shifts within hours, nobody watches live, and the clinic responds on working days. Daily asking would add flags no one can act on.
- **ASQ as the in-app screen:** its pathway assumes staff on site ("cannot leave until evaluated"), and its recall does not match our cadence.
- **C-SSRS "Since Last Contact" self-report:** it is the full clinician scale (intensity items, behaviour counts, free text), intended for trained clinicians.
- **Stopping the C-SSRS at a Yes to 4 or 5:** it deviates from the form and drops the behaviour data the clinician needs. Finishing costs seconds.
- **Item 9 as the only gate with no clinician override:** most suicides in Louzon 2016 followed "not at all".
- **Letting "sharing paused" withhold safety answers:** a positive screen would reach no one while the patient believes it does.
- **Prorating missing PHQ-9 items:** no rule was verified for this use. Incomplete means no total.
- **A visible Skip, Back or progress control on question screens:** breaks the screen rule. Gestures and the timeout replace them.
- **QIDS-SR16:** licensed via Mapi (UT Southwestern) and 16 items. Only if the clinic already licenses it and wants a weekly 7-day recall.
- **BDI-II, HADS:** paid licences (Pearson; GL Assessment). HADS is also built for medical inpatients.
- **MADRS-S:** 3-day recall fits no cadence; licensing unclear.
- **CES-D:** 20 items, built for population screening.
- **WHO-5:** free and kindly worded, but has no safety item. The best candidate if the clinic wants a positively worded add-on later.
- **GAD-2:** off by default. The clinic may switch it on at discharge (2 screens every 14 days).
- **SHAPS in the product:** a validation sub-study only (discharge, week 4, week 12) to test whether log b tracks anhedonia. PHQ-9 item 1 is the routine anchor.
- **Lowest lantern as a safety flag:** a mood rating is not a suicide screen. It stays a low-mood marker and a gentle offer.
- **`mood_end` in the composite:** demand effects right after a pleasant task.
- **`mood_end` off by default (reviewer):** rejected. It costs one tap, prompt count does not predict EMA compliance, and the pre/post panel is a product decision (X3). It stays exploratory and can be switched off.
- **VAMS cut-off of 55/100 on the lanterns:** the VAMS is a continuous worded VAS; the cut-off does not transfer.
- **Answer-dependent lantern feedback** (rising pitch, bigger world reaction for higher choices): it rewards "good" answers.
- **Signal-triggered crisis paths** (pulse, eyes, tasks, missed nights): no validated link to acute risk (Decisions rows 32 and 33).
- **The reviewer's claim that Käypä hoito asks for follow-up every 1 to 3 weeks:** not found in the guideline text the arbiter read. The 14-day cadence rests on the recall match instead.

## 9. Open risks

1. **C-SSRS electronic licence** for a patient-facing phone app: written confirmation is needed before any real patient use; until then, the fallback.
2. **Clinic protocol:** named receiver (R7), response time per tier (especially `high` during office hours), and the wording "next working day". Until signed, the app says only "your clinic will see your answers".
3. **MDR:** qualification and class (likely IIa or higher under Rule 11), and the clinical-investigation route via Fimea for any patient pilot. Not verified here.
4. **Translations:** official Finnish and Swedish PHQ-9 and C-SSRS versions are not confirmed. English only until they are.
5. **Crisis contacts:** the Swedish and English MIELI lines and hours are unverified, and the clinic number is a placeholder. An English speaker calling at night reaches a Finnish line, so the label says so.
6. **14-day cadence halves the safety-screen frequency** compared with today's weekly check-in (R15). The mitigations are clinician-requested early check-ins and the always-on Talk button; never a reworded PHQ.
7. **Daytime-only check-in for a bedtime app:** patients may rarely open the app in the daytime. Measure completion; the single notification on the due day is the only nudge.
8. **Method examples in C-SSRS items 3 to 6** are shown unsupervised at home. They must stay verbatim. The clinic must accept this; the mitigations are gating, daytime only and never at bedtime.
9. **Lantern validity:** not validated. Night Shift, True Tone, colour-vision deficiency and night dimming may shift ratings. Brightness is the primary cue, and grayscale and Night Shift tests are needed.
10. **Gesture-only back and stop:** test VoiceOver, Switch Control and motor impairment. Hidden gestures can be missed; the intro screen explains them once.
11. **Item 6 lifetime repeats:** `cssrs_6_repeat` labelling must not hide a genuinely new attempt. A Yes to 6b always raises the tier to `high`.
12. **Thresholds are design choices** built on published cut-offs and an MCID from another population. Tune them on real pilot data.
13. **Claims taken from secondary summaries and not re-verified by the arbiter:** Wu 2020, Levis 2020, Kleiman 2017, Carruthers 2010, Killgore 1999, Simon 2013, Muehlhausen 2015, Jones 2019, Wrzus 2023, ASQ adult data, Paykel 1995, and the QIDS, BDI-II and HADS licence terms. Check the primary papers before any submission.

## 10. Implementation brief (engineers)

### 10.1 Session document (`SessionSchema.md`, `contracts/session.v3.schema.json`)

Additive optional fields. Note the change in SessionSchema.md and keep `afferent.session/3` if the schema allows added properties; otherwise bump the schema version.

| Field | Type | Description |
|---|---|---|
| `core.mood_start_status` | enum | `answered`, `skipped` (10 s without a tap) |
| `mood_end_status` | enum | `answered`, `skipped`, `off` (switched off in Settings) |
| `mood_anchor_version` | int | Version of the onboarding anchor text the patient saw (1) |
| `display` | object | `night_shift` (bool or null; null where the OS does not expose it), `grayscale` (bool or null), `brightness` (0 to 1 or null) at the lantern screen |
| `low_mood_offer` | object | `shown` (bool), `count` (1 or 2 lanterns at 1), `accepted` (bool) |

Edits:
- Segment table: "Core: mood check-in, up to 10 s".
- "End check-in": on its own screen before the end screen.
- `pre_post.mood` unchanged.
- `mood_end` is never in the composite.

### 10.2 New check-in document (`contracts/checkin.v1.schema.json`, `afferent.checkin/1`)

One document per check-in attempt, sent as `checkin` on `/ws/app` (or `POST /api/checkins`). It replaces the `weekly_checkin` message.

| Field | Type | Description |
|---|---|---|
| `schema`, `checkin_id`, `patient_id`, `device_id`, `app_version` | | As in sessions |
| `started_iso`, `completed_iso` | string | Local time with offset |
| `status` | enum | `completed`, `incomplete` |
| `trigger` | enum | `schedule`, `clinician_early` |
| `early` | bool | Less than 14 days after the previous completed check-in |
| `language`, `instrument_versions` | | e.g. `{"phq9": "PHQ-9 English, phqscreeners.com manual", "cssrs": "C-SSRS Screener Self-Report Recent 2026"}` |
| `phq9.items` | object | `phq9_1` to `phq9_9`, each 0 to 3 or null |
| `phq9.item_ms`, `phq9.changed` | object | Decision time per item; number of re-taps or back-swipes per item |
| `phq9.total`, `phq9.phq8_total`, `phq9.band` | int/null, int/null, enum/null | null unless all 9 (8) answered; bands `minimal`, `mild`, `moderate`, `moderately_severe`, `severe` |
| `cssrs.asked`, `cssrs.reason` | bool, enum | `item9_positive`, `always_ask`, or `not_licensed` (when not asked) |
| `cssrs.items` | object | `c1` to `c6b`: `true`, `false`, `"not_asked"` (skip logic) or null (stopped) |
| `cssrs.tier`, `cssrs.c6_repeat` | enum, bool | `none`, `low`, `moderate`, `high` |
| `safety.tier` | enum | `none`, `low`, `moderate`, `high`, `incomplete`, `not_answered` |
| `safety.source` | enum | `cssrs`, `item9_fallback` |
| `safety.screen` | enum | `thank_you`, `support`, `crisis`, `saved` |
| `safety.shared` | const true | Safety answers always reach the hub while the check-in is on |

### 10.3 Daily record (`contracts/daily.v1.schema.json`)

| Field | Type | Description |
|---|---|---|
| `checkin_due` | bool | A check-in was due or overdue on this day |
| `checkin_overdue_days` | int/null | Days past day 14 without a completed check-in |
| `checkin_ids` | string[] | Check-ins started on this day |
| `safety_tier_max` | enum/null | Highest safety tier recorded on this day |
| `low_mood_marker` | int/null | Max `low_mood_offer.count` of the day |

### 10.4 Patient config (set at discharge, sent in `config`)

- `checkin.enabled` (default true in the pilot)
- `checkin.cadence_days` (14)
- `checkin.always_ask_cssrs` (false; clinician only)
- `checkin.cssrs_licensed` (false until written confirmation)
- `checkin.reminder_local_time` ("12:00")
- `checkin.language` ("en")
- `checkin.gad2` (false)
- `phq_baseline` = `{value, phq8, source: in_app | clinic_import, date}`
- `mood_end_enabled` (true; the patient can change it)
- `clinic_contact` (name, number, hours)

### 10.5 Hub

- Store check-ins in their own table.
- Flags: `safety_high`, `safety_moderate`, `safety_incomplete`, `safety_low` (sorted in that order), `talk_request`, `low_mood` (marker, not safety). The old `weekly_checkin` and `low_mood_twice` flag types go.
- Analytics: add a `phq` block (series, B, residual marker, state and reason per section 6.1, overdue). The displayed state is the max of the composite state and the PHQ-9 state.
- Never pass `phq9_9`, `cssrs` or `safety` to Gemma (`weekly_summary`). They must not appear in `summary_numbers`.
- Update `contracts/api.md` section 7: the new fixed texts and contacts from section 5.

### 10.6 UI flow (demo)

1. Delete the `#weekly` card, `WEEKLY_ITEMS`, the 7-day `weeklyDue` rule, and the direct `crisis()` call on `self_harm > 0`.
2. Build a question-screen component: full screen, a still background, the stem (PHQ only) plus the item plus the options, nothing else. It handles the 600 ms advance with re-tap, the left-edge swipe back (built for WKWebView), swipe-down stop, VoiceOver escape and accessible labels.
3. Check-in pill (daytime only, start screen) leads to the intro (Start / Later), then PHQ-9 items 1 to 9, then the branch per section 5.3, then the thank-you, support or crisis screen.
4. Lanterns:
   - `mood_start` inside the core, on the still darkened field, with the 10 s timeout.
   - `mood_end`, if enabled, as its own screen after dawn.
   - Then the end screen ("Rest well." / "Good morning.", the offer line if a lantern was 1, Back, Talk icon). Move `#moodEnd` out of `#end`.
   - Make the feedback identical for every lantern (same tone, same world reaction).
5. Onboarding: the anchor screen, then a separate practice lantern screen, also reachable from Settings > How it works.
6. Settings: "Check-in" (on/off, with the R15 note), "Second lantern after play" (on/off), the language of the check-in (official versions only).
7. Contacts: replace the two links in `#crisis` with the four ordered, labelled tap-to-call buttons. Add the fixed lines from section 5.5. Add the required research-prototype line to About.

## 11. Decisions.md rows this changes (for whoever edits Decisions.md)

- **33 and R15:** the check-in becomes 14-day, PHQ-9 plus a gated C-SSRS. Safety answers are always shared while the check-in is on.
- **X3:** `mood_end` is on its own screen, exploratory, and can be switched off.
- **X26:** the low-lantern rule becomes "either lantern 1, offer once a day, low-mood marker, not a safety flag". Contacts and texts as in section 5.
- **Row 9 / X3 colour:** brightness is the primary ordinal cue.

## 12. Sources

Verified by the arbiter in this ruling:
- C-SSRS Screener Self-Report Recent 2026 (item text): https://cssrs.columbia.edu/wp-content/uploads/C-SSRS-Screener-Self-Report-Recent-2026.pdf
- C-SSRS Screener with triage points 2026 (colour mapping, rendered page): https://cssrs.columbia.edu/wp-content/uploads/C-SSRS-Screener-with-triage-points-2026.pdf
- Louzon et al. 2016, Psychiatr Serv 67(5):517-522: https://pubmed.ncbi.nlm.nih.gov/26766757/
- Na et al. 2018, J Affect Disord 232:34-40: https://pubmed.ncbi.nlm.nih.gov/29477096/
- DeCou and Schumann 2018, Suicide Life Threat Behav 48(5):531-543: https://pubmed.ncbi.nlm.nih.gov/28678380/
- Angerhofer Richards et al. 2024, Ann Intern Med 177(11):1471-1481, doi 10.7326/M24-0024: https://www.healio.com/news/primary-care/20241002/suicide-attempts-fall-sharply-after-screening-initiative-during-primary-care-visits
- van Rijsbergen et al. 2014, Psychiatry Res 220(1-2):287-293, doi 10.1016/j.psychres.2014.06.052: https://research-portal.uu.nl/en/publications/how-do-you-feel-detection-of-recurrent-major-depressive-disorder-/
- Senova et al. 2019, Brain Stimul 12(1):119-128: https://pubmed.ncbi.nlm.nih.gov/30344109/
- Käypä hoito, Depressio (PHQ-9 for follow-up, PHQ-9 < 5 example goal, C-SSRS named): https://www.kaypahoito.fi/hoi50023
- MIELI Kriisipuhelin (09 2525 0111, Finnish, 24 h): https://mieli.fi/tukea-ja-apua/kriisipuhelin/
- 116117 Medical Helpline: https://www.116117.fi/en

Taken from the judge and reviewer, not re-verified by the arbiter:
- PHQ instruction manual (wording, licence, bands): https://www.phqscreeners.com/images/sites/g/files/g10016261/f/201412/instructions.pdf
- Löwe et al. 2004, Med Care: https://pubmed.ncbi.nlm.nih.gov/15550799/
- Wu et al. 2020, PHQ-8 vs PHQ-9: https://researchportalplus.anu.edu.au/en/publications/equivalency-of-the-diagnostic-accuracy-of-the-phq-8-and-phq-9-a-s/
- Kroenke et al. 2009, PHQ-8: https://pubmed.ncbi.nlm.nih.gov/18752852/
- Levis et al. 2020, PHQ-2, JAMA: https://eprints.whiterose.ac.uk/181473/
- Muehlhausen et al. 2015: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4597451/
- RADAR-MDD protocol: https://link.springer.com/10.1186/s12888-019-2049-z
- Miljevic et al. 2019: https://researchportalplus.anu.edu.au/en/publications/potential-predictors-of-depressive-relapse-following-repetitive-t/
- Paykel et al. 1995: https://www.cambridge.org/core/journals/psychological-medicine/article/abs/residual-symptoms-after-partial-remission-an-important-outcome-in-depression/8D31ED5E593A5B7E74E8416FB0B7DD36
- Simon et al. 2013: https://alert.psychnews.org/2013/09/depression-questionnaire-item-helps.html
- Columbia, communities and healthcare (permissions): https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/cssrs-for-communities-and-healthcare/
- Columbia, Since Last Contact (full scale): https://cssrs.columbia.edu/documents/self-report-screener-since-last-contact/since-last-visit-self-report-version-10-29-13-updated-8-12-16-for-clinical-use/
- Clario C-SSRS licensing: https://clario.com/about/legal-and-privacy/c-ssrs-licensing-application/
- Killgore 1999: https://experts.arizona.edu/en/publications/the-visual-analogue-mood-scale-can-a-single-item-scale-accurately/
- Bradley and Lang 1994 (SAM): https://scholarhub.vn/publication/Measuring-emotion-The-self-assessment-manikin-and-the-semantic-differential/5fbe0bbb-4a6b-4733-9957-e3da196aa79f
- Carruthers et al. 2010: https://pubmed.ncbi.nlm.nih.gov/20144203/
- Jones et al. 2019, EMA compliance: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6492133/
- Wrzus and Neubauer 2023: https://pesquisa.bvsalud.org/sms/resource/pt/mdl-36586594
- Torous et al. 2015: https://mental.jmir.org/2015/1/e8
- Apple Night Shift: https://support.apple.com/en-us/102191
- MDCG 2019-11: https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_qualification_classification_software_en_0.pdf
- MIELI crisis helpline overview (24/7): https://findahelpline.com/organizations/mieli-kriisipuhelin
