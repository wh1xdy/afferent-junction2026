// Signals section of the clinic view. Two inputs, and no other:
//  - the sensor blocks of a session document stored on the patient's own hub (sessionRows, html)
//  - the weekly finger sensor numbers of a code the patient handed over (weeklyRows, weeklyHtml)
// Nothing here is a current reading: the system never sends, streams or serves sensor values to the clinic.
// Pure functions on window.C: no DOM access, so hub/tests/clinic_signals.test.js runs them in a node vm.
(() => {
  const C = (window.C = window.C || {});
  const MINUS = '−';
  const NO_READING = 'no reading';
  const WEEKS = 8;
  const MIN_QUALITY = 0.3;
  const SOURCE = {
    ble: 'finger sensor (PPG), Bluetooth via the phone',
    hub_http: 'finger sensor (PPG), hub HTTP',
    finger: 'finger sensor (PPG)',
    camera: 'phone camera (rPPG)',
    simulated: 'simulator',
  };
  const SERIES = { pulse: 'pulse_bpm', breathing: 'breathing_per_min', rmssd: 'rmssd_ms' };
  // The sensor keeps one running median of its last 10 minutes of RMSSD readings, whoever wore the clip
  // (uno-q/modulino-hub/app.py update_hrv). It is not a baseline kept per person, so it is not called one.
  const VS_NOTE = 'RMSSD against the sensor’s median of its last 10 minutes of readings; not kept per person';
  // The numbers of a patient code (demo/js/qrpayload.js VITALS, map key 18): key, label, unit, what the number is.
  const WEEKLY = [
    ['pulse_bpm', 'Pulse, finger sensor', 'bpm', 'session mean, clips on during play'],
    ['breathing_per_min', 'Breathing rate', 'per min', 'from the pulse rhythm'],
    ['rmssd_ms', 'HRV (RMSSD)', 'ms', '60 s windows'],
  ];
  const NOT_CARRIED = 'This code carries no finger sensor numbers. It was made before the app added them.';
  const NO_WEEKS = 'No finger sensor reading in these 8 weeks.';
  const SESSION_FOOT = 'Measured values with their source, from a stored session. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';
  const WEEKLY_FOOT = 'Handed over by the patient in this code: weekly medians with their source. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';

  const esc = (s) => C.esc(s);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, d = 1) => (!isNum(v) ? null : (Number.isInteger(v) ? String(v) : v.toFixed(d)).replace('-', MINUS));
  const pct = (v) => { if (!isNum(v)) return null; const p = Math.round(v * 100); return (p > 0 ? '+' : p < 0 ? MINUS : '') + Math.abs(p); };
  const isSim = (o) => !!o && (o.simulated === true || o.source === 'simulated');
  const fingerSource = (o) => (isSim(o) ? SOURCE.simulated : SOURCE[o.transport] || SOURCE.finger);

  const named = (fields, block) => (fields || []).some((f) => f === '*' || f === 'vitals' || f === `vitals.${block}` || String(f).startsWith(`vitals.${block}.`));
  const has = (st) => !!st && st.samples > 0 && isNum(st.mean);
  const range = (st) => (isNum(st.min) && isNum(st.max) ? `${fmt(st.min)} to ${fmt(st.max)}` : '');

  // The rule of the patient code (hub/afferent_hub/qr.py session_vital): what the finger sensor recorded counts as a
  // measurement only when the sensor reported its signal quality and that quality stayed at 0.3 or more.
  // Returns why the session's finger numbers are not shown, or '' when they are.
  function unusable(f) {
    if (!f || f.quality_reported !== true) return 'signal quality not reported';
    const q = f.quality;
    if (!has(q)) return 'no reading at signal quality 0.3 or more';
    if (q.mean < MIN_QUALITY) return 'signal quality below 0.3';
    if (isNum(q.min) && q.min < MIN_QUALITY) return 'signal quality below 0.3 in part of the session';
    return '';
  }

  // Summary rows of one stored session. `vitals` is the session's vitals object, `simulatedFields` its simulated_fields.
  function sessionRows(vitals, simulatedFields) {
    const rows = [];
    const v = vitals || {};
    const f = v.finger, b = v.breathing, h = v.hrv, c = v.camera_pulse;
    const fsrc = f ? fingerSource(f) : SOURCE.finger;
    const why = unusable(f);
    const ok = (st) => !why && has(st);
    const block = (o, name) => ({ source: isSim(o) ? SOURCE.simulated : fsrc, simulated: isSim(o) || named(simulatedFields, name) });
    const push = (meta, key, label, value, unit, note, series) => rows.push({ ...meta, key, label, value: value ?? NO_READING, unit, note: note || '', series: series || null, missing: value == null });
    // a row of the finger sensor: the value with its note, or "no reading" with the reason
    const reading = (meta, key, label, value, unit, note, series) => (why ? push(meta, key, label, null, unit, why) : push(meta, key, label, value, unit, note, series));
    if (f) {
      const m = block(f, 'finger');
      const q = ok(f.quality) ? `signal quality ${f.quality.mean.toFixed(2)}` : '';
      reading(m, 'pulse', 'Pulse (fused)', ok(f.pulse_bpm) ? fmt(f.pulse_bpm.mean) : null, 'bpm', [ok(f.pulse_bpm) ? range(f.pulse_bpm) : '', q].filter(Boolean).join(', '), SERIES.pulse);
      reading(m, 'finger_1', 'Finger 1', ok(f.finger_1_bpm) ? fmt(f.finger_1_bpm.mean) : null, 'bpm');
      reading(m, 'finger_2', 'Finger 2', ok(f.finger_2_bpm) ? fmt(f.finger_2_bpm.mean) : null, 'bpm');
      reading(m, 'fingers_diff', 'Between the fingers', fmt(f.fingers_abs_diff_bpm), 'bpm', 'mean absolute difference');
      const p = f.presence_s;
      if (p) push(m, 'presence', 'Finger detection', fmt(p.active), 's', `measuring; checking for a finger ${fmt(p.probing) ?? 0} s, no finger ${fmt(p.idle) ?? 0} s`);
    }
    if (b) reading(block(b, 'breathing'), 'breathing', 'Breathing rate', ok(b.rate_per_min) ? fmt(b.rate_per_min.mean) : null, 'per min', ok(b.rate_per_min) ? range(b.rate_per_min) : '', SERIES.breathing);
    if (h) {
      const m = block(h, 'hrv');
      const r = h.rmssd_ms;
      reading(m, 'rmssd', 'HRV (RMSSD)', ok(r) ? fmt(r.mean) : null, 'ms', ok(r) && isNum(r.first) && isNum(r.last) ? `${fmt(r.first)} → ${fmt(r.last)}, first to last` : '', SERIES.rmssd);
      if (ok(h.sdnn_ms)) push(m, 'sdnn', 'SDNN', fmt(h.sdnn_ms.mean), 'ms');
      if (ok(h.rmssd_vs_baseline)) push(m, 'vs_baseline', 'vs recent median', pct(h.rmssd_vs_baseline.mean), '%', VS_NOTE);
    }
    if (c) {
      const t = c.trust_score, l = c.trust_label_s;
      const note = [has(t) ? `mean trust ${Math.round(t.mean)} of 100` : 'trust not reported',
        l ? `reliable ${l.reliable ?? 0} s, uncertain ${l.uncertain ?? 0} s, unreliable ${l.unreliable ?? 0} s` : ''].filter(Boolean).join('; ');
      push({ source: SOURCE.camera, simulated: named(simulatedFields, 'camera_pulse') }, 'camera', 'Pulse (camera)', has(c.pulse_bpm) ? fmt(c.pulse_bpm.mean) : null, 'bpm', note);
    }
    return rows;
  }

  const badge = (on) => (on ? '<span class="sim-badge small">Simulated</span>' : '');

  function spark(series, key) {
    const vals = series && Array.isArray(series[key]) ? series[key].map((x) => (isNum(x) ? x : null)) : [];
    const finite = vals.filter((x) => x != null);
    if (finite.length < 2) return '';
    let lo = Math.min(...finite), hi = Math.max(...finite);
    const pad = (hi - lo) * 0.15 || 1;
    lo -= pad; hi += pad;
    const span = hi - lo;
    // the list sparkline draws a baseline band; there is none here, so it is placed outside the drawing (and hidden in CSS)
    return `<span class="sig-spark" title="${esc(`one point every ${series.step_s || 5} s`)}">${C.sparkline(vals, { domain: [lo, hi], band: [lo - 3 * span, lo - 2 * span], w: 116, h: 26 })}</span>`;
  }

  function rowHtml(r, series) {
    const meta = [r.source, r.note].filter(Boolean).map(esc).join(' · ');
    return `<div class="sig-row${r.missing ? ' none' : ''}" data-key="${esc(r.key)}">
      <span class="sig-l">${esc(r.label)}</span>
      ${r.series ? spark(series, r.series) : ''}
      <span class="sig-v num">${esc(r.value)}${r.unit && !r.missing ? `${r.unit === '%' ? '' : ' '}<small>${esc(r.unit)}</small>` : ''}</span>
      <span class="sig-s">${meta}${badge(r.simulated)}</span>
    </div>`;
  }

  // o: {session, sessionLabel}. session is a compact session row of the hub with `vitals` (and `simulated_fields`),
  // sessionLabel when it was recorded. Returns '' when the session has no sensor block.
  function html(o) {
    const session = o && o.session;
    const vit = session && session.vitals;
    const rows = vit ? sessionRows(vit, session.simulated_fields) : [];
    if (!rows.length) return '';
    const when = o.sessionLabel || (session.started_iso ? `${session.started_iso.slice(0, 10)} ${session.started_iso.slice(11, 16)}` : '');
    const noQ = vit.finger && vit.finger.quality_reported === false;
    return `<div class="sig-block" data-part="session"><div class="sig-h"><h3>Last session with sensor data</h3><span class="muted">${esc(when)}</span></div><div class="sig-rows">${rows.map((r) => rowHtml(r, vit.series)).join('')}</div>${noQ ? '<p class="sig-note">signal quality not reported by this sensor version; not used by the game</p>' : ''}</div><p class="sig-foot">${esc(SESSION_FOOT)}</p>`;
  }

  // One row per number of a patient code. `vitals` is the block of a decoded code, or nothing for a code made
  // before the block existed. `week` is the newest week that has a value; a week without one is null, never 0.
  function weeklyRows(vitals) {
    if (!vitals || typeof vitals !== 'object') return [];
    return WEEKLY.map(([key, label, unit, note]) => {
      const raw = vitals.weekly && vitals.weekly[key];
      const weeks = Array.from({ length: WEEKS }, (_, i) => (Array.isArray(raw) && isNum(raw[i]) && raw[i] > 0 ? raw[i] : null));
      let week = WEEKS - 1;
      while (week >= 0 && weeks[week] === null) week--;
      const missing = week < 0;
      const simulated = !missing && !!vitals.simulated && vitals.simulated[key] === true;
      const days = !missing && vitals.days && isNum(vitals.days[key]) && vitals.days[key] > 0 ? vitals.days[key] : null;
      return { key, label, unit, note, weeks, week: missing ? null : week, value: missing ? NO_READING : weeks[week].toFixed(1), missing, days, simulated,
        source: simulated ? SOURCE.simulated : SOURCE.finger };
    });
  }

  // Inner HTML for the numbers of a patient code. `weekLabel(i)` names week i by its first day;
  // the page draws the charts into #sig-<key>.
  function weeklyHtml(vitals, weekLabel = () => '') {
    const rows = weeklyRows(vitals);
    if (!rows.length) return `<p class="sig-empty muted">${esc(NOT_CARRIED)}</p>`;
    if (rows.every((r) => r.missing)) return `<p class="sig-empty muted">${esc(NO_WEEKS)}</p>`;
    const cells = rows.map((r) => {
      const meta = r.missing ? [] : [r.source, `week from ${weekLabel(r.week)}`, r.days ? `${r.days} ${r.days === 1 ? 'day' : 'days'} with a reading` : '', r.note];
      return `<div class="mm sig-mm${r.missing ? ' none' : ''}" data-key="${esc(r.key)}">
        <div class="mm-h"><span>${esc(r.label)}</span><span class="mm-v num">${esc(r.value)}${r.missing ? '' : `<small> ${esc(r.unit)}</small>`}</span></div>
        <div class="sig-s">${meta.filter(Boolean).map(esc).join(' · ')}${badge(r.simulated)}</div>
        ${r.missing ? '' : `<div class="chart-wrap" id="sig-${esc(r.key)}"></div>`}</div>`;
    }).join('');
    return `<div class="mms">${cells}</div><p class="sig-foot">${esc(WEEKLY_FOOT)}</p>`;
  }

  C.signals = { sessionRows, html, weeklyRows, weeklyHtml };
})();
