(() => {
  const C = window.C;
  const V = (C.views = {});
  const esc = C.esc;

  const TASK = { breath: 'Breath', loyly: 'Löyly', threads: 'Aurora threads', stars: 'Constellation', fireflies: 'Fireflies', beacon: 'Beacon', bells: 'Bells', shutters: 'Shutters', fork: 'Fork', lanterns: 'Two lanterns', joutsen: 'Joutsen', bite: 'Bite' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MINUS = '−';

  const num = (v, d = 2) => (v == null || Number.isNaN(+v) ? '-' : (+v).toFixed(d).replace('-', MINUS));
  const signed = (v, d = 2) => (v == null ? '-' : (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(d));
  const pct = (v) => (v == null ? '-' : Math.round(v * 100) + '%');
  const parseDate = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dateShort = (s) => { if (!s) return ''; const d = parseDate(s); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const dateTiny = (s) => { if (!s) return ''; const d = parseDate(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  V.fmt = { num, signed, pct, dateShort, dateTiny };

  const icon = (name, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${name}</span>`;
  const info = (text) => `<button class="info" type="button" aria-label="${esc(text)}" data-tip="${esc(text)}">${icon('info')}</button>`;
  V.icon = icon;
  V.info = info;

  V.settings = function (S) {
    const t = S.ui.theme || 'light';
    const opt = (k, label, ic) => `<button role="radio" aria-checked="${t === k}" data-theme-set="${k}">${t === k ? icon('check') : icon(ic)}${label}</button>`;
    return `<section class="page"><div class="page-inner">
      <h1 class="page-title">Settings</h1>
      <div class="settings">
        <div><div class="group-h">Appearance</div><div class="group">
          <div class="li">${icon('contrast')}<span><b>Theme</b></span><span class="segmented" role="radiogroup" aria-label="Theme">${opt('light', 'Light', 'light_mode')}${opt('dark', 'Dark', 'dark_mode')}${opt('system', 'System', 'devices')}</span></div>
        </div></div>
        <div><div class="group-h">Demo</div><div class="group">
          <div class="li">${icon('history')}<span><b>Reset demo data</b></span><button class="btn text small" data-action="reset">Reset</button></div>
        </div></div>
      </div>
    </div></section>`;
  };

  const dnum = (v) => (v == null ? '-' : Number.isInteger(+v) ? String(v) : (+v).toFixed(1));
  const dplural = (v, unit) => `${dnum(v)}<small> ${unit}${+v === 1 ? '' : 's'}</small>`;

  V.validation = function (S) {
    const v = S.validation;
    if (!v) return '<section class="page"><div class="loading">Loading</div></section>';
    if (v.status === 'computing') return '<section class="page"><div class="loading">Computing</div></section>';
    const r = v.relapse, st = v.stable, b = v.bandit;
    const iqr = (o) => (o?.iqr ? `IQR ${dnum(o.iqr[0])} to ${dnum(o.iqr[1])}` : '');
    const best = esc(TASK[b.true_best.task_id] || b.true_best.task_id);
    const mm = r.mood_only_at_matched_false_alarms;
    const tiles = [
      [dplural(r.days_onset_to_check_in.median, 'day'), 'from relapse onset to a check-in suggestion', iqr(r.days_onset_to_check_in)],
      [`${Math.round(r.detected_share * 100)}<small>%</small>`, 'of simulated relapses reached a check-in suggestion', `${v.n_seeds} relapse seeds`],
      [num(st.false_alarms_per_patient_month), 'false check-in suggestions per patient-month', `${st.false_check_in_episodes} episodes in ${st.patient_days} patient-days`],
      mm?.days_onset_to_flag?.median ? [dplural(mm.days_onset_to_flag.median, 'day'), 'for the mood lantern alone, at equal false alarms', `flagged ${Math.round((mm.detected_share ?? 0) * 100)}% of relapses`] : [dplural(r.lead_time_vs_mood_only_days?.median, 'day'), 'earlier than a mood-only rule', iqr(r.lead_time_vs_mood_only_days)],
      [dplural(b.sessions_to_p_best_0_8.median, 'session'), `until ${best} is reliably found as most helpful`, iqr(b.sessions_to_p_best_0_8)],
    ].map(([n, l, s]) => `<div class="vkpi"><b class="num">${n}</b><span>${l}</span><span class="muted num">${s}</span></div>`).join('');
    const timing = [
      ['Watch', r.days_onset_to_watch, C.stateColor('watch')],
      ['Check-in', r.days_onset_to_check_in, C.stateColor('check_in')],
      ['Booster review', r.days_onset_to_booster, C.stateColor('booster')],
      ['Mood alone', mm?.best_k?.days_onset_to_flag || r.mood_only_rule_days_onset_to_flag, C.css('--c-outline')],
    ].filter(([, o]) => o?.iqr);
    const tmax = Math.max(28, ...timing.map(([, o]) => o.iqr[1] + 2));
    const ticks = [0, 7, 14, 21, 28, 35, 42].filter((t) => t <= tmax);
    const timingHtml = `<div class="trange">${timing.map(([l, o, c]) => `<div class="tr-row" data-tip="${esc(`${l}: median ${dnum(o.median)} days after onset, IQR ${dnum(o.iqr[0])} to ${dnum(o.iqr[1])}`)}"><span>${l}</span><span class="tr-track"><i style="left:${(o.iqr[0] / tmax) * 100}%;width:${(Math.max(0.3, o.iqr[1] - o.iqr[0]) / tmax) * 100}%;--c:${c}"></i><b style="left:${(o.median / tmax) * 100}%;--c:${c}"></b></span><span class="tr-v num">${dnum(o.median)} d</span></div>`).join('')}
      <div class="tr-row tr-axis"><span></span><span class="tr-track">${ticks.map((t) => `<em style="left:${(t / tmax) * 100}%">${t}</em>`).join('')}</span><span></span></div></div>`;
    const panel = (cls, h, body, foot) => `<div class="panel ${cls}"><h2>${h}</h2>${body}${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
    const leg = (c, l) => `<span class="legend"><i style="--c:${c}"></i>${l}</span>`;
    const line = C.css('--c-line'), teal = C.css('--c-stable');
    return `<section class="page"><div class="page-inner">
      <h1 class="page-title">Validation</h1>
      <div class="badges"><span class="sim-badge">Simulated</span>${v.untuned ? '<span class="sim-badge">Untuned</span>' : ''}<span class="sim-badge">Not clinically validated</span></div>
      <div class="vkpis">${tiles}</div>
      <div class="grid2">
        ${panel('wide', 'Early-warning index, one example', '<div id="v-ex"></div>', leg(line, 'Relapse') + leg(teal, 'Stable control'))}
        ${panel('', `Days from onset to each suggestion ${info('Median and IQR across seeds. Mood alone: the same rule on the mood lantern only, at equal false alarms.')}`, timingHtml, '')}
        ${panel('', `Probability that ${best} helps most`, '<div id="v-bandit"></div>', '')}
      </div>
    </div></section>`;
  };

  V.drawValidation = function (S) {
    const v = S.validation;
    if (!v?.example) return;
    const ex = v.example, a = ex.anna, m = ex.mikko;
    const line = C.css('--c-line'), teal = C.css('--c-stable');
    const days = a.days;
    const xt = [0, 14, 28, 42, 56].filter((d) => d <= days[days.length - 1]);
    const el1 = document.getElementById('v-ex');
    if (el1) C.lineChart(el1, {
      x: days, h: 240, aria: 'Example early-warning index',
      series: [{ values: m.composite, color: teal, width: 1.75, label: 'Stable' }, { values: a.composite, color: line, label: 'Relapse' }],
      marks: [{ x: a.onset_day, label: 'Onset', color: C.css('--c-outline') }].concat(a.first_check_in_day != null ? [{ x: a.first_check_in_day, label: 'Check-in suggested', color: C.stateColor('check_in') }] : []),
      xticks: xt, xtick: (d) => (d === 0 ? 'TMS end' : 'day ' + d), ytick: (t) => num(t, 1),
      tip: (i) => `<div class="tip-h">Day ${days[i]}</div><div class="tip-r"><span>Relapse</span><b>${signed(a.composite[i])}</b></div><div class="tip-r"><span>Stable</span><b>${signed(m.composite[i])}</b></div>`,
    });
    const bp = ex.bandit_p_best;
    const el3 = document.getElementById('v-bandit');
    if (el3 && bp?.sessions) {
      const keys = Object.keys(bp).filter((k) => k !== 'sessions' && Array.isArray(bp[k]));
      const colors = [line, C.css('--c-outline'), teal];
      C.lineChart(el3, {
        x: bp.sessions, h: 220, min: 0, max: 1, aria: 'Learning curve',
        series: keys.map((k, i) => ({ values: bp[k], color: colors[i % 3], width: i === 0 ? 2.25 : 1.5, label: TASK[k] || k })),
        hlines: [{ y: 0.8, label: '0.8', color: C.css('--c-outline') }],
        xticks: bp.sessions.filter((s) => s === 1 || s % 10 === 0), xtick: (s) => s, ytick: (t) => num(t, 1), mr: 96,
        tip: (i) => `<div class="tip-h">Session ${bp.sessions[i]}</div>${keys.map((k) => `<div class="tip-r"><span>${esc(TASK[k] || k)}</span><b>${num(bp[k][i])}</b></div>`).join('')}`,
      });
    }
  };
})();
