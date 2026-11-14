(() => {
  const { ema } = A;
  const Au = A.Audio;

  A.definePresenter('reaction', {
    stimulus: 'flare/0',
    leadIn: 0,
    outro: 0,
    tapTime: d => d.t,
    update(s, now, dt) {
      const c = s.core, t = now - s.phaseAt;
      s.V.tapHint = t < 3 && !c.trials.length ? 1 : ema(s.V.tapHint, 0, dt, 0.3);
    },
    onset(s, tr, now) { s.V.flash = A.config.reducedMotion ? 0.35 : 1; s.kick(0.9); Au.piano(7, 0.16); },
    early(s, tr, now) {},
    resolve(s, trial, now) { if (trial.outcome === 'hit') { s.kick(0.5); s.V.sparkle = 0.6; } },
    done(s, now) {},
    draw(ctx, s, now) {},
  });
})();
