// Signals section of the patient detail (Decisions I53, contracts/api.md section 3.5), and the weekly finger sensor
// and face numbers of a code the patient handed over (weeklyRows, weeklyHtml, faceRows, faceHtml; imported view).
// Pure functions on window.C: no DOM access, so hub/tests/clinic_signals.test.js runs them in a node vm.
(() => {
  const C = (window.C = window.C || {});
  const STALE_S = 5;
  const MINUS = '−';
  const NO_READING = 'no reading';
  const NO_CURRENT = 'no current reading';
  const SOURCE = {
    ble: 'finger sensor (PPG), Bluetooth via the phone',
    hub_http: 'finger sensor (PPG), hub HTTP',
    finger: 'finger sensor (PPG)',
    camera: 'phone camera (rPPG)',
    simulated: 'simulator',
    face: 'phone camera (TrueDepth face tracking)',
  };
  const PRESENCE = { idle: 'no finger', probing: 'checking for a finger', active: 'measuring' };
  const LINK = {
    off: 'Bluetooth off', unauthorized: 'Bluetooth not allowed', unsupported: 'no Bluetooth in this app', scanning: 'looking for the sensor',
    connecting: 'connecting to the sensor', connected: 'sensor connected', unavailable: 'sensor not reachable',
  };
  const SERIES = { pulse: 'pulse_bpm', breathing: 'breathing_per_min', rmssd: 'rmssd_ms' };
  // The sensor keeps one running median of its last 10 minutes of RMSSD readings, whoever wore the clip
  // (uno-q/modulino-hub/app.py update_hrv). It is not a baseline kept per person, so it is not called one.
  const VS_NOTE = 'RMSSD against the sensor’s median of its last 10 minutes of readings; not kept per person';
  const WEEKS = 8;
  // The numbers of a patient code (demo/js/qrpayload.js VITALS, map key 18): key, label, unit, what the number is.
  const WEEKLY = [
    ['pulse_bpm', 'Pulse, finger sensor', 'bpm', 'session mean, clips on during play'],
    ['breathing_per_min', 'Breathing rate', 'per min', 'from the pulse rhythm'],
    ['rmssd_ms', 'HRV (RMSSD)', 'ms', '60 s windows'],
  ];
  const NOT_CARRIED = 'This code carries no finger sensor numbers. It was made before the app added them.';
  const NO_WEEKS = 'No finger sensor reading in these 8 weeks.';
  const WEEKLY_FOOT = 'Handed over by the patient in this code: weekly medians with their source. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.';
  // The face numbers of a patient code (demo/js/qrpayload.js FACE, map key 19). Each is named by what the face did,
  // never by a feeling. A share is 0 to 1 and shown in percent; 0 is a value, a week without a reading is null.
  const FACE_WEEKLY = [
    ['smile_share', 'Smiling', '% of the time', 'share of the seconds with the face in view'],
    ['blinks_per_min', 'Blinks', 'per min', 'per minute with the face in view'],
    ['gaze_away_share', 'Looking away', '% of the time', 'gaze more than 25° off the screen'],
  ];
  const SHARES = new Set(['smile_share', 'gaze_away_share']);
  const FACE_NOT_CARRIED = 'This code carries no face numbers. It was made before the app added them.';
  const FACE_LEFT_OUT = 'This code was full, so the face numbers were left out. Everything else is in it.';
  const FACE_NO_WEEKS = 'No face reading in these 8 weeks.';
  const FACE_FOOT = 'Handed over by the patient in this code: weekly medians from the phone camera, named by what the face did. Camera images and face meshes never leave the phone. Support for monitoring and follow-up, not a diagnosis. Not part of the index.';

  const esc = (s) => C.esc(s);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const fmt = (v, d = 1) => (!isNum(v) ? null : (Number.isInteger(v) ? String(v) : v.toFixed(d)).replace('-', MINUS));
  const pct = (v) => { if (!isNum(v)) return null; const p = Math.round(v * 100); return (p > 0 ? '+' : p < 0 ? MINUS : '') + Math.abs(p); };
  const isSim = (o) => !!o && (o.simulated === true || o.source === 'simulated');
  const fingerSource = (o) => (isSim(o) ? SOURCE.simulated : SOURCE[o.transport] || SOURCE.finger);
  const ageText = (s) => (!isNum(s) ? 'age unknown' : s < 1.5 ? 'just now' : s < 90 ? `${Math.round(s)} s ago` : 'over a minute ago');

  // One row per value. `ageS` is the time since the dashboard received the object, in seconds;
  // the object's own age_s is added. A value older than STALE_S is not shown.
  function liveRows(physio, camera, ageS) {
    const rows = [];
    const total = (o) => (isNum(ageS) ? ageS + (isNum(o.age_s) ? o.age_s : 0) : null);
    if (physio && (physio.source === 'finger_ppg' || isSim(physio))) {
      const age = total(physio);
      const base = { source: fingerSource(physio), simulated: isSim(physio), age, ageText: ageText(age), stale: age == null || age > STALE_S };
      const row = (key, label, value, unit, note) => rows.push({ ...base, key, label, unit, note: base.stale ? '' : note || '',
        value: base.stale ? NO_CURRENT : value ?? NO_READING, missing: base.stale || value == null });
      const q = physio.quality_reported && isNum(physio.quality) ? `signal quality ${physio.quality.toFixed(2)}` : 'signal quality not reported';
      const fb = Array.isArray(physio.finger_bpm) ? physio.finger_bpm : [];
      row('pulse', 'Pulse (fused)', fmt(physio.pulse_bpm), 'bpm', q);
      row('finger_1', 'Finger 1', fmt(fb[0]), 'bpm');
      row('finger_2', 'Finger 2', fmt(fb[1]), 'bpm');
      row('breathing', 'Breathing rate', fmt(physio.breathing_per_min), 'per min');
      row('rmssd', 'HRV (RMSSD)', fmt(physio.rmssd_ms), 'ms');
      if (isNum(physio.sdnn_ms)) row('sdnn', 'SDNN', fmt(physio.sdnn_ms), 'ms');
      if (isNum(physio.rmssd_vs_baseline)) row('vs_baseline', 'vs recent median', pct(physio.rmssd_vs_baseline), '%', VS_NOTE);
      row('presence', 'Finger detection', PRESENCE[physio.presence] || (physio.presence == null ? 'not reported' : null), '');
    }
    if (camera && camera.source === 'rppg') {
      const age = total(camera);
      const stale = age == null || age > STALE_S;
      const value = fmt(camera.bpm);
      const trust = isNum(camera.trust_score) ? `trust ${Math.round(camera.trust_score)} of 100${camera.trust_label ? ', ' + camera.trust_label : ''}` : 'trust not reported';
      rows.push({ key: 'camera', label: 'Pulse (camera)', value: stale ? NO_CURRENT : value ?? NO_READING, unit: 'bpm', note: stale ? '' : trust,
        source: SOURCE.camera, simulated: false, age, ageText: ageText(age), stale, missing: stale || value == null });
    }
    return rows;
  }

  const named = (fields, block) => (fields || []).some((f) => f === '*' || f === 'vitals' || f === `vitals.${block}` || String(f).startsWith(`vitals.${block}.`));
  const has = (st) => !!st && st.samples > 0 && isNum(st.mean);
  const range = (st) => (isNum(st.min) && isNum(st.max) ? `${fmt(st.min)} to ${fmt(st.max)}` : '');

  // Summary rows of one stored session. `vitals` is the session's vitals object, `simulatedFields` its simulated_fields.
  function sessionRows(vitals, simulatedFields) {
    const rows = [];
    const v = vitals || {};
    const f = v.finger, b = v.breathing, h = v.hrv, c = v.camera_pulse;
    const fsrc = f ? fingerSource(f) : SOURCE.finger;
    const block = (o, name) => ({ source: isSim(o) ? SOURCE.simulated : fsrc, simulated: isSim(o) || named(simulatedFields, name) });
    const push = (meta, key, label, value, unit, note, series) => rows.push({ ...meta, key, label, value: value ?? NO_READING, unit, note: note || '', series: series || null, missing: value == null });
    if (f) {
      const m = block(f, 'finger');
      const q = f.quality_reported && has(f.quality) ? `signal quality ${f.quality.mean.toFixed(2)}` : '';
      push(m, 'pulse', 'Pulse (fused)', has(f.pulse_bpm) ? fmt(f.pulse_bpm.mean) : null, 'bpm', [has(f.pulse_bpm) ? range(f.pulse_bpm) : '', q].filter(Boolean).join(', '), SERIES.pulse);
      push(m, 'finger_1', 'Finger 1', has(f.finger_1_bpm) ? fmt(f.finger_1_bpm.mean) : null, 'bpm');
      push(m, 'finger_2', 'Finger 2', has(f.finger_2_bpm) ? fmt(f.finger_2_bpm.mean) : null, 'bpm');
      push(m, 'fingers_diff', 'Between the fingers', fmt(f.fingers_abs_diff_bpm), 'bpm', 'mean absolute difference');
      const p = f.presence_s;
      if (p) push(m, 'presence', 'Finger detection', fmt(p.active), 's', `measuring; checking for a finger ${fmt(p.probing) ?? 0} s, no finger ${fmt(p.idle) ?? 0} s`);
    }
    if (b) push(block(b, 'breathing'), 'breathing', 'Breathing rate', has(b.rate_per_min) ? fmt(b.rate_per_min.mean) : null, 'per min', has(b.rate_per_min) ? range(b.rate_per_min) : '', SERIES.breathing);
    if (h) {
      const m = block(h, 'hrv');
      const r = h.rmssd_ms;
      push(m, 'rmssd', 'HRV (RMSSD)', has(r) ? fmt(r.mean) : null, 'ms', has(r) && isNum(r.first) && isNum(r.last) ? `${fmt(r.first)} → ${fmt(r.last)}, first to last` : '', SERIES.rmssd);
      if (has(h.sdnn_ms)) push(m, 'sdnn', 'SDNN', fmt(h.sdnn_ms.mean), 'ms');
      if (has(h.rmssd_vs_baseline)) push(m, 'vs_baseline', 'vs recent median', pct(h.rmssd_vs_baseline.mean), '%', VS_NOTE);
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
    const meta = [r.source, r.ageText, r.note].filter(Boolean).map(esc).join(' · ');
    return `<div class="sig-row${r.missing ? ' none' : ''}" data-key="${esc(r.key)}">
      <span class="sig-l">${esc(r.label)}</span>
      ${r.series ? spark(series, r.series) : ''}
      <span class="sig-v num">${esc(r.value)}${r.unit && !r.missing ? `${r.unit === '%' ? '' : ' '}<small>${esc(r.unit)}</small>` : ''}</span>
      <span class="sig-s">${meta}${badge(r.simulated)}</span>
    </div>`;
  }

  // o: {physio, camera, at, cameraAt, via, session, sessionLabel, bound, nowMs}
  //  physio, camera: the newest objects (contracts/api.md 3.5) or null; at, cameraAt: when the dashboard received them (ms)
  //  via: 'phone' or 'hub'; session: a compact session row with `vitals` (and `simulated_fields`); bound: this patient is
  //  bound to the bedside unit; nowMs: the caller's clock. Returns '' when there is nothing to show.
  function html(o) {
    const now = o.nowMs;
    const age = (at) => (isNum(at) && isNum(now) ? Math.max(0, (now - at) / 1000) : null);
    const rows = liveRows(o.physio, null, age(o.at)).concat(liveRows(null, o.camera, age(o.cameraAt ?? o.at)));
    const vit = o.session && o.session.vitals;
    const srows = vit ? sessionRows(vit, o.session.simulated_fields) : [];
    if (!rows.length && !srows.length && !o.bound) return '';
    const out = [];
    if (rows.length) {
      // `link` is the phone's Bluetooth link. It says nothing about a frame the phone got from the hub
      // (transport hub_http): those values are current while the Bluetooth link may be off or searching.
      const link = o.physio && o.via === 'phone' && o.physio.transport !== 'hub_http' && LINK[o.physio.link];
      const from = [o.via === 'phone' ? 'relayed by the phone' : o.via === 'hub' ? 'from the bedside source on the hub' : '', link || ''].filter(Boolean).join(' · ');
      out.push(`<div class="sig-block" data-part="now"><div class="sig-h"><h3>Current readings</h3><span class="muted">${esc(from)}</span></div><div class="sig-rows">${rows.map((r) => rowHtml(r)).join('')}</div></div>`);
    } else if (o.bound) {
      out.push('<p class="sig-empty muted">No finger sensor reading yet</p>');
    }
    if (srows.length) {
      const when = o.sessionLabel || (o.session.started_iso ? `${o.session.started_iso.slice(0, 10)} ${o.session.started_iso.slice(11, 16)}` : '');
      const noQ = vit.finger && vit.finger.quality_reported === false;
      out.push(`<div class="sig-block" data-part="session"><div class="sig-h"><h3>Last session with sensor data</h3><span class="muted">${esc(when)}</span></div><div class="sig-rows">${srows.map((r) => rowHtml(r, vit.series)).join('')}</div>${noQ ? '<p class="sig-note">signal quality not reported by this sensor version; not used by the game</p>' : ''}</div>`);
    }
    out.push('<p class="sig-foot">Measured values with their source. Support for monitoring and follow-up, not a diagnosis. HRV is shown as a number and is not part of the index.</p>');
    return out.join('');
  }

  // One row per number of a handed-over code. `ok(x, key)` says which stored numbers are values; anything else, and a
  // week without a reading, is null, never 0. `week` is the newest week that has a value.
  function codeRows(spec, block, ok, fmt, source) {
    if (!block || typeof block !== 'object') return [];
    return spec.map(([key, label, unit, note]) => {
      const raw = block.weekly && block.weekly[key];
      const weeks = Array.from({ length: WEEKS }, (_, i) => (Array.isArray(raw) && isNum(raw[i]) && ok(raw[i], key) ? raw[i] : null));
      let week = WEEKS - 1;
      while (week >= 0 && weeks[week] === null) week--;
      const missing = week < 0;
      const simulated = !missing && !!block.simulated && block.simulated[key] === true;
      const days = !missing && block.days && isNum(block.days[key]) && block.days[key] > 0 ? block.days[key] : null;
      return { key, label, unit, note, weeks, week: missing ? null : week, value: missing ? NO_READING : fmt(weeks[week], key), missing, days, simulated,
        source: simulated ? SOURCE.simulated : source, fmt: (x) => fmt(x, key) };
    });
  }

  // `weekLabel(i)` names week i by its first day; the page draws the charts into #<prefix><key>.
  function codeHtml(rows, weekLabel, prefix, foot) {
    const cells = rows.map((r) => {
      const meta = r.missing ? [] : [r.source, `week from ${weekLabel(r.week)}`, r.days ? `${r.days} ${r.days === 1 ? 'day' : 'days'} with a reading` : '', r.note];
      return `<div class="mm sig-mm${r.missing ? ' none' : ''}" data-key="${esc(r.key)}">
        <div class="mm-h"><span>${esc(r.label)}</span><span class="mm-v num">${esc(r.value)}${r.missing ? '' : `<small> ${esc(r.unit)}</small>`}</span></div>
        <div class="sig-s">${meta.filter(Boolean).map(esc).join(' · ')}${badge(r.simulated)}</div>
        ${r.missing ? '' : `<div class="chart-wrap" id="${prefix}${esc(r.key)}"></div>`}</div>`;
    }).join('');
    return `<div class="mms">${cells}</div><p class="sig-foot">${esc(foot)}</p>`;
  }
  const empty = (text) => `<p class="sig-empty muted">${esc(text)}</p>`;

  // `vitals` is the block of a decoded code, or nothing for a code made before the block existed.
  function weeklyRows(vitals) {
    return codeRows(WEEKLY, vitals, (x) => x > 0, (x) => x.toFixed(1), SOURCE.finger);
  }

  function weeklyHtml(vitals, weekLabel = () => '') {
    const rows = weeklyRows(vitals);
    if (!rows.length) return empty(NOT_CARRIED);
    if (rows.every((r) => r.missing)) return empty(NO_WEEKS);
    return codeHtml(rows, weekLabel, 'sig-', WEEKLY_FOOT);
  }

  // `face` is the block of a decoded code; null when the encoder left it out because the code was full.
  function faceRows(face) {
    return codeRows(FACE_WEEKLY, face, (x, k) => x >= 0 && (!SHARES.has(k) || x <= 1),
      (x, k) => String(Math.round(SHARES.has(k) ? x * 100 : x)), SOURCE.face);
  }

  function faceHtml(face, weekLabel = () => '') {
    if (face === null) return empty(FACE_LEFT_OUT);
    const rows = faceRows(face);
    if (!rows.length) return empty(FACE_NOT_CARRIED);
    if (rows.every((r) => r.missing)) return empty(FACE_NO_WEEKS);
    return codeHtml(rows, weekLabel, 'face-', FACE_FOOT);
  }

  C.signals = { liveRows, sessionRows, html, weeklyRows, weeklyHtml, faceRows, faceHtml, STALE_S };
})();
