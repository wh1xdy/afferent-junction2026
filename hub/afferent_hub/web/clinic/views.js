(() => {
  const C = window.C;
  const V = (C.views = {});
  const esc = C.esc;

  const STATE = {
    booster: { label: 'Booster review', icon: 'medical_services', rank: 0, suggest: 'Consider a booster discussion at the next contact. The clinician decides.' },
    check_in: { label: 'Check-in', icon: 'call', rank: 1, suggest: 'Consider a check-in call. The clinician decides.' },
    watch: { label: 'Watch', icon: 'insights', rank: 2, suggest: 'Drifting from the usual pattern. Worth a look at the next contact.' },
    stable: { label: 'Stable', icon: 'check', rank: 3, suggest: 'Within the usual pattern. Nothing suggested.' },
  };
  const FEATURE = {
    rt_median: ['Reaction time', 'slower than usual', 'faster than usual'],
    mood: ['Mood lantern', 'lower than usual', 'higher than usual'],
    sleep_regularity: ['Sleep regularity', 'less regular', 'more regular'],
    missed_sessions: ['Mornings missed', 'more than usual', 'fewer than usual'],
    effort_hard_prop: ['Effort choice', 'easier than usual', 'harder than usual'],
    morning_pulse: ['Resting pulse', 'higher than usual', 'lower than usual'],
    home_only_days: ['Days at home', 'more than usual', 'fewer than usual'],
    upright_frac: ['Upright in play', 'less than usual', 'more than usual'],
    reward_bias: ['Reward bias', 'lower than usual', 'higher than usual'],
  };
  const MODE = { calm: ['Calm', 'spa'], wake: ['Wake', 'light_mode'], fatigue: ['Fatigue', 'wb_twilight'], rest: ['Rest', 'bedtime'], flow: ['Flow', 'animation'] };
  const TASK = { breath: 'Breath', loyly: 'Löyly', threads: 'Aurora threads', stars: 'Constellation', fireflies: 'Fireflies', beacon: 'Beacon', bells: 'Bells', shutters: 'Shutters', fork: 'Fork', lanterns: 'Two lanterns', joutsen: 'Joutsen', bite: 'Bite' };
  const SHARING = { summary: 'Summary', nothing_tonight: 'Skip today', paused: 'Paused 7 days' };
  const BAND = { minimal: 'Minimal', mild: 'Mild', moderate: 'Moderate', moderately_severe: 'Moderately severe', severe: 'Severe' };
  const TIER = { high: 'High', moderate: 'Moderate', incomplete: 'Incomplete', low: 'Low', none: 'None', not_answered: 'Not reached' };
  const ITEM9 = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MINUS = '−';

  const num = (v, d = 2) => (v == null || Number.isNaN(+v) ? '-' : (+v).toFixed(d).replace('-', MINUS));
  const signed = (v, d = 2) => (v == null ? '-' : (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(d));
  const pct = (v) => (v == null ? '-' : Math.round(v * 100) + '%');
  const parseDate = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dateShort = (s) => { if (!s) return ''; const d = parseDate(s); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const dateTiny = (s) => { const d = parseDate(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const timeOf = (iso) => (iso ? iso.slice(11, 16) : '');
  const addDays = (s, n) => { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const hhmm = (h) => { if (h == null) return '-'; const t = ((h % 24) + 24) % 24; return String(Math.floor(t)).padStart(2, '0') + ':' + String(Math.round((t % 1) * 60) % 60).padStart(2, '0'); };
  const stampOf = (d) => `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  V.fmt = { num, signed, pct, dateShort, timeOf, stampOf };

  function relDay(iso, today, sentence) {
    if (!iso) return sentence ? 'No session yet' : '<span class="t">No session yet</span>';
    const dd = Math.round((parseDate(today) - parseDate(iso)) / 864e5);
    const label = dd === 0 ? 'Today' : dd === 1 ? 'Yesterday' : dd > 1 && dd < 7 ? WD[parseDate(iso).getUTCDay()] : dateTiny(iso);
    if (sentence) return `${dd <= 1 ? label.toLowerCase() : label} ${timeOf(iso)}`;
    return `${label} <span class="t num">${timeOf(iso)}</span>`;
  }

  const icon = (name, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${name}</span>`;
  const info = (text) => `<button class="info" type="button" aria-label="${esc(text)}" data-tip="${esc(text)}">${icon('info')}</button>`;
  const simBadge = (on, small = true) => (on ? `<span class="sim-badge ${small ? 'small' : ''}">Simulated</span>` : '');
  const chip = (state) => { const s = STATE[state] || STATE.stable; return `<span class="st" data-state="${esc(state)}">${icon(s.icon)}${s.label}</span>`; };
  const flagChip = (f) => (C.isSafety(f.type) ? `<span class="st" data-state="safety">${icon('shield')}${C.flagText(f.type, 'chip')}</span>` : `<span class="st" data-state="talk">${icon('chat_bubble')}Asked to talk</span>`);
  V.chip = (state) => (STATE[state] || STATE.stable).label;
  V.stateRank = (s) => STATE[s]?.rank ?? 9;

  const featName = (key, label) => FEATURE[key]?.[0] || (label || key).replace(/\s*\(.*\)$/, '');
  function phrase(key, label, worse) {
    const f = FEATURE[key];
    if (!f) return `${featName(key, label)} ${worse ? 'away from usual' : 'better than usual'}`;
    return `${f[0]} ${worse ? f[1] : f[2]}`;
  }

  function reason(r, L) {
    const top = (r.top_contributors || []).filter((c) => c.contribution > 0.15);
    if (!top.length) return r.state === 'stable' ? 'Steady across all signals' : 'Small drift across several signals';
    const days = r.state !== 'stable' && r.state_since_day != null ? L.now_day - r.state_since_day : null;
    return phrase(top[0].key, top[0].label, true) + (days > 0 ? `, ${days} ${days === 1 ? 'day' : 'days'}` : '');
  }

  const needsLook = (r) => (r.flags || []).length > 0 || r.state === 'booster' || r.state === 'check_in';
  const noSession = (r, L) => r.last_session_day == null || L.now_day - r.last_session_day >= 2;
  const hasSafety = (r) => (r.flags || []).some((f) => C.isSafety(f.type));
  const FILTERS = [
    ['all', 'All', () => true],
    ['safety', 'Safety', hasSafety],
    ['look', 'Needs a look', needsLook],
    ['watch', 'Watch', (r) => r.state === 'watch' && !needsLook(r)],
    ['stable', 'Stable', (r) => r.state === 'stable' && !needsLook(r)],
    ['nosession', 'No session 2 days', noSession],
  ];

  V.sorted = (L) => [...L.patients].sort((a, b) => C.flagRank(a.flags) - C.flagRank(b.flags) || V.stateRank(a.state) - V.stateRank(b.state) || (b.composite ?? -9) - (a.composite ?? -9));

  V.visible = function (S) {
    const L = S.list;
    const f = (FILTERS.find(([k]) => k === S.ui.filter) || FILTERS[0])[2];
    const q = (S.ui.q || '').trim().toLowerCase();
    return V.sorted(L).filter((r) => f(r, L) && (!q || r.display_name.toLowerCase().includes(q) || r.id.includes(q)));
  };

  V.patients = (S, id) => `<div class="panes"><section class="list-pane" id="list-pane" aria-label="Patients">${V.list(S, id)}</section><aside class="detail-pane" id="detail-pane" aria-label="Patient detail">${V.detail(S, id)}</aside></div>`;

  V.list = function (S, sel) {
    const L = S.list;
    if (!L) return '<div class="loading">Loading patients</div>';
    const rows = V.visible(S);
    const played = L.patients.filter((r) => r.last_session_day === L.now_day).length;
    const n = L.patients.length;
    const chips = FILTERS.map(([k, label, f]) => {
      const c = L.patients.filter((r) => f(r, L)).length;
      if (k === 'safety' && !c) return '';
      const on = (S.ui.filter || 'all') === k;
      return `<button class="chip" type="button" data-filter="${k}" aria-pressed="${on}">${on ? icon('check') : ''}${label}${k === 'all' || c ? ` <span class="n num">${c}</span>` : ''}</button>`;
    }).join('');
    const max = Math.max(2.5, ...L.patients.flatMap((r) => (r.sparkline || []).filter((v) => v != null)));
    return `<h1 class="page-title">Patients</h1>
      <p class="page-sub">Sorted by need. ${n} ${n === 1 ? 'person' : 'people'} after TMS, ${played ? `${played} ${played === 1 ? 'session' : 'sessions'} this morning` : 'no session yet this morning'}.</p>
      <div class="filters" role="toolbar" aria-label="Filter patients">${chips}</div>
      <div class="plist" role="list">${rows.length ? rows.map((r) => V.row(r, L, r.id === sel, [-1, max])).join('') : '<div class="empty-row">No patient matches.</div>'}</div>
      <p class="list-foot">Each person is compared only with their own first two weeks after TMS. Afferent suggests; the clinician decides.${L.simulated ? ' All patients on this hub are simulated.' : ''}</p>`;
  };

  V.row = function (r, L, sel, domain) {
    const flags = C.sortFlags(r.flags);
    const f0 = flags[0];
    const talk = flags.find((f) => f.type === 'talk_request');
    const safe = f0 && C.isSafety(f0.type);
    const talkIcon = talk ? `<span class="talk" title="Asked to talk ${timeOf(talk.t_iso)}" aria-label="Asked to talk">${icon('chat_bubble', 'fill')}</span>` : '';
    const why = safe ? `Check-in ${relDay(f0.t_iso, L.date, true)}` : reason(r, L);
    return `<a class="prow" role="listitem" href="#/p/${esc(r.id)}" data-id="${esc(r.id)}" aria-current="${sel}">
      <span class="pname"><b>${esc(r.display_name)}</b>${talkIcon}</span>
      ${safe ? flagChip(f0) : chip(r.state)}
      <span class="spark-cell">${C.sparkline(r.sparkline || [], { domain, w: 120, h: 32 })}</span>
      <span class="preason">${esc(why)}</span>
      <span class="plast">${relDay(r.last_session_iso, L.date)}</span>
    </a>`;
  };

  function compositeBand(tl) {
    const v = tl.composite.slice(0, 14).filter((x) => x != null).sort((a, b) => a - b);
    if (v.length < 3) return [-0.5, 0.5, 0];
    const med = v[Math.floor(v.length / 2)];
    const mad = v.map((x) => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const s = Math.max(1.4826 * mad, 0.25);
    return [med - s, med + s, med];
  }

  function talkLine(flags, L) {
    const talks = flags.filter((f) => f.type === 'talk_request');
    if (!talks.length) return '';
    const today = talks.filter((f) => f.t_iso?.slice(0, 10) === L?.date).length;
    return `Tapped Talk to someone ${relDay(talks[0].t_iso, L?.date || talks[0].t_iso, true)}${today > 1 ? `, ${today} times today` : ''}.`;
  }

  function safetyBanner(f, D, id, also) {
    const doc = (D?.checkins || []).find((c) => c.checkin_id === f.checkin_id);
    const item9 = doc?.safety?.item9 ?? doc?.phq9?.items?.phq9_9;
    const cs = doc?.cssrs;
    const cssrs = f.label || (cs?.asked ? `C-SSRS answered${cs.tier ? ', tier ' + esc(cs.tier) : ''}` : cs ? 'C-SSRS not asked' : '');
    const screen = { crisis: 'Crisis screen shown, 112 first', support: 'Support screen shown', thank_you: 'Thank-you screen shown' }[f.screen];
    const facts = [`Check-in ${dateShort(f.t_iso)}, ${timeOf(f.t_iso)}`, item9 != null ? `Item 9: ${ITEM9[item9] || item9}` : '', cssrs, screen].filter(Boolean);
    return `<div class="banner" data-kind="safety" role="alert">${icon('shield')}
      <div><b>Safety answer: ${esc(TIER[C.flagText(f.type, 'tier')] || '').toLowerCase()}</b><p>${facts.map(esc).join(' · ')}</p>${also ? `<p class="also">${icon('chat_bubble')}${esc(also)}</p>` : ''}</div>
      <div class="bfoot"><span class="tag">${icon('description')}Follow your clinic protocol</span><button class="btn text small" data-action="clear-flags" data-id="${esc(id)}">${icon('done_all')}Mark as seen</button></div>
    </div>`;
  }

  function talkBanner(flags, L, id) {
    return `<div class="banner" data-kind="talk">${icon('chat_bubble')}
      <div><b>Asked to talk</b><p>${esc(talkLine(flags, L))} The app showed the helplines. Afferent is not watched around the clock.</p></div>
      <div class="bfoot"><button class="btn text small" data-action="clear-flags" data-id="${esc(id)}">${icon('done_all')}Mark as seen</button></div>
    </div>`;
  }

  V.detail = function (S, id) {
    if (!id) return S.list ? '<div class="loading">Choose a patient</div>' : '';
    const L = S.list;
    const row = L?.patients.find((p) => p.id === id);
    const A = S.analytics[id], D = S.detail[id];
    const name = D?.patient?.display_name || row?.display_name || id;
    const back = `<a class="btn text small dp-back" href="#/">${icon('arrow_back')}Patients</a>`;
    if (!A) return `<div class="dp">${back}<div class="dp-name">${esc(name)}</div>${S.missing[id] ? `<p class="muted">${esc(S.missing[id])}</p>` : '<div class="loading">Loading</div>'}</div>`;
    const simOn = A.simulated || row?.simulated;
    const flags = C.sortFlags(row?.flags);
    const safety = flags.find((f) => C.isSafety(f.type));
    const comp = A.composite, cm = A.completeness;
    const weeks = Math.floor(A.now_day / 7);
    const lastIso = row?.last_session_iso;
    const feat = S.ui.feature && A.features.find((f) => f.key === S.ui.feature);

    const head = `<div class="dp-head">
        <div>${back}<h2 class="dp-name">${esc(name)}${simBadge(simOn)}</h2></div>${chip(A.state)}
        <p class="dp-sub">${weeks} ${weeks === 1 ? 'week' : 'weeks'} after TMS. ${lastIso ? `Last session ${esc(relDay(lastIso, L.date, true))}.` : 'No session yet.'}</p>
      </div>`;
    const banners = safety ? safetyBanner(safety, D, id, talkLine(flags, L)) : flags.some((f) => f.type === 'talk_request') ? talkBanner(flags, L, id) : '';
    const trend = comp.trend_7d;
    const tIcon = trend > 0.05 ? 'trending_up' : trend < -0.05 ? 'trending_down' : 'trending_flat';
    const chartHead = feat
      ? `<div class="sect-h chart-h"><div><h2>${esc(featName(feat.key, feat.label))}</h2><p class="muted">${esc(feat.unit || '')}, last 6 weeks</p></div><span class="r"><button class="seg-back" data-feature="">${icon('arrow_back')}Index</button></span></div>`
      : `<div class="sect-h chart-h"><div><h2>Early-warning index ${info(`Weighted mean of personal z-scores. 0 is ${name}'s usual; higher means further from usual. Days above the drift line add up toward a suggestion.`)}</h2><p class="muted">last 6 weeks</p></div><span class="r kv"><span class="v num">${num(comp.value)}</span><span class="trend num">${icon(tIcon)}${signed(trend)} in 7 d</span></span></div>`;

    const cs = [...comp.contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4);
    const max = Math.max(0.3, ...cs.map((c) => Math.abs(c.contribution)));
    const moved = cs.map((c) => {
      const usual = Math.abs(c.signed_z) < 1;
      const worse = c.contribution > 0;
      const text = usual ? 'as usual' : (FEATURE[c.key] ? FEATURE[c.key][worse ? 1 : 2] : worse ? 'away from usual' : 'better than usual');
      return `<button class="mrow" data-feature="${esc(c.key)}" aria-pressed="${S.ui.feature === c.key}" title="Show on the chart">
        <span>${esc(featName(c.key, c.label))}</span>
        <span class="mbar"><i class="${worse ? '' : 'better'}" style="width:${Math.max(4, (Math.abs(c.contribution) / max) * 100).toFixed(0)}%"></i></span>
        <span class="mt">${text}</span></button>`;
    }).join('');

    const sensors = D?.privacy?.sensors || {};
    const sOn = Object.values(sensors).filter(Boolean).length, sAll = Object.keys(sensors).length;
    const since = A.cusum.since_day;
    const facts = [
      ['Last session', lastIso ? relDay(lastIso, L.date) : 'None yet'],
      ['Mornings played', `<span class="num">${cm.sessions_7d ?? '-'} of 7</span> <small>this week</small>`],
      ['Data complete', `<span class="num">${pct(cm.overall ?? comp.completeness)}</span> <small>${esc(comp.confidence || '')} confidence</small>`],
      ['In this state since', A.state !== 'stable' && since != null && A.timeline.dates[since] ? `${dateShort(A.timeline.dates[since])} <small class="num">${A.now_day - since} d</small>` : '-'],
      ['Sensors on', sAll ? `<span class="num">${sOn} of ${sAll}</span>` : '-'],
      ['Export', D?.privacy ? esc(SHARING[D.privacy.sharing] || D.privacy.sharing) : '-'],
    ].map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

    return `<div class="dp" data-id="${esc(id)}">
      ${head}${banners}
      <section>${chartHead}<div class="chart-wrap" id="dchart"></div></section>
      <section><div class="sect-h"><h2>What moved</h2>${info('Each signal against this person\'s first two weeks. Select one to see it on the chart.')}</div><div class="moved">${moved}</div></section>
      ${V.gameRt(A)}
      <div class="suggest">${esc(STATE[A.state]?.suggest || '')}</div>
      <div class="actions">
        <button class="btn filled" data-action="summary">${icon('description')}Weekly summary</button>
        <a class="btn outlined" href="/api/patients/${encodeURIComponent(id)}/export" download>${icon('download')}Export</a>
      </div>
      <div class="divider"></div>
      <section class="card"><div class="facts">${facts}</div></section>
      ${V.phq(D)}
      ${V.helps(A)}
      ${V.mornings(A)}
      ${V.everyday(D)}
      <p class="dp-foot">Computed on the hub from derived numbers only; no camera images are stored or sent. Research prototype. Not a CE-marked medical device. Not for clinical use.</p>
    </div>`;
  };

  V.drawDetail = function (S, id) {
    const el = document.getElementById('dchart');
    const A = S.analytics[id];
    if (!el || !A) return;
    const tl = A.timeline;
    const N = Math.min(42, tl.days.length);
    const from = tl.days.length - N;
    const feat = S.ui.feature && A.features.find((f) => f.key === S.ui.feature);
    const dates = tl.dates.slice(from);
    const xl = [[0, dateTiny(dates[0])], [Math.round((N - 1) / 2), dateTiny(dates[Math.round((N - 1) / 2)])], [N - 1, 'Today']];
    const stateCol = A.state === 'stable' ? C.css('--c-outline') : C.stateColor(A.state);
    let o;
    if (feat) {
      const vals = feat.series.value.slice(from);
      const dp = (v) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
      const b = feat.baseline;
      o = { values: vals, connect: true, band: b.ready ? [b.band_lo, b.band_hi] : null, mid: b.ready ? b.median : null, aria: `${feat.label} over 6 weeks`,
        tip: (i) => `<div class="tip-h">${dateShort(dates[i])}</div><div class="tip-r"><span>${esc(featName(feat.key, feat.label))}</span><b>${vals[i] == null ? 'no value' : num(vals[i], dp(vals[i])) + ' ' + esc(feat.unit || '')}</b></div>` };
    } else {
      const [b0, b1, med] = compositeBand(tl);
      const vals = tl.composite.slice(from);
      const st = tl.state.slice(from);
      o = { values: vals, band: [b0, b1], mid: med, threshold: A.cusum.k ?? 0.5, thresholdColor: stateCol, thresholdLabel: 'drift line', aria: 'Early-warning index over 6 weeks',
        tip: (i) => `<div class="tip-h">${dateShort(dates[i])}</div><div class="tip-r"><span>Index</span><b>${vals[i] == null ? '-' : signed(vals[i])}</b></div><div class="tip-r"><span>State</span><b>${V.chip(st[i])}</b></div>` };
    }
    C.seriesChart(el, { ...o, h: 196, xlabels: xl });
    const rtEl = document.getElementById('dchart-rt');
    const g = gameRtFeature(A, 'game_rt_norm');
    if (!rtEl || !g) return;
    const vals = g.series.value.slice(from);
    const ms = (gameRtFeature(A, 'game_rt_median')?.series.value || []).slice(from);
    const b = g.baseline;
    C.seriesChart(rtEl, { values: vals, connect: true, band: b.ready ? [b.band_lo, b.band_hi] : null, mid: b.ready ? b.median : null, h: 140, xlabels: xl,
      aria: 'In-game reaction time against the personal baseline over 6 weeks, exploratory',
      tip: (i) => `<div class="tip-h">${dateShort(dates[i])}</div><div class="tip-r"><span>Against usual</span><b>${vals[i] == null ? 'no value' : signed(vals[i])}</b></div><div class="tip-r"><span>Median</span><b>${ms[i] == null ? '-' : num(ms[i], 0) + ' ms'}</b></div>` });
  };

  const gameRtFeature = (A, key) => (A.secondary_features || []).find((f) => f.key === key);

  V.gameRt = function (A) {
    const g = gameRtFeature(A, 'game_rt_norm');
    if (!g || !g.series.value.slice(-42).some((v) => v != null)) return '';
    return `<section><div class="sect-h"><h2>In-game reaction time</h2><span class="muted">exploratory</span>${info('Reaction times inside the games, each task kind against this person\'s own usual, adjusted for game difficulty where logged. Difficulty and motivation still change it. Not part of the index; the morning reaction trial stays the primary measure.')}</div><div class="chart-wrap" id="dchart-rt"></div></section>`;
  };

  V.phq = function (D) {
    const P = D?.phq;
    const head = `<div class="sect-h"><h2>PHQ-9</h2><span class="muted">every 14 days</span>${info('Severity bands, not diagnoses. Item 9 and the safety follow-up are shown above when they need attention.')}</div>`;
    if (!P) return `<section>${head}<p class="muted">Loading</p></section>`;
    const docs = [...(D.checkins || [])].sort((a, b) => String(b.started_iso || '').localeCompare(String(a.started_iso || ''))).slice(0, 4);
    if (!P.history.length && !docs.length) return `<section>${head}<p class="muted">No check-in yet.</p></section>`;
    const hist = P.history.slice(-6);
    const first = P.history[0];
    const bars = hist.map((h, i) => `<span class="${i === hist.length - 1 ? 'last' : ''}" style="height:${Math.max(6, (h.total / 27) * 76).toFixed(0)}px" title="${esc(dateShort(h.date))}: ${h.total}"><em class="num">${h.total}</em></span>`).join('');
    const delta = first && P.total != null && P.history.length > 1 ? P.total - first.total : null;
    const due = P.date ? addDays(P.date, 14) : null;
    const meta = [
      delta != null ? `<b class="num">${delta > 0 ? '+' : delta < 0 ? MINUS : ''}${Math.abs(delta)}</b> from first check-in` : '',
      P.phq8_total != null ? `PHQ-8 <b class="num">${P.phq8_total}</b>` : '',
      P.overdue ? `<span class="overdue">Overdue, last ${P.days_since} days ago</span>` : due ? `due ${dateShort(due)}` : '',
    ].filter(Boolean).join(' · ');
    const rows = docs.map((c) => {
      const p = c.phq9 || {}, sf = c.safety || {};
      const flagged = ['high', 'moderate', 'incomplete', 'low'].includes(sf.tier);
      return `<tr><td>${dateShort(c.started_iso)}${c.early ? '<small>early</small>' : ''}</td>
        <td class="num">${p.total == null ? '<span class="muted">stopped</span>' : p.total}</td>
        <td>${p.band ? BAND[p.band] || esc(p.band) : '-'}</td>
        <td>${flagged ? `<span class="tier" data-tier="${esc(sf.tier)}">${icon('shield')}${esc(TIER[sf.tier])}</span>` : `<span class="muted">${esc(TIER[sf.tier] || sf.tier || '-')}</span>`}</td></tr>`;
    }).join('');
    return `<section>${head}
      <div class="phq-top"><div><div class="phq-num num">${P.total ?? '-'}<small> / 27</small></div><div class="muted">${P.band ? BAND[P.band] || esc(P.band) : 'No complete check-in'}</div></div><div class="phq-bars" aria-hidden="true">${bars}</div></div>
      ${meta ? `<p class="phq-meta">${meta}</p>` : ''}
      ${rows ? `<table class="tbl"><thead><tr><th>Check-in</th><th>Total</th><th>Band</th><th>Safety</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
    </section>`;
  };

  V.helps = function (A) {
    const B = A.bandit;
    const head = `<div class="sect-h"><h2>What helps</h2>${info('Share of tasks after which the pulse moved 2 bpm or more in the intended direction, with a 90% interval. Afferent keeps learning.')}</div>`;
    if (!B?.arms?.length) return `<section>${head}<p class="muted">Still learning.</p></section>`;
    const picks = Object.entries(B.by_mode || {})
      .map(([m, o]) => ({ m, arm: B.arms.find((a) => a.mode === m && a.task_id === o.best), p: o.p_best }))
      .filter((x) => x.arm && MODE[x.m] && x.arm.n >= 3).sort((a, b) => (b.p ?? 0) - (a.p ?? 0)).slice(0, 3);
    const rows = picks.map(({ m, arm, p }) => `<div class="help" data-tip="${esc(`${arm.label} in ${MODE[m][0]}: helped ${arm.helped} of ${arm.n}. 90% interval ${pct(arm.ci90[0])} to ${pct(arm.ci90[1])}. P(best) ${num(p)}.`)}">
        <span class="tile">${icon(MODE[m][1])}</span>
        <span><b>${esc(TASK[arm.task_id] || arm.label)}</b><small>${MODE[m][0]} · helped ${arm.helped} of ${arm.n}${(p ?? 0) < 0.5 ? ' · still learning' : ''}</small></span>
        <span class="ci" aria-hidden="true"><i style="left:${(arm.ci90[0] * 100).toFixed(0)}%;width:${((arm.ci90[1] - arm.ci90[0]) * 100).toFixed(0)}%"></i><b style="left:${(arm.mean * 100).toFixed(0)}%"></b></span>
      </div>`).join('');
    return `<section>${head}<div class="helps">${rows || '<p class="muted">Still learning.</p>'}</div></section>`;
  };

  const lantern = (m) => (m == null ? '<i class="lantern none"></i>' : `<i class="lantern" style="--m:${C.MOOD[Math.max(1, Math.min(5, Math.round(m))) - 1]}" title="Lantern ${m} of 5"></i>`);

  V.mornings = function (A) {
    const pp = [...(A.pre_post || [])].reverse().slice(0, 7);
    if (!pp.length) return '';
    const st = { completed: '', fell_asleep: 'fell asleep', interrupted: 'stopped', aborted: 'stopped' };
    const ps = A.pre_post_summary || {};
    const rows = pp.map((s) => {
      const p = s.pulse || {}, m = s.mood || {};
      return `<div class="morning"><span>${dateShort(s.date)}</span>
        <span class="lanterns">${lantern(m.start)}${icon('arrow_forward')}${lantern(m.end)}${st[s.status] ? `<span class="muted">${st[s.status]}</span>` : ''}</span>
        <span class="pdelta num">${p.delta == null ? '<span class="muted">no pulse</span>' : `${signed(p.delta, 1)} bpm`}</span></div>`;
    }).join('');
    return `<section><div class="sect-h"><h2>Recent mornings</h2>${info('Mood lantern at the start and end of each session, and the change in pulse from start to end.')}<span class="r muted num">median ${signed(ps.pulse_delta_median, 1)} bpm</span></div><div class="mornings">${rows}</div></section>`;
  };

  const EVERYDAY = [
    { label: 'Time in bed', unit: 'h', get: (d) => d.sleep?.time_in_bed_h, fmt: (v) => num(v, 1) },
    { label: 'Sleep midpoint', unit: '', get: (d) => d.sleep?.sleep_midpoint_h, fmt: hhmm, min: 0 },
    { label: 'Morning pulse', unit: 'bpm', get: (d) => d.morning_pulse_bpm, fmt: (v) => num(v, 0), floor: true },
    { label: 'Hours at home', unit: 'h', get: (d) => d.presence?.home_hours, fmt: (v) => num(v, 1), max: 24 },
    { label: 'Steps', unit: '', get: (d) => d.steps, fmt: (v) => (v == null ? '-' : Math.round(v).toLocaleString('en-US')) },
  ];

  V.everyday = function (D) {
    const days = (D?.daily || []).filter((d) => d.day_complete !== false).sort((a, b) => a.day_index - b.day_index);
    if (!days.length) return '';
    const recent = days.slice(-28);
    const base = days.filter((d) => d.day_index <= 13);
    const rows = EVERYDAY.map((m) => {
      const vals = recent.map(m.get);
      const bv = base.map(m.get).filter((v) => v != null).sort((a, b) => a - b);
      const usual = bv.length ? bv[Math.floor(bv.length / 2)] : null;
      let li = vals.length - 1;
      while (li > 0 && vals[li] == null) li--;
      const finite = vals.filter((v) => v != null);
      const min = m.min ?? (m.floor && finite.length ? Math.min(...finite, usual ?? Infinity) - 4 : 0);
      return `<div class="erow"><span>${m.label}</span>
        <span>${C.bars(vals, { w: 240, h: 28, ref: usual, min, max: m.max, title: (i, v) => `${dateShort(recent[i].date)}: ${m.fmt(v)} ${m.unit}` })}</span>
        <span class="v num">${m.fmt(vals[li])}${m.unit ? ' ' + m.unit : ''}<small>usual ${m.fmt(usual)}</small></span></div>`;
    }).join('');
    const sim = days.some((d) => d.simulated);
    return `<section><div class="sect-h"><h2>Everyday</h2><span class="muted">bedside unit and phone, 4 weeks</span><span class="r">${simBadge(sim)}</span></div><div class="erows">${rows}</div></section>`;
  };

  V.summaryDialog = function (Sm, name) {
    if (!Sm) return `<h2 id="dialog-title">Weekly summary</h2><div class="loading">Writing summary</div><div class="dactions"><button class="btn text" data-action="close-dialog">Close</button></div>`;
    const n = Sm.numbers || {};
    const facts = [
      ['State', n.state ? V.chip(n.state) : null],
      ['Index', n.composite != null ? `${signed(n.composite)} (${signed(n.composite_trend_7d)} in 7 d)` : null],
      ['Data complete', n.completeness != null ? `${pct(n.completeness)}, ${esc(n.confidence || '')}` : null],
      ['Mornings played', n.sessions_7d != null ? `${n.sessions_7d} of 7` : null],
      ['What moved', (n.top_contributors || []).map((c) => esc(featName(c.key, c.label))).join(', ') || null],
      ['Best calm task', n.best_calm_task ? esc(n.best_calm_task) : null],
      ['Pulse in play', n.pre_post_pulse_delta_median != null ? `${signed(n.pre_post_pulse_delta_median, 1)} bpm median` : null],
    ].filter(([, v]) => v != null);
    const src = Sm.source === 'gemma' ? `Written on the hub by Gemma${Sm.model ? ' ' + esc(Sm.model) : ''}` : 'Written from a template';
    return `<h2 id="dialog-title">Weekly summary, ${esc(name)}</h2>
      <p class="dsub">${icon('calendar_today')}Days ${Sm.week_start_day} to ${Sm.week_end_day} · ${src}</p>
      <p class="dtext">${esc(Sm.text)}</p>
      ${facts.length ? `<dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd class="num">${v}</dd>`).join('')}</dl>` : ''}
      <div class="dactions"><span class="muted">${esc(Sm.disclaimer || '')}</span><button class="btn text" data-action="refresh-summary">Regenerate</button><button class="btn filled small" data-action="close-dialog">Close</button></div>`;
  };

  V.exports = function (S) {
    const L = S.list;
    const scanned = V.scanned ? V.scanned(S) : '';
    if (!L) return `<section class="page"><div class="page-inner"><h1 class="page-title">Exports and codes</h1>${scanned}<div class="loading">Loading</div></div></section>`;
    const rows = V.sorted(L).map((r) => `<div class="xrow"><span><b>${esc(r.display_name)}</b><small>${r.sessions_7d ?? '-'} of 7 mornings this week · ${pct(r.completeness)} data</small></span>
      <span class="xmeta muted">Last session ${relDay(r.last_session_iso, L.date)}</span>
      <a class="btn outlined small" href="/api/patients/${encodeURIComponent(r.id)}/export" download>${icon('download')}Export</a></div>`).join('');
    return `<section class="page"><div class="page-inner">
      <h1 class="page-title">Exports and codes</h1>
      ${scanned}
      <div class="sect-h codes-h"><h2>Export runs</h2>${info('Each zip holds sessions, daily records, features, check-ins and a codebook, as CSV and NDJSON.')}</div>
      <p class="page-sub">One export a day from each home hub</p>
      <div class="exports">${rows}</div>
    </div></section>`;
  };

  V.settings = function (S) {
    const t = S.ui.theme || 'light';
    const opt = (k, label, ic) => `<button role="radio" aria-checked="${t === k}" data-theme-set="${k}">${t === k ? icon('check') : icon(ic)}${label}</button>`;
    return `<section class="page"><div class="page-inner">
      <h1 class="page-title">Settings</h1>
      <div class="settings">
        <div><div class="group-h">Appearance</div><div class="group">
          <div class="li">${icon('contrast')}<span><b>Theme</b><small>Light suits office daylight</small></span><span class="segmented" role="radiogroup" aria-label="Theme">${opt('light', 'Light', 'light_mode')}${opt('dark', 'Dark', 'dark_mode')}${opt('system', 'System', 'devices')}</span></div>
        </div></div>
        <div><div class="group-h">Demo</div><div class="group">
          <div class="li">${icon('phone_in_talk')}<span><b>Send profile to Anna's phone</b><small>Changes the next session only</small></span><span class="li-actions"><button class="btn outlined small" data-profile="good_day">Good day</button><button class="btn outlined small" data-profile="bad_day">Bad day</button><button class="btn outlined small" data-profile="live">Today</button></span></div>
          <div class="li">${icon('history')}<span><b>Reset demo data</b><small>Back to the seeded patients</small></span><button class="btn text small" data-action="reset">Reset</button></div>
        </div></div>
        <p class="dp-foot">Research prototype. Not a CE-marked medical device. Not for clinical use.</p>
      </div>
    </div></section>`;
  };

  const dnum = (v) => (v == null ? '-' : Number.isInteger(+v) ? String(v) : (+v).toFixed(1));
  const dplural = (v, unit) => `${dnum(v)}<small> ${unit}${+v === 1 ? '' : 's'}</small>`;

  V.validation = function (S) {
    const v = S.validation;
    if (!v) return '<section class="page"><div class="loading">Loading validation</div></section>';
    if (v.status === 'computing') return '<section class="page"><div class="loading">Validation is computing on the hub, about a minute after start</div></section>';
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
    const panel = (cls, h, sub, body, foot) => `<div class="panel ${cls}"><h2>${h}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
    const leg = (c, l) => `<span class="legend"><i style="--c:${c}"></i>${l}</span>`;
    const line = C.css('--c-line'), teal = C.css('--c-stable');
    return `<section class="page"><div class="page-inner">
      <h1 class="page-title">Validation</h1>
      <p class="page-sub">${v.n_seeds} simulated relapse patients and ${st.patients ?? v.n_seeds} stable controls, run day by day through the same engine as the patient list.</p>
      <div class="badges"><span class="sim-badge">Simulated</span>${v.untuned ? '<span class="sim-badge">Untuned</span>' : ''}<span class="sim-badge">Not clinically validated</span></div>
      <div class="vkpis">${tiles}</div>
      <div class="grid2">
        ${panel('wide', 'Early-warning index, one example', 'A relapse patient against a stable control', '<div id="v-ex"></div>', leg(line, 'Relapse') + leg(teal, 'Stable control'))}
        ${panel('', 'Time from onset to each suggestion', 'Median and interquartile range across seeds, days', timingHtml, 'Mood alone: the same rule on the mood lantern only, with its threshold raised until false alarms match.')}
        ${panel('', 'How fast it learns what helps', `Probability that ${best} helps most, by session`, '<div id="v-bandit"></div>', '')}
      </div>
      <p class="list-foot">${esc(v.disclaimer || '')}</p>
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
