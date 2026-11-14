(() => {
  const C = window.C, V = C.views, esc = C.esc;
  const { num, signed, pct, dateShort } = V.fmt;
  const icon = (n, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${n}</span>`;
  const info = (t) => `<button class="info" type="button" aria-label="${esc(t)}" data-tip="${esc(t)}">${icon('info')}</button>`;
  const MINUS = '−';

  const STATE = {
    booster: ['Booster review', 'medical_services', 'Consider discussing a booster session'],
    check_in: ['Check-in', 'call', 'Consider a check-in call'],
    watch: ['Watch', 'insights', 'Watch'],
    stable: ['Stable', 'check', 'Stable'],
  };
  const RANK = { booster: 0, check_in: 1, watch: 2, stable: 3 };
  const TIER_RANK = { high: 0, moderate: 1, incomplete: 2, low: 3 };
  const TIER = { high: 'High', moderate: 'Moderate', incomplete: 'Incomplete', low: 'Low', not_answered: 'Not reached' };
  const BAND = { minimal: 'Minimal', mild: 'Mild', moderate: 'Moderate', moderately_severe: 'Moderately severe', severe: 'Severe' };
  const SCREEN = { crisis: 'Crisis screen shown, 112 first', support: 'Support screen shown', thank_you: 'Thank-you screen shown', saved: 'Saved screen shown' };
  const FEAT = {
    rt_median: ['Reaction time', 'ms', 0, 'slower than usual', 'faster than usual'],
    mood: ['Mood lantern', 'of 5', 1, 'lower than usual', 'higher than usual'],
    sleep_regularity: ['Sleep regularity', 'IS', 2, 'less regular', 'more regular'],
    missed_sessions: ['Mornings missed', 'days of 7', 1, 'more than usual', 'fewer than usual'],
    effort_hard_prop: ['Effort choice', 'share hard', 2, 'easier than usual', 'harder than usual'],
    morning_pulse: ['Resting pulse', 'bpm', 1, 'higher than usual', 'lower than usual'],
    home_only_days: ['Days at home', 'days of 7', 1, 'more than usual', 'fewer than usual'],
    upright_frac: ['Upright in play', 'share upright', 2, 'less than usual', 'more than usual'],
    reward_bias: ['Reward bias', 'log b', 2, 'lower than usual', 'higher than usual'],
  };
  const EXPLORATORY = new Set(['upright_frac', 'reward_bias']);
  const SENSOR = { phone_camera: 'Phone camera', pulse_stone: 'Pulse stone', bedside_camera: 'Bedside camera', bedside_light: 'Bedside light', presence: 'Presence', phone_presence: 'Phone presence', phone_motion: 'Phone motion' };

  const dayIso = (B, d) => { const t = new Date(B.period.tms_end_date + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
  const dayStr = (B, d) => (d == null ? '-' : dateShort(dayIso(B, d)));
  const tiny = (B, d) => { const s = dateShort(dayIso(B, d)); return s.slice(4); };
  const hm = (m) => (m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  const week = (d) => Math.max(1, Math.floor((d - 1) / 7) + 1);
  const weeks = (B) => `Weeks ${week(B.period.from_day)} to ${week(B.period.to_day)} after TMS`;
  const intSigned = (n) => (n > 0 ? '+' : n < 0 ? MINUS : '') + Math.abs(n);
  const chip = (s) => { const x = STATE[s] || STATE.stable; return `<span class="st" data-state="${esc(s)}">${icon(x[1])}${x[0]}</span>`; };
  const flagged = (B) => (B.safety || []).filter((s) => s.tier in TIER_RANK);
  const topTier = (B) => flagged(B).sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])[0]?.tier || null;
  const phrase = (k, worse) => (FEAT[k] ? `${FEAT[k][0]} ${worse ? FEAT[k][3] : FEAT[k][4]}` : k);
  const fmtV = (k, v) => (v == null ? '-' : num(v, FEAT[k]?.[2] ?? 2));

  V.importRank = (imp) => {
    const t = topTier(imp.body);
    return [t ? TIER_RANK[t] : 9, RANK[imp.body.state.shown] ?? 9, -(imp.body.composite.value ?? -9)];
  };

  V.scanned = function () {
    const list = C.codes ? C.codes.all() : [];
    const sorted = list.map((i) => [V.importRank(i), i]).sort(([a], [b]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || 0).map(([, i]) => i);
    const rows = sorted.map((imp) => {
      const B = imp.body, t = topTier(B);
      return `<div class="xrow crow">
        <a class="crow-main" href="#/codes/${encodeURIComponent(imp.cti)}"><span class="crow-name"><b>${esc(C.codes.label(imp))}</b>${B.sim ? '<span class="sim-badge small">Simulated</span>' : ''}</span>
          <small>${icon('qr_code_2')}Scanned ${esc(C.scanFmt.when(imp.scanned_iso))} · ${esc(weeks(B))}</small></a>
        ${t ? `<span class="st" data-state="safety">${icon('shield')}Safety: ${esc(TIER[t].toLowerCase())}</span>` : chip(B.state.shown)}
        <span class="xmenu-wrap"><button class="icon-btn" data-codes="menu" aria-haspopup="menu" aria-expanded="false" aria-label="More for this code">${icon('more_vert')}</button>
          <span class="menu xmenu" role="menu" hidden>
            <button role="menuitem" data-codes="download" data-cti="${esc(imp.cti)}">${icon('download')}Download as JSON</button>
            <button role="menuitem" data-codes="delete" data-cti="${esc(imp.cti)}">${icon('delete')}Delete this import</button>
            <button role="menuitem" data-codes="forget" data-cti="${esc(imp.cti)}">${icon('phonelink_erase')}Forget this phone</button>
          </span></span>
      </div>`;
    }).join('');
    return `<div class="sect-h codes-h"><h2>Scanned codes</h2>${info('Codes the patient showed from their phone. Kept in this browser only, never sent to the hub or to any AI.')}
        <span class="r">${list.length ? `<button class="btn text small" data-codes="clear">${icon('delete_sweep')}Clear all scanned codes</button>` : ''}<button class="btn tonal small" data-codes="scan">${icon('qr_code_scanner')}Scan patient code</button></span></div>
      ${rows ? `<div class="exports codes">${rows}</div>` : ''}`;
  };

  function safetyBanner(B) {
    const fl = flagged(B), other = (B.safety || []).filter((s) => s.tier === 'not_answered');
    const talk = B.talk || [];
    const lost = B.omitted?.safety_entries || 0;
    if (!fl.length && !other.length && !talk.length) return '';
    const line = (s) => {
      const bits = [`${dayStr(B, s.day)}, ${hm(s.minute)}`];
      if (s.tier === 'not_answered') bits.push('check-in stopped before the safety item');
      else {
        bits.push(TIER[s.tier]);
        bits.push(s.source === 'item9_fallback' ? 'C-SSRS not asked; tier from item 9' : 'C-SSRS answered');
        if (s.c6_repeat) bits.push('known lifetime behaviour, unchanged since last check-in');
      }
      if (SCREEN[s.screen] && s.tier !== 'not_answered') bits.push(SCREEN[s.screen]);
      return `<li data-tier="${esc(s.tier)}">${bits.map(esc).join(' · ')}</li>`;
    };
    const items = (B.safety || []).map(line).join('') + talk.map((t) => `<li>${icon('chat_bubble')}Asked to talk · ${esc(dayStr(B, t.day))} ${hm(t.minute)}</li>`).join('');
    const top = topTier(B);
    if (!top) {
      return `<div class="banner" data-kind="talk">${icon(talk.length ? 'chat_bubble' : 'info')}
        <div><b>${talk.length ? 'Asked to talk' : 'Check-in stopped before the safety item'}</b><ul class="sf-list">${items}</ul></div></div>`;
    }
    return `<div class="banner" data-kind="safety" role="alert">${icon('shield')}
      <div><b>Safety answer: ${esc(TIER[top].toLowerCase())}</b><ul class="sf-list">${items}</ul>
        <p>Ask the patient about the answers; this code holds the level only.</p>
        ${lost ? `<p>${lost} older safety ${lost === 1 ? 'answer is' : 'answers are'} not in this code.</p>` : ''}</div>
      <div class="bfoot"><span class="tag">${icon('description')}Follow your clinic protocol</span></div>
    </div>`;
  }

  function stateBanner(B) {
    const s = B.state.shown, x = STATE[s] || STATE.stable;
    const reasons = (B.contrib || []).filter((c) => c.contribution > 0.15).slice(0, 3).map((c) => phrase(c.key, true));
    const ph = B.phq.history || [], last = ph[ph.length - 1];
    const phqRaised = B.state.phq_state && RANK[B.state.phq_state] < (RANK[B.state.cusum] ?? 9) && RANK[B.state.phq_state] <= RANK[s];
    const since = s !== 'stable' && B.state.since_day != null ? `since ${dayStr(B, B.state.since_day)}` : '';
    return `<div class="banner sbanner" data-kind="state" data-state="${esc(s)}">${icon(x[1])}
      <div><b>${esc(x[2])}</b>${since ? `<span class="since">${esc(since)}</span>` : ''}
        <p>${esc(reasons.length ? reasons.join(', ') : s === 'stable' ? 'Steady across all signals' : 'Small drift across several signals')}.</p>
        ${phqRaised && last ? `<p>PHQ-9 ${last.total}, ${esc((BAND[last.band] || '').toLowerCase())}${B.phq.baseline != null ? `, ${intSigned(last.total - B.phq.baseline)} from discharge` : ''}.</p>` : ''}
        <p>The clinician decides.</p></div>
    </div>`;
  }

  function drivers(B) {
    const cs = [...(B.contrib || [])].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5);
    if (!cs.length) return '';
    const max = Math.max(0.3, ...cs.map((c) => Math.abs(c.contribution)));
    return `<section><div class="sect-h"><h2>Main drivers</h2>${info('Each signal\'s share of the index. Amber pushes it up, teal pulls it down.')}</div><div class="moved">${cs.map((c) => {
      const worse = c.contribution > 0;
      return `<div class="mrow"><span>${esc(FEAT[c.key]?.[0] || c.key)}</span><span class="mbar"><i class="${worse ? '' : 'better'}" style="width:${Math.max(4, (Math.abs(c.contribution) / max) * 100).toFixed(0)}%"></i></span><span class="mt num">${signed(c.contribution)}</span></div>`;
    }).join('')}</div></section>`;
  }

  function phq(B) {
    const P = B.phq, H = P.history || [];
    const head = `<div class="sect-h"><h2>PHQ-9</h2><span class="muted">severity bands</span>${info('Totals only. The item answers stay on the home hub. Bands are severity bands, not diagnoses.')}</div>`;
    if (!H.length) return `<section>${head}<p class="muted">No check-in in this code.${P.overdue ? ' Check-in overdue.' : ''}</p></section>`;
    const last = H[H.length - 1];
    const bars = H.map((h, i) => `<span class="${i === H.length - 1 ? 'last' : ''}" style="height:${Math.max(6, (h.total / 27) * 76).toFixed(0)}px" title="${esc(dayStr(B, h.day))}: ${h.total}"><em class="num">${h.total}</em></span>`).join('');
    const meta = [
      P.baseline != null ? `<b class="num">${intSigned(last.total - P.baseline)}</b> from discharge` : '',
      last.phq8_total != null ? `PHQ-8 <b class="num">${last.phq8_total}</b>` : '',
      P.baseline != null && P.baseline >= 5 ? 'residual symptoms at discharge' : '',
      P.overdue ? '<span class="overdue">Check-in overdue</span>' : '',
      P.last_status ? `last check-in ${esc(P.last_status)}` : '',
    ].filter(Boolean).join(' · ');
    const rows = [...H].reverse().map((h) => `<tr><td>${esc(dayStr(B, h.day))}${h.early ? '<small>early</small>' : ''}</td><td class="num">${h.total}</td><td class="num">${h.phq8_total ?? '-'}</td><td>${esc(BAND[h.band] || '-')}</td></tr>`).join('');
    return `<section>${head}
      <div class="phq-top"><div><div class="phq-num num">${last.total}<small> / 27</small></div><div class="muted">${esc(BAND[last.band] || '')}</div></div><div class="phq-bars" aria-hidden="true">${bars}</div></div>
      ${meta ? `<p class="phq-meta">${meta}</p>` : ''}
      <table class="tbl"><thead><tr><th>Check-in</th><th>PHQ-9</th><th>PHQ-8</th><th>Severity band</th></tr></thead><tbody>${rows}</tbody></table>
      ${P.baseline != null ? `<p class="phq-meta">Discharge baseline <b class="num">${P.baseline}</b>${P.baseline_source === 'clinic_import' ? ', entered by the clinic' : ''}</p>` : ''}
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
    return `<section><div class="sect-h"><h2>Measures, 8 weeks</h2><span class="muted">weekly medians</span>${info('Each line is the weekly median; the band is the usual range from the first two weeks after TMS. A week without data is a gap.')}</div><div class="mms">${cells}</div></section>`;
  }

  const weekStart = (B, i) => Math.max(0, B.period.to_day - 55 + 7 * i);

  function signals(B) {
    return `<section class="signals" aria-label="Signals"><div class="sect-h"><h2>Signals, 8 weeks</h2><span class="muted">finger sensor, weekly medians</span>${info('Pulse, breathing rate and HRV (RMSSD) from the finger sensor at the patient\'s home: for each week the median of the session means. The pulse here is not the resting pulse under Measures, which is the bedside morning reading. Numbers only: no usual range, and not part of the early-warning index. A week without a reading is a gap.')}</div>${C.signals.weeklyHtml(B.vitals, (i) => tiny(B, weekStart(B, i)))}</section>`;
  }

  function facts(B) {
    const m = B.mornings, c = B.complete, total = B.period.to_day - B.period.from_day + 1;
    const on = Object.entries(B.sensors || {}).filter(([, v]) => v).map(([k]) => SENSOR[k] || k);
    const byf = Object.entries(c.by_feature || {}).map(([k, v]) => `${FEAT[k]?.[0] || k} ${pct(v)}`).join(', ');
    const pauses = (B.pauses || []).map((p) => `${dayStr(B, p.from_day)} to ${dayStr(B, p.until_day)}, by ${p.source === 'clinician' ? 'the clinic' : 'the patient'}`);
    const rows = [
      ['Mornings lit', `<span class="num">${m.lit ?? '-'}</span> <small>in these weeks, ${m.lit_total ?? '-'} in all</small>`],
      ['Days played', `<span class="num">${c.played_days ?? '-'} of ${total}</span> <small>${c.sessions_7d ?? '-'} of 7 this week</small>`],
      ['Missed and rest days', `<span class="num">${m.missed ?? '-'} missed, ${m.rest ?? '-'} rest</span>${m.frozen ? ` <small>${m.frozen} kept by a pause</small>` : ''}`],
      ['Pauses', pauses.length ? `<span data-tip="${esc(pauses.join('; '))}">${pauses.length} ${pauses.length === 1 ? 'pause' : 'pauses'}</span> <small class="num">${c.paused_days ?? 0} days</small>` : 'None'],
      ['Data complete', `<span class="num" data-tip="${esc(byf)}">${pct(B.composite.completeness)}</span> <small>${esc(B.state.confidence || '')} confidence</small>`],
      ['Sensors on', `<span class="num" data-tip="${esc(on.join(', ') || 'None')}">${on.length} of ${Object.keys(B.sensors || {}).length}</span>`],
    ];
    return `<section class="card"><div class="facts">${rows.map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div></section>`;
  }

  V.imported = function (S, cti) {
    const imp = C.codes?.get(cti);
    const back = `<a class="btn text small code-back" href="#/exports">${icon('arrow_back')}Exports and codes</a>`;
    if (!imp) return `<section class="page"><div class="page-inner code-page">${back}<p class="muted">This import is no longer in this browser.</p></div></section>`;
    const B = imp.body, F = C.scanFmt;
    const k = C.codes.key(imp.fp);
    const cs = B.state;
    const cusumTip = [`CUSUM ${num(B.cusum.value)}`, cs.first_watch_day != null ? `watch line ${dayStr(B, cs.first_watch_day)}` : '', cs.first_check_in_day != null ? `check-in line ${dayStr(B, cs.first_check_in_day)}` : '', cs.first_booster_day != null ? `booster line ${dayStr(B, cs.first_booster_day)}` : ''].filter(Boolean).join(' · ');
    const trend = B.composite.trend_7d;
    const tIcon = trend > 0.05 ? 'trending_up' : trend < -0.05 ? 'trending_down' : 'trending_flat';
    const verified = k ? `First scanned ${F.day(k.first_seen_iso)}` : 'Signature checked; this phone is not saved';
    const signedAt = F.when(imp.iat);
    return `<section class="page"><div class="page-inner code-page"><div class="dp code-dp" data-cti="${esc(imp.cti)}">
      <div class="dp-head">
        <div>${back}<h2 class="dp-name">${esc(C.codes.label(imp))}${B.sim ? '<span class="sim-badge small">Simulated</span>' : ''}</h2></div>
        <span data-tip="${esc(cusumTip)}">${chip(cs.shown)}</span>
        <div class="code-meta"><span class="src-chip">${icon('qr_code_2')}From patient code, ${esc(F.day(imp.iat))}</span>${imp.expired ? `<span class="src-chip warn">${icon('schedule')}Expired</span>` : ''}${imp.future ? `<span class="src-chip warn">${icon('schedule')}Check the dates</span>` : ''}
          <span class="vfp" data-tip="${esc(verified)}">${icon('verified')}<span class="num">${esc(imp.fp)}</span></span></div>
        <p class="dp-sub">${esc(weeks(B))} · data to ${esc(dayStr(B, B.period.to_day))} · scanned ${esc(F.when(imp.scanned_iso))}</p>
      </div>
      ${safetyBanner(B)}
      ${stateBanner(B)}
      <section><div class="sect-h chart-h"><div><h2>Early-warning index ${info('Weighted mean of personal z-scores; 0 is this person\'s usual. Weekly medians from the patient\'s phone.')}</h2><p class="muted">8 weeks, weekly</p></div><span class="r kv"><span class="v num">${num(B.composite.value)}</span><span class="trend num">${icon(tIcon)}${signed(trend)} in 7 d</span></span></div><div class="chart-wrap" id="cchart"></div></section>
      ${drivers(B)}
      ${phq(B)}
      ${measures(B)}
      ${signals(B)}
      ${facts(B)}
      <p class="dp-foot">Summary from the patient's phone, signed on ${esc(signedAt)}. Not live data.${imp.once ? ' Shown once; not saved.' : ''} Research prototype. Not a CE-marked medical device. Not for clinical use.</p>
    </div></div></section>`;
  };

  V.drawImported = function (S, cti) {
    const imp = C.codes?.get(cti);
    if (!imp) return;
    const B = imp.body, to = B.period.to_day;
    const start = (k) => to - 55 + 7 * k;
    const xl = [[0, tiny(B, Math.max(0, start(0)))], [7, tiny(B, to)]];
    const wtip = (vals, label, fmt) => (i) => `<div class="tip-h">${esc(tiny(B, Math.max(0, start(i))))} to ${esc(tiny(B, start(i) + 6))}</div><div class="tip-r"><span>${esc(label)}</span><b>${vals[i] == null ? 'no value' : fmt(vals[i])}</b></div>`;
    const el = document.getElementById('cchart');
    const cv = B.weekly.composite || [];
    const stateCol = B.state.shown === 'stable' ? C.css('--c-outline') : C.stateColor(B.state.shown);
    if (el) C.seriesChart(el, { values: cv, connect: true, threshold: 0.5, thresholdColor: stateCol, thresholdLabel: 'drift line', h: 196, xlabels: xl, aria: 'Early-warning index, 8 weekly medians', tip: wtip(cv, 'Index', (v) => signed(v)) });
    for (const k of C.qr.FEATURES) {
      const e = document.getElementById('mm-' + k);
      if (!e) continue;
      const vals = B.weekly[k] || [], b = B.baseline[k];
      const band = b && b.scale != null ? [b.median - b.scale, b.median + b.scale] : null;
      C.seriesChart(e, { values: vals, connect: false, band, mid: band ? b.median : null, bandLabel: 'usual', h: 104, xlabels: xl, aria: `${FEAT[k][0]}, 8 weekly medians`, tip: wtip(vals, FEAT[k][0], (v) => `${fmtV(k, v)} ${FEAT[k][1]}`) });
    }
    for (const r of C.signals.weeklyRows(B.vitals)) {
      const e = document.getElementById('sig-' + r.key);
      if (e) C.seriesChart(e, { values: r.weeks, connect: false, dots: true, h: 104, xlabels: xl, aria: `${r.label}, 8 weekly medians`, tip: wtip(r.weeks, r.label, (v) => `${num(v, 1)} ${r.unit}`) });
    }
  };
})();
