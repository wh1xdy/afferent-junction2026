# Afferent Live

A public, read-only page that shows the real Afferent demo system running right now: the finger clips and
the UNO Q sensor box, the bedroom climate, the bedside light the phone sets during a session, and the home hub
on the Jetson. Made for Junction 2026 judges ("a link where your project can be experienced live").

Three parts:

- **`server.py`** runs on the Mac at the demo table (Python 3 stdlib only; it can move to the Jetson later). It
  polls the box and the hub through the Wendy Net forwards and keeps one sanitized snapshot.
- **The page** (`index.html`, `live.css`, `live.js`, `whatif.js`) is published on GitHub Pages and reads that
  snapshot. It also has **What would it do?**: sliders for pulse, HRV, breathing and smiling that run the game's own
  decision code (`demo/js/engine.js`, loaded unchanged) and show the state, the reasons line, the games it would
  draw from, the bedside light and the music, in the app's own words.
- **Play it here** (`play/` on Pages) is the real game (`demo/`). `play/live-bridge.js`, added only to the published
  copy, feeds the table's pulse into the game while someone at the table wears the clips, with a banner saying
  whose pulse it is. Otherwise the game runs on its own simulator, labelled SIMULATED as always.

## Run it

```sh
python3 live/server.py                      # http://127.0.0.1:8787/
python3 -m unittest live/test_server.py -v  # the tests
```

| env | default | |
|---|---|---|
| `BIND` | `127.0.0.1` | address to listen on |
| `PORT` | `8787` | port |
| `AFFERENT_BOX_URL` | `http://127.0.0.1:18081` | the UNO Q box (`/state`), forwarded over the mesh |
| `AFFERENT_HUB_URL` | `http://127.0.0.1:18000` | the home hub on the Jetson, forwarded over the mesh |
| `AFFERENT_HUB_TOKEN_FILE` | `~/.afferent/home-hub.token` | the hub token, read for each hub request |
| `SSE_MAX` | `150` | most `/stream` listeners at once (a quick tunnel carries 200 requests in flight) |

Polling: box every 1 s, hub bedside every 2 s, the demo patient's view every 30 s (the full record only when that
view shows a new session), 3 s timeouts. A source that has not answered for 10 s shows offline.

Routes, GET only: `/` the page, `/live.json` the snapshot (no-store, `Access-Control-Allow-Origin: *`), `/stream`
Server-Sent Events (`snapshot` once a second, `beat` as soon as a new heartbeat is seen), `/health`,
`/endpoint.json`, and the static files listed in `STATIC` in `server.py`. Everything else is 404 (405 for other
methods). No request path is ever mapped to a file by itself.

## What leaves the table

Only the snapshot, and only these facts: box online and its sensors on or off; room °C (one decimal) and humidity
(integer) from the box's thermometer; each clip on or off and its pulse; the fused pulse, its quality and when the
last beat was; HRV and breathing while a pulse is live; which Modulinos are attached; hub online; the bedside light's
colour, level and reason (and the game mode the colour stands for); in bed if known; whether a session runs and its
mode; the number of mornings the demo patient has recorded and when the last one started; the server time.

Never: ids, names, tokens, hub or box addresses, raw sensor arrays, free text from the hub. The hub token goes only
to the hub, as a `Bearer` header (never in a URL, never logged; redirects are refused so it cannot follow one).
Visitors never reach the box or the hub: every visitor request is answered from the cached facts.

The box's own rules decide what counts as a pulse (`uno-q/modulino-hub/app.py`): a number only while the sensors
are on and warmed up, the clip locked onto a rhythm within the last 3 s, trusted, and with quality at least 0.3
(the clip's own or the fused one, as `on_beat` does). The fused pulse is the box's guarded `finger.bpm`, with the
same quality rule, one person on the clips, and a locked clip behind it. A bedside run by the hub's simulator shows
no light, and a simulated patient or session counts no mornings.

**Session and mode** are read from the bedside light, because only a running session sets it: reason `mode` with
one of the game's mode colours (`engine.js` MODES, read from that file at start), or `dawn` at the end of a session.
A session ends early in the snapshot when the hub records a new session. At night flow and wake share one colour, so
night wake shows as flow; a session with the bedside light switched off in privacy settings does not show.

**Heartbeats**: the box's newest locked beat per clip (`fingers[c].t`) is a new beat when it is newer than the one
seen before (both clips on one hand within 0.25 s are one beat). `beat.t` is rewritten every second, so it is not
used. The box is read once a second, so at most one beat a second is seen; between them the page keeps the live
rate and every seen beat sets the phase right again.

## Publishing (GitHub Pages + a Cloudflare quick tunnel)

The page lives on GitHub Pages; the data comes from `server.py` on the Mac through a quick tunnel in front of port
8787 only. `endpoint.json` next to the page says where the tunnel is.

```sh
live/publish.sh                 # build the Pages tree into $TMPDIR/afferent-pages and stop there
live/publish.sh --publish       # build and force-update the gh-pages branch (switches Pages on with gh if needed)
caffeinate -dimsu live/tunnel.sh --publish   # server + tunnel; pushes endpoint.json each time the address changes
```

- `publish.sh` copies only git-tracked files: the live page at the root, `demo/` as `play/` (without its tests),
  the design files `npm run design` would copy into `play/design/`, and `play/js/live-bridge.js`, loaded just
  before `main.js`. `demo/js/voice-config.js` is never copied (Talk stays off). It refuses to build if a server
  file or the hub token ends up in the tree. Without `--publish` nothing leaves the Mac.
- `tunnel.sh` starts `server.py` if nothing answers on the port, runs `cloudflared tunnel --url
  http://127.0.0.1:8787`, waits for the address, and with `--publish` commits only `endpoint.json`
  ("live: tunnel address") to gh-pages. Without `--publish` it prints what it would write. When cloudflared ends it
  starts a new tunnel (a new address) and publishes that.
- `endpoint.json` looks like `{"live":"https://<words>.trycloudflare.com","sse":false,"updated_iso":"…"}`.
  Quick tunnels buffer Server-Sent Events, so `"sse": false` makes the page poll `/live.json` (every 2 s, every
  second while a pulse is live) instead; served by `server.py` directly, `/endpoint.json` says the same origin and
  the page uses `/stream`. When the data stops for 10 s the page reads `endpoint.json` again.

**The Mac must stay awake** for the page to be live: `tunnel.sh` holds a `caffeinate` assertion while it runs; keep
the Mac on power, lid open (or an external display), and Wi-Fi on the mesh. Battery saver or sleep ends the tunnel;
the page then shows "The demo table is offline right now. Last seen …".

## Files

| | |
|---|---|
| `server.py` | the poller, the snapshot and the HTTP server |
| `test_server.py` | sanitizing, the pulse rules, beats, session from the light, routes, SSE |
| `index.html`, `live.css`, `live.js` | the page |
| `whatif.js` | What would it do?: loads `play/js/*` (the app's scripts) and runs a staged session's `assess()` |
| `play/live-bridge.js` | the table's pulse into the published game, with its banner |
| `publish.sh`, `tunnel.sh` | GitHub Pages build and the tunnel |
| `fonts/` | Jost and Google Sans Flex from `design/fonts` (SIL OFL, licences beside them) |
