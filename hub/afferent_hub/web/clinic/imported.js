(() => {
  const C = window.C, V = C.views, esc = C.esc;
  const { num, signed, pct, dateShort, dateTiny } = V.fmt;
  const icon = (n, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${n}</span>`;
  const info = (t) => `<button class="info" type="button" aria-label="${esc(t)}" data-tip="${esc(t)}">${icon('info')}</button>`;
  const MINUS = '−';

  const STATE = {
    booster: ['Booster review', 'medical_services', 'Consider booster'],
    check_in: ['Check-in', 'call', 'Consider check-in call'],
    watch: ['Watch', 'insights', 'Watch'],
    stable: ['Stable', 'check', 'Stable'],
  };
  const NONE = ['Not enough data yet', 'schedule', 'Not enough data yet'];
  const NOT_REACHED = 'Safety item not reached';
  const look = (s) => STATE[s] || (s == null ? NONE : STATE.stable);
  const RANK = { booster: 0, check_in: 1, watch: 2, stable: 3 };
  const TIER_RANK = { high: 0, moderate: 1, incomplete: 2, low: 3 };
  const TIER = { high: 'High', moderate: 'Moderate', incomplete: 'Incomplete', low: 'Low', not_answered: 'Not reached' };
  const BAND = { minimal: 'Minimal', mild: 'Mild', moderate: 'Moderate', moderately_severe: 'Moderately severe', severe: 'Severe' };
  const SCREEN = { crisis: 'Crisis screen (112)', support: 'Support screen', thank_you: 'Thank-you screen', saved: 'Saved screen' };
  const FEAT = {
    rt_median: ['Reaction time', 'ms', 0, '↑'],
    mood: ['Mood', 'of 5', 1, '↓'],
    sleep_regularity: ['Sleep regularity', 'IS', 2, '↓'],
    missed_sessions: ['Missed mornings', 'd/wk', 1, '↑'],
    effort_hard_prop: ['Effort', 'share hard', 2, '↓'],
    morning_pulse: ['Resting pulse', 'bpm', 1, '↑'],
    home_only_days: ['Days home', 'd/wk', 1, '↑'],
    upright_frac: ['Upright', 'share', 2, '↓'],
    reward_bias: ['Reward bias', 'log b', 2, '↓'],
  };
  const EXPLORATORY = new Set(['upright_frac', 'reward_bias']);
  const SENSOR = { phone_camera: 'Phone camera', pulse_stone: 'Pulse stone', bedside_camera: 'Bedside camera', bedside_light: 'Bedside light', phone_presence: 'Phone presence', phone_motion: 'Phone motion' };

  const dayIso = (B, d) => { const t = new Date(B.period.tms_end_date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  const tiny = (B, d) => { const s = dateShort(dayIso(B, d)); return s.slice(4); };
  const dayStr = (B, d) => (d == null ? '-' : tiny(B, d));
  const hm = (m) => (m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  const week = (d) => Math.max(1, Math.floor((d - 1) / 7) + 1);
  const weeks = (B) => `Wk ${week(B.period.from_day)}–${week(B.period.to_day)} post-TMS`;
  const intSigned = (n) => (n > 0 ? '+' : n < 0 ? MINUS : '') + Math.abs(n);
  const chip = (s) => { const x = look(s); return `<span class="st" data-state="${esc(s ?? 'none')}">${icon(x[1])}${x[0]}</span>`; };
  const flagged = (B) => (B.safety || []).filter((s) => s.tier in TIER_RANK);
  const topTier = (B) => flagged(B).sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])[0]?.tier || null;
  const DIR = { '↑': 'up', '↓': 'down' };
  const reason = (k) => (FEAT[k] ? `${esc(FEAT[k][0])} <span role="img" aria-label="${DIR[FEAT[k][3]]}">${FEAT[k][3]}</span>` : esc(k));
  const fmtV = (k, v) => (v == null ? '-' : num(v, FEAT[k]?.[2] ?? 2));

  const received = (imp) => C.scanFmt.when(imp.scanned_iso);
  const range = (B) => `${dateTiny(dayIso(B, Math.max(0, B.period.from_day)))}–${dateTiny(dayIso(B, B.period.to_day))}`;
  const status = (B) => { const t = topTier(B); return t ? `<span class="st" data-state="safety">${icon('shield')}Safety: ${esc(TIER[t].toLowerCase())}</span>` : chip(B.state.shown); };
  const newest = (a, b) => String(b.scanned_iso).localeCompare(String(a.scanned_iso));

  V.exportsAll = () => (C.codes ? C.codes.all() : []).sort(newest);
  V.exportsVisible = (S) => {
    const q = (S.ui.q || '').trim().toLowerCase();
    return V.exportsAll().filter((imp) => !q || C.codes.label(imp).toLowerCase().includes(q));
  };

  const rowMenu = (imp) => `<span class="xmenu-wrap"><button class="icon-btn" data-codes="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More">${icon('more_vert')}</button>
      <span class="menu xmenu" role="menu" hidden>
        <button role="menuitem" data-codes="download" data-cti="${esc(imp.cti)}">${icon('download')}Download JSON</button>
        <button role="menuitem" data-codes="delete" data-cti="${esc(imp.cti)}">${icon('delete')}Delete</button>
        <button role="menuitem" data-codes="forget" data-cti="${esc(imp.cti)}">${icon('phonelink_erase')}Forget phone</button>
      </span></span>`;

  V.exportRow = (imp, sel) => {
    const B = imp.body;
    return `<div class="erow" role="listitem" data-cti="${esc(imp.cti)}" aria-current="${sel}">
      <a class="erow-main" href="#/e/${encodeURIComponent(imp.cti)}">
        <span class="erow-name"><b>${esc(C.codes.label(imp))}</b>${B.sim ? '<span class="sim-badge small">Simulated</span>' : ''}</span>
        <span class="erow-range num">${esc(range(B))}</span>
        ${status(B)}
      </a>
      ${rowMenu(imp)}
    </div>`;
  };

  V.exportsEmpty = () => `<div class="xempty">${icon('qr_code_scanner')}<button class="btn filled" data-codes="scan">Scan QR</button></div>`;

  V.exportList = (S, sel) => {
    const rows = V.exportsVisible(S);
    return `<h1 class="page-title">Patients</h1>
      <div class="plist elist" role="list">${rows.length ? rows.map((imp) => V.exportRow(imp, imp.cti === sel)).join('') : '<div class="empty-row">No match</div>'}</div>`;
  };

  V.exportPanes = (S, sel) => (V.exportsAll().length
    ? `<div class="panes xpanes"><section class="list-pane" id="list-pane" aria-label="Exports">${V.exportList(S, sel)}</section><aside class="detail-pane" id="detail-pane" aria-label="Export">${V.exportDetail(S, sel)}</aside></div>`
    : `<section class="page">${V.exportsEmpty()}</section>`);

  function history(imp) {
    const all = V.exportsAll().filter((x) => x.record_id === imp.record_id);
    if (all.length < 2) return '';
    return `<section><div class="sect-h"><h2>Exports</h2><span class="muted num">${all.length}</span></div><div class="ehist">${all.map((x) => `<a class="ehrow" href="#/e/${encodeURIComponent(x.cti)}" aria-current="${x.cti === imp.cti}" title="Received via QR">${icon('qr_code_2')}<span class="vh">Received via QR </span><span class="num">${esc(received(x))}</span><span class="muted num">${esc(range(x.body))}</span></a>`).join('')}</div></section>`;
  }

  function safetyBanner(B) {
    const fl = flagged(B), other = (B.safety || []).filter((s) => s.tier === 'not_answered');
    const talk = B.talk || [];
    const lost = B.omitted?.safety_entries || 0;
    if (!fl.length && !other.length && !talk.length) return '';
    const line = (s) => {
      const bits = [`${dayStr(B, s.day)} ${hm(s.minute)}`];
      if (s.tier === 'not_answered') bits.push(NOT_REACHED);
      else {
        bits.push(TIER[s.tier]);
        bits.push(s.source === 'item9_fallback' ? 'PHQ-9 item 9' : 'C-SSRS');
        if (s.c6_repeat) bits.push('Lifetime, unchanged');
      }
      if (SCREEN[s.screen] && s.tier !== 'not_answered') bits.push(SCREEN[s.screen]);
      return `<li data-tier="${esc(s.tier)}">${bits.map(esc).join(' · ')}</li>`;
    };
    const items = (B.safety || []).map(line).join('') + talk.map((t) => `<li>${icon('chat_bubble')}Asked to talk · ${esc(dayStr(B, t.day))} ${hm(t.minute)}</li>`).join('');
    const top = topTier(B);
    if (!top) {
      return `<div class="banner" data-kind="talk">${icon(talk.length ? 'chat_bubble' : 'info')}
        <div><b>${talk.length ? 'Asked to talk' : NOT_REACHED}</b><ul class="sf-list">${items}</ul></div></div>`;
    }
    return `<div class="banner" data-kind="safety" role="alert">${icon('shield')}
      <div><b>Safety: ${esc(TIER[top].toLowerCase())}</b><ul class="sf-list">${items}</ul>
        ${lost ? `<p>+${lost} older omitted</p>` : ''}</div>
    </div>`;
  }

  function stateBanner(B) {
    const s = B.state.shown, x = look(s);
    const reasons = (B.contrib || []).filter((c) => c.contribution > 0.15).slice(0, 3).map((c) => reason(c.key));
    const ph = B.phq.history || [], last = ph[ph.length - 1];
    const phqRaised = B.state.phq_state && RANK[B.state.phq_state] < (RANK[B.state.cusum] ?? 9) && RANK[B.state.phq_state] <= RANK[s];
    return `<div class="banner sbanner" data-kind="state" data-state="${esc(s ?? 'none')}">${icon(x[1])}
      <div><b>${esc(x[2])}</b>
        <p>${s == null ? 'No sessions' : reasons.length ? reasons.join(' · ') : s === 'stable' ? 'All steady' : 'Small drift'}</p>
        ${phqRaised && last ? `<p>PHQ-9 ${last.total}${B.phq.baseline != null ? ` · ${intSigned(last.total - B.phq.baseline)} vs discharge` : ''}</p>` : ''}
</div>
    </div>`;
  }

  function drivers(B) {
    const cs = [...(B.contrib || [])].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5);
    if (!cs.length) return '';
    const max = Math.max(0.3, ...cs.map((c) => Math.abs(c.contribution)));
    return `<section><div class="sect-h"><h2>Drivers</h2>${info('Share of index')}</div><div class="moved">${cs.map((c) => {
      const worse = c.contribution > 0;
      return `<div class="mrow"><span>${esc(FEAT[c.key]?.[0] || c.key)}</span><span class="mbar"><i class="${worse ? '' : 'better'}" style="width:${Math.max(4, (Math.abs(c.contribution) / max) * 100).toFixed(0)}%"></i></span><span class="mt num">${signed(c.contribution)}</span></div>`;
    }).join('')}</div></section>`;
  }

  function phq(B) {
    const P = B.phq, H = P.history || [];
    const head = `<div class="sect-h"><h2>PHQ-9</h2>${info('Bands, not diagnoses')}</div>`;
    if (!H.length) return `<section>${head}<p class="muted">No check-in${P.overdue ? ' · <span class="overdue">Overdue</span>' : ''}</p></section>`;
    const last = H[H.length - 1];
    const bars = H.map((h, i) => `<span class="${i === H.length - 1 ? 'last' : ''}" style="height:${Math.max(6, (h.total / 27) * 76).toFixed(0)}px" title="${esc(dayStr(B, h.day))}: ${h.total}"><em class="num">${h.total}</em></span>`).join('');
    const meta = [
      P.baseline != null ? `<b class="num">${intSigned(last.total - P.baseline)}</b> vs discharge` : '',
      P.baseline != null && P.baseline >= 5 ? 'Residual at discharge' : '',
      P.overdue ? '<span class="overdue">Overdue</span>' : '',
      P.last_status ? `Last: ${esc(P.last_status)}` : '',
    ].filter(Boolean).join(' · ');
    const rows = [...H].reverse().map((h) => `<tr><td>${esc(dayStr(B, h.day))}${h.early ? '<small>early</small>' : ''}</td><td class="num">${h.total}</td><td class="num">${h.phq8_total ?? '-'}</td><td>${esc(BAND[h.band] || '-')}</td></tr>`).join('');
    return `<section>${head}
      <div class="phq-top"><div><div class="phq-num num">${last.total}<small> / 27</small></div><div class="muted">${esc(BAND[last.band] || '')}</div></div><div class="phq-bars" aria-hidden="true">${bars}</div></div>
      ${meta ? `<p class="phq-meta">${meta}</p>` : ''}
      <table class="tbl"><thead><tr><th>Date</th><th>PHQ-9</th><th>PHQ-8</th><th>Band</th></tr></thead><tbody>${rows}</tbody></table>
      ${P.baseline != null ? `<p class="phq-meta">Baseline <b class="num">${P.baseline}</b>${P.baseline_source === 'clinic_import' ? ' · clinic' : ''}</p>` : ''}
    </section>`;
  }

  const order = (B) => {
    const c = Object.fromEntries((B.contrib || []).map((x) => [x.key, Math.abs(x.contribution)]));
    return C.qr.FEATURES.slice().sort((a, b) => (c[b] ?? -1) - (c[a] ?? -1));
  };

  function measures(B) {
    const cells = order(B).map((k) => {
      const vals = B.weekly[k] || [];
      let li = vals.length - 1;
      while (li > 0 && vals[li] == null) li--;
      const f = FEAT[k];
      return `<div class="mm"><div class="mm-h"><span>${esc(f[0])}</span>${EXPLORATORY.has(k) ? '<span class="xchip">exploratory</span>' : ''}<span class="mm-v num">${fmtV(k, vals[li])}<small> ${esc(f[1])}</small></span></div><div class="chart-wrap" id="mm-${k}"></div></div>`;
    }).join('');
    return `<section><div class="sect-h"><h2>Measures</h2>${info('Weekly medians. Band: usual, wk 1–2.')}</div><div class="mms">${cells}</div></section>`;
  }

  const weekStart = (B, i) => Math.max(0, B.period.to_day - 55 + 7 * i);

  function signals(B) {
    return `<section class="signals" aria-label="Signals"><div class="sect-h"><h2>Signals</h2>${info('Finger sensor, during play. Not in index.')}</div>${C.signals.weeklyHtml(B.vitals, (i) => tiny(B, weekStart(B, i)))}</section>`;
  }

  function facts(B) {
    const m = B.mornings, c = B.complete, total = B.period.to_day - B.period.from_day + 1;
    const sensors = Object.entries(B.sensors || {}).filter(([k]) => k !== 'presence');
    const on = sensors.filter(([, v]) => v).map(([k]) => SENSOR[k] || k);
    const byf = Object.entries(c.by_feature || {}).map(([k, v]) => `${FEAT[k]?.[0] || k} ${pct(v)}`).join(', ');
    const pauses = (B.pauses || []).map((p) => `${dayStr(B, p.from_day)}–${dayStr(B, p.until_day)}, ${p.source === 'clinician' ? 'clinic' : 'patient'}`);
    const rows = [
      ['Mornings lit', `<span class="num">${m.lit ?? '-'}</span> <small>${m.lit_total ?? '-'} total</small>`],
      ['Days played', `<span class="num">${c.played_days ?? '-'}/${total}</span> <small>${c.sessions_7d ?? '-'}/7 last wk</small>`],
      ['Missed / rest', `<span class="num">${m.missed ?? '-'} / ${m.rest ?? '-'}</span>${m.frozen ? ` <small>${m.frozen} paused</small>` : ''}`],
      ['Pauses', pauses.length ? `<span class="num" data-tip="${esc(pauses.join('; '))}">${pauses.length}</span> <small class="num">${c.paused_days ?? 0} d</small>` : '<span class="num">0</span>'],
      ['Complete', `<span class="num" data-tip="${esc(byf)}">${pct(B.composite.completeness)}</span> <small>${esc(B.state.confidence || '')} conf.</small>`],
      ['Sensors', `<span class="num" data-tip="${esc(on.join(', ') || 'None')}">${on.length}/${sensors.length}</span>`],
    ];
    return `<section class="card"><div class="facts">${rows.map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div></section>`;
  }

  V.exportDetail = function (S, cti) {
    const imp = C.codes?.get(cti);
    const back = `<a class="icon-btn dp-back" href="#/" aria-label="Patients" title="Patients">${icon('arrow_back')}</a>`;
    if (!imp) return `<div class="dp">${back}<p class="muted">Not found</p></div>`;
    const B = imp.body, F = C.scanFmt;
    const k = C.codes.key(imp.fp);
    const cs = B.state;
    const cusumTip = [`CUSUM ${num(B.cusum.value)}`, cs.first_watch_day != null ? `Watch ${dayStr(B, cs.first_watch_day)}` : '', cs.first_check_in_day != null ? `Check-in ${dayStr(B, cs.first_check_in_day)}` : '', cs.first_booster_day != null ? `Booster ${dayStr(B, cs.first_booster_day)}` : ''].filter(Boolean).join(' · ');
    const trend = B.composite.trend_7d;
    const tIcon = trend > 0.05 ? 'trending_up' : trend < -0.05 ? 'trending_down' : 'trending_flat';
    const verified = [`Signed ${F.when(imp.iat)}`, k ? `Known since ${F.day(k.first_seen_iso)}` : 'Not saved'].join(' · ');
    return `<div class="dp code-dp" data-cti="${esc(imp.cti)}">
      <div class="dp-head">
        <div>${back}<h2 class="dp-name">${esc(C.codes.label(imp))}${B.sim ? '<span class="sim-badge small">Simulated</span>' : ''}</h2></div>
        <span data-tip="${esc(cusumTip)}">${chip(cs.shown)}</span>
        <div class="code-meta"><span class="src-chip" title="Received via QR">${icon('qr_code_2')}<span class="vh">Received via QR </span><span class="num">${esc(received(imp))}</span></span>${imp.expired ? `<span class="src-chip warn">${icon('schedule')}Expired</span>` : ''}${imp.future ? `<span class="src-chip warn">${icon('schedule')}Check dates</span>` : ''}
          <span class="vfp" data-tip="${esc(verified)}" aria-label="${esc(verified)}">${icon('verified')}<span class="num">${esc(imp.fp)}</span></span></div>
        <p class="dp-sub num">${esc(range(B))} · ${esc(weeks(B))}</p>
      </div>
      ${safetyBanner(B)}
      ${stateBanner(B)}
      <section><div class="sect-h chart-h"><div><h2>Early-warning index ${info('Mean personal z-score. 0 = usual.')}</h2></div><span class="r kv"><span class="v num">${num(B.composite.value)}</span><span class="trend num" title="7-day change">${icon(tIcon)}${signed(trend)}<small>/ 7 d</small></span></span></div><div class="chart-wrap" id="cchart"></div></section>
      ${drivers(B)}
      ${phq(B)}
      ${measures(B)}
      ${signals(B)}
      ${facts(B)}
      ${history(imp)}
    </div>`;
  };

  V.drawImported = function (S, cti) {
    const imp = C.codes?.get(cti);
    if (!imp) return;
    const B = imp.body, to = B.period.to_day;
    const start = (k) => to - 55 + 7 * k;
    const xl = [[0, tiny(B, Math.max(0, start(0)))], [7, tiny(B, to)]];
    const wtip = (vals, label, fmt) => (i) => `<div class="tip-h">${esc(tiny(B, Math.max(0, start(i))))}–${esc(tiny(B, start(i) + 6))}</div><div class="tip-r"><span>${esc(label)}</span><b>${vals[i] == null ? '-' : fmt(vals[i])}</b></div>`;
    const el = document.getElementById('cchart');
    const cv = B.weekly.composite || [];
    const stateCol = B.state.shown === 'stable' || B.state.shown == null ? C.css('--c-outline') : C.stateColor(B.state.shown);
    if (el) C.seriesChart(el, { values: cv, connect: true, threshold: 0.5, thresholdColor: stateCol, thresholdLabel: '0.5', h: 196, xlabels: xl, aria: 'Early-warning index, 8 weekly medians', tip: wtip(cv, 'Index', (v) => signed(v)) });
    for (const k of C.qr.FEATURES) {
      const e = document.getElementById('mm-' + k);
      if (!e) continue;
      const vals = B.weekly[k] || [], b = B.baseline[k];
      const band = b && b.scale != null ? [b.median - b.scale, b.median + b.scale] : null;
      C.seriesChart(e, { values: vals, connect: false, band, mid: band ? b.median : null, bandLabel: '', h: 104, aria: `${FEAT[k][0]}, 8 weekly medians`, tip: wtip(vals, FEAT[k][0], (v) => `${fmtV(k, v)} ${FEAT[k][1]}`) });
    }
    for (const r of C.signals.weeklyRows(B.vitals)) {
      const e = document.getElementById('sig-' + r.key);
      if (e) C.seriesChart(e, { values: r.weeks, connect: false, dots: true, h: 104, aria: `${r.label}, 8 weekly medians`, tip: wtip(r.weeks, r.label, (v) => `${num(v, 1)} ${r.unit}`) });
    }
  };
})();
