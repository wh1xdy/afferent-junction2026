# Afferent: what exists

As of Sunday 15 November. Everything below is on `main` unless it says otherwise. Point your agents at this file and at `uno-q/SENSORS.md`.

## The phone app (`demo/`, Capacitor; iOS and Android)

**Session flow**
- Hold to kindle → 6 s rest moment ("Rest a moment with the lantern") → start mood check-in → the Fork → games → dawn → end sheet. The rest moment gives the resting eye, blink and pulse baselines; the check-in gives the start mood that goes into the doctor's handover. Please keep both, and talk to Alex before changing how a session starts (#40).
- The first adaptive game always comes, and waiting at the "tap to continue" dots doesn't eat the play time (#60).
- Greetings and the check-in question follow the real time of day (morning, afternoon, evening, night) (#60).
- Instructions stay until the first touch, and the dots between games say "Tap the light to go on" (#60).
- Tap hints are a soft touch dot on the thing to touch (#43, #67). There's no headphones splash anymore (#50).
- Cold start: a soft loading screen, the launch navy with an ember breathing where the fire will be. It shows only while the art, the fonts and the first world frame load, with no minimum time, then crossfades into the world; it never stays past 8 s (`demo/js/loader.js`, #87). Please don't add a wait in front of the app.

**Responds to the body (finger clips or camera pulse)**
- The fire beats in a lub-dub to the real pulse. The connect moment (stronger first beats, a warm ring) plays when a pulse appears, also mid-session. With no reading the fire only breathes (#51).
- Calm biofeedback: the aurora and glow grow as breathing nears 6 a minute and HRV rises against the session's own start value (#51).
- Games by state, against the person's own values (#55):
  - Stressed (pulse up, HRV down or breathing faster): calm breathing games.
  - Energised (pulse up, HRV steady, calm breathing): puzzles.
  - Tired by day: gentle wake-up games. Tired at night: wind-down.
- Live vitals overlay (on by default, switch in Settings): pulse, HRV, breathing, the state and why ("Pulse up, HRV down → calmer breathing game"), plus the calm response, music and room rows (#55).
- Music follows the heart: generated in D, starts at the real pulse and glides at most 1 bpm per 12 s towards calm; it takes the bed's place and never plays on simulated data (#53).
- Haptics: one vocabulary across every game (touch, tick, hit, bright, miss, land, rise, success, complete, rhythm, breath, drag, heart) through `demo/js/haptics.js`, on top of Core Haptics on iOS and a matching Android plugin. Calm and night are softer (#58, #51).
- The whole app is haptic: every control answers a tap with one touch or tick, and a swipe ticks once where it closes (`demo/js/gui/feel.js`, #89).
- Settings: a Vibration switch, and Heartbeat touch with four levels, Off, Soft, Medium and Strong, felt on the start screen and in calm moments (#80); every level is stronger since #88.

**Sensors and checks**
- Clip check before a session: "put a finger in each clip", a live OK, and the camera pulse as fallback (#46).
- Room temperature and humidity come from the box through the home hub. "Your signals" shows them, and on a warm night there's one gentle line before the wind-down (#59).
- Heart Duel (Settings → Sessions → Together): two people, one clip each, whoever calms down first wins. Nothing is saved or sent (#49, haptics #74).
- Simulated sensors are off by default on phones and on in the browser demo (#67).

**Menus**
- Settings is a short list of categories, each opening its own page; the hub address has a Paste button and a "Key missing" status (#76).
- "Show to my doctor" shows a link, not the numbers: the phone encrypts the dashboard and uploads only ciphertext to the voice relay; the key stays after `#`, and links end after 7 days or when the patient takes them back (#82). Without a relay that has the current `voice-relay` (one instance), the phone falls back to the hub's dashboard (same Wi-Fi only).
- iOS keyboard: no zoom into a field, no accessory bar; Return and a tap outside close it (#84).
- Sheets close on a swipe down and slide out when closed; pages go back from the left edge (#66, #71).
- Layout keeps clear of the Dynamic Island: use `--af-top`, `--af-ceiling` and `--af-bottom` for anything new (#54). Portrait only (#74).

## The sensor box (UNO Q, `uno-q/modulino-hub`)
- Two finger clips → one fused pulse, pulse per finger, breathing (from heart rhythm), HRV (RMSSD), quality, presence; plus the Modulino Thermo (room), a buzzer and an LED. The knob may be unplugged inside the new case.
- Bluetooth "Afferent Finger": `180D/2A37` is the fused pulse. `AFF0/AFF1` is 7 bytes (v3); byte 6 holds flags: bit 0 = two people, bits 1/2 = finger 1/2 left out. Details in `uno-q/SENSORS.md`.
- The phone also finds the box through Wendy Net's own advertisement, so it no longer hangs at "scanning" when a mesh peer sits on ours (#63).
- A settling or doubled pulse is held until it's steady for 6 s (#62).
- A noisy clip next to a clean one is left out, so one bad clip can't sink the quality. A "finger" must show a pulse-like swing, so light leaking into the case no longer counts as a finger (#75).
- Pushes quality-gated readings to the data manager. Deploy with `DATA_MANAGER_URL` and `DATA_MANAGER_TOKEN` passed at deploy time (Alex has the token).

## The Jetson
- **Data manager** (Wameuh's), mesh port 8100, token required. Please don't deploy a second copy.
- **Home hub** `afferent-home-hub` (`jetson/home_hub`, deploy with `deploy.sh`): sessions, analytics, the week view, the shared dashboard (with "Bedroom at night", #59), the real UNO Q as bedside. Every route except `/api/health` needs the hub token (`~/.afferent/home-hub.token` on Alex's Mac; never in the repo). It keeps Talk transcripts on `/data` (#73).
- **Reaching the hub from a phone**: straight to the Jetson once the LAN door runs (branch `hub-direct`, not deployed yet). The hub stays on the mesh; the door (`jetson/home_hub/door`, app `afferent-home-hub-door`, host networking) relays the Jetson's own Wi-Fi port 8800 to it and announces `_afferent-hub._tcp` with Bonjour. The token is still checked by the hub on every route but `/api/health`; the door holds none.
  1. The Jetson on the phone's Wi-Fi (it is on `Junction2026` now, at 10.0.32.31).
  2. `WENDY_DEVICE=<jetson> jetson/home_hub/deploy.sh`, then `WENDY_DEVICE=<jetson> jetson/home_hub/door/deploy.sh`.
  3. In the app: Settings → Home hub → Find on this Wi-Fi (keeps the key it has; iPhone build with `AfferentHubFinder`), or Paste the address from `jetson/home_hub/pair.sh --jetson`. Then Connect.

  Venue Wi-Fi like `Junction2026` drops Bonjour between devices, so Find may show nothing there: Paste works. The Mac bridge (`wendy net forward` + `socat` + `pair.sh <Mac IP>`) still works as before. Steps and fallbacks: `docs/home-hub.md`, "Reaching the hub".

## In progress
- **Finger clips that forgive pressure** (#91): a pressed, partly clipping sensor still gives a pulse, and the first pulse comes after about 6 s instead of 11.

## Rules our code follows (please keep them)
- Nothing is sent or streamed live to a doctor. The patient hands data over when they choose to. That includes "Talk to someone" and check-in safety answers: the hub keeps them for the handover and sends nothing to a clinic socket, and no screen says the clinic has been told.
- Face images and meshes never leave the phone; only numbers do.
- A finger reading counts for 3 s. Quality below 0.3, or no quality, is not a measurement. Missing stays missing, never 0.
- Simulated data is never shown or stored as real, and a session never mixes simulated and real pulse.
- Commits and pull requests carry no AI credit: no AI author, no `Co-Authored-By`/`Claude-Session` lines, no "Generated with" or session links. The `No AI credit` check fails a PR that has them (#90); fix your own branch, never rewrite main.
- Hardware that exists: two finger clips, a thermometer, a buzzer, an LED, a knob, a Jetson with one camera. There is no bed sensor.
