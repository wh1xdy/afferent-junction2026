(() => {
  const TOTAL_S = 180, RAMP_S = 60, FROM = [3.5, 5], TO = [4, 6], REST_MS = 4000;
  const $ = id => document.getElementById(id);
  let el = null, raf = 0, t0 = 0, run = null;

  const night = () => typeof A.night === 'function' && A.night();
  const lens = s => { const k = Math.min(1, s / RAMP_S); return [FROM[0] + (TO[0] - FROM[0]) * k, FROM[1] + (TO[1] - FROM[1]) * k]; };
  const tick = () => {
    if (!run) return;
    const now = performance.now(), s = (now - t0) / 1000;
    if (s >= TOTAL_S) { finish(); return; }
    let p = run.p + (now - run.last) / 1000 / (run.inhale ? run.len[0] : run.len[1]);
    run.last = now;
    if (p >= 1) {
      p = 0; run.inhale = !run.inhale;
      if (run.inhale) run.len = lens(s);
      el.querySelector('.stay-cue').textContent = run.inhale ? 'Breathe in, gently' : 'And out, slowly';
      A.Haptics?.breath(run.inhale ? 'in' : 'out', run.inhale ? run.len[0] : run.len[1]);
    }
    run.p = p;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * p), b = run.inhale ? e : 1 - e;
    el.style.setProperty('--b', b.toFixed(4));
    el.style.setProperty('--left', (1 - s / TOTAL_S).toFixed(4));
    raf = requestAnimationFrame(tick);
  };

  const close = () => {
    cancelAnimationFrame(raf); run = null; A.Haptics?.stop();
    if (!el) return;
    el.classList.remove('on');
    const gone = el;
    setTimeout(() => gone.remove(), 600);
    el = null;
  };
  const finish = () => {
    cancelAnimationFrame(raf); run = null; A.Haptics?.stop();
    if (!el) return;
    el.classList.add('resting');
    el.querySelector('.stay-cue').textContent = 'Rest a moment.';
    el.style.setProperty('--b', '0.35');
    setTimeout(close, REST_MS);
  };

  const open = () => {
    if (el || night()) return;
    el = document.createElement('div');
    el.className = 'stay';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Stay and breathe');
    el.innerHTML = `<div class="stay-orb" aria-hidden="true"><span class="stay-ring"></span><span class="stay-core"></span></div>
      <p class="stay-cue" aria-live="polite">Breathe in, gently</p>
      <p class="stay-note">Three minutes. Stop whenever you like.</p>
      <div class="stay-actions"><button type="button" class="btn tonal state stay-done">Done</button></div>`;
    el.querySelector('.stay-done').onclick = close;
    $('phone').append(el);
    void el.offsetWidth;
    el.classList.add('on');
    t0 = performance.now();
    run = { p: 0, inhale: true, len: lens(0), last: t0 };
    A.Haptics?.breath('in', run.len[0]);
    raf = requestAnimationFrame(tick);
  };

  const mount = () => {
    const paper = document.querySelector('#end .end-paper');
    if (!paper || $('stayBtn')) return;
    const b = document.createElement('button');
    b.id = 'stayBtn'; b.type = 'button'; b.className = 'btn text state stay-btn';
    b.innerHTML = '<span class="ms" aria-hidden="true">self_improvement</span>Stay and breathe';
    b.onclick = open;
    paper.append(b);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  A.bus.on('home', close);
  A.Stay = { open, close };
})();
