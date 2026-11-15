# Show to my doctor: the handover

Nothing goes to a clinician by itself. The patient chooses to show a code, and the code is a link to
their dashboard, not the numbers themselves.

## The link

- The phone builds the same dashboard as the Share tab (`demo/js/qrexport.js`, `demo/js/dashboard_gen.js`)
  and locks it on the phone (`demo/js/handover.js`): AES-GCM under a fresh random 256-bit key. Only the
  locked bytes go to the voice relay (`POST /share`, with the relay's access code). The code holds
  `https://<relay>/d/<id>#<key>`. A browser never sends what follows `#`, so the relay never sees the key or
  anything it could read.
- The doctor's browser opens the viewer at `/d/<id>` (`voice-relay/viewer.html`), fetches the locked bytes,
  unlocks them there and shows the dashboard in a sandboxed frame (scripts only, no same origin, no other
  sites). A wrong or cut key, an ended link and a link taken back each get a plain message.
- A link lasts 7 days. The patient can take it back from the code view or from Settings (Share with your
  clinic), with the revoke token the relay gave at upload; the key itself is never stored.
- No relay set up or reachable: the paired home hub publishes the dashboard (`/api/export/publish`) and the
  code holds its `/shared/<id>` address, labelled "On this network only". It opens without the hub token,
  for 7 days or until the next publish, sandboxed in its own origin; the pairing token is never in the
  link. A hub from before this answers only `/api/export/dashboard`, which needs the token. With neither,
  the sheet offers Save file and the Share sheet.
- The relay address and code are the voice companion's (`demo/js/voice-config.js` from
  `npm run voiceconfig`, or typed on the phone). The relay keeps shares in memory, so it is deployed with
  exactly one instance ([`voice-relay/README.md`](../voice-relay/README.md)).
- The phone no longer makes the signed data code. `demo/js/qrpayload.js` stays: it draws the QR matrix,
  caches the summary, and the clinic still imports signed codes made earlier (printed ones are valid 30
  days). The clinic's Scan offers to open a dashboard link instead.
- "Print or save as PDF" prints the link code and when it ends; the weekly numbers are on the dashboard,
  not on paper.
- Tests: `node demo/tests/handover.test.js`, `node demo/tests/qrshow.test.js`,
  `cd voice-relay && pytest test_main.py`.

## Sensor numbers in the handover

No sensor number is sent or streamed to the clinic page. Its socket only says which stored document
changed (`session_added` and `checkin_added`: ids, day, status; `analytics_updated`: the list row without its flags).
"Talk to someone" and check-in safety answers stay on the patient's hub: no clinic socket hears of them, and they
reach a clinician only in the handover (the dashboard's Safety & contact card). On the home hub the real
patient is left out of the clinic view entirely (`hub/afferent_hub/home.py`): the clinic sees that patient
only through the code the patient shows.

That is about the clinic page, not the hub's network. The demo hub from `./start.sh` has no login; the
home hub on the Jetson needs its pairing token on every route except `/api/health`
([home-hub.md](home-hub.md)).

The dashboard behind "Show to my doctor" shows three weekly numbers from the finger clips for its 8
weeks: pulse (bpm), breathing rate (per minute) and HRV as RMSSD (ms). The signed code format
(`demo/js/qrpayload.js`), which the clinic still imports for codes made earlier, carries the same three.

- Built in `hub/afferent_hub/qr.py` (`vitals_block`) from the `vitals` blocks of the stored sessions: per
  day the last played session, per week the median, as for the other measures. The pulse is the session
  mean of the fused finger pulse, with the clips on during play. It is not `morning_pulse`, which is the
  bedside morning reading of `daily.v1` and has no real source today.
- The recorder (`demo/js/record.js`) keeps a finger reading only when its reported quality is 0.3 or more;
  a weaker stretch is a gap. A session counts only when its finger block reports quality, that quality
  never fell below 0.3, and it has at least 10 s of readings; the clinic's Signals section applies the
  same rule to a stored session. A week without such a session has no value (never 0). Simulated sessions
  are used only when there is no measured one, and the number is then marked simulated.
- In the signed code they are map key 18, and the version stays 1. A code made before this still decodes
  (no key 18: "carries no finger sensor numbers"). New numbers go into a new key, never into `FEATURES`,
  whose fixed lengths older readers check. Map key 19 is retired (it held the bedroom at night for a day);
  index drivers added after the first nine are map key 20 (`QR.ADDED`, below).
- Size: at their largest the three rows add about 135 characters; the worst case (with expressiveness, map key
  20) is one code of about 1085 of 1134 characters, version 22 (`node demo/tests/qrpayload.test.js` prints the numbers). Per-finger pulse
  is not in the code; it is in the session documents and the export file.
- The room climate is a card on the same dashboard, not in the code ([app.md](app.md#room-climate)).

## Expressiveness in the index

The early-warning index is the weighted mean of ten drivers, each a robust z-score against the patient's own
first two weeks after TMS (`hub/afferent_hub/analytics/features.py`, `FEATURES`): reaction time and mood
(weight 1.5), sleep regularity, missed sessions and effort (1.0), morning pulse and home-only days (0.75), upright
time, reward bias and expressiveness (0.5, exploratory). Expressiveness comes from the face numbers of play
(`vitals.face`, the phone's TrueDepth camera, [app.md](app.md#face-measures-from-the-phone-camera)) and says what
the face did, never how the person feels.

- Per day, from that day's last played session with face numbers (30 tracked seconds or more): the mean of the
  smile share and the facial movement, each divided by the patient's own level. The own level is the median over
  the index's baseline window (days 0 to 13, longer until 7 values), at least 0.02 for the smile share and 0.005
  for the movement, and needs 3 values. 1.0 is as in the first weeks; 0.8 is a fifth less.
- Then as for the other drivers: robust z against its own baseline (scale at least 0.1), lower is worse, EWMA,
  clipped at 3, weight 0.5 of 9.
- No face numbers (no TrueDepth camera, Phone camera off, under 30 s tracked) is no value, never a low one: it
  adds nothing to the index, and until the patient's first face value it does not count against completeness
  either. After that, days without it are missing data, as for any driver.
- The doctor gets that weekly number: on the dashboard (Weekly trend, What moved the signal, its share of days),
  and in the signed code as map key 20 (contribution, usual level and scale, share of days, 8 weekly medians,
  about 30 characters). A code from before decodes without it. The hub's own analytics and its export file
  (`features.csv`) carry the daily value like every driver's; the face block itself stays on the hub.
- In the synthetic validation (`python -m afferent_hub.analytics.validate`) it leaves the false check-ins as they
  were and moves the median from onset to a check-in suggestion from 13 to 13.5 days: with the simulated decline
  (about a fifth at full severity) it is not an earlier signal, only one more driver the clinic can see.
