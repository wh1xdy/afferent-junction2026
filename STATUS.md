# Afferent: what exists

As of Saturday 14 November, evening. Everything below is on `main` unless it says otherwise. Point your agents at this file and at `uno-q/SENSORS.md`.

## The phone app (`demo/`, Capacitor; iOS and Android)

**Session flow**
- Hold to kindle → 6 s rest moment ("Rest a moment with the lantern") → start mood check-in → the Fork → games → dawn → end sheet. The rest moment gives the resting eye, blink and pulse baselines; the check-in gives the start mood that goes into the doctor's handover. Please keep both, and talk to Alex before changing how a session starts (#40).
- The first adaptive game always comes, and waiting at the "tap to continue" dots doesn't eat the play time (#60).
- Greetings and the check-in question follow the real time of day (morning, afternoon, evening, night) (#60).
- Instructions stay until the first touch, and the dots between games say "Tap the light to go on" (#60).
- Tap hints are a soft touch dot on the thing to touch (#43, #67). There's no headphones splash anymore (#50).
- Cold start: a soft loading screen, the launch navy with an ember breathing where the fire will be. It shows only while the art, the fonts and the first world frame load, with no minimum time, then crossfades into the world; it never stays past 8 s (`demo/js/loader.js`). Please don't add a wait in front of the app.

**Responds to the body (finger clips or camera pulse)**
- The fire beats in a lub-dub to the real pulse. The connect moment (stronger first beats, a warm ring) plays when a pulse appears, also mid-session. With no reading the fire only breathes (#51).
- Calm biofeedback: the aurora and glow grow as breathing nears 6 a minute and HRV rises against the session's own start value (#51).
- Games by state, against the person's own values (#55):
  - Stressed (pulse up, HRV down or breathing faster): calm breathing games.
  - Energised (pulse up, HRV steady, calm breathing): puzzles.
  - Tired by day: gentle wake-up games. Tired at night: wind-down.
- Live vitals overlay (on by default, switch in Settings): pulse, HRV, breathing, the state and why ("Pulse up, HRV down → calmer breathing game"), plus the calm response, music and room rows (#55).
- Music follows the heart: generated in D, starts at the real pulse and glides at most 1 bpm per 12 s towards calm; it takes the bed's place and never plays on simulated data (#53).
- Haptics: one vocabulary across every game (touch, tick, hit, bright, miss, land, rise, success, complete, rhythm, breath, drag, heart) through `demo/js/haptics.js`, on top of Core Haptics on iOS and a matching Android plugin. Calm and night are softer. There's a Vibration switch, plus a separate Heartbeat touch switch (#58, #51).

**Sensors and checks**
- Clip check before a session: "put a finger in each clip", a live OK, and the camera pulse as fallback (#46).
- Room temperature and humidity come from the box through the home hub. "Your signals" shows them, and on a warm night there's one gentle line before the wind-down (#59).
- Heart Duel (Settings → Together): two people, one clip each, whoever calms down first wins. Nothing is saved or sent (#49, haptics #74).
- Simulated sensors are off by default on phones and on in the browser demo (#67).

**Menus**
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
- **Reaching the hub from a phone right now**: the Mac bridges it.
  1. `wendy net forward 18000:18000 --device <jetson>`.
  2. `socat TCP-LISTEN:8000,bind=<Mac Wi-Fi IP>,fork,reuseaddr TCP:127.0.0.1:18000`.
  3. `jetson/home_hub/pair.sh <Mac Wi-Fi IP>` gives the address for the app's Settings → Hub address. It must end in `/k/<token>`.

  The phone and the Mac must be on the same Wi-Fi.

## In progress
- **QR → encrypted dashboard link.** "Show to my doctor" will show a link, not the numbers. The phone encrypts the dashboard and uploads only ciphertext to a small share endpoint on the voice relay; the key stays after `#`, and links expire after 7 days. David needs to deploy that endpoint on Cloud Run; until then the phone falls back to the hub's dashboard (same Wi-Fi only).
- **Settings as categories** with sub-pages, a Paste button and a "Key missing" status for the hub address.

## Rules our code follows (please keep them)
- Nothing is sent or streamed live to a doctor. The patient hands data over when they choose to.
- Face images and meshes never leave the phone; only numbers do.
- A finger reading counts for 3 s. Quality below 0.3, or no quality, is not a measurement. Missing stays missing, never 0.
- Simulated data is never shown or stored as real, and a session never mixes simulated and real pulse.
- Commits and pull requests carry no AI credit: no AI author, no `Co-Authored-By`/`Claude-Session` lines, no "Generated with" or session links. The `No AI credit` check fails a PR that has them; fix your own branch, never rewrite main.
- Hardware that exists: two finger clips, a thermometer, a buzzer, an LED, a knob, a Jetson with one camera. There is no bed sensor.
