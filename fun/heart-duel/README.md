# Heart Duel
- Two-player party game for the demo table: each player wears one fingertip clip of the "Afferent Finger" sensor, two hearts beat at their real pulse, and three modes (keys 1 SYNC, 2 CALM, 3 POKER FACE) make a game of it.
- Build and start on the Mac, in a normal terminal (it needs Bluetooth): `./build.sh && ./heart-duel`, then open http://localhost:8765 (tests: `node --test`).
- `./heart-duel --demo` needs no Bluetooth: two simulated players, and the page shows a SIMULATED badge.
- It is a party game, not a medical measurement: a number is only shown while heartbeats confirm it, otherwise the page says "put the clip on" or greys the last value out.
- Two people on one sensor box: player 1 puts the clip on first (finger 1 switches the sensors on). With the newer UNO Q firmware a clip that comes off drops out within 4 s and nothing from a duel is stored as patient data; with the older firmware the page falls back to its own "is this number still confirmed" check.
