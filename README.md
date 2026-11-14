# Afferent

Home maintenance companion after TMS for depression (Junction 2026, Aalto "Beyond the Clinic"). Three dimensions in one closed loop: a two-minute wordless game that measures and adapts to the body, a bedside unit and phone that observe everyday life, and local analytics with a clinician dashboard ("who might need a call"). Supportive, not a treatment. All patient data in the demo is SIMULATED.

## Start the hub (one command)

```
./start.sh --reset
```

Needs Python 3 (the script creates `hub/.venv` and installs `hub/requirements.txt` on first run). It prints the URLs, including the LAN addresses for the phone.

| URL | What |
|---|---|
| `http://localhost:8000/clinic/` | Clinician dashboard (list, patient detail, validation tab) |
| `http://localhost:8000/app/?input=auto&clock=morning` | Game, autoplay story (no input needed) |
| `http://localhost:8000/app/?input=touch` | Game, played by touch |
| `http://localhost:8000/app/patient.html?patient=anna` | Patient view ("your week", privacy switches) |

Options: `--no-sim` (no bedside simulator), `--serial /dev/tty.usbmodemXXXX` (real Arduino UNO Q), `--ws` (bedside unit over Wi-Fi), `--sim-pulse` (simulated pulse stone during sessions), `--port 8000`.

Game query options: `patient=anna|juha|mikko|leena|sofia|eero`, `input=auto|touch|camera`, `clock=morning|night`, `profile=live|good_day|bad_day`, `stage=1` (60 s stage mode), `dev=1` (show the demo chips on the start screen on a phone).

## Reset the demo

Every played session is stored (Anna gets a real day-56 session). Reset right before going on stage:

```
curl -X POST localhost:8000/api/demo/reset
```

or `./start.sh --reset`, or the dashboard Demo menu > Reset.

## Put the app on the demo iPhone

1. `npm install` (once), then `npm run sync` (copies `design/` into `demo/` and runs `npx cap sync ios`).
2. `npm run open` (opens `ios/App/App.xcodeproj` in Xcode). Select the iPhone, set your signing team, Run.
3. On the phone: Settings icon (sliders) > Hub address: type the hub's LAN address from the `./start.sh` output, for example `192.168.1.20:8000`, and tap Connect. The address is saved on the phone. "Hub: connected" confirms it; the dashboard row then shows "Playing now" during a session.
4. Phone and hub must be on the same Wi-Fi. Allow "Local Network" when iOS asks.

Without the native app, open `http://<hub-ip>:8000/app/` in Safari on the phone (touch and simulated sensors work; the camera needs the native app or `localhost`).

In the native app the input, clock, session length and profile chips are in the Settings card (under the sensor switches).

## Tests

```
cd hub && .venv/bin/python -m pytest -q
NODE_PATH=<dir with node_modules/playwright-core> node hub/tests/e2e_live_demo.js   # with the hub running
cd hub && .venv/bin/python -m afferent_hub.analytics.validate                       # regenerates Validation.md
```

## Documents

`STATUS.md` (what works, what is simulated, handover per person), `Criteria.md` (judging criteria mapping), `DemoScript.md` (video and stage), `Statistics.md` (every metric and its evidence level), `Validation.md` (synthetic validation), `Decisions.md`, `GameDesign.md`, `DesignSystem.md`, `contracts/` (API and schemas).
