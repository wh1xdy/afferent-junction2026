(() => {
  const C = (window.C = window.C || {});
  let uid = 0;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const STATE_VAR = { stable: '--af-state-stable', watch: '--af-state-watch', check_in: '--af-state-check-in', booster: '--af-state-booster' };
  const MODE_VAR = { calm: '--af-mode-calm', flow: '--af-mode-flow', wake: '--af-mode-wake', fatigue: '--af-mode-fatigue', rest: '--af-mode-rest', measure: '--af-mode-measure' };
  C.stateColor = (s) => css(STATE_VAR[s] || STATE_VAR.stable);
  C.modeColor = (m) => css(MODE_VAR[m] || '--af-silver-400');
  C.css = css;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  C.esc = esc;

  const FLAG_TEXT = {
    low_mood_twice: { chip: 'Dimmest lantern twice', toast: 'chose the dimmest lantern twice', banner: 'chose the dimmest mood lantern at the start and end of a session' },
    weekly_checkin: { chip: 'Weekly check-in, item 3', toast: 'answered above “Not at all” on the self-harm item of the weekly check-in', banner: 'answered above “Not at all” on the self-harm item of the weekly check-in' },
    talk_request: { chip: 'Asked to talk', toast: 'tapped “Talk to someone”', banner: 'tapped “Talk to someone”' },
  };
  C.flagText = (type, where) => (FLAG_TEXT[type] || FLAG_TEXT.talk_request)[where];

  const scale = (d0, d1, r0, r1) => {
    const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    f.domain = [d0, d1];
    return f;
  };
  C.scale = scale;

  function path(xs, vals, x, y) {
    let d = '', pen = false;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null || Number.isNaN(v)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + x(xs[i]).toFixed(1) + ' ' + y(v).toFixed(1);
      pen = true;
    }
    return d;
  }

  function areas(xs, vals, x, y, base) {
    const out = [];
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        out.push('M' + seg.map(([a, b]) => a.toFixed(1) + ' ' + b.toFixed(1)).join('L') + `L${seg[seg.length - 1][0].toFixed(1)} ${base}L${seg[0][0].toFixed(1)} ${base}Z`);
      }
      seg = [];
    };
    vals.forEach((v, i) => (v == null ? flush() : seg.push([x(xs[i]), y(v)])));
    flush();
    return out.join('');
  }

  function niceTicks(lo, hi, n = 4) {
    const span = hi - lo || 1;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  C.niceTicks = niceTicks;

  const tip = () => document.getElementById('tip');
  C.tipShow = (html, cx, cy) => {
    const t = tip();
    t.innerHTML = html;
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let left = cx + 16, top = cy - r.height / 2;
    if (left + r.width > window.innerWidth - 12) left = cx - r.width - 16;
    top = Math.max(8, Math.min(window.innerHeight - r.height - 8, top));
    t.style.transform = `translate(${left}px, ${top}px)`;
  };
  C.tipHide = () => { tip().hidden = true; };

  function glowDefs(id, color) {
    return `<defs>
      <filter id="glow${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
      <linearGradient id="fill${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.16"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>`;
  }

  C.sparkline = function (vals, opts = {}) {
    const w = opts.w || 132, h = opts.h || 36, id = ++uid;
    const color = opts.color || css('--af-clinic-line-primary');
    const xs = vals.map((_, i) => i);
    const finite = vals.filter((v) => v != null);
    if (!finite.length) return `<svg class="spark" width="${w}" height="${h}"></svg>`;
    const lo = Math.min(-0.5, ...finite), hi = Math.max(1, ...finite);
    const x = scale(0, Math.max(1, vals.length - 1), 3, w - 6), y = scale(lo, hi, h - 4, 4);
    let li = vals.length - 1;
    while (li > 0 && vals[li] == null) li--;
    const d = path(xs, vals, x, y);
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${glowDefs(id, color)}
      <line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="${css('--af-clinic-baseline-line')}" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>
      <path d="${areas(xs, vals, x, y, h)}" fill="url(#fill${id})"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="5" opacity="0.35" filter="url(#glow${id})"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(li).toFixed(1)}" cy="${y(vals[li]).toFixed(1)}" r="3" fill="${color}"/>
    </svg>`;
  };

  C.timeline = function (el, o) {
    const W = Math.max(320, el.clientWidth), id = ++uid;
    const ML = 44, MR = 92, top = 18;
    const H1 = o.compact ? 176 : 220, gap = 30, H2 = o.compact ? 70 : 84, ribbon = 6;
    const y1b = top + H1, y2t = y1b + gap, y2b = y2t + H2, rt = y2b + 14, H = rt + ribbon + 30;
    const n = o.days.length;
    const x = scale(0, Math.max(1, n - 1), ML, W - MR);
    const primary = css('--af-clinic-line-primary');
    const t = o.top;
    const vals = t.values;
    const finite = vals.filter((v) => v != null).concat(t.band ? t.band : []);
    let lo = Math.min(...finite, t.floor ?? Infinity), hi = Math.max(...finite, t.ceil ?? -Infinity);
    const pad = (hi - lo) * 0.12 || 0.5;
    lo -= pad; hi += pad;
    const y = scale(lo, hi, y1b, top);
    const ticks = niceTicks(lo, hi, 4);
    const cmax = Math.max(10, ...o.cusum.filter((v) => v != null)) * 1.08;
    const yc = (v) => y2b - (Math.log1p(Math.max(0, v)) / Math.log1p(cmax)) * H2;
    const xs = o.days;
    let li = vals.length - 1;
    while (li > 0 && vals[li] == null) li--;

    const g = [];
    g.push(glowDefs(id, primary));
    g.push(`<rect x="${ML}" y="${top}" width="${(x(Math.min(13, n - 1)) - ML + (x(1) - x(0)) / 2).toFixed(1)}" height="${H1}" fill="${css('--af-silver-300')}" opacity="0.025"/>`);
    g.push(`<text x="${ML + 8}" y="${top + 14}" class="ax-note">Baseline, days 0 to 13</text>`);
    ticks.forEach((tv) => {
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}" stroke="${css('--af-clinic-grid')}"/>`);
      g.push(`<text x="${ML - 10}" y="${(y(tv) + 4).toFixed(1)}" class="ax" text-anchor="end">${t.tick ? t.tick(tv) : tv}</text>`);
    });
    if (t.band) {
      const [b0, b1] = t.band;
      g.push(`<rect x="${ML}" y="${y(b1).toFixed(1)}" width="${W - MR - ML}" height="${(y(b0) - y(b1)).toFixed(1)}" fill="${css('--af-clinic-baseline-band')}" rx="2"/>`);
      g.push(`<text x="${W - MR + 10}" y="${(y((b0 + b1) / 2) + 4).toFixed(1)}" class="ax-note">Usual range</text>`);
    }
    if (t.median != null) g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y(t.median).toFixed(1)}" y2="${y(t.median).toFixed(1)}" stroke="${css('--af-clinic-baseline-line')}" stroke-dasharray="3 4"/>`);
    if (t.raw) {
      t.raw.forEach((v, i) => { if (v != null) g.push(`<circle cx="${x(xs[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.2" fill="${css('--af-silver-400')}" opacity="0.55"/>`); });
    }
    const d = path(xs, vals, x, y);
    g.push(`<path d="${areas(xs, vals, x, y, y1b)}" fill="url(#fill${id})"/>`);
    g.push(`<path d="${d}" fill="none" stroke="${css('--af-clinic-line-primary-glow')}" stroke-width="7" filter="url(#glow${id})"/>`);
    g.push(`<path class="main-line" d="${d}" fill="none" stroke="${primary}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (li >= 0 && vals[li] != null) {
      const cx = x(xs[li]).toFixed(1), cy = y(vals[li]).toFixed(1);
      g.push(`<circle class="last-ring ${o.pulseLast ? 'pulse' : ''}" cx="${cx}" cy="${cy}" r="10" fill="${primary}" opacity="0.16"/>`);
      g.push(`<circle class="last-dot ${o.pulseLast ? 'pulse' : ''}" cx="${cx}" cy="${cy}" r="4.5" fill="${primary}" stroke="${css('--af-clinic-bg')}" stroke-width="2"/>`);
      g.push(`<text x="${(+cx + 14).toFixed(1)}" y="${(+cy + 5).toFixed(1)}" class="last-label">${t.fmt(vals[li])}</text>`);
    }
    g.push(`<text x="${ML}" y="${y2t - 8}" class="ax-note">CUSUM, accumulated drift (log scale)</text>`);
    g.push(`<path d="${areas(xs, o.cusum, x, yc, y2b)}" fill="${css('--af-lantern-amber')}" opacity="0.10"/>`);
    g.push(`<path d="${path(xs, o.cusum, x, yc)}" fill="none" stroke="${css('--af-lantern-amber')}" stroke-width="1.5" opacity="0.85"/>`);
    g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y2b}" y2="${y2b}" stroke="${css('--af-clinic-border-strong')}"/>`);
    const th = o.thresholds || {};
    let lastLabel = Infinity;
    [['watch', 'Watch'], ['check_in', 'Call'], ['booster', 'Booster']].forEach(([k, lab]) => {
      if (th[k] == null) return;
      const yy = yc(th[k]);
      const ly = Math.min(yy + 4, lastLabel - 12);
      lastLabel = ly;
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${C.stateColor(k)}" stroke-dasharray="2 4" opacity="0.55"/>`);
      g.push(`<text x="${W - MR + 10}" y="${ly.toFixed(1)}" class="ax" fill="${C.stateColor(k)}">${lab} ${th[k]}</text>`);
    });
    const cw = Math.max(1, x(1) - x(0));
    o.states.forEach((s, i) => {
      const missed = o.missed && o.missed[i];
      g.push(`<rect x="${(x(xs[i]) - cw / 2 + 0.5).toFixed(1)}" y="${rt}" width="${Math.max(1, cw - 1).toFixed(1)}" height="${ribbon}" rx="1.5" fill="${C.stateColor(s)}" opacity="${missed ? 0.22 : s === 'stable' ? 0.45 : 0.9}"/>`);
    });
    for (let dday = 0; dday < n; dday += 7) {
      const xx = x(xs[dday]).toFixed(1);
      g.push(`<line x1="${xx}" x2="${xx}" y1="${rt + ribbon + 3}" y2="${rt + ribbon + 7}" stroke="${css('--af-clinic-border-strong')}"/>`);
      g.push(`<text x="${xx}" y="${rt + ribbon + 22}" class="ax" text-anchor="middle">${dday === 0 ? 'TMS end' : o.dateLabel(dday)}</text>`);
    }
    if (n - 1 > 0 && (n - 1) % 7 > 2) {
      g.push(`<text x="${x(xs[n - 1]).toFixed(1)}" y="${rt + ribbon + 22}" class="ax ax-today" text-anchor="middle">Today</text>`);
    }
    g.push(`<line class="xhair" x1="0" x2="0" y1="${top}" y2="${rt + ribbon}" stroke="${css('--af-silver-200')}" opacity="0" stroke-width="1"/>`);
    g.push(`<circle class="xdot" r="4" fill="${primary}" opacity="0"/>`);
    g.push(`<rect class="hit" x="${ML}" y="0" width="${W - MR - ML}" height="${H}" fill="transparent"/>`);
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || 'Timeline')}">${g.join('')}</svg>`;

    const svg = el.firstChild, hit = svg.querySelector('.hit'), xh = svg.querySelector('.xhair'), xd = svg.querySelector('.xdot');
    hit.addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - ML) / (W - MR - ML)) * (n - 1))));
      const xx = x(xs[i]);
      xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.setAttribute('opacity', 0.35);
      if (vals[i] != null) { xd.setAttribute('cx', xx); xd.setAttribute('cy', y(vals[i])); xd.setAttribute('opacity', 1); } else xd.setAttribute('opacity', 0);
      C.tipShow(o.tip(i), r.left + xx, ev.clientY);
    });
    hit.addEventListener('mouseleave', () => { xh.setAttribute('opacity', 0); xd.setAttribute('opacity', 0); C.tipHide(); });
  };

  C.bars = function (vals, o = {}) {
    const w = o.w || 220, h = o.h || 40, id = ++uid;
    const finite = vals.filter((v) => v != null);
    const color = o.color || css('--af-silver-300');
    if (!finite.length) return `<svg class="bars" width="${w}" height="${h}"></svg>`;
    const lo = o.min ?? Math.min(0, ...finite), hi = Math.max(o.max ?? -Infinity, ...finite, o.ref ?? -Infinity) || 1;
    const n = vals.length, bw = w / n;
    const y = scale(lo, hi, h - 1, 3);
    const out = [];
    if (o.band) out.push(`<rect x="0" y="${y(o.band[1]).toFixed(1)}" width="${w}" height="${Math.max(1, y(o.band[0]) - y(o.band[1])).toFixed(1)}" fill="${css('--af-clinic-baseline-band')}"/>`);
    vals.forEach((v, i) => {
      const last = i === n - 1;
      if (v == null) {
        out.push(`<rect x="${(i * bw + bw / 2 - 1).toFixed(1)}" y="${h - 3}" width="2" height="2" rx="1" fill="${css('--af-clinic-text-faint')}"/>`);
        return;
      }
      const yy = y(v), hh = Math.max(1.5, y(lo) - yy);
      out.push(`<rect x="${(i * bw + 1).toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${last ? css('--af-clinic-line-primary') : color}" opacity="${last ? 1 : 0.5}"><title>${esc(o.title ? o.title(i, v) : v)}</title></rect>`);
    });
    if (o.ref != null) out.push(`<line x1="0" x2="${w}" y1="${y(o.ref).toFixed(1)}" y2="${y(o.ref).toFixed(1)}" stroke="${css('--af-clinic-baseline-line')}" stroke-dasharray="3 3"/>`);
    return `<svg class="bars" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${out.join('')}</svg>`;
  };

  C.trace = function (vals, o = {}) {
    const w = o.w || 300, h = o.h || 64, id = ++uid;
    const color = o.color || css('--af-clinic-line-primary');
    const finite = vals.filter((v) => v != null);
    if (finite.length < 2) return `<svg class="trace" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"></svg>`;
    const lo = Math.min(...finite, o.ref ?? Infinity) - 3, hi = Math.max(...finite, o.ref ?? -Infinity) + 3;
    const x = scale(0, Math.max(20, vals.length) - 1, 2, w - 6), y = scale(lo, hi, h - 4, 4);
    const xs = vals.map((_, i) => i);
    const d = path(xs, vals, x, y);
    return `<svg class="trace" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${glowDefs(id, color)}
      ${o.ref != null ? `<line x1="0" x2="${w}" y1="${y(o.ref).toFixed(1)}" y2="${y(o.ref).toFixed(1)}" stroke="${css('--af-clinic-baseline-line')}" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>` : ''}
      <path d="${areas(xs, vals, x, y, h)}" fill="url(#fill${id})"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="5" opacity="0.3" filter="url(#glow${id})" vector-effect="non-scaling-stroke"/>
      <path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>`;
  };

  C.lineChart = function (el, o) {
    const W = Math.max(280, el.clientWidth), H = o.h || 240, id = ++uid;
    const ML = 44, MR = o.mr ?? 84, top = 16, bottom = H - 30;
    const n = o.x.length;
    const x = scale(o.x[0], o.x[n - 1], ML, W - MR);
    const all = o.series.flatMap((s) => s.values.filter((v) => v != null));
    let lo = o.min ?? Math.min(...all), hi = o.max ?? Math.max(...all);
    if (o.min == null) lo -= (hi - lo) * 0.1;
    if (o.max == null) hi += (hi - lo) * 0.1;
    const y = scale(lo, hi, bottom, top);
    const g = [];
    o.series.forEach((s, k) => g.push(glowDefs(id + '_' + k, s.color)));
    niceTicks(lo, hi, 4).forEach((tv) => {
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}" stroke="${css('--af-clinic-grid')}"/>`);
      g.push(`<text x="${ML - 10}" y="${(y(tv) + 4).toFixed(1)}" class="ax" text-anchor="end">${o.ytick ? o.ytick(tv) : tv}</text>`);
    });
    (o.marks || []).forEach((m) => {
      const xx = x(m.x).toFixed(1);
      g.push(`<line x1="${xx}" x2="${xx}" y1="${top}" y2="${bottom}" stroke="${m.color || css('--af-silver-400')}" stroke-dasharray="2 4" opacity="0.7"/>`);
      g.push(`<text x="${(+xx + 6).toFixed(1)}" y="${top + 12}" class="ax-note" fill="${m.color || ''}">${esc(m.label)}</text>`);
    });
    (o.hlines || []).forEach((m) => {
      const yy = y(m.y).toFixed(1);
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${yy}" y2="${yy}" stroke="${m.color}" stroke-dasharray="2 4" opacity="0.6"/>`);
      g.push(`<text x="${W - MR + 10}" y="${(+yy + 4).toFixed(1)}" class="ax" fill="${m.color}">${esc(m.label)}</text>`);
    });
    o.series.forEach((s, k) => {
      const d = path(o.x, s.values, x, y);
      if (s.fill) g.push(`<path d="${areas(o.x, s.values, x, y, bottom)}" fill="url(#fill${id}_${k})"/>`);
      if (s.glow) g.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="6" opacity="0.35" filter="url(#glow${id}_${k})"/>`);
      g.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} opacity="${s.opacity || 1}"/>`);
      let li = s.values.length - 1;
      while (li > 0 && s.values[li] == null) li--;
      if (s.label) g.push(`<text x="${(x(o.x[li]) + 10).toFixed(1)}" y="${(y(s.values[li]) + 4).toFixed(1)}" class="series-label" fill="${s.color}">${esc(s.label)}</text>`);
    });
    g.push(`<line x1="${ML}" x2="${W - MR}" y1="${bottom}" y2="${bottom}" stroke="${css('--af-clinic-border-strong')}"/>`);
    (o.xticks || []).forEach((tv) => g.push(`<text x="${x(tv).toFixed(1)}" y="${bottom + 20}" class="ax" text-anchor="middle">${o.xtick ? o.xtick(tv) : tv}</text>`));
    g.push(`<line class="xhair" x1="0" x2="0" y1="${top}" y2="${bottom}" stroke="${css('--af-silver-200')}" opacity="0"/>`);
    g.push(`<rect class="hit" x="${ML}" y="0" width="${W - MR - ML}" height="${H}" fill="transparent"/>`);
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g.join('')}</svg>`;
    const svg = el.firstChild, hit = svg.querySelector('.hit'), xh = svg.querySelector('.xhair');
    hit.addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const fx = (ev.clientX - r.left - ML) / (W - MR - ML);
      const i = Math.max(0, Math.min(n - 1, Math.round(fx * (n - 1))));
      const xx = x(o.x[i]);
      xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.setAttribute('opacity', 0.35);
      C.tipShow(o.tip(i), r.left + xx, ev.clientY);
    });
    hit.addEventListener('mouseleave', () => { xh.setAttribute('opacity', 0); C.tipHide(); });
  };

  C.stickFigure = function (pose, o = {}) {
    const w = 180, h = 200;
    const silver = css('--af-silver-200'), amber = css('--af-lantern-amber');
    let k = pose && pose.keypoints;
    if (!k) {
      const pitch = (o.pitch ?? -8) * (Math.PI / 180);
      const hx = 0.5 + Math.sin(-pitch) * 0.07, hy = 0.2 + (1 - Math.cos(pitch)) * 0.1;
      k = { head: [hx, hy], neck: [0.5, 0.33], l_shoulder: [0.38, 0.36], r_shoulder: [0.62, 0.36], l_elbow: [0.33, 0.52], r_elbow: [0.67, 0.52], l_wrist: [0.4, 0.64], r_wrist: [0.6, 0.64], l_hip: [0.43, 0.74], r_hip: [0.57, 0.74] };
    }
    const P = (n) => (k[n] ? [k[n][0] * w, k[n][1] * h] : null);
    const seg = (a, b) => {
      const p = P(a), q = P(b);
      return p && q ? `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}"/>` : '';
    };
    const hip = k.l_hip && k.r_hip ? [((k.l_hip[0] + k.r_hip[0]) / 2) * w, ((k.l_hip[1] + k.r_hip[1]) / 2) * h] : null;
    const neck = P('neck');
    const head = P('head');
    const lines = [seg('l_shoulder', 'r_shoulder'), seg('l_shoulder', 'l_elbow'), seg('l_elbow', 'l_wrist'), seg('r_shoulder', 'r_elbow'), seg('r_elbow', 'r_wrist'), seg('l_hip', 'r_hip'), seg('neck', 'head')];
    if (hip && neck) lines.push(`<line x1="${neck[0].toFixed(1)}" y1="${neck[1].toFixed(1)}" x2="${hip[0].toFixed(1)}" y2="${hip[1].toFixed(1)}"/>`);
    const joints = Object.keys(k).filter((n) => n !== 'head').map((n) => `<circle cx="${(k[n][0] * w).toFixed(1)}" cy="${(k[n][1] * h).toFixed(1)}" r="3" fill="${amber}"/>`);
    return `<svg class="stick" viewBox="0 0 ${w} ${h}" width="100%" height="100%" aria-label="Stick figure">
      <g stroke="${silver}" stroke-width="2.5" stroke-linecap="round" opacity="0.9">${lines.join('')}</g>
      ${head ? `<circle cx="${head[0].toFixed(1)}" cy="${head[1].toFixed(1)}" r="15" fill="none" stroke="${silver}" stroke-width="2.5"/>` : ''}
      ${joints.join('')}
    </svg>`;
  };
})();
