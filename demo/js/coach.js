// Distance coaching for the phone camera: how far the face is from the phone, from the face measures (TrueDepth,
// `distance_cm` of the "face" event, A.Sensors.faceLog), turned into one calm line when it is outside a good range.
// The clip check's camera step (clipcheck.js) is the main place; during a session a small line at the top right says
// the same (#camCoach), never over the play area, and it gives up for a minute when it was not followed.
//
// Rules kept here:
//  - The range is the reference app's: under 20 cm "further away", over 45 cm "closer" (ios/Afferent/ExpressionView.swift,
//    the `coach` line of ExpressionTracker).
//  - NEW here (the reference coached on every frame): a line shows only after the face has been out of the range for 2 s
//    without a break, and goes once the face is back inside the range by 2 cm, or when no face is tracked. A face that
//    crosses to the other side gets the other line, again after 2 s.
//  - In a session it shows for at most 8 s at a time and then rests 60 s; in the clip check it stays while it applies.
//  - Only numbers are read; nothing is recorded or sent.
// Logic (coach, distanceNow) runs without a page for the node tests (demo/tests/camera-extras.test.js).
(() => {
  const RANGE_CM = [20, 45], SHOW_S = 2, BACK_CM = 2, FRESH_S = 3;
  const SESSION = { maxShowS: 8, restS: 60 };
  const WORDS = { closer: 'Move a little closer', further: 'A little further back' };
  const side = d => d < RANGE_CM[0] ? 'further' : d > RANGE_CM[1] ? 'closer' : null;

  // The face's distance right now: the last second of the face measures, at most 3 s old, with a tracked face; else null.
  const distanceNow = now => {
    const S = A.Sensors;
    if (!S?.faceOn?.()) return null;
    const last = S.faceLog?.[S.faceLog.length - 1];
    if (!last || !last.tracked || !(now - last.at < FRESH_S)) return null;
    return Number.isFinite(last.distance_cm) && last.distance_cm > 0 ? last.distance_cm : null;
  };

  // One coach per place. step(now, distance_cm) -> 'closer' | 'further' | null, called a few times a second.
  const coach = ({ showS = SHOW_S, maxShowS = Infinity, restS = 0 } = {}) => ({
    out: null, since: null, shown: null, shownAt: null, restUntil: -Infinity,
    step(now, cm) {
      const d = Number.isFinite(cm) && cm > 0 ? cm : null;
      if (d == null) { this.out = this.since = null; this.hide(); return null; }
      const s = side(d);
      if (this.shown) {
        const back = this.shown === 'further' ? d >= RANGE_CM[0] + BACK_CM : d <= RANGE_CM[1] - BACK_CM;
        if (back || (s && s !== this.shown)) this.hide();
        else if (now - this.shownAt >= maxShowS) { this.hide(); this.restUntil = now + restS; this.out = this.since = null; return null; }
        else return this.shown;
      }
      if (s !== this.out) { this.out = s; this.since = s ? now : null; }
      if (!s || now < this.restUntil || now - this.since < showS) return null;
      this.shown = s; this.shownAt = now;
      return s;
    },
    hide() { this.shown = this.shownAt = null; },
  });

  A.Coach = { RANGE_CM, SHOW_S, BACK_CM, SESSION, WORDS, side, distanceNow, coach };

  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;

  // ── during a session: one small line at the top right, under the status bar ─────────────────────────────────────
  const live = coach(SESSION);
  let said = '';
  const tick = () => {
    const el = document.getElementById('camCoach');
    if (!el || typeof A.now !== 'function') return;
    const s = A.session, now = A.now();
    const playing = !!s && !s.done && (s.phase === 'walk' || s.phase === 'game') && !document.hidden;
    const say = live.step(now, playing ? distanceNow(now) : null), text = say ? WORDS[say] : '';
    if (text === said) return;
    said = text;
    if (text) el.textContent = text;
    el.classList.toggle('on', !!text);
  };
  setInterval(tick, 500);
})();
