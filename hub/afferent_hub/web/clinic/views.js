(() => {
  const C = window.C;
  const V = (C.views = {});
  const esc = C.esc;

  const STATE = {
    booster: { short: 'Consider booster discussion', rank: 0 },
    check_in: { short: 'Consider a call', rank: 1 },
    watch: { short: 'Watch', rank: 2 },
    stable: { short: 'Stable', rank: 3 },
  };
  const MODE_LABEL = { calm: 'Calm', flow: 'Flow', wake: 'Wake', fatigue: 'Fatigue', rest: 'Rest', measure: 'Measure' };
  const MODE_SUB = { calm: 'settling, pulse should fall', wake: 'activating, pulse should rise', fatigue: 'against tiredness, pulse should rise', rest: 'night rest, pulse should fall' };
  const PHASE_LABEL = { fadein: 'Starting', rest: 'Resting baseline', checkin: 'Mood check-in', rt: 'Reaction trials', walk: 'Walking', game: 'Task', dawn: 'Dawn', end: 'End check-in', asleep: 'Fell asleep' };
  const TASK_LABEL = { breath: 'Breath', loyly: 'Löyly', threads: 'Aurora threads', stars: 'Constellation', fireflies: 'Fireflies', beacon: 'Beacon', bells: 'Bells', shutters: 'Shutters', fork: 'Fork', lanterns: 'Two lanterns' };
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
  const hhmm = (h) => { if (h == null) return '-'; const t = ((h % 24) + 24) % 24; return String(Math.floor(t)).padStart(2, '0') + ':' + String(Math.round((t % 1) * 60) % 60).padStart(2, '0'); };
  V.fmt = { num, signed, pct, dateShort, timeOf };

  function relDay(iso, today) {
    if (!iso) return 'No session yet';
    const dd = Math.round((parseDate(today) - parseDate(iso)) / 864e5);
    const label = dd === 0 ? 'Today' : dd === 1 ? 'Yesterday' : dd > 1 && dd < 7 ? `${dd} days ago` : dateShort(iso);
    return `${label} <span class="muted">${timeOf(iso)}</span>`;
  }

  const chip = (state, label, big) => `<span class="chip ${big ? 'chip-big' : ''}" data-state="${esc(state)}"><i></i>${esc(label || STATE[state]?.short || state)}</span>`;
  const sim = (on, text = 'Simulated') => (on ? `<span class="af-simulated">${esc(text)}</span>` : '');
  const info = (text) => `<button class="info" type="button" aria-label="${esc(text)}" data-tip="${esc(text)}">i</button>`;
  const initial = (name) => esc((name || '?').slice(0, 1).toUpperCase());

  V.chip = chip;
  V.stateShort = (s) => STATE[s]?.short || s;
  V.stateRank = (s) => STATE[s]?.rank ?? 9;

  function card(cls, head, body, foot) {
    return `<section class="card ${cls}">${head ? `<header class="card-head">${head}</header>` : ''}<div class="card-body">${body}</div>${foot ? `<footer class="card-foot">${foot}</footer>` : ''}</section>`;
  }
  const title = (t, sub, right) => `<div class="card-title"><h2>${t}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="card-tools">${right}</div>` : ''}`;

  V.list = function (S) {
    const L = S.list;
    if (!L) return `<section class="page"><div class="loading">Loading patients</div></section>`;
    const flagged = (r) => ((r.flags || []).length ? 1 : 0);
    const rows = [...L.patients].sort((a, b) => flagged(b) - flagged(a) || V.stateRank(a.state) - V.stateRank(b.state) || (b.composite ?? -9) - (a.composite ?? -9));
    const needsCall = (r) => flagged(r) || r.state === 'booster' || r.state === 'check_in';
    const counts = { booster: 0, check_in: 0, watch: 0, stable: 0 };
    rows.forEach((r) => (counts[r.state] = (counts[r.state] || 0) + 1));
    const played = rows.filter((r) => r.last_session_day === L.now_day).length;
    const drifted = counts.booster + counts.check_in;
    const asked = rows.filter(flagged).length;
    const groups = [
      ['Might need a call', rows.filter(needsCall)],
      ['Watch', rows.filter((r) => !needsCall(r) && r.state === 'watch')],
      ['Stable', rows.filter((r) => !needsCall(r) && r.state === 'stable')],
    ];
    const tiles = [
      ['booster', 'Booster discussion', counts.booster],
      ['check_in', 'Consider a call', counts.check_in],
      ['watch', 'Watch', counts.watch],
      ['stable', 'Stable', counts.stable],
    ].map(([s, l, n]) => `<div class="kpi kpi-state" data-state="${s}" data-zero="${n === 0}"><span class="kpi-n af-num">${n}</span><span class="kpi-l"><i></i>${l}</span></div>`).join('');
    return `<section class="page list-page">
      <div class="page-head">
        <div class="page-title">
          <p class="eyebrow af-caps">${dateShort(L.date)} · ${rows.length} patients after TMS</p>
          <h1>Who might need a call</h1>
          <p class="lede">${drifted ? `<strong>${drifted} ${drifted === 1 ? 'person' : 'people'}</strong> drifted from their own usual pattern.` : 'Everyone is within their usual pattern.'}${asked ? ` <strong>${asked}</strong> left a note for the clinic.` : ''} ${played} of ${rows.length} played today.</p>
        </div>
        <div class="kpis">${tiles}</div>
      </div>
      <div class="card list-card">
        <div class="list-cols af-caps"><span>Patient</span><span>Suggested</span><span>Early-warning index, 14 days ${info('Weighted mean of personal robust z-scores (EWMA). 0 is this person\'s usual. Positive means worse than usual.')}</span><span>Main drivers</span><span>Last session</span><span>Data</span><span></span></div>
        ${groups.filter(([, g]) => g.length).map(([name, g]) => `<div class="list-group"><div class="group-label af-caps">${name}<span class="af-num">${g.length}</span></div>${g.map((r) => V.row(r, L)).join('')}</div>`).join('')}
      </div>
      <p class="footnote">Each person is compared only with their own first two weeks after TMS. Afferent suggests; the clinician decides. ${L.simulated ? 'All patients on this hub are simulated.' : ''}</p>
    </section>`;
  };

  const SHORT_LABEL = { 'Reward bias log b (7 sessions)': 'Reward bias', 'Effort choice (7 sessions)': 'Effort choice', 'Missed sessions (7 d)': 'Missed sessions', 'Home-only days (7 d)': 'Home-only days', 'Morning resting pulse': 'Morning pulse', 'Upright time in play': 'Upright time' };
  const shortLabel = (l) => SHORT_LABEL[l] || l;

  V.row = function (r, L) {
    const color = C.stateColor(r.state);
    const drivers = (r.top_contributors || []).filter((c) => c.contribution > 0.05).slice(0, 2);
    const flags = (r.flags || []).length ? `<span class="flag-chip">${C.flagText(r.flags[0].type, 'chip')} ${timeOf(r.flags[0].t_iso)}</span>` : '';
    const trend = r.composite_trend_7d;
    const since = r.state !== 'stable' && r.state_since_day != null ? `<span class="muted">since day ${r.state_since_day} · ${L.now_day - r.state_since_day} d</span>` : `<span class="muted">${r.confidence === 'low' ? 'Low data' : 'Within usual range'}</span>`;
    return `<a class="prow" href="#/p/${esc(r.id)}" data-id="${esc(r.id)}" data-state="${esc(r.state)}" data-flag="${(r.flags || []).length > 0}">
      <span class="pcell pname">
        <span class="avatar" style="--c:${color}">${initial(r.display_name)}</span>
        <span class="pname-t"><b>${esc(r.display_name)}${sim(r.simulated)}</b><span class="muted">Week ${Math.floor((r.day_index ?? 0) / 7) + 1} after TMS</span></span>
      </span>
      <span class="pcell pstate">${chip(r.state)}${flags || since}</span>
      <span class="pcell pindex">${C.sparkline(r.sparkline || [], { color })}<span class="pindex-v"><b class="af-num">${num(r.composite)}</b><span class="trend af-num" data-dir="${trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'flat'}">${trend > 0.05 ? '↑' : trend < -0.05 ? '↓' : '→'} ${signed(trend)} <span class="muted">7 d</span></span></span></span>
      <span class="pcell pdrivers">${drivers.length ? drivers.map((c) => `<span><b>${esc(shortLabel(c.label))}</b> <span class="af-num muted">${signed(c.contribution)}</span></span>`).join('') : '<span class="muted">No feature above usual</span>'}</span>
      <span class="pcell plast">${r.live_now ? '<span class="live-pill"><i></i>Playing now</span>' : `<span>${relDay(r.last_session_iso, L.date)}</span>`}<span class="muted af-num">${r.sessions_7d ?? 7 - (r.missed_7d ?? 0)} of 7 days played</span></span>
      <span class="pcell pdata"><span class="meter"><i style="width:${Math.round((r.completeness ?? 0) * 100)}%"></i></span><span class="af-num">${pct(r.completeness)} <span class="muted">${esc(r.confidence || '')}</span></span></span>
      <span class="pcell chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </a>`;
  };

  function compositeBand(tl) {
    const v = tl.composite.slice(0, 14).filter((x) => x != null).sort((a, b) => a - b);
    if (v.length < 3) return [-0.5, 0.5];
    const med = v[Math.floor(v.length / 2)];
    const mad = v.map((x) => Math.abs(x - med)).sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const s = Math.max(1.4826 * mad, 0.25);
    return [med - s, med + s];
  }

  V.detail = function (S, id) {
    const row = S.list?.patients.find((p) => p.id === id);
    const A = S.analytics[id];
    const D = S.detail[id];
    if (!A) {
      if (S.missing[id]) return `<section class="page"><a class="back" href="#/">All patients</a><div class="empty"><h1>${esc(row?.display_name || id)}</h1><p>${esc(S.missing[id])}</p></div></section>`;
      return `<section class="page"><a class="back" href="#/">All patients</a><div class="loading">Loading ${esc(row?.display_name || id)}</div></section>`;
    }
    const name = D?.patient?.display_name || row?.display_name || id;
    const simOn = A.simulated || row?.simulated;
    const flags = row?.flags || [];
    const comp = A.composite, cu = A.cusum, cm = A.completeness;
    const tms = D?.patient?.tms_end_date;
    const sensors = D?.privacy?.sensors || {};
    const sOn = Object.values(sensors).filter(Boolean).length, sAll = Object.keys(sensors).length;
    const weeks = Math.floor(A.now_day / 7);
    const sinceDays = cu.since_day != null ? A.now_day - cu.since_day : null;
    const thr = cu.thresholds || A.params?.thresholds || {};
    const nextThr = { stable: ['watch', thr.watch], watch: ['check_in', thr.check_in], check_in: ['booster', thr.booster], booster: ['booster', thr.booster] }[A.state] || [];

    const flagBanner = flags.length ? `<div class="flag-banner" role="alert">
        <div><b>${esc(name)} ${C.flagText(flags[0].type, 'banner')}${new Set(flags.map((f) => f.session_id || f.t_iso)).size > 1 ? ` (${new Set(flags.map((f) => f.session_id || f.t_iso)).size} notes)` : ''}, ${dateShort(flags[0].t_iso)} at ${timeOf(flags[0].t_iso)}.</b>
        <span>The app showed the fixed card with Emergency 112, MIELI Crisis Helpline 09 2525 0111 and the clinic number. Afferent is not watched around the clock.</span></div>
        <button class="btn" data-action="clear-flags" data-id="${esc(id)}">Mark as seen</button></div>` : '';

    const head = `<div class="p-head">
        <div class="p-id">
          <a class="back" href="#/"><svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>All patients</a>
          <div class="p-id-row"><h1>${esc(name)}</h1>${sim(simOn)}
          <p class="muted meta">Week ${weeks + 1} after TMS${tms ? ` (ended ${dateTiny(tms)})` : ''} · day ${A.now_day} · ${dateShort(A.date)}${sAll ? ` · sharing ${esc(D.privacy.sharing)}, ${sOn} of ${sAll} sensors on ${info('Sensors on: ' + Object.entries(sensors).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')).join(', ') + '. Patients can switch each sensor off in the app.')}` : ''}</p></div>
        </div>
      </div>
      <section class="status card" data-state="${esc(A.state)}">
        <div class="status-main">
          ${chip(A.state, STATE[A.state]?.short, true)}
          <h2 class="status-label" data-state="${esc(A.state)}">${esc((A.suggestion?.text || A.state_label).replace(/\s*The clinician decides\.?\s*$/, ''))}</h2>
          <p class="status-text">The clinician decides.${sinceDays != null && A.state !== 'stable' ? ` In this state since day ${cu.since_day} (${dateTiny(A.timeline.dates[cu.since_day] || A.date)}).` : ''}</p>
          ${A.suggestion?.reasons?.length ? `<p class="status-reasons"><span class="muted">Mostly</span> ${A.suggestion.reasons.map((r) => `<b>${esc(r)}</b>`).join('<span class="muted">, </span>')}</p>` : ''}
        </div>
        <div class="status-kpis">
          <div class="skpi"><span class="af-caps">Early-warning index</span><b class="af-num" data-k="composite">${num(comp.value)}</b><span class="af-num muted">${signed(comp.trend_7d)} in 7 days</span></div>
          <div class="skpi"><span class="af-caps">CUSUM ${info('One-sided cumulative sum of the index above k = ' + (cu.k ?? 0.5) + ', from day 14. Watch at ' + thr.watch + ', call at ' + thr.check_in + ', booster discussion at ' + thr.booster + '.')}</span><b class="af-num" data-k="cusum">${num(cu.value, 1)}</b><span class="af-num muted">${A.state === 'booster' ? `booster line ${thr.booster}` : `next line ${nextThr[1]}`}${sinceDays != null && A.state !== 'stable' ? ` · ${sinceDays} d in state` : ''}</span></div>
          <div class="skpi"><span class="af-caps">Features available ${info('Share of the index weight with recent data. Per-feature coverage over 7 days is in the drivers panel.')}</span><b class="af-num">${comp.n_features}<small> / ${comp.n_features_total}</small></b><span class="muted">${esc(comp.confidence)} confidence · ${pct(cm.overall ?? comp.completeness)} of weight</span></div>
          <div class="skpi"><span class="af-caps">Days played, 7 days</span><b class="af-num">${cm.sessions_7d ?? '-'}<small> / 7</small></b><span class="muted af-num">${cm.missed_7d ?? 0} missed</span></div>
        </div>
      </section>`;

    const feat = S.ui.feature && A.features.find((f) => f.key === S.ui.feature);
    const segs = `<div class="seg" role="tablist"><button role="tab" data-feature="" aria-selected="${!feat}">Index</button>${feat ? `<button role="tab" aria-selected="true" data-feature="${esc(feat.key)}">${esc(feat.label)}</button>` : ''}</div>`;
    const hist = (cu.history || []).map((h) => `<span class="hstep">${chip(h.state, STATE[h.state]?.short)}<span class="muted af-num">day ${h.day}</span></span>`).join('<span class="harrow" aria-hidden="true"></span>');
    const timelineCard = card('c-timeline',
      title(feat ? esc(feat.label) : 'Early-warning index', feat ? `Raw values against ${esc(name)}'s own baseline (median ± 1 robust SD) · ${esc(feat.unit || '')}` : `Personal z-score, 0 is ${esc(name)}'s usual · positive means worse than usual`, segs + sim(simOn)),
      `<div class="timeline" id="timeline"></div>`,
      `<div class="history"><span class="af-caps muted">State history</span>${hist}</div>`);

    const contribCard = V.contrib(A, S.ui.feature);
    const live = card('c-live', title('Live', 'Phone game and bedside', `<span class="live-status" id="live-status"></span>`), `<div id="live-body"></div>`);
    const helps = V.helps(A, name);
    const summary = V.summary(S.summary[id]);
    const sessions = V.sessions(A, D);
    const everyday = V.everyday(D, A);

    return `<section class="page detail" data-id="${esc(id)}">${flagBanner}${head}
      <div class="grid">
        ${timelineCard}${live}
        ${contribCard}${helps}${summary}
        ${sessions}${everyday}
      </div>
      <p class="footnote">Numbers are computed on the hub from derived values only; no camera frames are stored or sent. Afferent suggests; the clinician decides.</p>
    </section>`;
  };

  V.drawTimeline = function (S, id, opts = {}) {
    const el = document.getElementById('timeline');
    const A = S.analytics[id];
    if (!el || !A) return;
    const tl = A.timeline;
    const feat = S.ui.feature && A.features.find((f) => f.key === S.ui.feature);
    const dp = (v) => (feat && Math.abs(v) >= 100 ? 0 : feat && Math.abs(v) >= 10 ? 1 : 2);
    const top = feat
      ? { values: feat.series.value, band: feat.baseline.ready ? [feat.baseline.band_lo, feat.baseline.band_hi] : null, median: feat.baseline.median, fmt: (v) => num(v, dp(v)), tick: (v) => num(v, dp(v)) }
      : { values: tl.composite, band: compositeBand(tl), median: null, fmt: (v) => num(v), tick: (v) => num(v, 1), floor: -1, ceil: 1.5 };
    C.timeline(el, {
      days: tl.days, top, cusum: tl.cusum, states: tl.state, missed: tl.missed, thresholds: A.cusum.thresholds,
      compact: window.innerHeight < 1000, pulseLast: opts.pulse,
      dateLabel: (d) => dateTiny(tl.dates[d]),
      aria: feat ? feat.label + ' over time' : 'Early-warning index over time',
      tip: (i) => {
        const rows = [];
        rows.push(`<div class="tip-h">${dateShort(tl.dates[i])} <span class="muted">day ${tl.days[i]}</span></div>`);
        if (feat) {
          rows.push(`<div class="tip-r"><span>${esc(feat.label)}</span><b>${feat.series.value[i] == null ? 'no value' : num(feat.series.value[i], dp(feat.series.value[i])) + ' ' + esc(feat.unit || '')}</b></div>`);
          rows.push(`<div class="tip-r"><span>Signed z (EWMA)</span><b>${signed(feat.series.ewma_z[i])}</b></div>`);
        }
        rows.push(`<div class="tip-r"><span>Index</span><b>${tl.composite[i] == null ? '-' : signed(tl.composite[i])}</b></div>`);
        rows.push(`<div class="tip-r"><span>CUSUM</span><b>${num(tl.cusum[i], 1)}</b></div>`);
        rows.push(`<div class="tip-r"><span>State</span><b>${chip(tl.state[i])}</b></div>`);
        if (tl.mood) rows.push(`<div class="tip-r"><span>Mood check-in</span><b>${tl.mood[i] == null ? '-' : V.lantern(tl.mood[i]) + ' ' + tl.mood[i]}</b></div>`);
        rows.push(`<div class="tip-r"><span>Game</span><b>${tl.played?.[i] ? 'played' : tl.missed?.[i] ? 'missed' : '-'}</b></div>`);
        return rows.join('');
      },
    });
  };

  V.lantern = (m) => `<i class="lantern" style="--m:var(--af-mood-${Math.max(1, Math.min(5, Math.round(m)))});--g:var(--af-mood-${Math.max(1, Math.min(5, Math.round(m)))}-glow)"></i>`;

  V.contrib = function (A, selected) {
    const cs = [...A.composite.contributions].sort((a, b) => b.contribution - a.contribution);
    const fm = Object.fromEntries(A.features.map((f) => [f.key, f]));
    const max = Math.max(0.4, ...cs.map((c) => Math.abs(c.contribution)));
    const rows = cs.map((c) => {
      const f = fm[c.key] || {};
      const w = (Math.abs(c.contribution) / max) * 50;
      const side = c.contribution >= 0 ? 'pos' : 'neg';
      const comp = A.completeness?.by_feature?.[c.key];
      return `<button class="crow" data-feature="${esc(c.key)}" aria-pressed="${selected === c.key}" title="Show ${esc(c.label)} on the timeline">
        <span class="crow-l"><b>${esc(c.label)}</b><span class="muted"><span class="ev" data-ev="${esc(f.evidence)}">${esc(f.evidence || '')}</span> · weight ${c.weight}${comp != null && comp < 0.7 ? ` · ${pct(comp)} data` : ''}</span></span>
        <span class="cbar"><span class="cbar-zero"></span><i class="${side}" style="width:${w.toFixed(1)}%"></i></span>
        <span class="crow-v af-num"><b>${signed(c.contribution)}</b><span class="muted">z ${signed(c.signed_z, 1)}</span></span>
      </button>`;
    }).join('');
    return card('c-contrib',
      title('What drives the index', 'Contribution of each feature, weight × signed z (EWMA). Click a row to see it on the timeline.'),
      `<div class="clegend af-caps"><span><i class="neg"></i>Better than usual</span><span><i class="pos"></i>Worse than usual</span></div><div class="crows">${rows}</div>`,
      `<span class="muted">Contributions add up to the index</span><b class="af-num">${signed(A.composite.value)}</b>`);
  };

  V.helps = function (A, name) {
    const B = A.bandit;
    if (!B?.arms?.length) return card('c-helps', title(`What helps ${esc(name)}`), '<p class="muted">Not enough sessions yet.</p>');
    const modes = ['calm', 'wake', 'fatigue', 'rest'].filter((m) => B.arms.some((a) => a.mode === m));
    const groups = modes.map((m) => {
      const arms = B.arms.filter((a) => a.mode === m).sort((a, b) => b.p_best - a.p_best);
      const best = B.by_mode?.[m]?.best;
      const only = arms.length === 1;
      return `<div class="hgroup"><div class="hgroup-h"><span class="mode-dot" style="--c:${C.modeColor(m)}"></span><span class="af-caps">${MODE_LABEL[m]}</span><span class="muted">${MODE_SUB[m] || ''}</span></div>
        ${arms.map((a) => {
          const isBest = !only && a.task_id === best && a.p_best >= 0.5;
          return `<div class="harm ${isBest ? 'best' : ''}" data-tip="${esc(`${a.label} in ${MODE_LABEL[m]}: helped ${a.helped} of ${a.n} times. Beta(${a.alpha}, ${a.beta}), mean ${pct(a.mean)}, 90% interval ${pct(a.ci90[0])} to ${pct(a.ci90[1])}. P(best) ${num(a.p_best)}.`)}">
            <span class="harm-l">${esc(a.label)}</span>
            <span class="ci"><span class="ci-50"></span><i style="left:${(a.ci90[0] * 100).toFixed(1)}%;width:${((a.ci90[1] - a.ci90[0]) * 100).toFixed(1)}%"></i><b style="left:${(a.mean * 100).toFixed(1)}%"></b></span>
            <span class="harm-n af-num muted">${a.helped}/${a.n}</span>
            <span class="harm-p af-num">${only ? '<span class="muted small">only task</span>' : `<span class="pbar"><i style="width:${(a.p_best * 100).toFixed(0)}%"></i></span>${num(a.p_best)}`}</span>
          </div>`;
        }).join('')}</div>`;
    }).join('');
    const nd = (B.next_day || []).map((r) => `<tr><td>${esc(r.label)}</td><td class="af-num">${signed(r.mood_diff, 1)}</td><td class="af-num">${signed(r.composite_diff)}</td><td class="af-num muted">${r.n_with} / ${r.n_without}</td></tr>`).join('');
    return card('c-helps',
      title(`What helps ${esc(name)}`, 'Share of tasks after which the pulse moved 2 bpm or more in the intended direction, with 90% interval', info('Thompson sampling on Beta(1, 1) priors per task and mode. P(best) is the probability that this task helps most in its mode. The next session is weighted by it.')),
      `${B.headline ? `<p class="headline">${esc(B.headline.text)}</p>` : ''}
       <div class="hscale af-caps"><span></span><span class="hscale-axis"><span>0%</span><span>50%</span><span>100%</span></span><span>Helped</span><span>P(best)</span></div>
       ${groups}
       ${nd ? `<details class="nextday"><summary>Next-day associations <span class="muted">(association, not causation)</span></summary><table><thead><tr><th></th><th>Mood next day</th><th>Index change</th><th>Days with / without</th></tr></thead><tbody>${nd}</tbody></table></details>` : ''}`);
  };

  V.summary = function (Sm) {
    if (!Sm) return card('c-summary', title('Weekly summary'), '<div class="loading small">Writing summary</div>');
    const gem = Sm.source === 'gemma';
    const label = gem ? `Generated on device · Gemma${Sm.model ? ' ' + esc(Sm.model) : ''}` : 'Template';
    const n = Sm.numbers || {};
    const facts = [
      ['State', n.state ? chip(n.state, n.state_label) : null],
      ['Index', n.composite != null ? `${signed(n.composite)} <span class="muted">(${signed(n.composite_trend_7d)} in 7 d)</span>` : null],
      ['Features available', n.completeness != null ? `${pct(n.completeness)} <span class="muted">${esc(n.confidence || '')}</span>` : null],
      ['Sessions', n.sessions_7d != null ? `${n.sessions_7d} of 7 days` : null],
      ['Drivers', (n.top_contributors || []).map((c) => `${esc(c.label)} <span class="muted">z ${signed(c.signed_z, 1)}</span>`).join('<br>') || null],
      ['Best calm task', n.best_calm_task ? `${esc(n.best_calm_task)} <span class="muted">P(best) ${num(n.best_calm_p_best)}</span>` : null],
      ['Pulse in play', n.pre_post_pulse_delta_median != null ? `${signed(n.pre_post_pulse_delta_median, 1)} bpm median` : null],
    ].filter(([, v]) => v != null);
    return card('c-summary',
      title('Weekly summary', `Days ${Sm.week_start_day} to ${Sm.week_end_day}`, `<span class="src-pill" data-src="${esc(Sm.source)}">${label}</span>`),
      `<div class="sum-grid"><p class="summary-text">${esc(Sm.text)}</p>${facts.length ? `<dl class="sum-facts"><dt class="af-caps sum-facts-h">Written only from these numbers</dt>${facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="af-num">${v}</dd></div>`).join('')}</dl>` : ''}</div>`,
      `<span class="muted small">${esc(Sm.disclaimer || '')}</span><button class="ghost-btn small" data-action="refresh-summary">Regenerate</button>`);
  };

  function slope(a, b, lo, hi, good) {
    if (a == null || b == null) return '<svg class="slope" width="30" height="16"></svg>';
    const y = C.scale(lo, hi, 13, 3);
    const c = good == null ? C.css('--af-silver-300') : good ? C.css('--af-aurora-teal') : C.css('--af-lantern-amber');
    return `<svg class="slope" width="30" height="16" viewBox="0 0 30 16" aria-hidden="true"><line x1="4" y1="${y(a).toFixed(1)}" x2="26" y2="${y(b).toFixed(1)}" stroke="${c}" stroke-width="1.75" stroke-linecap="round"/><circle cx="4" cy="${y(a).toFixed(1)}" r="2" fill="${C.css('--af-silver-500')}"/><circle cx="26" cy="${y(b).toFixed(1)}" r="2.6" fill="${c}"/></svg>`;
  }

  V.sessions = function (A, D) {
    const pp = [...(A.pre_post || [])].reverse();
    const ps = A.pre_post_summary || {};
    const rowsHtml = pp.map((s) => {
      const p = s.pulse || {}, h = s.head_pitch || {}, e = s.eye_openness || {}, m = s.mood || {};
      return `<tr data-session="${esc(s.session_id)}">
        <td><b>${dateShort(s.date)}</b><span class="muted af-num">day ${s.day}</span></td>
        <td><span class="status-tag" data-s="${esc(s.status)}">${esc((s.status || '').replace('_', ' '))}</span>${s.profile && s.profile !== 'live' ? `<span class="muted">${esc(s.profile.replace('_', ' '))}</span>` : ''}${s.simulated ? '' : '<span class="muted">measured</span>'}</td>
        <td class="mcell">${slope(0, p.delta, -8, 8, p.delta == null ? null : p.delta <= -2 ? true : p.delta >= 2 ? false : null)}<span class="af-num">${num(p.start, 0)} → ${num(p.end, 0)}<small class="${p.delta <= -2 ? 'good' : ''}">${signed(p.delta, 1)} bpm</small></span></td>
        <td class="mcell">${slope(h.start, h.end, -15, 5, h.delta == null ? null : h.delta >= 2 ? true : null)}<span class="af-num">${h.delta == null ? '<span class="muted">not tracked</span>' : signed(h.delta, 1) + '°'}<small>head pitch</small></span></td>
        <td class="mcell">${slope(e.start, e.end, 0.3, 0.9, null)}<span class="af-num">${e.start == null && e.end == null ? '<span class="muted">not tracked</span>' : `${num(e.start)} → ${num(e.end)}`}<small>openness</small></span></td>
        <td class="mood-cell">${m.start != null ? V.lantern(m.start) : '<i class="lantern none"></i>'}<span class="muted">→</span>${m.end != null ? V.lantern(m.end) : '<i class="lantern none"></i>'}<span class="af-num muted">${m.delta != null ? signed(m.delta, 0) : ''}</span></td>
      </tr>`;
    }).join('');
    return card('c-sessions',
      title('Recent sessions', 'How each game session changed the body, start to end'),
      `<div class="pp-sum">
         <div><b class="af-num">${signed(ps.pulse_delta_median, 1)}<small> bpm</small></b><span class="muted">median pulse change</span></div>
         <div><b class="af-num">${pct(ps.settled_share)}</b><span class="muted">sessions that settled (−2 bpm or more)</span></div>
         <div><b class="af-num">${signed(ps.mood_delta_median, 1)}</b><span class="muted">median mood change</span></div>
       </div>
       <table class="pp"><thead><tr><th>Session</th><th>Status</th><th>Pulse</th><th>Posture</th><th>Eyes</th><th>Mood</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="6" class="muted">No sessions in the last 7 days.</td></tr>'}</tbody></table>`);
  };

  const EVERYDAY = [
    { k: 'sleep', label: 'Time in bed', unit: 'h', get: (d) => d.sleep?.time_in_bed_h, fmt: (v) => num(v, 1), sim: 'sleep' },
    { k: 'mid', label: 'Sleep midpoint', unit: '', get: (d) => d.sleep?.sleep_midpoint_h, fmt: hhmm, sim: 'sleep', min: 0 },
    { k: 'rest', label: 'Night restlessness', unit: '', get: (d) => d.sleep?.restlessness_events, fmt: (v) => num(v, 0), sim: 'sleep' },
    { k: 'pulse', label: 'Morning pulse', unit: 'bpm', get: (d) => d.morning_pulse_bpm, fmt: (v) => num(v, 0), sim: 'morning_pulse_bpm', floorMin: true },
    { k: 'home', label: 'Hours at home', unit: 'h', get: (d) => d.presence?.home_hours, fmt: (v) => num(v, 1), sim: 'presence', max: 24 },
    { k: 'vis', label: 'Visitors', unit: '', get: (d) => d.presence?.visitors_count, fmt: (v) => num(v, 0), sim: 'presence' },
    { k: 'steps', label: 'Steps', unit: '', get: (d) => d.steps, fmt: (v) => (v == null ? '-' : Math.round(v).toLocaleString('en-US')), sim: 'steps' },
  ];

  V.everyday = function (D, A) {
    const days = (D?.daily || []).filter((d) => d.day_complete !== false).sort((a, b) => a.day_index - b.day_index);
    if (!days.length) return card('c-everyday', title('Everyday', 'Bedside unit and phone, passive'), '<p class="muted">No daily records yet.</p>');
    const N = 28;
    const recent = days.slice(-N);
    const base = days.filter((d) => d.day_index <= 13);
    const anySim = days.some((d) => d.simulated);
    const rows = EVERYDAY.map((m) => {
      const vals = recent.map(m.get);
      const bv = base.map(m.get).filter((v) => v != null).sort((a, b) => a - b);
      const usual = bv.length ? bv[Math.floor(bv.length / 2)] : null;
      let li = vals.length - 1;
      while (li > 0 && vals[li] == null) li--;
      const isSim = recent.some((d) => d.simulated && (!d.simulated_fields || d.simulated_fields.includes(m.sim) || d.simulated_fields.includes('*')));
      const finite = vals.filter((v) => v != null);
      const min = m.min ?? (m.floorMin && finite.length ? Math.min(...finite, usual ?? Infinity) - 4 : 0);
      return `<div class="erow">
        <span class="erow-l"><b>${m.label}</b>${isSim ? '<span class="sim-dot" title="Simulated">SIM</span>' : ''}</span>
        <span class="erow-c">${C.bars(vals, { w: 240, h: 30, ref: usual, min, max: m.max, title: (i, v) => `${dateShort(recent[i].date)}: ${m.fmt(v)} ${m.unit}` })}</span>
        <span class="erow-v af-num"><b>${m.fmt(vals[li])}<small>${m.unit ? ' ' + m.unit : ''}</small></b><span class="muted">usual ${m.fmt(usual)}</span></span>
      </div>`;
    }).join('');
    const light = days.slice(-7).filter((d) => d.bedside_light?.morning_light_min > 0).length;
    return card('c-everyday',
      title('Everyday', `Bedside unit and phone, passive · last ${recent.length} days`, sim(anySim)),
      `<div class="erows">${rows}</div>`,
      `<span class="muted">Dashed line: usual (median of days 0 to 13). Last bar: latest day.</span><span class="muted af-num">Dawn light ${light} of 7 mornings</span>`);
  };

  V.live = function (S, id) {
    const L = S.live[id];
    const bed = S.bedside;
    const row = S.list?.patients.find((p) => p.id === id);
    const A = S.analytics[id];
    const active = L && L.active;
    const pose = S.pose[id];
    const freshPose = pose && Date.now() - pose.at < 5000 ? pose : null;
    const status = active ? '<span class="live-pill"><i></i>Live now</span>' : L && L.endedAt ? `<span class="idle-pill">${L.interrupted ? 'Session interrupted' : 'Session ended'}</span>` : '<span class="idle-pill">No session running</span>';
    const basePulse = A?.director?.baseline_pulse_bpm;
    let main;
    if (active || (L && L.endedAt)) {
      const mode = L.mode;
      const pulse = L.pulse_bpm;
      const d = pulse != null && basePulse ? pulse - basePulse : null;
      main = `<div class="live-grid">
        <div class="stick-box">${C.stickFigure(freshPose, { pitch: L.head_pitch_deg })}<span class="stick-l">${freshPose ? (freshPose.simulated ? '<span class="af-simulated">Simulated pose</span>' : 'Bedside pose') : L.simulated !== false ? '<span class="af-simulated">Simulated pose</span>' : 'Head pitch only'}</span></div>
        <div class="live-now">
          <div class="live-mode">${mode ? `<span class="mode-chip" style="--c:${C.modeColor(mode)}"><i></i>${MODE_LABEL[mode] || esc(mode)}</span>` : ''}<span class="muted">${esc(PHASE_LABEL[L.phase] || L.phase || '')}${L.task_id ? ' · ' + esc(TASK_LABEL[L.task_id] || L.task_id) : ''}</span></div>
          <div class="live-pulse"><b class="af-num" data-k="pulse">${pulse == null ? '-' : Math.round(pulse)}</b><span>bpm</span>${L.pulse_source === 'simulated' || L.simulated ? sim(true) : ''}</div>
          <div class="muted af-num">${basePulse ? `usual ${Math.round(basePulse)} · ${d == null ? '' : signed(d, 0) + ' bpm'}` : ''}</div>
        </div>
      </div>
      <div class="trace-box">${C.trace(L.trace || [], { ref: basePulse, len: 120 })}<span class="af-caps muted">Pulse, last 60 s</span></div>
      <div class="live-metrics">
        <div><span class="af-caps muted">Eye openness</span><b class="af-num">${num(L.eye_openness)}</b><span class="meter"><i style="width:${Math.round((L.eye_openness ?? 0) * 100)}%"></i></span></div>
        <div><span class="af-caps muted">PERCLOS</span><b class="af-num">${pct(L.perclos)}</b><span class="meter"><i style="width:${Math.round((L.perclos ?? 0) * 100)}%"></i></span></div>
        <div><span class="af-caps muted">Head pitch</span><b class="af-num">${L.head_pitch_deg == null ? '-' : signed(L.head_pitch_deg, 0) + '°'}</b><span class="muted small">${L.face_tracked === false ? 'face not tracked' : 'tracked'}</span></div>
      </div>`;
    } else {
      const last = A?.pre_post?.[A.pre_post.length - 1];
      main = `<div class="live-grid idle">
        <div class="stick-box empty">${C.stickFigure(null, { pitch: -8 })}<span class="stick-l">During a session</span></div>
        <div class="live-now">
          <span class="af-caps muted">Last session</span>
          <p class="idle-text">${row?.last_session_iso ? relDay(row.last_session_iso, S.list.date) : 'No session yet'}</p>
          ${last ? `<p class="muted">${esc((last.status || '').replace('_', ' '))}${last.profile && last.profile !== 'live' ? ' · ' + esc(last.profile.replace('_', ' ')) : ''}</p>` : ''}
          <p class="muted small">When ${esc(row?.display_name || 'the patient')} plays, mode, pulse and posture appear here live.</p>
        </div>
      </div>
      ${last ? `<div class="live-metrics last-pp">
        <div><span class="af-caps muted">Pulse</span><b class="af-num">${num(last.pulse?.start, 0)} → ${num(last.pulse?.end, 0)}</b><span class="muted small af-num">${signed(last.pulse?.delta, 1)} bpm</span></div>
        <div><span class="af-caps muted">Head pitch</span><b class="af-num">${last.head_pitch?.delta == null ? '<span class="muted">-</span>' : signed(last.head_pitch.delta, 1) + '°'}</b><span class="muted small">${last.head_pitch?.delta == null ? 'face not tracked' : 'start to end'}</span></div>
        <div><span class="af-caps muted">Mood</span><b>${last.mood?.start != null ? V.lantern(last.mood.start) : '-'} <span class="muted">→</span> ${last.mood?.end != null ? V.lantern(last.mood.end) : '-'}</b><span class="muted small af-num">${last.mood?.start ?? '-'} → ${last.mood?.end ?? '-'}</span></div>
      </div>` : ''}`;
    }
    const bedHtml = bed ? (() => {
      const l = bed.light || {};
      const on = l.level > 0;
      return `<div class="bed">
        <span class="orb" style="--c:${esc(l.rgb || '#000')};--a:${on ? Math.min(1, 0.35 + l.level / 80) : 0}" data-on="${on}"></span>
        <span class="bed-t"><b>Bedside light ${on ? `${l.level}%` : 'off'}${bed.simulated ? ' <span class="sim-dot">SIMULATED</span>' : ''}</b><span class="muted">${esc(l.reason || '')}${l.rgb && on ? ' · ' + esc(l.rgb) : ''}</span></span>
        <span class="bed-t"><b>${bed.presence?.in_bed ? 'In bed' : 'Not in bed'}</b><span class="muted af-num">${bed.presence?.in_bed && bed.presence.since_iso ? 'since ' + timeOf(bed.presence.since_iso) : ''}${bed.thermo?.temp_c != null ? ` · ${num(bed.thermo.temp_c, 1)} °C` : ''}</span></span>
      </div>`;
    })() : '<div class="bed muted">Bedside unit not connected</div>';
    const bedFor = bed && (!bed.patient_id || bed.patient_id === id) ? bedHtml : '<div class="bed muted">No bedside unit paired with this patient</div>';
    return { status, body: main + bedFor + `<p class="privacy-note">Never video. Numbers and a stick figure only.</p>` };
  };

  const dnum = (v) => (v == null ? '-' : Number.isInteger(+v) ? String(v) : (+v).toFixed(1));
  const dplural = (v, unit) => `${dnum(v)}<small> ${unit}${+v === 1 ? '' : 's'}</small>`;

  V.validation = function (S) {
    const v = S.validation;
    if (!v) return `<section class="page"><div class="loading">Loading validation</div></section>`;
    if (v.status === 'computing') return `<section class="page"><div class="loading">Validation is computing on the hub (about a minute after start)</div></section>`;
    const r = v.relapse, st = v.stable, b = v.bandit;
    const iqr = (o) => (o?.iqr ? `IQR ${dnum(o.iqr[0])} to ${dnum(o.iqr[1])}` : '');
    const best = esc(TASK_LABEL[b.true_best.task_id] || b.true_best.task_id);
    const tiles = [
      [dplural(r.days_onset_to_check_in.median, 'day'), 'from relapse onset to “consider a call”', iqr(r.days_onset_to_check_in)],
      [`${Math.round(r.detected_share * 100)}<small>%</small>`, 'of simulated relapses reached “consider a call”', `${v.n_seeds} relapse seeds`],
      [`${num(st.false_alarms_per_patient_month)}`, 'false call suggestions per patient-month, stable controls', `${st.false_check_in_episodes} episodes in ${st.patient_days} patient-days`],
      (() => {
        const mm = r.mood_only_at_matched_false_alarms, bk = mm?.best_k;
        if (!mm?.days_onset_to_flag?.median) return [dplural(r.lead_time_vs_mood_only_days.median, 'day'), 'earlier than a mood-only rule, same CUSUM', iqr(r.lead_time_vs_mood_only_days)];
        const lo = Math.min(mm.days_onset_to_flag.median, bk?.days_onset_to_flag?.median ?? Infinity);
        const hi = Math.max(mm.days_onset_to_flag.median, bk?.days_onset_to_flag?.median ?? -Infinity);
        const shares = [mm.detected_share, bk?.detected_share].filter((x) => x != null).map((x) => Math.round(x * 100));
        return [`${dnum(r.days_onset_to_check_in.median)}<small> vs ${dnum(lo)}${hi > lo ? '-' + dnum(hi) : ''} days</small>`, 'to “consider a call” at equal false alarms, full index vs mood alone', `flagged ${Math.round(r.detected_share * 100)}% vs ${Math.min(...shares)}${Math.max(...shares) > Math.min(...shares) ? '-' + Math.max(...shares) : ''}%, ${mm.false_check_in_episodes} false episodes each`];
      })(),
      [dplural(b.sessions_to_p_best_0_8.median, 'session'), `until P(best) of ${best} stays above ${b.target_p_best ?? 0.8}`, `${iqr(b.sessions_to_p_best_0_8)}${b.sessions_to_first_p_best_0_8 ? `, first reached after ${dnum(b.sessions_to_first_p_best_0_8.median)}` : ''}`],
    ].map(([n, l, s]) => `<div class="vkpi"><b class="af-num">${n}</b><span>${l}</span><span class="muted af-num">${s}</span></div>`).join('');
    const timing = [
      ['Watch', r.days_onset_to_watch, C.stateColor('watch')],
      ['Consider a call', r.days_onset_to_check_in, C.stateColor('check_in')],
      ['Consider booster discussion', r.days_onset_to_booster, C.stateColor('booster')],
      ['Mood alone, equal false alarms', r.mood_only_at_matched_false_alarms?.best_k?.days_onset_to_flag || r.mood_only_rule_days_onset_to_flag, C.css('--af-silver-400')],
    ].filter(([, o]) => o?.iqr);
    const tmax = Math.max(28, ...timing.map(([, o]) => o.iqr[1] + 2));
    const ticks = [0, 7, 14, 21, 28, 35].filter((t) => t <= tmax);
    const timingHtml = `<div class="trange">${timing.map(([l, o, c]) => `<div class="tr-row" data-tip="${esc(`${l}: median ${dnum(o.median)} days after onset, IQR ${dnum(o.iqr[0])} to ${dnum(o.iqr[1])}${o.n != null ? `, n = ${o.n}` : ''}`)}"><span class="tr-l">${l}</span><span class="tr-track"><i style="left:${(o.iqr[0] / tmax) * 100}%;width:${(Math.max(0.3, o.iqr[1] - o.iqr[0]) / tmax) * 100}%;--c:${c}"></i><b style="left:${(o.median / tmax) * 100}%;--c:${c}"></b></span><span class="tr-v af-num">${dnum(o.median)} d</span></div>`).join('')}
      <div class="tr-row tr-axis"><span></span><span class="tr-track">${ticks.map((t) => `<em style="left:${(t / tmax) * 100}%">${t}</em>`).join('')}</span><span></span></div></div>`;
    const modes = Object.entries(b.by_mode || {}).map(([m, o]) => `<span><span class="mode-dot" style="--c:${C.modeColor(m)}"></span>${MODE_LABEL[m] || m} <b class="af-num">${dnum(o.sessions_to_p_best_0_8?.median)}</b> <span class="muted af-num">sessions, settled in ${pct(o.found_share_by_day_56)}</span></span>`).join('');
    const sens = (v.sensitivity || []).length;
    return `<section class="page validation">
      <div class="page-head">
        <div class="page-title">
          <p class="eyebrow af-caps">Dimension 3 · analytics</p>
          <h1>Validation on synthetic patients</h1>
          <p class="lede">${v.n_seeds} simulated relapse patients (gradual relapse from day ${r.onset_day}) and ${st.patients ?? v.n_seeds} stable controls, run day by day through the same engine the clinic view uses.</p>
        </div>
        <div class="vbadges">${sim(true)}${v.untuned ? '<span class="af-simulated untuned">Untuned</span>' : ''}<span class="af-simulated untuned">Not clinically validated</span><p class="disclaimer">${esc(v.disclaimer)}</p></div>
      </div>
      <div class="vkpis">${tiles}</div>
      <div class="grid">
        ${card('c-vex', title('Early-warning index, one example', 'Relapse patient against a stable control'), '<div id="v-ex"></div>', '<span class="legend"><i style="--c:var(--af-clinic-line-primary)"></i>Relapse (Anna)</span><span class="legend"><i style="--c:var(--af-aurora-teal)"></i>Stable control (Mikko)</span>')}
        ${card('c-vtiming', title('Time from onset to each suggestion', 'Median and interquartile range across seeds, days'), timingHtml, `<span class="muted">Mood alone: the same CUSUM on the mood check-in only, threshold raised until its false alarms match the full index. Dot: median. Bar: interquartile range.</span>`)}
        ${card('c-vcusum', title('CUSUM, same example', 'Accumulated drift with state thresholds'), '<div id="v-cusum"></div>', '<span class="legend"><i style="--c:var(--af-clinic-line-primary)"></i>Relapse</span><span class="legend"><i style="--c:var(--af-aurora-teal)"></i>Stable control</span>')}
        ${card('c-vbandit', title('How fast it learns what helps', `P(best) of the truly best calm task (${best}) by session, one example`), '<div id="v-bandit"></div>', modes ? `<div class="vmodes">${modes}</div>` : `<span class="muted">Found by day 56 in ${pct(b.found_share_by_day_56)} of seeds.</span>`)}
        ${sens ? card('c-vsens', title('Sensitivity', 'Each dot is one CUSUM setting: earlier calls cost more false alarms'), '<div id="v-sens"></div>', '<span class="muted">Grey: other settings of k (CUSUM slack) and call threshold. Hover a dot for details.</span>') : ''}
      </div>
    </section>`;
  };

  V.drawValidation = function (S) {
    const v = S.validation;
    if (!v?.example) return;
    const ex = v.example, a = ex.anna, m = ex.mikko;
    const amber = C.css('--af-clinic-line-primary'), teal = C.css('--af-aurora-teal');
    const days = a.days;
    const dtick = (d) => (d === 0 ? 'TMS end' : 'day ' + d);
    const xt = [0, 14, 28, 42, 56].filter((d) => d <= days[days.length - 1]);
    const tipFor = (i) => `<div class="tip-h">Day ${days[i]}</div><div class="tip-r"><span>Relapse index</span><b>${signed(a.composite[i])}</b></div><div class="tip-r"><span>Stable index</span><b>${signed(m.composite[i])}</b></div><div class="tip-r"><span>CUSUM</span><b>${num(a.cusum[i], 1)} / ${num(m.cusum[i], 1)}</b></div><div class="tip-r"><span>State</span><b>${chip(a.state[i])}</b></div>`;
    const marks = [{ x: a.onset_day, label: 'Onset', color: C.css('--af-silver-300') }];
    if (a.first_check_in_day != null) marks.push({ x: a.first_check_in_day, label: 'Call suggested', color: C.stateColor('check_in') });
    const el1 = document.getElementById('v-ex');
    if (el1) C.lineChart(el1, {
      x: days, h: 250, aria: 'Example early-warning index',
      series: [{ values: m.composite, color: teal, width: 1.75, opacity: 0.9, label: 'Stable' }, { values: a.composite, color: amber, glow: true, fill: true, label: 'Relapse' }],
      marks, xticks: xt, xtick: dtick, ytick: (t) => num(t, 1), tip: tipFor,
    });
    const th = v.params?.thresholds || { watch: 1.5, check_in: 3, booster: 8 };
    const el2 = document.getElementById('v-cusum');
    if (el2) C.lineChart(el2, {
      x: days, h: 220, min: 0, aria: 'Example CUSUM',
      series: [{ values: m.cusum, color: teal, width: 1.75, label: 'Stable' }, { values: a.cusum, color: amber, glow: true, fill: true, label: 'Relapse' }],
      hlines: [{ y: th.check_in, label: 'Call ' + th.check_in, color: C.stateColor('check_in') }, { y: th.booster, label: 'Booster ' + th.booster, color: C.stateColor('booster') }],
      marks: marks.slice(0, 1), xticks: xt, xtick: dtick, ytick: (t) => num(t, 0), tip: tipFor, mr: 92,
    });
    const bp = ex.bandit_p_best;
    const el3 = document.getElementById('v-bandit');
    if (el3 && bp?.sessions) {
      const keys = Object.keys(bp).filter((k) => k !== 'sessions' && Array.isArray(bp[k]));
      const colors = [amber, C.css('--af-silver-400'), teal];
      C.lineChart(el3, {
        x: bp.sessions, h: 220, min: 0, max: 1, aria: 'Bandit learning curve',
        series: keys.map((k, i) => ({ values: bp[k], color: colors[i % 3], glow: i === 0, fill: i === 0, width: i === 0 ? 2 : 1.5, label: TASK_LABEL[k] || k })),
        hlines: [{ y: 0.8, label: '0.8', color: C.css('--af-silver-300') }],
        xticks: bp.sessions.filter((s) => s === 1 || s % 10 === 0), xtick: (s) => s, ytick: (t) => num(t, 1), mr: 92,
        tip: (i) => `<div class="tip-h">Session ${bp.sessions[i]}</div>${keys.map((k) => `<div class="tip-r"><span>P(best) ${esc(TASK_LABEL[k] || k)}</span><b>${num(bp[k][i])}</b></div>`).join('')}`,
      });
    }
    const el4 = document.getElementById('v-sens');
    const sv = (v.sensitivity || []).filter((p) => p.days_onset_to_check_in?.median != null);
    if (el4 && sv.length) {
      const W = Math.max(280, el4.clientWidth), H = 220, ML = 44, MR = 20, top = 14, bottom = H - 30;
      const xs = sv.map((p) => p.false_alarms_per_patient_month), ys = sv.map((p) => p.days_onset_to_check_in.median);
      const x = C.scale(0, Math.max(...xs) * 1.15 || 0.1, ML, W - MR);
      const ylo = Math.min(...ys) - 1, yhi = Math.max(...ys) + 1;
      const y = C.scale(ylo, yhi, bottom, top);
      const g = [];
      C.niceTicks(ylo, yhi, 4).forEach((t) => g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y(t)}" y2="${y(t)}" stroke="${C.css('--af-clinic-grid')}"/><text x="${ML - 10}" y="${y(t) + 4}" class="ax" text-anchor="end">${t}</text>`));
      C.niceTicks(0, x.domain[1], 4).forEach((t) => g.push(`<text x="${x(t)}" y="${bottom + 20}" class="ax" text-anchor="middle">${num(t, 2)}</text>`));
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${bottom}" y2="${bottom}" stroke="${C.css('--af-clinic-border-strong')}"/>`);
      g.push(`<text x="${ML}" y="${top - 2}" class="ax-note">days to call</text><text x="${W - MR}" y="${bottom - 8}" class="ax-note" text-anchor="end">false alarms per patient-month</text>`);
      sv.forEach((p) => {
        const cx = x(p.false_alarms_per_patient_month), cy = y(p.days_onset_to_check_in.median);
        const tipTxt = `k ${p.k}, call at ${p.check_in}: ${dnum(p.days_onset_to_check_in.median)} days to call, ${num(p.false_alarms_per_patient_month, 3)} false alarms per patient-month, ${pct(p.detected_share)} of relapses reached a call`;
        g.push(`<circle cx="${cx}" cy="${cy}" r="${p.current ? 7 : 5}" fill="${p.current ? C.css('--af-lantern-amber') : C.css('--af-silver-400')}" opacity="${p.current ? 1 : 0.6}" stroke="${C.css('--af-night-800')}" stroke-width="2" ${p.current ? 'style="filter:drop-shadow(0 0 6px rgba(242,181,68,0.7))"' : ''} data-tip="${esc(tipTxt)}"/>`);
        if (p.current) g.push(`<text x="${cx + 12}" y="${cy + 4}" class="ax" fill="${C.css('--af-lantern-glow')}">in use: k ${p.k}, call at ${p.check_in}</text>`);
      });
      el4.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sensitivity of detection delay against false alarms">${g.join('')}</svg>`;
    }
  };
})();
