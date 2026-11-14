# Bug burn-down: games and media (demo/js game side)

Branch `burndown/games`. Tests: `node demo/tests/games.test.js` (new: tasks driven frame by frame as engine.js runs
them) and `node demo/tests/music.test.js`.

| # | Bug | File | Severity | Status |
|---|-----|------|----------|--------|
| 1 | Vihta: a late first tap is cut at `g.max`, taps per second divided by the full 10 s | tasks/vihta.js | Medium | Fixed |
| 2 | Owls, Runes, Faces, Swans, Signpost: `g.max` below the trials' own time limits, so a slow but valid player loses the last trials | tasks/{owls,runes,faces,swans,signpost}.js | Medium | Fixed |
| 3 | Generated (bio) music crashes for good if its first beat is skipped onto a non-bar beat | biomusic.js | Medium | Fixed |

## 1. Vihta cut short after a late first tap — Medium — Fixed
- **Reproduce:** first tap at 9 s, then a tap every 0.25 s: the session closes the task at `g.max` = 17 s (7 s of
  tapping), `completed` false, and `taps_per_s` = taps / 10 under-reports by 30 %.
- **Root cause:** the run is timed from the first tap (`t0`), but `g.max` is fixed at RUN + WAIT + 1 from the task start;
  nothing stops a first tap after the 6 s wait.
- **Fix:** on the first tap `max` becomes at least `this.t + RUN + 1`.
- **Verification:** `node demo/tests/games.test.js` → "vihta: a first tap after the wait..." ok (failed before: `'max' !== 'done'`, 32 taps).

## 2. Trial tasks capped below their own response limits — Medium — Fixed
- **Reproduce:** a player who answers every trial inside the limit but slowly (owls 3.2 s of 5, runes 3.8 s of 5,
  faces 1.8 s of 2, swans/signpost 2.0 s of 2.2) is closed at `g.max` with 5/6, 7/8, 9/12, 9/12, 9/12 trials;
  the slowest trials (the fatigue signal) are dropped and the task is recorded `completed: false`.
- **Root cause:** `g.max` was budgeted with a typical answer time (2.2 s, 3 s, 0.9 s, 1.1 s) instead of the trial's LIMIT.
- **Fix:** budget `n * (… + LIMIT + ITI) + slack`. `g.max` is only the safety close in engine.js (these tasks have no bar).
- **Verification:** `node demo/tests/games.test.js` → the five "a player who answers every trial ... plays every trial" tests ok (all failed before).

## 3. Bio music stuck after a skipped first beat — Medium — Fixed
- **Reproduce:** `BioSynth.create(ctx, { at: 1, bpm: 60 })`, `step(1.45)` (a 0.45 s stalled tick), `step(2)` →
  `TypeError: Cannot read properties of null (reading 'pulse')`. It throws on every later tick, and inside
  `Music.follow`, so the rest of `Music.tick` (flush, sway, levels) stops for the session.
- **Root cause:** voice and chord are set only on a bar beat (`k % 4 === 0`); the skip-ahead in `step()` can land the first
  scheduled beat on beat 1–3, where `S.v`/`S.chord` are still null.
- **Fix:** the bar-beat branch also runs while no chord is set yet.
- **Verification:** `node demo/tests/music.test.js` → 37 ok including "generated music whose first beat is already past...".

## Final run
`for f in demo/tests/*.test.js; do node $f >/dev/null 2>&1 || echo FAIL $f; done` → no failures.

## Reviewed, found clean (or only Low)
- Asset manifest: all 80 entries exist with their extension (webp/png); every art name used in tasks/world is listed.
  Audio manifests (ambience, music) all point at existing .m4a files.
- rt.js, kit.js, skill.js (tiers ≤ 3 everywhere, third/boss logic), engine core RT (onset, false starts, event timestamps),
  measures.js fork/lanterns, minigames.js pickGame, juice.js (reset between tasks), audio.js, music.js lifecycle,
  ambience.js voice/drop, duel.js / duel-core.js, heartduel-game.js (pinned copy of fun/heart-duel), haptics.js timers,
  fxgl.js, layers.js, guide.js, ba.js, quote.js.
- Smoke run of every task in demo/js/tasks with its bot, 3 seeds, k 0 and 1, with and without Skill: no throws, no NaN in
  `extra`; all finish except Bells, which can reach its 22 s cap after replays (a game, by design).

## Suspicions not proven / Low, left
- Fork: a round with no choice (timeout, path `none`) is recorded `completed: true`, so the task can read completed. The
  hub's synthetic data uses the same convention, so I left it.
- Lanterns and Fork take RT/decision time from the frame clock (`tr.t`), not the tap's event time: up to one frame early.
- Skill.checkAssist drops the last history RT even when this session's core was not credited.
- Shutters finale schedules a 420 ms `setTimeout` particle burst that can land after the task closes (cosmetic).
