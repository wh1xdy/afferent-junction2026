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
changed (`session_added`: ids, day, status; `analytics_updated`: the list row). On the home hub the real
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
  whose fixed lengths older readers check.
- Size: at their largest the three rows add about 135 characters; the worst case is one code of about 1055
  of 1134 characters, version 22 (`node demo/tests/qrpayload.test.js` prints the numbers). Per-finger pulse
  is not in the code; it is in the session documents and the export file.
- The room climate is a card on the same dashboard, not in the code ([app.md](app.md#room-climate)).
