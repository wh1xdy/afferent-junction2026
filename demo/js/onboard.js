(() => {
  const $ = id => document.getElementById(id);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const CUE = 'wake up and pick up my phone';
  const fmt = k => { const [y, m, d] = k.split('-').map(Number); const t = new Date(y, m - 1, d); return `${DAYS[t.getDay()]} ${d} ${MONTHS[m - 1]}`; };
  const toggle = (id, text) => `<label class="toggle"><span>${text}</span><input type="checkbox" id="${id}"><i></i></label>`;

  const settings = () => {
    const card = $('settings');
    if (!card) return;
    const box = document.createElement('div');
    box.className = 'mornings';
    box.innerHTML = `
      <p class="sub">Mornings</p>
      <div class="toggles">
        ${toggle('countSw', 'Show the morning count')}
        ${toggle('lineSw', 'Show a line after the session')}
        ${toggle('remindSw', 'Morning reminder')}
        <label class="toggle field" id="wakeRow"><span>Usual wake time</span><input type="time" id="wakeIn" step="900"></label>
        <button type="button" class="toggle field" id="pauseRow" aria-expanded="false"><span>Pause</span><b id="pauseVal"></b></button>
      </div>
      <div id="pauseMenu" class="pause-menu hidden" role="menu">
        <button type="button" role="menuitem" data-p="today">Today</button>
        <button type="button" role="menuitem" data-p="monday">Until Monday</button>
        <button type="button" role="menuitem" data-p="month">Until next month</button>
        <label class="custom" role="menuitem"><span>Custom date</span><input type="date" id="pauseDate"></label>
        <button type="button" role="menuitem" data-p="resume" id="resumeBtn">Resume</button>
      </div>`;
    const anchor = card.querySelector('p.small');
    anchor ? anchor.before(box) : card.append(box);

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
    card.id = 'onboard'; card.className = 'card onboard';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'obLead');
    card.innerHTML = `
      <p id="obLead" class="lead">When I <input id="obCue" type="text" autocomplete="off" spellcheck="false" aria-label="When I"> I light the lantern.</p>
      <label class="toggle field"><span>Usual wake time</span><input type="time" id="obWake" step="900"></label>
      <label class="toggle"><span>Aim for a week of mornings</span><input type="checkbox" id="obAim"><i></i></label>
      <p class="small">Your clinic sees your weekly summary, nothing more. Most mornings is plenty.</p>
      <button id="obGo" class="primary" type="button">Let's begin</button>`;
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
      if (!phone.querySelector('.card:not(.hidden)')) phone.classList.remove('card-open');
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
