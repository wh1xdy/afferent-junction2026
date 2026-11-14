# Afferent

Home maintenance companion after TMS for depression (Junction 2026, Aalto "Beyond the Clinic").
A two-minute wordless morning game that measures and adapts to the body, a bedside unit and phone that observe everyday life, and local analytics with a clinician dashboard.
Supportive, not a treatment. All patient data in the demo is SIMULATED.

Live demo: https://afferent-demo.david-noel-vinu.workers.dev

## Run

```
./start.sh --reset
```

Needs Python 3. Creates `hub/.venv` on first run and prints the LAN addresses for the phone.

- Clinic dashboard: http://localhost:8000/clinic/
- Game: http://localhost:8000/app/?input=auto&clock=morning
- Patient view: http://localhost:8000/app/patient.html?patient=anna

`./start.sh --help` lists the options. Reset the demo data with `curl -X POST localhost:8000/api/demo/reset`.

Tests:

```
cd hub && .venv/bin/python -m pytest -q
cd hub && .venv/bin/python -m afferent_hub.analytics.validate
```

## iPhone app

```
npm install
npm run sync
npm run open
```

In Xcode select the iPhone, set the signing team, Run. In the app, Settings > Hub address: the LAN address from `./start.sh`, same Wi-Fi as the hub.

## Android app

```
npm install
npm run build:android
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run open:android` opens the project in Android Studio instead.

## Layout

- `demo/` the game and patient view (Capacitor web root)
- `hub/` FastAPI hub: API, analytics, clinic dashboard, bedside link
- `contracts/` JSON schemas and fixtures shared by game and hub
- `design/` tokens, fonts and the final concept art
- `art/` image and music generation plans and `generate.py`
- `ios/`, `android/` Capacitor native projects
