(() => {
  const C = (window.C = window.C || {});

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  C.css = css;
  const STATE_VAR = { stable: '--c-stable', watch: '--c-watch', check_in: '--c-check', booster: '--c-booster' };
  C.stateColor = (s) => css(STATE_VAR[s] || STATE_VAR.stable);
  C.MOOD = ['#34476E', '#5A7CA6', '#A9A79A', '#E8B867', '#FFCB5C'];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  C.esc = esc;

  const FLAG_TEXT = {
    safety_high: { chip: 'Safety: high', toast: 'check-in safety answer: high', tier: 'high' },
    safety_moderate: { chip: 'Safety: moderate', toast: 'check-in safety answer: moderate', tier: 'moderate' },
    safety_incomplete: { chip: 'Safety: incomplete', toast: 'stopped the check-in before the safety item', tier: 'incomplete' },
    safety_low: { chip: 'Safety: low', toast: 'check-in safety answer: low', tier: 'low' },
    talk_request: { chip: 'Asked to talk', toast: 'tapped Talk to someone', tier: null },
  };
  const FLAG_RANK = { safety_high: 0, safety_moderate: 1, safety_incomplete: 2, safety_low: 3, talk_request: 4 };
  C.flagText = (type, where) => (FLAG_TEXT[type] || FLAG_TEXT.talk_request)[where];
  C.isSafety = (type) => type && type.startsWith('safety_');
  C.flagRank = (flags) => Math.min(9, ...(flags || []).map((f) => FLAG_RANK[f.type] ?? 9));
  C.sortFlags = (flags) => [...(flags || [])].sort((a, b) => (FLAG_RANK[a.type] ?? 9) - (FLAG_RANK[b.type] ?? 9) || String(b.t_iso || '').localeCompare(String(a.t_iso || '')));

  const scale = (d0, d1, r0, r1) => {
    const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
    f.domain = [d0, d1];
    return f;
  };
  C.scale = scale;

  function path(xs, vals, x, y, connect) {
    let d = '', pen = false;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v == null || Number.isNaN(v)) { if (!connect) pen = false; continue; }
      d += (pen ? 'L' : 'M') + x(xs[i]).toFixed(1) + ' ' + y(v).toFixed(1);
      pen = true;
    }
    return d;
  }

  function niceTicks(lo, hi, n = 4) {
    const span = hi - lo || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(span / n)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  C.niceTicks = niceTicks;

  const lastIndex = (vals) => { let i = vals.length - 1; while (i > 0 && vals[i] == null) i--; return i; };

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

  C.sparkline = function (vals, o = {}) {
    const w = o.w || 140, h = o.h || 28;
    const [lo, hi] = o.domain || [-1, 2.5];
    const [b0, b1] = o.band || [-0.5, 0.5];
    const finite = vals.filter((v) => v != null);
    const x = scale(0, Math.max(1, vals.length - 1), 4, w - 4);
    const y = scale(lo, hi, h - 3, 3);
    const clamp = (v) => (v == null ? null : Math.max(lo, Math.min(hi, v)));
    const cv = vals.map(clamp);
    const by0 = y(b1), bh = Math.max(6, y(b0) - y(b1));
    const band = `<rect x="0" y="${by0.toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="${css('--c-band')}"/>`;
    if (!finite.length) return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${band}</svg>`;
    const li = lastIndex(cv);
    const line = css('--c-line');
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${band}
      <path d="${path(cv.map((_, i) => i), cv, x, y)}" fill="none" stroke="${line}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(li).toFixed(1)}" cy="${y(cv[li]).toFixed(1)}" r="3.6" fill="${line}" stroke="${css('--c-surface')}" stroke-width="1.5"/>
    </svg>`;
  };

  C.seriesChart = function (el, o) {
    const W = Math.max(280, el.clientWidth), H = o.h || 200;
    const ML = 4, MR = 4, top = 24, bottom = H - 26;
    const vals = o.values, n = vals.length;
    const x = scale(0, Math.max(1, n - 1), ML, W - MR);
    const finite = vals.filter((v) => v != null).concat(o.band || [], o.threshold != null ? [o.threshold] : []);
    let lo = Math.min(...finite), hi = Math.max(...finite);
    const pad = (hi - lo) * 0.14 || 0.5;
    lo -= pad; hi += pad;
    const y = scale(lo, hi, bottom, top);
    const line = css('--c-line');
    const g = [];
    if (o.band) {
      const [b0, b1] = o.band;
      const yb = y(b1), hb = Math.max(4, y(b0) - y(b1));
      g.push(`<rect x="${ML}" y="${yb.toFixed(1)}" width="${W - ML - MR}" height="${hb.toFixed(1)}" rx="8" fill="${css('--c-band')}"/>`);
      if (o.mid != null) g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y(o.mid).toFixed(1)}" y2="${y(o.mid).toFixed(1)}" stroke="${css('--c-band-line')}" stroke-width="1"/>`);
      const ly = yb - 7 < top - 6 ? y(b0) + 16 : yb - 7;
      g.push(`<text x="${ML + 4}" y="${ly.toFixed(1)}" class="lbl-band">${esc(o.bandLabel || 'personal baseline')}</text>`);
    }
    if (o.threshold != null) {
      const yt = y(o.threshold).toFixed(1);
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${yt}" y2="${yt}" stroke="${o.thresholdColor}" stroke-width="1.5" stroke-dasharray="5 5"/>`);
      g.push(`<text x="${W - MR - 2}" y="${(+yt - 7).toFixed(1)}" text-anchor="end" class="lbl-thr">${esc(o.thresholdLabel)}</text>`);
    }
    const d = path(vals.map((_, i) => i), vals, x, y, o.connect);
    g.push(`<path d="${d}" fill="none" stroke="${line}" stroke-width="${o.connect ? 1.5 : 2.25}" stroke-linejoin="round" stroke-linecap="round"/>`);
    if (o.connect || o.dots) vals.forEach((v, i) => v != null && g.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5" fill="${line}"/>`));
    const li = lastIndex(vals);
    if (vals[li] != null) {
      g.push(`<circle class="last-ring" cx="${x(li).toFixed(1)}" cy="${y(vals[li]).toFixed(1)}" r="9" fill="${line}" opacity="0.14"/>`);
      g.push(`<circle cx="${x(li).toFixed(1)}" cy="${y(vals[li]).toFixed(1)}" r="4.5" fill="${line}" stroke="${css('--c-surface-low')}" stroke-width="2"/>`);
    }
    (o.xlabels || []).forEach(([i, t], k, arr) => g.push(`<text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="${k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle'}">${esc(t)}</text>`));
    g.push(`<line class="xhair" x1="0" x2="0" y1="${top - 8}" y2="${bottom}" stroke="${css('--c-outline')}" opacity="0" stroke-width="1"/>`);
    g.push(`<circle class="xdot" r="4" fill="${line}" opacity="0"/>`);
    g.push(`<rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`);
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g.join('')}</svg>`;
    if (!o.tip) return;
    const svg = el.firstChild, hit = svg.querySelector('.hit'), xh = svg.querySelector('.xhair'), xd = svg.querySelector('.xdot');
    hit.addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left - ML) / (W - ML - MR)) * (n - 1))));
      const xx = x(i);
      xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.setAttribute('opacity', 0.5);
      if (vals[i] != null) { xd.setAttribute('cx', xx); xd.setAttribute('cy', y(vals[i])); xd.setAttribute('opacity', 1); } else xd.setAttribute('opacity', 0);
      C.tipShow(o.tip(i), r.left + xx, ev.clientY);
    });
    hit.addEventListener('mouseleave', () => { xh.setAttribute('opacity', 0); xd.setAttribute('opacity', 0); C.tipHide(); });
  };

  C.bars = function (vals, o = {}) {
    const w = o.w || 220, h = o.h || 28;
    const finite = vals.filter((v) => v != null);
    if (!finite.length) return `<svg class="bars" width="100%" height="${h}"></svg>`;
    const lo = o.min ?? Math.min(0, ...finite), hi = Math.max(o.max ?? -Infinity, ...finite, o.ref ?? -Infinity) || 1;
    const n = vals.length, bw = w / n;
    const y = scale(lo, hi, h - 1, 2);
    const out = [];
    const base = css('--c-surface-highest'), last = css('--c-line'), faint = css('--c-outline-variant');
    vals.forEach((v, i) => {
      if (v == null) { out.push(`<rect x="${(i * bw + bw / 2 - 1).toFixed(1)}" y="${h - 2}" width="2" height="2" rx="1" fill="${faint}"/>`); return; }
      const yy = y(v), hh = Math.max(1.5, y(lo) - yy);
      out.push(`<rect x="${(i * bw + 1).toFixed(1)}" y="${yy.toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${i === n - 1 ? last : base}"><title>${esc(o.title ? o.title(i, v) : v)}</title></rect>`);
    });
    if (o.ref != null) out.push(`<line x1="0" x2="${w}" y1="${y(o.ref).toFixed(1)}" y2="${y(o.ref).toFixed(1)}" stroke="${css('--c-outline')}" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`);
    return `<svg class="bars" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${out.join('')}</svg>`;
  };

  C.lineChart = function (el, o) {
    const W = Math.max(280, el.clientWidth), H = o.h || 240;
    const ML = 40, MR = o.mr ?? 84, top = 16, bottom = H - 28;
    const n = o.x.length;
    const x = scale(o.x[0], o.x[n - 1], ML, W - MR);
    const all = o.series.flatMap((s) => s.values.filter((v) => v != null));
    let lo = o.min ?? Math.min(...all), hi = o.max ?? Math.max(...all);
    if (o.min == null) lo -= (hi - lo) * 0.1;
    if (o.max == null) hi += (hi - lo) * 0.1;
    const y = scale(lo, hi, bottom, top);
    const g = [];
    const grid = css('--c-grid'), outline = css('--c-outline-variant');
    niceTicks(lo, hi, 4).forEach((tv) => {
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${y(tv).toFixed(1)}" y2="${y(tv).toFixed(1)}" stroke="${grid}"/>`);
      g.push(`<text x="${ML - 8}" y="${(y(tv) + 4).toFixed(1)}" text-anchor="end">${o.ytick ? o.ytick(tv) : tv}</text>`);
    });
    (o.marks || []).forEach((m) => {
      const xx = x(m.x).toFixed(1);
      g.push(`<line x1="${xx}" x2="${xx}" y1="${top}" y2="${bottom}" stroke="${m.color}" stroke-dasharray="4 4"/>`);
      g.push(`<text x="${(+xx + 6).toFixed(1)}" y="${top + 12}" fill="${m.color}" class="lbl-thr">${esc(m.label)}</text>`);
    });
    (o.hlines || []).forEach((m) => {
      const yy = y(m.y).toFixed(1);
      g.push(`<line x1="${ML}" x2="${W - MR}" y1="${yy}" y2="${yy}" stroke="${m.color}" stroke-width="1.5" stroke-dasharray="5 5"/>`);
      g.push(`<text x="${W - MR + 8}" y="${(+yy + 4).toFixed(1)}" fill="${m.color}" class="lbl-thr">${esc(m.label)}</text>`);
    });
    o.series.forEach((s) => {
      const d = path(o.x, s.values, x, y);
      g.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.25}" stroke-linejoin="round" stroke-linecap="round" opacity="${s.opacity || 1}"/>`);
      const li = lastIndex(s.values);
      if (s.label) g.push(`<text x="${(x(o.x[li]) + 8).toFixed(1)}" y="${(y(s.values[li]) + 4).toFixed(1)}" fill="${s.color}" class="lbl-thr">${esc(s.label)}</text>`);
    });
    g.push(`<line x1="${ML}" x2="${W - MR}" y1="${bottom}" y2="${bottom}" stroke="${outline}"/>`);
    (o.xticks || []).forEach((tv) => g.push(`<text x="${x(tv).toFixed(1)}" y="${bottom + 20}" text-anchor="middle">${o.xtick ? o.xtick(tv) : tv}</text>`));
    g.push(`<line class="xhair" x1="0" x2="0" y1="${top}" y2="${bottom}" stroke="${css('--c-outline')}" opacity="0"/>`);
    g.push(`<rect class="hit" x="${ML}" y="0" width="${W - MR - ML}" height="${H}" fill="transparent"/>`);
    el.innerHTML = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g.join('')}</svg>`;
    const svg = el.firstChild, hit = svg.querySelector('.hit'), xh = svg.querySelector('.xhair');
    hit.addEventListener('mousemove', (ev) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - r.left - ML) / (W - MR - ML)) * (n - 1))));
      const xx = x(o.x[i]);
      xh.setAttribute('x1', xx); xh.setAttribute('x2', xx); xh.setAttribute('opacity', 0.5);
      C.tipShow(o.tip(i), r.left + xx, ev.clientY);
    });
    hit.addEventListener('mouseleave', () => { xh.setAttribute('opacity', 0); C.tipHide(); });
  };
})();
