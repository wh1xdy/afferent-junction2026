(() => {
  const g = typeof globalThis !== 'undefined' ? globalThis : self;
  const node = typeof module !== 'undefined' && module.exports && typeof require === 'function';

  const CSS = `
    :root { color-scheme: light; --ink:#1b2a41; --mut:#5b6b80; --line:#e3e8f0; --card:#ffffff; --bg:#f4f6fa;
      --stable:#2e7d32; --watch:#a87400; --check:#d84315; --boost:#b71c1c; --acc:#2f5aa8; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg);
      color: var(--ink); line-height: 1.45; padding: 24px 16px 48px; }
    main { max-width: 760px; margin: 0 auto; }
    header.top { margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; }
    h2 { font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--mut); margin-bottom: 10px; }
    .sub { color: var(--mut); font-size: 14px; margin-top: 2px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; margin-bottom: 12px; }
    .row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
    .big { font-size: 34px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .chip { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 13px; font-weight: 600;
      color: #fff; background: var(--mut); }
    .chip.stable { background: var(--stable); } .chip.watch { background: var(--watch); }
    .chip.check_in { background: var(--check); } .chip.booster { background: var(--boost); }
    .chip.tier { background: #6a7b91; text-transform: none; font-weight: 500; }
    .sim { display: inline-block; margin-left: 8px; padding: 2px 10px; border-radius: 6px; font-size: 12px;
      font-weight: 700; letter-spacing: .08em; color: #8a5a00; background: #ffe9c2; vertical-align: middle; }
    .kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 10px; }
    .kv div { background: var(--bg); border-radius: 10px; padding: 10px 12px; }
    .kv b { display: block; font-size: 19px; font-variant-numeric: tabular-nums; }
    .kv span { font-size: 12px; color: var(--mut); }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 44px; margin-top: 8px; }
    .bars i { flex: 1; background: var(--acc); border-radius: 3px 3px 0 0; min-height: 2px; opacity: .85; }
    .bars i.none { background: var(--line); }
    .feat { margin-top: 12px; }
    .feat .lbl { font-size: 13px; color: var(--ink); display: flex; justify-content: space-between; }
    .feat .lbl em { font-style: normal; color: var(--mut); font-variant-numeric: tabular-nums; }
    .cbars { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .cbars .crow { display: grid; grid-template-columns: 150px 1fr 52px; align-items: center; gap: 8px; font-size: 13px; }
    .cbars .track { height: 8px; border-radius: 4px; background: var(--line); position: relative; overflow: hidden; }
    .cbars .fill { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--acc); }
    .cbars .fill.warn { background: var(--check); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
    th { text-align: left; color: var(--mut); font-weight: 500; font-size: 12px; padding: 4px 8px 4px 0; }
    td { padding: 5px 8px 5px 0; border-top: 1px solid var(--line); font-variant-numeric: tabular-nums; }
    .dots { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
    .dots i { width: 12px; height: 12px; border-radius: 50%; }
    .flags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .flags span { font-size: 12px; padding: 3px 10px; border-radius: 999px; background: var(--bg); color: var(--mut); }
    .up { color: var(--check); } .down { color: var(--stable); }
    .foot { margin-top: 18px; font-size: 12px; color: var(--mut); }
    .note { margin-top: 8px; font-size: 13px; color: var(--mut); }
  `;

  function renderApp(D, META) {
    const h = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const app = document.getElementById('app');
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = n => String(n).padStart(2, '0');
    const end = (() => { const d = new Date((D.period || {}).tms_end_date || Date.now()); return isNaN(d) ? new Date() : d; })();
    const dayDate = d => { const x = new Date(end); x.setDate(x.getDate() + d); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; };
    const hm = m => (m == null ? '' : ` ${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    const FEATURE_LABELS = {
      rt_median: 'Reaction time', mood: 'Mood', sleep_regularity: 'Sleep regularity',
      missed_sessions: 'Missed sessions', effort_hard_prop: 'Hard effort share', morning_pulse: 'Morning pulse',
      home_only_days: 'Home-only days', upright_frac: 'Upright time', reward_bias: 'Reward bias',
    };
    const STATE_LABELS = { stable: 'Stable', watch: 'Watch', check_in: 'Check in', booster: 'Booster' };
    const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
    const num = (v, d = 2) => (v == null ? '–' : Number(v.toFixed(d)));
    const card = (title, ...kids) => {
      const c = h('section', 'card');
      if (title) c.append(h('h2', null, title));
      kids.forEach(k => k && c.append(k));
      return c;
    };

    const top = h('header', 'top');
    const t = h('h1', null, 'Afferent summary');
    if (D.sim) t.append(h('span', 'sim', 'SIMULATED DATA'));
    top.append(t, h('p', 'sub', `Data from ${dayDate(D.period?.from_day ?? 0)} to ${dayDate(D.period?.to_day ?? 0)}`));
    const made = D.generated_iso || META.generated_iso;
    top.append(h('p', 'sub', `Made ${made ? new Date(made).toLocaleString() : '—'}${META.source ? ` · ${META.source}` : ''}`));
    app.append(top);

    const st = D.state || {}, comp = D.composite || {};
    const head = h('div', 'row');
    head.append(h('span', `chip ${st.shown || ''}`, STATE_LABELS[st.shown] || st.shown || '—'));
    const compVal = h('span', null);
    compVal.append(h('b', 'big', comp.value == null ? '–' : num(comp.value)));
    const tr = comp.trend_7d;
    if (tr != null) {
      const up = tr > 0;
      compVal.append(h('span', ` ${up ? 'up' : 'down'}`, ` ${up ? '▲' : '▼'} ${Math.abs(Math.round(tr * 100))}% / 7d`));
    }
    head.append(compVal);
    const meta = h('div', 'kv');
    [['Signal confidence', st.confidence || '–'],
     ['Since', st.since_day != null ? dayDate(st.since_day) : '–'],
     ['CUSUM', STATE_LABELS[st.cusum] || '–'],
     ['Check-in state', STATE_LABELS[st.phq_state] || '–'],
     ['Completeness', pct(comp.completeness)],
    ].forEach(([k, v]) => { const d = h('div'); d.append(h('b', null, String(v)), h('span', null, k)); meta.append(d); });
    const stateCard = card('Status', head, meta);
    const hist = (D.cusum || {}).history || [];
    if (hist.length) {
      const dots = h('div', 'dots');
      hist.forEach(e => dots.append(h('i')));
      hist.forEach((e, i) => {
        const c = { stable: 'var(--stable)', watch: 'var(--watch)', check_in: 'var(--check)', booster: 'var(--boost)' }[e.state] || 'var(--line)';
        dots.children[i].style.background = c;
        dots.children[i].title = `${dayDate(e.day)} · ${e.state}`;
      });
      stateCard.append(dots);
    }
    app.append(stateCard);

    const featBlock = (label, series, note) => {
      const f = h('div', 'feat');
      const vals = series.filter(v => v != null);
      const max = Math.max(...vals.map(Math.abs), 0.0001);
      const lbl = h('div', 'lbl');
      lbl.append(h('span', null, label),
                 h('em', null, note ?? (vals.length ? num(vals[vals.length - 1]) : '–')));
      const bars = h('div', 'bars');
      series.forEach(v => {
        const i = h('i', v == null ? 'none' : null);
        if (v != null) i.style.height = `${Math.max(6, Math.round(Math.abs(v) / max * 100))}%`;
        bars.append(i);
      });
      f.append(lbl, bars);
      return f;
    };

    const weekly = D.weekly || {};
    const keys = ['composite', ...Object.keys(FEATURE_LABELS).filter(k => k in weekly)];
    if (keys.length) {
      const wc = card('Weekly trend (8 weeks)');
      keys.forEach(k => wc.append(featBlock(k === 'composite' ? 'Composite' : FEATURE_LABELS[k] || k, weekly[k] || [])));
      app.append(wc);
    }

    const vit = D.vitals || {}, vw = vit.weekly || {};
    const VITAL_LABELS = { pulse_bpm: 'Pulse, bpm', breathing_per_min: 'Breathing, /min', rmssd_ms: 'HRV (RMSSD), ms' };
    const vk = Object.keys(VITAL_LABELS).filter(k => k in vw);
    if (vk.length) {
      const vc = card('Vitals (8 weeks)');
      vk.forEach(k => {
        const days = (vit.days || {})[k];
        const sim = (vit.simulated || {})[k];
        vc.append(featBlock(VITAL_LABELS[k], vw[k] || [],
          `${days != null ? days + 'd' : ''}${sim ? ' · sim' : ''}` || undefined));
      });
      app.append(vc);
    }

    const contrib = (D.contrib || []).filter(c => c.contribution != null);
    if (contrib.length) {
      const cc = card('What moved the signal');
      const box = h('div', 'cbars');
      const max = Math.max(...contrib.map(c => Math.abs(c.contribution)), 0.0001);
      contrib.slice(0, 8).forEach(c => {
        const r = h('div', 'crow');
        const track = h('div', 'track');
        const fill = h('div', `fill${c.contribution > 0 ? ' warn' : ''}`);
        fill.style.left = c.contribution > 0 ? '50%' : `${50 - Math.abs(c.contribution) / max * 50}%`;
        fill.style.width = `${Math.abs(c.contribution) / max * 50}%`;
        track.append(fill);
        r.append(h('span', null, FEATURE_LABELS[c.key] || c.key), track,
                 h('span', 'em', (c.contribution > 0 ? '+' : '') + num(c.contribution)));
        box.append(r);
      });
      cc.append(box);
      app.append(cc);
    }

    const m = D.mornings || {}, cpl = D.complete || {};
    const mk = h('div', 'kv');
    [['Lanterns lit', m.lit], ['Rested', m.rest], ['Missed', m.missed], ['Frozen', m.frozen],
     ['Played days', cpl.played_days], ['Sessions 7d', cpl.sessions_7d],
     ['Days tracked 7d', cpl.days_7d], ['Missed 7d', cpl.missed_7d],
    ].forEach(([k, v]) => { const d = h('div'); d.append(h('b', null, v == null ? '–' : String(v)), h('span', null, k)); mk.append(d); });
    const mCard = card('Mornings & completeness', mk);
    const bf = cpl.by_feature || {};
    const bfk = Object.keys(bf);
    if (bfk.length) {
      const flags = h('div', 'flags');
      bfk.forEach(k => flags.append(h('span', null, `${FEATURE_LABELS[k] || k}: ${pct(bf[k])}`)));
      mCard.append(flags);
    }
    app.append(mCard);

    const phq = D.phq || {};
    if ((phq.history || []).length || phq.baseline != null) {
      const pc = card('Check-ins');
      pc.append(h('p', 'sub', `Baseline ${phq.baseline ?? '–'} (${phq.baseline_source || 'app'})${phq.overdue ? ' · check-in overdue' : ''}${phq.last_status ? ` · last ${phq.last_status}` : ''}`));
      if ((phq.history || []).length) {
        const tb = h('table');
        const th = h('tr');
        th.append(h('th', null, 'Day'), h('th', null, 'Total'), h('th', null, 'Band'), h('th', null, ''));
        tb.append(th);
        phq.history.forEach(e => {
          const r = h('tr');
          r.append(h('td', null, dayDate(e.day)), h('td', null, String(e.total ?? '–')),
                   h('td', null, e.band || '–'), h('td', null, e.early ? 'early' : ''));
          tb.append(r);
        });
        pc.append(tb);
      }
      app.append(pc);
    }

    const safety = D.safety || [], talk = D.talk || [], pauses = D.pauses || [];
    if (safety.length || talk.length) {
      const sc = card('Safety & contact');
      if (safety.length) {
        const tb = h('table');
        const th = h('tr');
        th.append(h('th', null, 'Day'), h('th', null, 'Time'), h('th', null, 'Tier'), h('th', null, 'Source'));
        tb.append(th);
        safety.forEach(e => {
          const r = h('tr');
          const tier = h('td');
          tier.append(h('span', `chip tier ${e.tier || ''}`, e.tier || '–'));
          r.append(h('td', null, dayDate(e.day)), h('td', null, hm(e.minute).trim() || '–'), tier,
                   h('td', null, `${e.source || ''}${e.c6_repeat ? ' · c6 repeat' : ''}`));
          tb.append(r);
        });
        sc.append(tb);
      }
      if (talk.length) {
        sc.append(h('p', 'note', `Talk requests: ${talk.map(e => dayDate(e.day) + hm(e.minute)).join(' · ')}`));
      }
      app.append(sc);
    }

    const sensors = D.sensors || {};
    const sOn = Object.keys(sensors).filter(k => sensors[k]);
    if (pauses.length || sOn.length) {
      const xc = card('Context');
      if (pauses.length) xc.append(h('p', 'note', `Pauses: ${pauses.map(p => `${dayDate(p.from_day)} → ${dayDate(p.until_day)} (${p.source})`).join(' · ')}`));
      if (sOn.length) {
        const flags = h('div', 'flags');
        sOn.forEach(k => flags.append(h('span', null, k.replace(/_/g, ' '))));
        xc.append(flags);
      }
      app.append(xc);
    }

    const om = D.omitted || {};
    const omText = Object.entries(om).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ');
    app.append(h('p', 'foot', (omText ? `Not shown above: ${omText}. ` : '') +
      'This summary was made on the patient\u2019s device and transferred directly. Research prototype — not a medical device.'));
  }

  function render(body, meta = {}) {
    const esc = o => JSON.stringify(o).replace(/</g, '\\u003c');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Afferent summary</title>
<style>${CSS}</style>
</head>
<body>
<main id="app"></main>
<script>
(${renderApp.toString()})(${esc(body || {})}, ${esc(meta)});
</script>
</body>
</html>
`;
  }

  const DashGen = { render, renderApp };
  if (node) module.exports = DashGen;
  else (g.A = g.A || {}).DashGen = DashGen;
})();
