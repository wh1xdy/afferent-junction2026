# Integration plan: how everything comes together

Source: round 3 of the integration debate (architect, hardware, vision, data, clinician, game, demo, red team), ruled by three judges (feasibility, judging criteria and video, safety-privacy-honesty). Majority of the judges wins; on a tie the safety judge decides. Section 9 lists what lost.

Hard rule (David): no assumptions, nothing prepared for information we do not have. Everything below is either ours to decide (with reason and ref), a fact read from code, or an exact question to the one person who knows, with what we do for each answer. No answer is picked for a teammate.

Refs: `ours:` = our main `94e65f5`. `mg:` = `minigames` `a9163ab` (worktree `../afferent-game-mg`). `im:` = `ios-merge` `7444b17` (worktree `../afferent-game-ios`). `T:` = team `junction/main` `d70eb17`. `TA:` = team branch Alex (`ab64f38`, now `cef6c9b`, which only changes `jetson/hub/grounding.py`). No prefix = our main. Input map: `design/sensing-integration.md` (its 40 questions are dispositioned in Appendix A).

State of the trees when this was written (checked, not assumed):

- `minigames` holds main plus the Ride and tasks (`a9163ab` "merge main into minigames", main...minigames = 0/4, tree clean). The merge is finished.
- `ios-merge` is clean, 18 commits behind main and 2 ahead.
- `mg:demo/js/skill.js:35-49` still reads `mood_start`, `rt.lapses` and `rt.median_ms`: a live firewall breach on minigames, not on main. `mg:demo/js/quote.js` no longer reads mood (clock pools only).
- Decision ID collision: `im:Decisions.md:49-50` uses X37/X38 (camera owner, no ScreenLight) and `mg:Decisions.md:49-55` uses X37 to X43 (task versions, haptics, arms, ...). They will conflict at the fold.
- The live worker serves `tel:0900000000` (placeholder clinic number, `demo/index.html:83`) as a dial link. `/clinic/` returns 404 there.
- The main working tree has another session's uncommitted work (`art/generate.py` modified; `art/final/`, `demo/audio/`, `demo/js/shaders/`, `demo/shaderlab.html` and `design/music.md` untracked). Nobody sweeps these into an integration commit.

## 1. End-to-end picture

```
                         one private network we control (D6), 5 GHz if a Jetson joins
  +--------------------------------------+
  | iPhone, Capacitor app (ios-merge)    |   QuickTime cable  +-----------------------+
  |  game, patient view, check-in        |------------------->| presenter Mac screen  |
  |  AfferentPulse: rPPG (PulseCamera)   |   (mirror only)    +-----------------------+
  |  VisionEyes: eyes, PERCLOS, pitch    |
  |  privacy switches (phone enforces)   |
  +------------------+-------------------+
                     | WS /ws/app + REST  (sessions, privacy, light, profile, config)
  +------------------v-------------------+        +------------------------------+
  | afferent_hub on David's Mac :8000    |------->| /clinic/ on the projector    |
  |  SQLite, analytics (baseline, z,     | REST + | list, Anna detail, What      |
  |  CUSUM, bandit), summary (Template | |/ws/clinic helps, Validation, preset |
  |  Gemma per D4), privacy enforcement  |        | relay (Day profile menu)     |
  |  BedsideSource: sim (default)        |        +------------------------------+
  +-------+------------------+-----------+
          :                  :                         ':' = no link until the answer
          : HTTP /state /led : HTTP :8090/summary
          : (Alex A2, A3)    : (Vlad V3, V6; cut for the demo)
  +-------v--------+  +------v----------------+  +------------------------------+
  | UNO Q unit     |  | Jetson presence       |  | Not linked, ever or for now: |
  | finger PPG,    |  | (Vlad)                |  | jetson/vision (YOLO, rPPG,   |
  | knob, KY-016   |  +-----------------------+  | /stream), jetson/hub, team   |
  | (Alex)         |..BLE 2A37 to the phone     | iPhone app, posture POC (R2) |
  +----------------+  only on tree branch (b)   +------------------------------+
  L0 fallback: workers.dev with game, patient view, /clinic/?fixtures (I45)
```

1. One phone app plays the two-minute game by touch and senses passively (eyes from VisionEyes, pulse from the phone camera) when the patient allows the camera.
2. Everything the phone produces goes to one place: our hub, over `/ws/app` plus REST. The phone never calls a team service.
3. The hub is the only integration point and the only enforcement point for privacy (`sharing`, switches) before anything reaches storage or the clinic.
4. The hub computes the per-person baseline, the composite, CUSUM and the bandit, and pushes task weights back to the phone in `config`.
5. The clinician view reads the hub and updates live; the same view runs offline on fixtures as the public fallback.
6. Bedside data (finger pulse, knob, light) enters only through one hub-side `BedsideSource` adapter per team service, and only after Alex answers how it is reached. Until then the hub's bedside simulator runs, labelled SIMULATED.
7. Presence (Vlad) would enter the same way, as counts only, after the demo.
8. Measurement firewall: game output reads only pulse, eyes and the clock; mood and RT go only to the record and the hub.
9. Nothing switches silently from real to simulated; every non-live value carries a SIMULATED label, and a link that has not passed two rehearsals stays simulated on stage.
10. For the demo the whole home side collapses into the iPhone plus David's Mac on our own network; every team device is optional and unlinked at the stage default (L1).

## 2. Topologies

### 2.1 Demo topology (run levels)

| Level | What runs | When used |
|---|---|---|
| L0 | workers.dev: game (touch), patient view, `/clinic/?fixtures` plus `/contracts/fixtures/` at the root. No hub, all SIMULATED | Judges browsing; last-resort stage fallback; only after the P0 hotfix (I32, I45) |
| L1 (stage default) | iPhone (ios-merge build, touch play, camera per I21) on our network, `ws://<mac>:8000/ws/app` to `afferent_hub` on David's Mac, `/clinic/` on the projector from localhost, phone mirrored by QuickTime cable, bedside simulator in the hub. No team device linked | Stage, video, backup clip |
| L1-web | Safari on the iPhone at `http://<mac>:8000/app/`. Touch play only: plain-http LAN origins are not a secure context, so no camera; eyes come from the labelled preset | If Q8 (D3) shows native `ws://` from `capacitor://` fails |
| L2 | L1 plus a team link whose owner's answer allows it and which passed two rehearsals (finger via HTTP adapter, real lamp) | Only if answers arrive in time (section 6, step 7) |

Network: which device provides it is David's fact (D6). If any Jetson joins, it must be 5 GHz (`T:jetson/presence/TESTING.md:18`). Venue Wi-Fi is not used (client isolation, `T:README.md:99`; #24).

UNO Q reach (I53): the UNO Q talks Wendy Net over Bluetooth, run by WendyOS (David; `T:README.md:3,12,74-75`). On a WendyOS Jetson our hub would join Wendy Net natively, as a mesh app that finds the UNO Q by mDNS like the team's `jetson/hub` (`TA:jetson/hub/wendy.json:6-12`; `TA:jetson/hub/app.py:43-62`); what that takes for our hub is Alex A16. On David's Mac (I1, not a WendyOS device) the team docs name three options, none documented for the UNO Q: (a) `wendy net forward <local>:<host port> --device <board>`, shown only for Jetson apps (`T:README.md:52,86`; `TA:README.md:151`); (b) the "USB via Mac" link in the diagram, no steps (`T:README.md:12`); (c) the Mac as a participant via `wendy net configure --participate=true ...`, shown only for the boards (`T:README.md:74-75`). Which one works is Alex A2. L1 uses none of them. (`TA:` lines in this paragraph and in I53 are at `4d738e8`.)

