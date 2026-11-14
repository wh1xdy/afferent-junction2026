(() => {
  const $ = id => document.getElementById(id);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const CUE = 'wake up and pick up my phone';
  const fmt = k => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d); return `${DAYS[t.getDay()]} ${d} ${MONTHS[m - 1]}`; };
  const sw = id => `<span class="switch"><input type="checkbox" role="switch" id="${id}"><span class="track"></span><span class="thumb"><span class="ms">check</span></span></span>`;
  const toggle = (id, text, icon) => `<label class="li state"><span class="ms" aria-hidden="true">${icon}</span><span class="txt"><span class="hl">${text}</span></span>${sw(id)}</label>`;

  const settings = () => {
    const box = document.querySelector('#morningsGroup .group');
    if (!box) return;
    box.innerHTML = `
        ${toggle('countSw', 'Show the morning count', 'wb_twilight')}
        ${toggle('lineSw', 'Show a line after the session', 'edit_note')}
        ${toggle('remindSw', 'Morning reminder', 'alarm')}
        <label class="li state" id="wakeRow"><span class="ms" aria-hidden="true">schedule</span><span class="txt"><span class="hl">Usual wake time</span></span><input type="time" id="wakeIn" class="time-val" step="900"></label>
        <button type="button" class="li state" id="pauseRow" aria-expanded="false" aria-controls="pauseMenu"><span class="ms" aria-hidden="true">pause</span><span class="txt"><span class="hl">Pause</span></span><span class="val" id="pauseVal"></span><span class="ms trail" aria-hidden="true">expand_more</span></button>
        <div id="pauseMenu" class="pause-menu hidden" role="menu">
          <button type="button" class="state" role="menuitem" data-p="today">Today</button>
          <button type="button" class="state" role="menuitem" data-p="monday">Until Monday</button>
          <button type="button" class="state" role="menuitem" data-p="month">Until next month</button>
          <label class="custom state" role="menuitem"><span>Custom date</span><input type="date" id="pauseDate"></label>
          <button type="button" class="state" role="menuitem" data-p="resume" id="resumeBtn">Resume</button>
        </div>`;

    const P = A.Prefs, S = A.Streak;
    const sync = () => {
      $('countSw').checked = P.get('showCount') !== false;
      $('lineSw').checked = P.get('showLine') !== false;
      $('remindSw').checked = !!P.get('reminder');
      $('wakeIn').value = P.get('wake') || '07:00';
      $('wakeRow').classList.toggle('hidden', !P.get('reminder'));
      const until = S.pausedUntil();
      $('pauseVal').textContent = until ? `Until ${fmt(until)}` : 'Off';
      $('resumeBtn').classList.toggle('hidden', !until);
      const t = S.today();
      $('pauseDate').min = t;
      $('pauseDate').max = S.shift(t, S.PAUSE_CAP - 1);
    };
    const menu = on => { $('pauseMenu').classList.toggle('hidden', !on); $('pauseRow').setAttribute('aria-expanded', String(on)); };
    $('countSw').onchange = e => { P.set({ showCount: e.target.checked }); S.refresh(); };
    $('lineSw').onchange = e => P.set({ showLine: e.target.checked });
    $('remindSw').onchange = e => { P.set({ reminder: e.target.checked }); sync(); };
    $('wakeIn').onchange = e => P.set({ wake: e.target.value || '07:00' });
    $('pauseRow').onclick = () => menu($('pauseMenu').classList.contains('hidden'));
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      S.setPause(b.dataset.p === 'resume' ? null : S.pauseFor(b.dataset.p));
      menu(false); sync();
    });
    $('pauseDate').onchange = e => { if (e.target.value) { S.setPause(e.target.value); menu(false); sync(); } };
    A.bus.on('pause', sync);
    document.querySelectorAll('[data-open="settings"]').forEach(b => b.addEventListener('click', () => { menu(false); sync(); }));
    sync();
  };

  const onboard = () => {
    const phone = $('phone');
    const card = document.createElement('div');
    card.id = 'onboard'; card.className = 'onboard';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'obLead');
    card.innerHTML = `
      <div class="sheet onboard-sheet">
        <div class="handle" aria-hidden="true"></div>
        <span class="ob-mark" aria-hidden="true">${A.Glyph ? A.Glyph.laminate() : ''}</span>
        <p id="obLead" class="ob-lead">When I <input id="obCue" type="text" autocomplete="off" spellcheck="false" aria-label="When I"> I light the lantern.</p>
        <div class="group">
          <label class="li state"><span class="ms" aria-hidden="true">schedule</span><span class="txt"><span class="hl">Usual wake time</span></span><input type="time" id="obWake" class="time-val" step="900"></label>
          ${toggle('obAim', 'Aim for a week of mornings', 'wb_twilight')}
        </div>
        <p class="ob-note">One short summary a day goes to your clinic, nothing more. Most mornings is plenty.</p>
        <div class="ob-go"><button id="obGo" class="btn filled block state" type="button">Let's begin</button></div>
      </div>`;
    phone.append(card);
    phone.classList.add('onboarding', 'card-open');
    const P = A.Prefs;
    $('obCue').value = P.get('cue') || CUE;
    $('obWake').value = P.get('wake') || '07:00';
    $('obAim').checked = P.get('aim') !== 0;
    $('obGo').onclick = () => {
      P.set({ cue: $('obCue').value.trim() || CUE, wake: $('obWake').value || '07:00', aim: $('obAim').checked ? 7 : 0, onboarded: A.Streak.today() });
      card.remove();
      phone.classList.remove('onboarding');
      if (!phone.querySelector('.screen.settings:not(.hidden), .layer:not(.hidden), .talk:not(.hidden)')) phone.classList.remove('card-open');
      A.Streak.refresh();
    };
  };

  const mount = () => {
    if (!$('start') || !A.Prefs) return;
    settings();
    if (new URLSearchParams(location.search).get('onboard') === '1') onboard();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
