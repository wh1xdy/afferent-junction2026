(() => {
  const C = (window.C = window.C || {});
  const NO_READING = 'no reading';
  const WEEKS = 8;
  const SOURCE = { finger: 'finger sensor (PPG)', simulated: 'simulator' };
  const WEEKLY = [
    ['pulse_bpm', 'Pulse, finger sensor', 'bpm', 'session mean, clips on during play'],
    ['breathing_per_min', 'Breathing rate', 'per min', 'from the pulse rhythm'],
    ['rmssd_ms', 'HRV (RMSSD)', 'ms', '60 s windows'],
  ];
  const NOT_CARRIED = 'Not in this export';
  const NO_WEEKS = 'No reading in these 8 weeks';

  const esc = (s) => C.esc(s);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const badge = (on) => (on ? '<span class="sim-badge small">Simulated</span>' : '');

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
    return `<div class="mms">${cells}</div>`;
  }

  // The bedroom at night from the code (map key 19): context next to the signals, not part of the index.
  const ROOM = [
    ['temp_c_night', 'Temperature at night', '°C', 1, 'bedside unit, 23:00 to 07:00'],
    ['humidity_pct', 'Humidity at night', '%', 0, 'bedside unit, 23:00 to 07:00'],
  ];
  const SLEEP_C = [16, 19];

  function roomRows(room) {
    if (!room || typeof room !== 'object') return [];
    return ROOM.map(([key, label, unit, dp, note]) => {
      const raw = room.weekly && room.weekly[key];
      const weeks = Array.from({ length: WEEKS }, (_, i) => (Array.isArray(raw) && isNum(raw[i]) ? raw[i] : null));
      let week = WEEKS - 1;
      while (week >= 0 && weeks[week] === null) week--;
      const missing = week < 0, simulated = !missing && room.simulated === true;
      return { key, label, unit, dp, note, weeks, week: missing ? null : week, value: missing ? NO_READING : weeks[week].toFixed(dp), missing, simulated,
        nights: !missing && isNum(room.nights) && room.nights > 0 ? room.nights : null };
    });
  }

  function roomHtml(room, weekLabel = () => '') {
    const rows = roomRows(room);
    if (!rows.length) return `<p class="sig-empty muted">${esc(NOT_CARRIED)}</p>`;
    if (rows.every((r) => r.missing)) return `<p class="sig-empty muted">${esc(NO_WEEKS)}</p>`;
    const cells = rows.map((r) => {
      const meta = r.missing ? [] : [r.simulated ? SOURCE.simulated : r.note, `week from ${weekLabel(r.week)}`, r.nights ? `${r.nights} ${r.nights === 1 ? 'night' : 'nights'} with a reading` : '', r.key === 'temp_c_night' ? `band: ${SLEEP_C[0]} to ${SLEEP_C[1]} °C, the range sleep research points to` : ''];
      return `<div class="mm sig-mm${r.missing ? ' none' : ''}" data-key="${esc(r.key)}">
        <div class="mm-h"><span>${esc(r.label)}</span><span class="mm-v num">${esc(r.value)}${r.missing ? '' : `<small> ${esc(r.unit)}</small>`}</span></div>
        <div class="sig-s">${meta.filter(Boolean).map(esc).join(' · ')}${badge(r.simulated)}</div>
        ${r.missing ? '' : `<div class="chart-wrap" id="room-${esc(r.key)}"></div>`}</div>`;
    }).join('');
    return `<div class="mms">${cells}</div>`;
  }

  C.signals = { weeklyRows, weeklyHtml, roomRows, roomHtml, SLEEP_C };
})();