### 2.2 Product topology (after the hackathon)

| Part | Where | Status |
|---|---|---|
| Phone app | Patient's iPhone (Android later), same code as L1 | Built |
| Home hub (`afferent_hub`) | A home device on the patient's network. Which device is open: Alex A14 (could the UNO Q Linux side host it) | Not decided, no build |
| Bedside unit | UNO Q with finger PPG, knob, light, reached by the home hub through one adapter (transport per Alex A2, A13) | Blocked on Alex |
| Presence | Vlad's tracker, read by the home hub as counts only (I37 to I41) | After the demo |
| Clinic | Clinician view served from patient data the home hub shares under `sharing` (I33). The home-to-clinic transport is not designed in this plan | Not designed |
| Summary | Template, or Gemma where it runs locally (I43; where Ollama could run: Alex A14) | Template built |

## 3. Every link

Status values: works (built and tested), untested (built, never run on the real device), adapter needed (owner's answer is in, code is ours to write), blocked (waits on the named question), cut (not built for the demo).

| # | Link | Transport | Owner | Status | Fallback |
|---|---|---|---|---|---|
| K1 | Phone game to hub (sessions, privacy, light, pulse relay, config) | WS `/ws/app` + REST, our network | David (agents) | Works in headless Chrome against the Mac hub (e2e 13/13, STATUS). Native `capacitor://` to `ws://` and the iOS Local Network prompt: untested (D3) | Phone outbox replays on reconnect; L1-web; L0 plus backup clip |
| K2 | Hub to clinician view | REST + `/ws/clinic`, localhost | David (agents) | Works | `/clinic/?fixtures` |
| K3 | Phone camera to rPPG | In-process Capacitor plugin `AfferentPulse` (wh1xdy's PulseCamera, pre-merge, no ScreenLight) | David (code from wh1xdy) | Builds for the simulator; never run on a device (D3) | Simulator, labelled SIMULATED |
| K4 | Phone camera to eyes, PERCLOS, head pitch | In-process, VisionEyes (ours, 9c84517) | David (agents) | Untested on a device (D3) | K5 preset, labelled |
| K5 | Dashboard preset to phone | `POST /api/demo/profile` then WS `profile` then `setProfile` mid-session (`clinic.js:271-277`, `service.py:435-439`, `main.js:342`) | David (agents) | Works in code. Untested: whether `bad_day` moves the eyes while the real camera supplies them, and whether its fog and exposure change is acceptable on stage (rehearsal) | Video only |
| K6 | Hub summary | In-process: Template, or Gemma via Ollama | David | Template works. Gemma blocked on D4 | Template, chip "Template" |
| K7 | UNO Q to hub: finger pulse, knob, light | HTTP `/state`, `/led`, `/heartbeat`, `/presence`, `/sensor` on modulino-hub (container :8080, mesh host 18080, `T:uno-q/modulino-hub/app.py:507-531`), over Wendy Net (Bluetooth via WendyOS, I53) | Adapter builder: Vlad V5; device: Alex | Blocked on Alex A2 (how the Mac joins or forwards into Wendy Net), A3 (beep) | Hub bedside simulator, labelled |
| K8 | UNO Q to phone: finger pulse | BLE 2A37 (`[0x00, bpm]`, 1 Hz, last value kept, `T:app.py:250-262`) | Alex (device), David (bridge) | Blocked on A2 = none, A3, A8, then our side-by-side device test; needs a row reversing #24 | None (no finger on stage) |
| K9 | UNO Q USB serial (`contracts/api.md` section 4) | Serial `V/K/P/I/T` lines | Alex | Superseded for the UNO Q by Wendy Net (I53); section 4 kept for the simulator and as a fallback. No `Serial` in the sketch, MCU held by arduino-bridge | K7 |
| K10 | Hub to bedside light (KY-016) | HTTP `POST /led` with `ms=0` (500 ms default reverts to auto = off) | Alex (device), adapter per V5 | Blocked on A2, A6 | In-game dawn plus the phone `#led` panel (`main.js:300-313`); no room claim |
| K11 | Presence to hub | HTTP `:8090/summary` | Vlad (service), agents (adapter) | Cut for the demo (I41); later blocked on V3, V6 | Seeded SIMULATED history |
| K12 | Presence to UNO Q buzzes | Team `HUB_URL` | Vlad | Not ours; V4 decides the stage-quiet item | Board unpowered during our slot |
| K13 | Jetson vision to anything of ours | None, by decision (I7) | Alex/wh1xdy | No link. Side effects on stage (press arms the person alarm, turn moves YOLO confidence, `/stream`, `/rppg/frame`): A4, A5 | Nobody touches the knob; privacy line scoped (I46) |
| K14 | Posture POC to hub | WS `/ws/bedside` `pose` (`contracts/api.md` 3.3) | Romain | Blocked on R1 to R4 | Head-tilt figure labelled SIMULATED POSE |
| K15 | jetson/hub (team branch Alex) | None | Team | No link; Q-T1 decides what is shown | Only our `/clinic/` and one PHQ-9 flow on stage |
| K16 | Phone to presenter screen | QuickTime over a cable | David | To rehearse | Phone held to the camera |
| K17 | Public worker | Static hosting on workers.dev | David | Works, but ships the placeholder clinic dial link today | Previous deploy only after the P0 fix |

## 4. Decisions that are ours

Each row is ready to paste into `Decisions.md` (same columns as the v3 table). ID prefix `I` (integration) avoids both the existing X rows and the X37/X38 collision (I10). David confirms them (D10); nobody edits `Decisions.md` before that. Refs are in the Reason cell.

| # | Question | Chosen | Rejected | Reason | Overrides |
|---|---|---|---|---|---|
| I1 | Where the hub runs at the demo | `afferent_hub` on David's Mac, port 8000 | Jetson as hub host | Tested there (STATUS integration check); the Jetson CPU is shared by vision and the team LLM ("37-64 s", `TA:` README). Answers sensing-integration David Q2 for the host | none |
| I2 | Demo network | Our own private network for phone and Mac; boards optional on it; 5 GHz if a Jetson joins; which device provides it: D6 | Venue Wi-Fi; Jetson AP as primary | Client isolation (`T:README.md:99`); `T:jetson/presence/TESTING.md:18` | #24 (router kept as one option) |
| I3 | Phone on the projector | QuickTime mirror over a cable; Wi-Fi carries only WS and REST | AirPlay over the same Wi-Fi | Keeps video off the network the demo depends on | none |
| I4 | Integration point | The hub is the only integration and enforcement point; the phone never calls team HTTP services; at most one hub-side `BedsideSource` adapter per team service, written only after the owner's answer; asks to teammates are optional and no plan depends on a yes | Phone talking to UNO Q or Jetson directly; firmware feature requests before the demo | One place to enforce privacy and labels; hard rule | none |
| I5 | Real vs simulated | No silent switch; a source change is a hub restart without `--reset`; every non-live value labelled SIMULATED | Automatic fallback mid-session | Honesty; vitals-ux C4 | none |
| I6 | Run levels | L0, L1 (stage default), L1-web, L2 as in section 2.1; a link not rehearsed twice stays simulated | Everything live | Freeze rule from architect and demo | #38 (fallbacks made explicit) |
| I7 | Single sources | One rPPG source (the phone); no Jetson rPPG in the game; no HRV, RMSSD, breathing, AFF1 or emotion fields anywhere | Jetson rPPG; breathing field | `contracts/api.md:272` has no Jetson rppg source; claims policy; X2. Answers sensing-integration David Q4, Q6 | none |
| I8 | `eyes_source: "vision"` on main | Yes, added to `session.v3.schema.json` in the ios-merge fold with a contract test | Keeping main's enum | `im:contracts/session.v3.schema.json:292-299`; David Q9 | none |
| I9 | Camera owner and screen light | Stay on the pre-merge PulseCamera, no ScreenLight (confirms ios-merge X38); fix only the X37 rationale wording (ARKit can lock; the reasons are untested accuracy and the ScreenLight coupling in `T:ios/Afferent/ExpressionView.swift:75-99`) | Reopening X37 for the team ARKit path | Brightness moving 12% to 85% breaks fixed stimulus luminance (M1, M2, M5); David Q11 | ios-merge X37 wording |
| I10 | Decision ID collision | At the fold, ios-merge X37 and X38 become X44 and X45; minigames X37 to X43 keep their numbers | Renumbering minigames | `im:Decisions.md:49-50` vs `mg:Decisions.md:49-55`; minigames rows are already referenced in its code and docs | ios-merge X37, X38 IDs |
| I11 | Finger pulse source enum | `finger_ppg`, added only together with the first producer; `ky039` kept for stored rows only | `finger`, `pulsesensor`, the part name | A source class stays true for any clip; X31 needs bedside finger kept apart from camera; David Q3 | none |
| I12 | Finger pulse path | Nothing built before Alex answers. Then: (a) A2 reachable offline and A3 beep mutable: one hub HTTP `BedsideSource` (pulse, knob, light; posts `/heartbeat?on=0` and `/presence?auto=0` at session start); (b) A2 none, beep off by firmware default, A8 BLE free, our side-by-side device test passes: phone 2A37 plugin from FingerSensor, plus a new row reversing #24; (c) otherwise none. Every path: stone slot via `feedPulse` (never `setPulse`), true source label (fix the forced `ky039` and the invented `quality ?? 0.5` in `sensors.js:142`), 2A37 only, a value counts only if its notification is at most 3 s old, beep off or the finger stays out of the session. Purpose: in-session director only; the live bound patient's `morning_pulse_bpm` stays null | Phone BLE first; finger into the rPPG slot | `sensors.js:141-151`; `T:sketch.ino:51,157` (beep default on); vitals-ux M10, X31; David Q10 | #24 only if branch (b) |
| I13 | `contracts/api.md` section 4 (USB serial) | Superseded for the UNO Q by Wendy Net (I53), kept for the simulator and as a fallback; in 3.4, "level 0 to 100" is the hub-side scale and the device mapping is a relative delta (`knob.position` is an unbounded int16, `T:sketch.ino:29,172,192`) | Retiring section 4 now | Deciding for Alex otherwise; David Q1 | none |
| I14 | `pulse_stone` semantics | Off means the receiver drops the data (phone `pulse()` gate, `sensors.js:150`; hub drop with the first hub producer). Patient text "not recorded"; "off" only on an HTTP path that sends `/presence?auto=0` then `/sensor?ch=0&on=0` and `ch=1` (the presence loop re-powers within about 9 s otherwise, `T:app.py:319-356`) | `pulse_stone` drives `POST /sensor` alone | Code; David Q5 | none |
| I15 | Knob | Not used on stage. Turn sets `dawn_level` (fix #26 text to match `controller.py:197-206`, `main.js:314-319,341`). Press acts only while `bedside_camera` is true (`controller.py:189-196` flips the camera with no consent check today) | Press toggles the camera unconditionally | Consent; true for every answer | #26 text |
| I16 | Bedside light without a link | In-game dawn plus the existing phone `#led` panel; no "room wakes" claim; nothing built before Alex A6; a `/clinic/` tile "Bedside light (simulated)" only if David asks after a "no reachable lamp" answer | Second-screen lamp, phone border glow, a tile now | Hard rule; M1, M2 (no glow during measurement) | none |
| I17 | Stage sensing moment | Eyes, never pulse. Real eyes into the v1 fatigue shift only if D3 plus two rehearsals at the stage position show it; otherwise the existing dashboard Day profile relay (K5), with the presenter saying "simulated" and the toast on the projector; otherwise video only. Wording "the morning slows to the shore"; "followed her eyes" only when real; never "the island read her pulse"; no duration stated until measured | Live pulse moment; a new presenter strip | An actor cannot change pulse on cue; rPPG needs at least 8.5 s; the relay already exists (`clinic.js:271-277`) | #38 |
| I18 | Director v2 / `moments.js` | Cut for the demo | Building four Answers before the demo | Large and unbuilt; v1 already gives a real eye-driven change (`engine.js:200-207`) | none |
| I19 | Measurement freeze | No `setMode` while a measurement slot (core, Fork, Two lanterns) is active; a pending mode commits at the next break; extend `demo/tests/director.test.js`; re-time the eyes moment after it lands | Mode changes at any time | `mg:engine.js:403-411,512-514`: director runs every frame in walk and game, `style()` retargets exposure and fog, so luminance can change mid-task (M1, M2) | none |
| I20 | Simulator default | Off outside demo builds (`main.js:22` `?? true`) | On everywhere | vitals-ux C4 | none |
| I21 | Camera as default input on native | When `phone_camera` is on and permission granted, native input is "touch + camera"; play stays touch; web stays touch. Gated on D3 fps and heat; if that fails, the presenter sets the chip before each take | Default `touch`, which never starts the camera (`im:main.js:33,203-209`) | Otherwise no default session logs eyes and the stage moment has no input | none |
| I22 | Camera at the start screen | Yes, gated on D3, with all of: our reason line before the OS prompt; camera glyph whenever it runs; stop on "Not today", on leaving the start screen, in the background, and 60 s after the start screen shows with no Begin (restart on the next tap); pre-Begin numbers only warm the estimator and are discarded unless a session starts; frames stay in memory; `phone_camera` is the master | Camera from Begin only | First reading needs at least 8.5 s (`PulseCamera.swift:80-90`, `PulseEstimator.swift:35,135`), the core rest is 6 s (X4) | none |
| I23 | Background camera stop | Explicit stop on `visibilitychange` hidden, in every configuration | Relying on iOS to interrupt capture | Nothing stops it today (`im:main.js:267`, `AfferentPulse.swift:63`) | none |
| I24 | Dark face | Trust reason "face too dark" forces Drift only, never an Answer | Treating quality 0.5 as passing | `PulseEstimator.swift:124-127`; vitals-ux 42-43 edge case at exactly 0.5 | none |
| I25 | Camera switch label on native | "Phone camera (eyes, head tilt, pulse)"; web keeps "(eyes, head tilt)" | Current label | `im:index.html:109` understates; `Info.plist:35` mentions pulse | none |
| I26 | Camera relock and light | Relock only at breaks, never in the core, Fork, Two lanterns or the 3 s before them (`relockCamera()` stays unwired for the demo); `light.level` and ambient are logged only; the game never brightens screen or lamp for rPPG | Relock any time; light-driven decisions | vitals-ux 2.2 commit points; M1, M2 | none |
| I27 | Team Swift files in ios-merge | Remove Expressions, ExpressionView, CheckInView and FingerSensor from Sources (`im:project.pbxproj:24,26,27,205-208`); drop `NSBluetoothAlwaysUsageDescription`; FingerSensor and a true string come back only on I12 branch (b) | Keeping FingerSensor pending the finger ruling | An emotion classifier, a second PHQ-9 and an unused Bluetooth permission with a false purpose ("to compare it with the camera") must not ship | none |
| I28 | Local Network usage text | "Afferent talks to your Afferent hub on your home network." | "talks to your bedside unit" | The socket goes to the hub (`im:Info.plist:32`) | none |
| I29 | Measurement firewall | `skill.js` assists from `f` and pulse quality only; quotes by date only (already true on `a9163ab`); a game-side firewall test covering both files; lands before minigames is pushed or deployed | Assist from mood and RT | `mg:skill.js:35-49`; mechanics-review C2; vitals-ux C15 | none |
| I30 | Patient week lights | Lit or unlit; one warm fill `#FFD58A` for every lit day, today stays `#F2C230` | Colour by mood (`patient.js:224-226`) | Meta output reading mood shows a bad week (engagement D1, vitals-ux C20) | none |
| I31 | Low-lantern offer | Either lantern at 1, at most once a day, end screen only, an offer and never a flag; if opened, the dashboard shows `talk_request` source `mood` ("opened the support card after a low lantern") | Both lanterns at 1 (`engine.js:504`) | Implements the `design/questions.md` section 0 ruling | none |
| I32 | Crisis contacts | 112, MIELI 09 2525 0111 and Medical Helpline 116117 tap-to-call; the clinic row is plain text "Your clinic, number added by your care team" until a verified number exists, on every build and in both fixtures (`demo/index.html:83`, `checkin.js:188`, `views.py:52`, `contracts/fixtures/patient_view_anna.json`, `demo/data/patient_view_anna.json`) | "112 and MIELI only"; tappable placeholder | The placeholder may dial a real stranger; 116117 verified (`questions.md:228-235`) | none |
| I33 | Sharing pause | Hidden now (P0). Then enforced in two layers: the outbox sends no session or daily body while `sharing != summary`; the hub stores only a `declined` daily record with every sensor block null (`features.py:107` treats it neutrally). Safety answers, `crisis` and talk requests still pass (`api.md:248`, `checkin.js:321`). Acts forward only. Expiry (`nothing_tonight` to the next day boundary, `paused` 7 days) lives in the hub privacy object; if expiry does not land, `patient.js:51-52` copy is reworded to the real behaviour. Unhidden only when enforced and tested | Showing it unenforced (`service.py:402-405` only stores it; `engine.js:68,567` still send) | The patient copy promises "Nothing leaves this phone" | none |
| I34 | Privacy switches | Shown only if enforced and its source exists on stage. Demo build shows `phone_camera` (and `sharing` once I33 lands). Hidden: `presence`, `phone_motion`, `phone_presence`, `pulse_stone`, `bedside_camera`; each returns with its producer and enforcement. Defaults come only from the hub privacy object (`api.md:88`; fix `main.js:20`, `synthetic.py:20-21`). `OFF_NOTE` (`patient.js:54`) written per switch; "Nothing is collected" only where the source really stops | Making simulators respect switches to keep them visible | A shown switch that does nothing is a privacy lie | none |
| I35 | Onboarding line | "Your clinic sees your morning results and your check-in answers. Camera images never leave your phone." | "One short summary a day goes to your clinic, nothing more." (`onboard.js:71`); "Never camera images." | Scoped to the phone so it stays true whatever team devices do | none |
| I36 | Live `simulated_fields` | Drop "presence" from the live bedside-derived list | Labelling an absent value | `service.py:264` | none |
| I37 | `home_only` and `home_hours` | `home_only = away_hours < 0.5` summed over the hub day; blind time is never "home"; true only on a complete day with less than 0.5 h unaccounted, else null; `home_hours` = hub-seen time minus away; the hub buckets Vlad's intervals with its own day function and measures its own coverage. Defined now, built only with the presence adapter after the demo; Vlad confirms field meanings (V6) | Team outings of at least 15 min each; using `coverage_today` | Seeded history is on this scale (`synthetic.py:450-454`); `coverage_today` is keyed by container midnight (`T:jetson/presence/core.py`); sensing-integration David Q7, Vlad Q3, Q4 | none |
| I38 | `visitors_count` | Dwell-filtered visits overlapping the day, not devices; schema description updated now (`daily.v1.schema.json:57,62`) | Devices or `guests_now` | BLE rotation safe; Vlad Q5 (confirm V7) | none |
| I39 | `isolation_alert` | Never a flag; withdrawal reaches the clinic only as `home_only_days` in the composite and CUSUM | An isolation alert | `api.md:524`; X26 | none |
| I40 | Team data firewall | No team field enters `daily.v1`, session or analytics unless it maps onto an existing field with the same meaning; never HRV, RMSSD, stress marker, breathing, emotion composites, `isolation_alert`, jetson/hub daily metrics or UTC days | Ingesting team metrics | Claims policy; one meaning per field | none |
| I41 | Presence on stage | Adapter cut for the demo; the reader, when built, is our hub, never the phone | Phone reading `:8090` | It cannot move the composite in a 2 to 3 minute slot; needs 5 GHz shared with the Jetson; sensing-integration Vlad Q2 (our side) | none |
| I42 | Day boundary | 04:00, one function for streak, X25, sleep and presence, built after the demo; stage forces `clock=morning` (`main.js:34`) | 00:00 | Morning sessions after midnight belong to the night before; D2 covers a slot between 00:00 and 04:00 | none |
| I43 | Gemma | Chip and copy say "Template" unless Gemma actually ran (D4); Gemma logo on the end card only if it ran (`DemoScript.md:32`); drop "on the Jetson" (`DemoScript.md:9`, `STATUS.md:62`); never Qwen | Logo and claim regardless | Only the template has run here (STATUS) | #36 wording |
| I44 | Sound | Stage phone silent in every option; X28 stays closed for the demo build; the video bed is laid in the edit, its source per D7; the procedural pass only if every must and should is done | In-app music before the demo | Delight in the edit at zero build risk | none |
| I45 | Public deploy (L0) | After I32: `/` plus `/clinic/?fixtures` plus `/contracts/fixtures/` at the root (`clinic.js:13`), SIMULATED and "Research prototype, not a medical device. All patients simulated." on every page, no C-SSRS item text, fixture JSON checked for the placeholder before deploy | Deploying the dashboard as it is | Judges browse it; the number is public today | none |
| I46 | Claims sweep | Never on our screens, in the VO, slides, `Criteria.md` or the submission: HRV, stress marker, strain, screening, any emotion label, Qwen, "learns what brings her pulse down", light therapy, "validated at 1.8 BPM", "alert the care team", "notices sleep", "room wakes" (unless I16 opens), "depression shows up before patients report it". Replacements: "It learns which tasks seem to help Anna, and shows how sure it is (simulated history)"; "This morning is added to Anna's simulated history; the trend compares each patient only with their own past"; "Opening: the island wakes with you"; stick figure "drawn from head tilt"; privacy line "our app never stores or sends video" unless A5 and R3 both say no frame endpoint runs | Current `DemoScript.md:28-32,49` and `Criteria.md:13,23,33,34,41` | Claims policy: supportive, early warning, suggests, the clinician decides | #41 extended |
| I47 | Safety path on stage | 3:00 slot: Talk card live; 2:00 slot: in the video, stage shows the seeded `safety_moderate` banner. Always: no C-SSRS item text on a projector, no presenter taps a contact (D5) | Live crisis flow regardless of slot | Slot length is D1 | none |
| I48 | What we present | Only our `/clinic/` and our one PHQ-9 flow on stage and in the video until Q-T1 is answered; no bridge to jetson/hub; nothing from team surfaces recorded | Showing two clinician views | One product story; `TA:jetson/hub/report.py:76` ("screening"), `grounding.py:43-45` (item 9 to the LLM) conflict with our safety rules | none |
| I49 | Flags acknowledge and export | After the demo; nobody presses Clear on stage while it hard-deletes (`db.py:121-122`); a must before real use | Building now | All stage data is simulated | none |
| I50 | Contract text fixes | `api.md:400` drop the session fallback for morning pulse; `api.md:411` and X17: CUSUM k 0.35 and the raised MAD floors (`STATUS.md:68,128`); `daily.v1` "visits" wording | Leaving stale text for judges | Judges who read contracts reward honesty | X17 text |
| I51 | Integration order | P0 hotfix on main first (I32, I33 hide, I35). Then, once D8 says the other sessions are idle, one integration on `minigames`: main merged in, I29, the ios-merge fold (I8, I10, I23 to I28), game and hub fixes; hub tests, e2e 13/13 and the game A10 gate; one push with David's go, main briefly frozen | Several pushes; touching a tree another session works in | Memory rule: one update per batch; main moved during the debate | none |
| I52 | Web fallback | L1-web as in 2.1, labelled; no camera claim | Pretending the web build senses on stage | Secure-context rule for the camera | none |
| I53 | UNO Q transport | Wendy Net over Bluetooth, run by WendyOS on the UNO Q; section 4 superseded for the UNO Q, kept for the simulator and as a fallback; on a WendyOS Jetson our hub joins Wendy Net natively; Mac path is A2, hub participation is A16; no code change | USB serial lines as the UNO Q contract | David's fact (2026-11-14); `T:README.md:3,12,74-75,85-86`; `TA:jetson/hub/app.py:3,43-62` | #24 (UNO Q part), I13 |

## 5. Questions per teammate (paste one block per person)

Each block is one chat message. Every item is answerable in one line. The table under it says what we do for each answer.

### 5.1 David

```
Integration questions for you (one line each is enough):
D1. Stage slot length, feature freeze time F, video deadline, submission deadline?
D2. Local time of our stage slot?
D3. Device run on the demo iPhone (which model?), ios-merge build, input "touch + camera", at the demo lamp level and at stage light: (a) Local Network prompt shown and accepted? (b) does ws://<mac>:8000 connect from the app? (c) debug panel trust score and light.level? (d) PERCLOS with eyes drooping 5 s and 10 s, and seconds until the mode shifts? (e) does pitch rise when you look up? (f) fps and heat after 3 min with the world renderer?
D4. Does Gemma run via Ollama on your Mac (model pulled, RAM), and what do the side-challenge rules require?
D5. In our WKWebView, does tapping a tel: link show the system confirmation before dialling?
D6. Which device provides our network: travel router, a second phone's hotspot, or the demo iPhone?
D7. Do you have a paid Suno plan?
D8. Are the other sessions idle: the one that merged main into minigames, and the one with uncommitted art/, demo/audio/, shaders and the untracked design/music.md on main?
D9. Which command and which tree deploy the workers.dev worker, and do I have your go to push and redeploy the P0 hotfix (clinic row, sharing hide, onboarding line)?
D10. Do you confirm the I-rows in design/integration-plan.md section 4, or which ones do you overrule?
```

| Q | Answer | What we do |
|---|---|---|
| D1 | 3:00 | DemoScript section 2 with the I46 fixes, Talk card live (I47) |
| D1 | 2:00 | Short chip (`main.js:39,66,98`), timed run; if the eyes shift cannot land in a walk inside the run, the stage shows the Opening and dawn and the shift goes to the video; seeded safety banner |
| D1 | F given | Section 6 gets clock times; until then everything is relative to F |
| D2 | 06:00 to 21:00 | `clock=morning` on the stage URL |
| D2 | 00:00 to 04:00 | I42 exception: stage forces the morning clock and the boundary text is checked |
| D3 a/b | Pass | L1 is the stage default |
| D3 a/b | Fail | L1-web for the stage (touch, preset eyes, labelled); outbox replay check; backup clip |
| D3 c | Trust at least 30, light ok | rPPG stays the secondary source for the director |
| D3 c | Lower | Pulse shows "needs light"; no live pulse claim anywhere |
| D3 d | Shift twice | Two stage-position rehearsals, then real eyes (I17) |
| D3 d | No shift | K5 preset relay, labelled; else video only |
| D3 e | Pitch falls | Flip the sign in `pitchDegrees` |
| D3 f | fps or heat bad | I21 falls back to the presenter chip; I22 stays off |
| D4 | Runs | Gemma chip and logo allowed |
| D4 | Does not | Template everywhere, logo off |
| D5 | No confirmation | Stage build shows contacts without tap targets |
| D6 | Any device | That device's IPs go into the stage checklist; if a Jetson joins, 5 GHz |
| D7 | Yes | Suno bed for the video after the demo build is frozen |
| D7 | No | A licence-free bed in the edit |
| D8 | Idle | Start section 6 step 1 |
| D8 | Not idle | Wait; only P0 (own files only) and docs proceed |
| D9 | Go | Commit P0 alone (other sessions' files untouched), push, redeploy |
| D9 | Not yet | Current deploy stays; it is the only public place with the placeholder |
| D10 | Confirmed | Agents add the rows to `Decisions.md` in the integration branch |

### 5.2 Alex

```
Hi Alex, a few one-line questions so we only build what matches your hardware:
A1. Are you wh1xdy, the author of uno-q/, jetson/vision/, jetson/hub/, ios/ and hardware/? If not, who is?
A2. The UNO Q talks Wendy Net over Bluetooth (David). From David's MacBook (not a WendyOS device) on our own hotspot, what exact command makes GET /state and POST /led on the UNO Q answer: wendy net forward <local>:18080 --device <uno-q>, your "USB via Mac" relay (which steps?), the Mac joining with wendy net configure --participate=true, or direct host:18080? Which port, 8080 or 18080? Does it need internet or an org invite?
A3. Can the demo build boot with heartbeat_sound off (and without the 1760 Hz startup beep and 1200 Hz press click)? If not, may our hub POST /heartbeat?on=0?
A4. During our slot, does jetson/vision run and reach the UNO Q (a press arms the person alarm, a turn moves the YOLO confidence)? Can it be off for our slot?
A5. During our slot, can any device other than the Jetson reach jetson/vision /stream or /rppg/frame?
A6. Is the KY-016 on D9-D11 the only bedside light? Lying in bed, does it visibly light the room at 60%? What /led call rate is safe through the bridge?
A7. When finger.bpm is non-null but finger.quality < 0.3, do you trust that bpm?
A8. At the demo, does the team iPhone app hold the "Afferent Finger" BLE connection, and can a second central connect?
A9. Is an IR bed-presence sensor planned, yes or no?
A10. Is jetson/hub at the demo? Does its POST /phq9 take any entry other than ?demo=1, and does its report (with the "screening" footer) appear in any slide or the submission text?
A11. Do you play the patient on stage (Decisions #39)?
A12. (low) How many knob.position counts make one full turn?
```

Follow-up, only if A2 = no path and A3 = beep can be off: "When can the UNO Q sit next to the demo iPhone for one 2A37 test with the front camera running?"
Post-demo: "Could the UNO Q Linux side host our hub, and could Ollama run on the demo Jetson?" (A14); "Did you compare FacePulse with PulseCamera on the same face and light, and what was the error?" (A15); "What must our hub do to be a Wendy Net participant on the Jetson: is a mesh `wendy.json` plus an mDNS browse for role=modulino-hub, as in your jetson/hub, enough?" (A16).

| Q | Answer | What we do |
|---|---|---|
| A1 | No | All of A2 to A15 go to wh1xdy |
| A2 | Works offline | I12 branch (a) becomes possible: one HTTP `BedsideSource` (builder per V5), two rehearsals before it goes on stage |
| A2 | Only with internet or invite | Rehearse it; simulator stays the stage default |
| A2 | No path | No knob or lamp link; finger only via I12 branch (b) or none |
| A3 | Boots silent | Finger allowed on either path |
| A3 | Only our POST | Finger only on branch (a) |
| A3 | Neither | No finger pulse on stage |
| A4 | Not running or off | Nothing to do |
| A4 | Running | Nobody touches the knob; the unit stays out of the stage loop |
| A5 | No | Pitch line "no video leaves the room" may stay (if R3 also no) |
| A5 | Yes | Line becomes "our app never stores or sends video"; bedside "Never images" text not shown near it |
| A6 | KY-016 only, not visible | No room claim; at most a dark-room close-up in the video |
| A6 | Visible and A2 path | Real lamp as a hero beat after two rehearsals; fades stepped at his rate, `ms=0` |
| A6 | No reachable lamp | In-game dawn; tile only if David asks (I16) |
| A7 | Yes | HTTP adapter uses `bpm != null` |
| A7 | No | HTTP adapter adds the 0.3 gate |
| A8 | Only one central | Branch (b) needs the team app closed during our slot, or is dropped |
| A9 | No | `in_bed` gate leaves the idle schedule (`controller.py:285-298`) or the schedule goes off (David picks); no "notices sleep" |
| A9 | Yes | Ask for its interface first, build nothing before |
| A10 | No to both | Separate prototype, nothing to do |
| A10 | Yes | Team ruling on one PHQ-9 flow and one claims list before any recording (T1) |
| A11 | No | Whoever plays the patient gets the two eye rehearsals |
| A12 | Any number | Sets the relative-delta step only |
| A13 | Dropped: answered by David (I53) | Section 4 superseded for the UNO Q, kept for the simulator and as a fallback |

### 5.3 Vlad

```
Hi Vlad, one-line questions about presence and the outer loop:
V1. Are you lusca-vlad-30322, the author of jetson/presence?
V2. STATUS gives you baseline, trend and clinician view. Our hub has them (hub/afferent_hub/analytics, web/clinic). Is our /clinic/ the view you present (and do you stand at the hub as DemoScript section 2 says), or another one such as jetson/hub /report/clinician?
V3. At the demo, are the presence Jetson, the demo iPhone and David's Mac on one hotspot or router? Which band, 5 GHz or 2.4 GHz?
V4. At the demo, is HUB_URL set to the UNO Q, do left_home, returned_home and isolation buzz it, and can they be off for our slot?
V5. modulino-hub is wh1xdy's code but STATUS gives you knob, LED and Wi-Fi/BLE: who answers the knob and LED questions and builds our hub-side adapter once Alex answers: you, Alex, or our agents?
V6. Does state "unknown" mean neither home nor away, and is every blind period served as a closed interval in recent_network_outages?
V7. We count visits (recent_visits) as visitors_count, not devices. Is that the number you stand behind? Are nearby_devices addr and maker stored on /data, and for how long?
V8. On stage and in the video, does presence run real or with SIM=1?
V9. How do we clear today's outings and visits before going on stage?
V10. Is isolation_alert meant to reach the clinic as an alert?
```

Follow-up, only if V3 = shared network before integration ends: "Please send one real /summary JSON captured on the Jetson"; "Whose MAC is in PHONE_MACS on stage, and is its Private Wi-Fi Address set to Fixed?"; "Which PROFILE, do you POST /calibrate at the venue, and does guests_now stay at 0 in the hall?"; "Is the Jetson clock NTP-synced, and do you want a POST /activity from our hub on session_start?"
Post-demo: "Can tracking be paused on request?"

| Q | Answer | What we do |
|---|---|---|
| V1 | No | Find the author, resend |
| V2 | Ours | Vlad reviews `Statistics.md` and `Validation.md`; `/clinic/` freezes at F |
| V2 | Another view | T1 decides one view; no bridge before that |
| V3 | Shared, 5 GHz, before integration ends | I41 may reopen as a labelled live readout only, never the composite |
| V3 | No or later | Presence stays SIMULATED history only |
| V4 | Off | Nothing to do |
| V4 | On | Board stays unpowered during our slot, or the script explains the beep |
| V5 | Any name | That person or agent builds K7 after A2; we do not assign his work |
| V6 | Yes | I37 as written |
| V6 | No | `home_hours` stays null until he names the field |
| V7 | Visits yes; addr stored | Presence text says phones are seen by address on the unit |
| V7 | Not stored | Text says "counted, not stored"; our hub takes counts only either way |
| V8 | Either | Anything shown carries the label from `summary.sim` |
| V9 | A way exists | Goes into the reset checklist next to `POST /api/demo/reset` |
| V9 | None | No test outings after a cut-off time |
| V10 | No | As planned (I39) |
| V10 | Yes | Conflicts with `api.md:524`; team ruling, our proposal stays I39 |

### 5.4 Romain

```
Hi Romain, quick ones about the demo:
R1. The phone pulse is now wh1xdy's PulseCamera and the eyes are our VisionEyes. Is your demo part the posture POC only?
R2. Does the POC run during our slot? If yes, on which machine and camera device, and can it stay off port 8000?
R3. If it runs: can HSEmotion and /stream.mjpg be off, with no face embeddings stored?
R4. If it runs: will it send pose JSON to our /ws/bedside (contracts/api.md section 3.3)?
R5. Do you run the dashboard click path on stage (DemoScript section 2)?
```

| Q | Answer | What we do |
|---|---|---|
| R1 | POC only | STATUS:29 is corrected; every phone vision check is David's D3 |
| R2 | Not running | SIMULATED POSE head-tilt figure, line says "drawn from head tilt" |
| R2 | Same Mac, cannot move | Our hub runs `--port 8100`, address re-entered on the phone |
| R2 | On the Jetson `/dev/video0` | Clashes with jetson/vision cam1 (`T:jetson/vision/rppg.py:426-443`): only one runs, A4 decides |
| R3 | Emotion, video or embeddings on | Separate showcase with its own label, never next to our consent texts |
| R4 | Yes | He sends our JSON (`api.md:338`); `bedside_camera` stays false by default and its switch returns with that producer |
| R4 | No | Nothing to build |
| R5 | No | David drives both screens |

### 5.5 Team chat (all four)

```
T1. Which clinician view and which PHQ-9 flow go on the projector and into the video: our /clinic/ on hub :8000, or jetson/hub /report/clinician (branch Alex)? Will the team iPhone app (Expressions, HRV, its PHQ-9) or /ask appear in the demo, the video or the submission text?
```

| Answer | What we do |
|---|---|
| Ours only | Pitch as planned (I48) |
| Theirs or both | Before any recording, the four agree one view and one claims list; until then nothing from team surfaces is recorded |

## 6. Build order until the demo

Owners: "agents" = David's coding agents (software that needs no unanswered question); teammates own their hardware. Every push and every deploy needs David's go (D9). Times are relative to F until D1 is answered.

| Step | When | What | Owner | Depends on |
|---|---|---|---|---|
| 0a | Now | Send 5.1 to 5.5 | David | none |
| 0b | Now | P0 hotfix on main, committed alone: clinic row non-tappable everywhere (I32), sharing pause options hidden (I33), onboarding line (I35); then push and redeploy | agents, David's go | D9 |
| 0c | Now, parallel | D3 device run on `../afferent-game-ios` (no code change needed) | David | none |
| 0d | Now | Docs on main: I13 (api.md 4 and 3.4), I50, I38 schema descriptions | agents | none |
| 1 | After D8 = idle | One integration on `minigames`: merge main (with 0b, 0d); I29 firewall fix and test; ios-merge fold with I8, I10, I23, I24, I25, I26, I27, I28; I19 freeze plus test; I20; I30; I31; I15 press gate; I33 enforcement (both layers, expiry); I34 switches, defaults, `OFF_NOTE`; I36; the I-rows into `Decisions.md` after D10 | agents | D8, D10 |
| 2 | End of step 1 | Gates: hub pytest, e2e 13/13 (`hub/tests/e2e_live_demo.js`), contract tests, game A10 gate, one device build; one push with main briefly frozen | agents, David (device build, go) | step 1 |
| 3 | After D3 | I21 default and I22 start-screen camera with every stop rule; second device build | agents, David | D3 pass |
| 4 | Before any recording | `DemoScript.md` and `Criteria.md` rewrite per I43, I46, I47, I17 wording, slot per D1 | agents draft, David owns | D1, D4 |
| 5 | After step 2 | Redeploy L0 per I45 (fixture JSON grep for the placeholder first) | agents, David's go | step 2 |
| 6 | Before F | Two eyes rehearsals at stage position (decide I17); if they fail, one K5 preset rehearsal | David, the patient actor (A11) | D3, step 3 |
| F | Feature freeze | After F: bug fixes and copy only | all | D1 |
| 7 | Only if answers arrive in time | K7 HTTP adapter (I12 a, with the `feedPulse` source and quality fix and `morning_pulse_bpm` null rule); real lamp K10 (A2 plus A6). Each needs two rehearsals or it stays simulated | builder per V5; Alex (board on site, beep default, lamp placement) | A2, A3, A6, A7, V5 |
| 8 | After F | Record the L1 run as backup clip; shoot the video (touch only, SIMULATED outside the phone frame for any non-live value); three stage rehearsals, each with reset and an early hub start | David | steps 4 to 6 |

Teammate hardware work (theirs, not assigned by us): Alex brings the board per A2 to A6 and keeps it quiet or unpowered per A3, A4; Vlad keeps presence buzzes off per V4 and clears state per V9.

Explicitly not built before the demo: director v2 / `moments.js` (I18); the presence adapter and the `phone_presence` hub gate (I41); any finger path before Alex answers (I12), and the BLE plugin unless branch (b) opens; any lamp stand-in, second screen, border glow or `/clinic/` light tile (I16); a new presenter strip (K5 exists); in-app music, the procedural sound pass and Suno layering (I44); flags acknowledge and export (I49); day-close job, `day_complete`, the 04:00 boundary (I42); `questions.md` 10.3 daily fields; display state = max(composite, PHQ); live `bedside_light`; `room.*` units; relock wiring (I26); posture integration (R4); the harm item (pilot only); reminders, notifications, frost, Heartline wording, first-light pre-ramp, knob meanings on stage; any bridge to jetson/hub or the team app (I48).

## 7. Demo run sheet

### 7.1 Before every take or stage run

1. Hub started at least 15 s early on the Mac; `POST /api/demo/reset` before every take (it does not reset team data; moot at L1).
2. Phone: ios-merge build, Local Network prompt already accepted, sound off, stage URL with `clock=morning` (D2), Short chip if the slot is 2:00.
3. QuickTime mirror over the cable; `/clinic/` on the projector from localhost.
4. Stage quiet, one item per service: UNO Q beep (A3), jetson/vision knob mappings and person alarm (A4), presence buzzes (V4). If any cannot be silenced, the board stays unpowered.
5. Nobody touches the knob; nobody taps a contact; nobody presses Clear on flags.
6. Presence state cleared per V9 if presence runs at all.
7. Chip says "Template" unless Gemma ran (D4).

### 7.2 Moments

| Moment | Live or simulated | Label | Fallback |
|---|---|---|---|
| Hook | Live (presenter) | none | none |
| Begin, kindle, mood lantern, 5 taps | Live touch play and real RT and self-report | Pulse readout SIMULATED (no live pulse claim) | L1-web; L0 |
| "Playing now" on `/clinic/` | Live (K1, K2) | none | Outbox replay on reconnect; L1-web; backup clip |
| Eyes droop, "the morning slows to the shore" | Live only per I17 (D3 plus two rehearsals) | Real: "followed her eyes". Preset: presenter says "simulated", toast visible | K5 Day profile preset; else video only |
| Fork and Two lanterns | Live touch, measurement freeze active (I19) | none | none |
| Dawn | Live on the phone | Room only if A2 plus A6 plus two rehearsals | Phone dawn, no room claim |
| Row flash, toast, index update | Live computation on Anna's simulated days 0-55 plus today | "simulated" said once | `/clinic/?fixtures` |
| Anna detail, baseline band, "Consider discussing a booster", drivers | Simulated history, live analytics | SIMULATED | Fixtures |
| What helps Anna, Validation (13 days) | Simulated | SIMULATED, "not clinically validated" | Fixtures |
| Safety | 3:00: Talk card live, no taps. 2:00: seeded banner | No C-SSRS item text | Banner |
| Privacy line | Spoken | Scoped per A5 and R3 (I46) | Narrowest wording |
| Tagline | Live | none | none |

Video (2:00): DemoScript section 1 with I46 fixes; 0:30-0:50 pulse only as presets with SIMULATED outside the frame; 1:02-1:12 real lamp only per A6, else phone dawn; 1:12-1:22 unit shown as hardware, card SIMULATED, no "notices sleep"; 1:42-1:52 "shows what seems to help, and how sure it is"; 1:52-2:00 logos only for what ran plus the research-prototype line; every take played by touch.

Always simulated and labelled: Anna's days 0-55, the roster, presence, sleep, steps, the head-tilt figure, the stage pulse, the validation cohort, the bedside unit card.

## 8. Top risks

| # | Risk | Mitigation |
|---|---|---|
| 1 | Native `ws://` from `capacitor://` and the Local Network prompt have never run; without them no live dashboard moment | D3 first (step 0c); L1-web; outbox; backup clip |
| 2 | Placeholder clinic number is a public dial link today | P0 (step 0b) with David's go; I32 on every build and fixture |
| 3 | Privacy promises with no enforcement (sharing pause, switches, `OFF_NOTE`, onboarding line) | P0 hide plus I33 to I35 in step 1 |
| 4 | Firewall breach (`mg:skill.js`) reaches main or the worker | I29 lands before any push of minigames; test covers skill.js and quote.js |
| 5 | Two parallel team products (two clinician views, two PHQ-9 flows, HRV, "screening", emotion) drift into our claims | T1 today; I48; I40; claims sweep I46 |
| 6 | Eyes in stage light do not shift the mode inside the slot, more so after the measurement freeze | Timed rehearsals after I19 (step 6); K5 preset; video only |
| 7 | The integrated build (minigames plus ios-merge fold) is fresh and untested on device | Gates in step 2; keep the previous worker deploy (with P0) as fallback; only fixes after F |
| 8 | Stage hazards: board beep, person alarm, presence buzzes, leftover day-56 session, night clock, validation warm-up, team state our reset does not clear | Checklist 7.1; A3, A4, V4, V9, D2 |
| 9 | Claims outrun hardware (KY-016 vs "room wakes", "never video" next to `/stream`, Gemma logo with template only) | I16, I43, I46 gated on A5, A6, R3, D4 |
| 10 | Another session's uncommitted files on main or a still-active session in a worktree get swept into an integration commit | D8 before step 1; P0 commits name files explicitly |

## 9. Dissent (what lost and why)

| Position | Who | Ruling | Why it lost |
|---|---|---|---|
| Cut the phone BLE branch for the demo outright | Feasibility judge | Kept as I12 branch (b), lowest priority | Judging and safety judges kept the answer-driven tree; branch (b) only opens on Alex's answers and two rehearsals anyway |
| Defer the start-screen camera until after the demo | Feasibility judge | I22 built, gated on D3 | Judging and safety judges accepted it with all stop conditions; it removes a chip flip and gives every session eyes |
| Defer "simulator off outside demo builds" | Feasibility judge | I20 built | Judging and safety judges upheld it (vitals-ux C4) |
| Sharing enforcement only a "should", expiry post-demo | Feasibility judge | I33 enforcement is a must, expiry included | Judging and safety made enforcement a must; expiry split 1-1-1, tie broken by the safety judge, with the judging judge's copy fallback |
| Show `pulse_stone` ("not recorded") and `bedside_camera` | Judging judge | Hidden (I34) | Feasibility and safety: no source on stage, so a shown switch would control nothing |
| Build a presenter strip when the eyes rehearsal fails | Judging judge, demo, game | Existing Day profile relay (K5) | Feasibility verified the relay already works end to end (`clinic.js:271-277`, `service.py:439`); safety only required a labelled preset |
| Keep FingerSensor and the Bluetooth key pending the finger ruling | Vision, hardware | Removed (I27) | All three judges: unused permission with a false purpose, and keeping it is preparing for an answer we lack |
| Crisis card "112 and MIELI only" | Demo H8, architect H6 | 112, MIELI, 116117 (I32) | 116117 is verified (`questions.md:228-235`); clinician F1 |
| Onboarding "Never camera images." | Game | Clinician wording (I35) | Could become false if team frame endpoints run; the phone-scoped line stays true |
| Onboarding line ships only with sharing enforcement | Clinician, game | Ships in P0 with the sharing hide | Safety judge: the line is true either way; the pause copy is the coupled item |
| Procedural sound pass before the demo | Game (G5 b) | X28 closed for the demo (I44) | Feasibility and judging: zero score gain on a silent stage, the edit carries delight |
| Dashboard lamp tile as the "no lamp" stand-in | Demo (accepted it), game (withdrew) | Optional, only after A6, only if David asks (I16) | Hard rule; judging judge put it last; feasibility said not unless asked |
| Hub write-time gate so `phone_presence` can stay visible | Data (round 2) | Hidden until the presence adapter (I34, I41) | No producer at the demo; conceded by data |
| Pulse enum `finger` / `pulsesensor` / part name | Architect (round 2), hardware, red team, clinician (round 1) | `finger_ppg` (I11) | Majority of roles; a source class stays true for any clip |
| "Fatigue shift lands only at phase boundaries" | Demo P4 | Mid-task switching is real, hence I19 | Code: director runs every frame in walk and game (`mg:engine.js:512-514`) |
| "Minigames is mid-merge" | Architect X10, red team F1, game, clinician | Merge finished (`a9163ab`, clean) | Checked in the tree; D8 still gates touching it |
| "quote.js breach is live on minigames" | Red team F2, feasibility judge | Moot on `a9163ab`; the test still covers it | The merged quote.js picks by clock only |
| Second-screen lamp stand-in; phone BLE first | Architect (rounds 1 and 2) | Withdrawn by the architect | Hedges on unanswered questions; reverses #24 without a row |
| Reopen X37 for the ARKit path | Vision (round 1) | Wording fix only (I9) | Brings ScreenLight back (`T:ExpressionView.swift:85-86`) |
| Game's Vlad question "where does the hub run?" | Game | Dropped | The hub is ours (I1); safety judge's no-assumptions check |

## Appendix A. Disposition of the 40 questions in `design/sensing-integration.md` section 9

| Question | Disposition |
|---|---|
| David 1 (api.md section 4) | Decided: I13, superseded for the UNO Q by I53 |
| David 2 (where the hub runs) | Decided: I1; Mac's reach into Wendy Net is Alex A2 |
| David 3 (finger source value) | Decided: I11 |
| David 4 (breathing field) | Decided: no (I7) |
| David 5 (`pulse_stone` powers sensors off) | Decided: I14 |
| David 6 (Jetson rPPG in the game) | Decided: no (I7) |
| David 7 ("went out" definition) | Decided: I37 |
| David 8 (ios-merge on the demo iPhone) | Question D3 |
| David 9 (`eyes_source: "vision"`) | Decided: yes (I8) |
| David 10 (finger over BLE or hub) | Decided as a tree (I12); facts from Alex A2, A3, A8 |
| David 11 (pre-merge PulseCamera) | Decided: yes (I9) |
| Romain 1 (rPPG ownership) | Answered by git log (all rPPG code is wh1xdy's); scope confirm R1 |
| Romain 2 (pose to `/ws/bedside`) | Question R4 |
| Romain 3 (port 8000) | Question R2 |
| Romain 4 (POC runs at the demo) | Question R2 |
| Alex 1 (identity) | Question A1 |
| Alex 2 (serial lines) | Answered by David: Wendy Net over Bluetooth (I53) |
| Alex 3 (reach :18080 from a non-Wendy laptop) | Question A2 |
| Alex 4 (8080 or 18080) | Merged into A2 |
| Alex 5 (USB serial while arduino-bridge holds the MCU) | Answered by code (no `Serial` in the sketch); relay option inside A2 |
| Alex 6 (`knob.position` range) | Answered by code (unbounded int16); step via A12 |
| Alex 7 (press between polls) | Post-demo (knob not used on stage, I15) |
| Alex 8 (`finger.quality` meaning) | Question A7 |
| Alex 9 (contact field) | Answered by code: none; `presence.mode` "active" is the boot state (`T:app.py:273,319-320`), so contact is null on the HTTP path |
| Alex 10 (`climate.humidity`) | Post-demo (no feature reads `room.*`) |
| Alex 11 (KY-016 colours, level, fade) | Question A6; firmware facts known: PWM scaling, no fade, `ms=0` (K10) |
| Alex 12 (other readers of `/rppg`) | Moot (I7) |
| Alex 13 (Jetson rPPG under warm light) | Moot (I7) |
| Alex 14 (Jetson camera off on request) | Moot at L1 (no Jetson link, `bedside_camera` hidden); post-demo |
| Alex 15 (IR bed sensor) | Question A9 |
| Alex 16 (camera device numbers) | Only relevant via R2 (POC on the Jetson) |
| Alex 17 (vision and presence on one Jetson) | Covered by A4 for our slot; otherwise post-demo |
| Vlad 1 (identity) | Question V1 |
| Vlad 2 (who reads `:8090/summary`, same Wi-Fi) | Decided: our hub, after the demo (I41); network V3 |
| Vlad 3 (container timezone) | Moot: the hub buckets with its own day (I37) |
| Vlad 4 (`home_hours` with unknown or outage) | Decided: I37; semantics V6 |
| Vlad 5 (`visitors_count`) | Decided: I38; confirm V7 |
| Vlad 6 (`POST /activity`) | Follow-up, only if V3 = shared network |
| Vlad 7 (real `PHONE_MACS`, `PROFILE`) | Follow-up, only if V3 = shared network |
| Vlad 8 (`HUB_URL`, buzzes) | Question V4 |
