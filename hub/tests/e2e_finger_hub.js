/*
  Cross-track end-to-end test of the finger sensor's hub HTTP path (Decisions I53, contracts/api.md 3.5),
  headless Chrome via playwright-core.

  SYNTHETIC INPUT. A fake UNO Q (an HTTP server in this file) answers GET /state with a hand-made
  "finger on the clip" document in the shape of uno-q/modulino-hub/app.py. No number here is a
  measurement, and nothing in this test touches the real UNO Q, the Jetson or a phone. It proves that
  the parts built on separate branches fit together, not that the hardware works.

  Run:      npm run design     (once, so /app/ finds its design tokens)
            NODE_PATH=<dir with node_modules/playwright-core> node hub/tests/e2e_finger_hub.js
  Options:  PORT=8195  UNOQ_PORT=18195  PYTHON=hub/.venv/bin/python  TIMEOUT_S=200  SHOTS=<dir for screenshots>

  It starts the fake UNO Q and its own hub (own database in the temp dir, bedside source
  unoq:http://127.0.0.1:<UNOQ_PORT>), opens the clinic dashboard and the game (autoplay, 60 s stage
  length) and checks the chain: fake /state -> hub adapter -> `physio` on both sockets -> phone
  recorder -> session document (validated against session.v3.schema.json) -> clinic Signals section,
  then the pulse_stone switch off and on. Exit code 0 on pass, 1 on fail.
*/
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.PORT || 8195;
const UNOQ_PORT = +process.env.UNOQ_PORT || 18195;
const PYTHON = process.env.PYTHON || path.join(ROOT, 'hub', '.venv', 'bin', 'python');
const TIMEOUT_MS = (+process.env.TIMEOUT_S || 200) * 1000;
const SHOTS = process.env.SHOTS || null;
const HUB = `http://127.0.0.1:${PORT}`;
const PATIENT = 'anna';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = async (p) => (await fetch(HUB + p, { cache: 'no-store' })).json();
const postJSON = async (p, body) => (await fetch(HUB + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
const parse = (f) => { try { return JSON.parse(String(f.payload)); } catch { return null; } };
const until = async (fn, ms, step = 250) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };

// ── fake UNO Q (SYNTHETIC) ─────────────────────────────────────────────────────────────
const unoq = { calls: [], power: [true, true], auto: true, since: Date.now() / 1000 - 90 };
const fakeState = () => {
  const now = Date.now() / 1000, on = unoq.power[0] && unoq.power[1];
  return {
    knob: null, climate: { celsius: 24.6, humidity: 28.0, t: now - 1 },
    beat: { bpm_live: on ? 72 : null, t: now, fused: true },
    fingers: [
      { bpm_live: on ? 72 : null, locked: on, ibi_ms: 833, peak_slope: 2000, locked_count: on ? 60 : 0, t: on ? now - 0.4 : unoq.offAt },
      { bpm_live: on ? 73 : null, locked: on, ibi_ms: 822, peak_slope: 1900, locked_count: on ? 58 : 0, t: on ? now - 0.7 : unoq.offAt },
    ],
    modulinos: { knob: true, thermo: true, buzzer: true, t: now - 1 }, bridge: 'connected',
    finger: on ? { bpm: 72, period_ms: 833, quality: 0.62, sources: [0, 1], fingers: [72, 73] }
      : { bpm: null, period_ms: null, quality: null, sources: [], fingers: [null, null] },
    breathing: on ? { per_minute: 6, snr: 4.2, channel: 0 } : { per_minute: null, snr: null, channel: null },
    hrv: on ? { rmssd_ms: 51.3, sdnn_ms: 47.9, mean_bpm: 72, pairs: 55, channel: 'both', baseline_rmssd_ms: 46.1, vs_baseline: 0.11 }
      : { rmssd_ms: null, sdnn_ms: null, mean_bpm: null, pairs: 0, channel: null, baseline_rmssd_ms: 46.1, vs_baseline: null },
    presence: { auto: unoq.auto, mode: 'active', since: unoq.since, last_probe_range: 2400 },
    ble: 'advertising', now,
  };
};
const fake = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), q = u.searchParams;
  const json = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'GET' && (u.pathname === '/state' || u.pathname === '/')) return json(200, fakeState());
  if (req.method !== 'POST') return json(404, { error: 'not found' });
  unoq.calls.push({ t: Date.now(), path: u.pathname + u.search });
  const flag = (k) => !['0', 'false', 'off'].includes(q.get(k) ?? '1');
  if (u.pathname === '/heartbeat') return json(200, { heartbeat_sound: flag('on') });
  if (u.pathname === '/presence') { unoq.auto = flag('auto'); return json(200, { auto: unoq.auto }); }
  if (u.pathname === '/sensor') {
    const ch = (+q.get('ch') || 0) % 2, was = unoq.power[0] && unoq.power[1];
    unoq.power[ch] = flag('on');
    const is = unoq.power[0] && unoq.power[1];
    if (was && !is) unoq.offAt = Date.now() / 1000;
    if (!was && is) unoq.since = Date.now() / 1000 - 30;
    return json(200, { ch, on: unoq.power[ch] });
  }
  if (u.pathname === '/led') return json(200, { ok: true });
  return json(404, { error: 'not found' });
});
const posted = (re, since = 0) => unoq.calls.filter((c) => c.t >= since && re.test(c.path));

(async () => {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); };
  let hub = null, browser = null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afferent-e2e-finger-'));
  const cleanup = async () => {
    try { await browser?.close(); } catch {}
    try { hub?.kill('SIGTERM'); } catch {}
    try { fake.close(); } catch {}
  };

  try {
    await new Promise((ok, bad) => { fake.once('error', bad); fake.listen(UNOQ_PORT, '127.0.0.1', ok); });
    hub = spawn(PYTHON, ['-m', 'uvicorn', 'afferent_hub.main:app', '--host', '127.0.0.1', '--port', String(PORT), '--log-level', 'warning'], {
      cwd: path.join(ROOT, 'hub'), stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, AFFERENT_BEDSIDE: `unoq:http://127.0.0.1:${UNOQ_PORT}`, AFFERENT_DB: path.join(tmp, 'hub.db'), AFFERENT_VALIDATION: '0' },
    });
    const health = await until(() => getJSON('/api/health').catch(() => null), 30000, 500);
    if (!health || !health.ok) throw new Error(`hub did not start on ${HUB}`);

    // ── A. hub adapter ──
    const bed = await until(async () => { const b = await getJSON('/api/bedside/state'); return b.physio && b.physio.pulse_bpm != null ? b : null; }, 10000);
    check('hub reads the fake UNO Q as unoq_http, connected, not simulated', bed && bed.source === 'unoq_http' && bed.connected === true && bed.simulated === false,
      bed ? `source ${bed.source}, connected ${bed.connected}, simulated ${bed.simulated}` : 'no physio within 10 s');
    const ph = bed && bed.physio;
    check('bedside state carries the physio object with a true source label',
      ph && ph.source === 'finger_ppg' && ph.transport === 'hub_http' && ph.simulated === false && ph.pulse_bpm === 72 && ph.quality === 0.62 && ph.quality_reported === true
        && JSON.stringify(ph.finger_bpm) === '[72,73]' && ph.breathing_per_min === 6 && ph.rmssd_ms === 51.3 && ph.sdnn_ms === 47.9 && ph.rmssd_vs_baseline === 0.11 && ph.presence === 'active',
      JSON.stringify(ph));
    check('bedside pulse is labelled finger_ppg', bed && bed.pulse && bed.pulse.bpm === 72 && bed.pulse.source === 'finger_ppg', JSON.stringify(bed && bed.pulse));
    check('hub muted the beep and did not touch the presence override', posted(/^\/heartbeat\?on=0$/).length >= 1 && posted(/^\/presence/).length === 0,
      unoq.calls.map((c) => c.path).join(' '));

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = { clinic: [], app: [] };
    const watch = (page, key) => {
      page.on('pageerror', (e) => errors[key].push('pageerror ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors[key].push('console ' + m.text()); });
    };

    // ── B. clinic view, current readings from the hub ──
    const clinic = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
    watch(clinic, 'clinic');
    const clinicMsgs = [];
    clinic.on('websocket', (ws) => ws.on('framereceived', (f) => { const m = parse(f); if (m) clinicMsgs.push({ t: Date.now(), m }); }));
    await clinic.goto(`${HUB}/clinic/#/p/${PATIENT}`, { waitUntil: 'networkidle' });
    const sigNow = () => clinic.evaluate(() => document.querySelector('#signals [data-part="now"]')?.innerText || '');
    const nowText = await until(async () => { const t = await sigNow(); return /72/.test(t) ? t : null; }, 10000);
    check('clinic Signals shows the hub readings with source and units',
      nowText && nowText.includes('finger sensor (PPG), hub HTTP') && nowText.includes('from the bedside source on the hub') && /HRV \(RMSSD\)/.test(nowText)
        && /51\.3\s*ms/.test(nowText) && /47\.9\s*ms/.test(nowText) && /72\s*bpm/.test(nowText) && /6\s*per min/.test(nowText) && nowText.includes('measuring'),
      (nowText || await sigNow()).replace(/\s+/g, ' ').slice(0, 400));
    check('measured values carry no Simulated badge', nowText && !/simulated/i.test(nowText));
    if (SHOTS) await clinic.screenshot({ path: `${SHOTS}/finger-clinic-now.png`, fullPage: true }).catch(() => {});

    // ── C. phone web layer ──
    const app = await browser.newPage({ viewport: { width: 430, height: 900 } });
    watch(app, 'app');
    const appSent = [], appRecv = [];
    app.on('websocket', (ws) => {
      ws.on('framesent', (f) => { const m = parse(f); if (m) appSent.push({ t: Date.now(), m }); });
      ws.on('framereceived', (f) => { const m = parse(f); if (m) appRecv.push({ t: Date.now(), m }); });
    });
    await app.goto(`${HUB}/app/?input=auto&patient=${PATIENT}&clock=morning&stage=1`, { waitUntil: 'load' });
    await app.waitForSelector('#begin', { state: 'visible', timeout: 15000 });
    const gotIt = app.locator('#checkin:not(.hidden) button', { hasText: 'Got it' });
    if (await gotIt.count()) { await gotIt.first().click(); await app.waitForSelector('#checkin', { state: 'hidden', timeout: 5000 }); }
    const hubFrame = await until(() => app.evaluate(() => { const h = A.Sensors.fingerHub; return h && h.pulse_bpm ? JSON.parse(JSON.stringify(h)) : null; }), 10000);
    check('phone takes the hub physio into A.Sensors', hubFrame && hubFrame.source === 'finger_ppg' && hubFrame.transport === 'hub_http' && hubFrame.pulse_bpm === 72 && hubFrame.sdnn_ms === 47.9,
      JSON.stringify(hubFrame));
    await app.click('#signalsBtn');
    const sheet = await until(() => app.evaluate(() => { const t = document.getElementById('signalsBody')?.innerText || ''; return /72/.test(t) ? t : null; }), 5000);
    check('Your signals sheet shows the values, calm and without diagnosis words',
      sheet && /home hub/i.test(sheet) && /Beat-to-beat variation/.test(sheet) && !/stress|diagnos|SIMULATED/i.test(sheet),
      (sheet || '').replace(/\s+/g, ' ').slice(0, 300));
    if (SHOTS) await app.screenshot({ path: `${SHOTS}/finger-app-signals.png` }).catch(() => {});
    await app.click('#signals button[data-close="signals"]');

    const tBegin = Date.now();
    await app.click('#begin', { delay: 1300 });
    while (Date.now() - tBegin < TIMEOUT_MS && !appRecv.some((r) => r.m.type === 'ack')) await app.waitForTimeout(500);
    await clinic.waitForTimeout(2500);

    const sentEnd = appSent.find((s) => s.m.type === 'session_end');
    const ack = appRecv.find((r) => r.m.type === 'ack');
    const doc = sentEnd && sentEnd.m.session;
    check('session played to the end and the hub acked it', doc && ack && ack.m.ok !== false, doc ? `status ${doc.status}, ${((Date.now() - tBegin) / 1000).toFixed(0)} s, ack ${JSON.stringify(ack && ack.m).slice(0, 120)}` : 'no session_end');
    const v = (doc && doc.vitals) || {}, f = v.finger || {};
    check('session pulse is the finger sensor, all real',
      doc && doc.signal.pulse_source === 'finger_ppg' && v.pulse_source === 'finger_ppg' && v.pulse_mean_bpm === 72
        && !(doc.simulated_fields || []).some((n) => n.startsWith('vitals') || /pulse/i.test(n)),
      doc ? `signal.pulse_source ${doc.signal.pulse_source}, vitals.pulse_mean_bpm ${v.pulse_mean_bpm}, simulated_fields ${JSON.stringify(doc.simulated_fields)}` : '');
    check('session records finger, breathing, HRV and the series from the hub path',
      f.source === 'finger_ppg' && f.transport === 'hub_http' && f.quality_reported === true && f.pulse_bpm && f.pulse_bpm.mean === 72 && f.pulse_bpm.samples >= 30
        && f.finger_1_bpm.mean === 72 && f.finger_2_bpm.mean === 73 && f.presence_s && f.presence_s.active >= 30
        && v.breathing && v.breathing.rate_per_min.mean === 6 && v.hrv && v.hrv.rmssd_ms.mean === 51.3 && v.hrv.sdnn_ms && v.hrv.sdnn_ms.mean === 47.9
        && v.hrv.rmssd_vs_baseline && v.hrv.rmssd_vs_baseline.mean === 0.11 && v.series && v.series.t_s.length >= 5,
      JSON.stringify({ finger: f, breathing: v.breathing, hrv: v.hrv }).slice(0, 700));
    if (doc) {
      const py = spawnSync(PYTHON, ['-c', [
        'import json, sys',
        'from jsonschema import Draft202012Validator',
        'doc = json.load(sys.stdin)',
        `schema = json.load(open(${JSON.stringify(path.join(ROOT, 'contracts', 'session.v3.schema.json'))}))`,
        'errs = [f"{e.json_path}: {e.message}" for e in Draft202012Validator(schema).iter_errors(doc)]',
        'print(json.dumps(errs[:5]))',
        'sys.exit(1 if errs else 0)',
      ].join('\n')], { input: JSON.stringify(doc), encoding: 'utf8' });
      check('the whole session document validates against session.v3.schema.json', py.status === 0, (py.stdout || py.stderr || '').trim().slice(0, 400));
    } else check('the whole session document validates against session.v3.schema.json', false, 'no session');

    const lives = clinicMsgs.filter((x) => x.m.type === 'live' && x.m.patient_id === PATIENT);
    const withPhysio = lives.filter((x) => x.m.physio && x.m.physio.source === 'finger_ppg' && x.m.physio.transport === 'hub_http');
    check('relayed live data carries physio and the finger_ppg pulse label',
      lives.length > 20 && withPhysio.length > lives.length * 0.8 && lives.filter((x) => x.m.pulse_source === 'finger_ppg').length > lives.length * 0.8
        && lives.every((x) => x.m.pulse_source !== 'simulated'),
      `${lives.length} live, ${withPhysio.length} with physio, sources ${[...new Set(lives.map((x) => x.m.pulse_source))].join(',')}`);

    const detail = await getJSON(`/api/patients/${PATIENT}`);
    const stored = detail.sessions[detail.sessions.length - 1];
    check('compact session row has vitals, pulse_source and simulated_fields',
      doc && stored && stored.session_id === doc.session_id && stored.vitals && stored.vitals.finger && stored.vitals.finger.transport === 'hub_http'
        && stored.pulse_source === 'finger_ppg' && Array.isArray(stored.simulated_fields),
      stored ? `session ${stored.session_id}, pulse_source ${stored.pulse_source}` : 'no stored session');
    const sesText = await until(() => clinic.evaluate(() => document.querySelector('#signals [data-part="session"]')?.innerText || null), 8000);
    check('clinic Signals shows the last session summary without a Simulated badge',
      sesText && /Last session with sensor data/.test(sesText) && sesText.includes('finger sensor (PPG), hub HTTP') && !/simulated/i.test(sesText),
      (sesText || '').replace(/\s+/g, ' ').slice(0, 400));
    const dawn = appSent.find((s) => s.m.type === 'light' && s.m.reason === 'dawn');
    check('dawn light reached the KY-016 through POST /led', dawn && posted(/^\/led\?r=\d+&g=\d+&b=\d+&ms=0$/, dawn.t - 500).length >= 1,
      `dawn ${JSON.stringify(dawn && dawn.m)}; led calls ${posted(/^\/led/).map((c) => c.path).join(' ')}`);
    if (SHOTS) {
      await clinic.screenshot({ path: `${SHOTS}/finger-clinic-end.png`, fullPage: true }).catch(() => {});
      await app.screenshot({ path: `${SHOTS}/finger-app-end.png` }).catch(() => {});
    }

    // ── D. the pulse_stone switch ──
    const tOff = Date.now();
    await postJSON(`/api/patients/${PATIENT}/privacy`, { sensor: 'pulse_stone', on: false });
    const offCalls = await until(() => { const c = posted(/^\/(presence|sensor)/, tOff).map((x) => x.path); return c.length >= 3 ? c : null; }, 6000);
    check('switch off: presence override, then both sensors powered down', JSON.stringify(offCalls) === JSON.stringify(['/presence?auto=0', '/sensor?ch=0&on=0', '/sensor?ch=1&on=0']), JSON.stringify(offCalls));
    const bedOff = await getJSON('/api/bedside/state');
    check('switch off: the hub holds no finger data', bedOff.physio === null && bedOff.pulse.bpm === null, JSON.stringify({ physio: bedOff.physio, pulse: bedOff.pulse }));
    await sleep(3500);
    const late = (list) => list.filter((x) => x.t > tOff + 1000 && (x.m.type === 'physio' || x.m.type === 'pulse'));
    check('switch off: nothing of the finger sensor is relayed', late(appRecv).length === 0 && late(clinicMsgs).length === 0, `app ${late(appRecv).length}, clinic ${late(clinicMsgs).length}`);
    const phoneOff = await app.evaluate(() => ({ enabled: A.Sensors.enabled.pulse_stone, frame: A.Sensors.fingerFrame(A.now()), pulse: A.Sensors.pulse(A.now()).source }));
    check('switch off: the phone drops finger data', phoneOff.enabled === false && phoneOff.frame === null && phoneOff.pulse !== 'finger_ppg', JSON.stringify(phoneOff));
    const clinicOff = await sigNow();
    check('switch off: the clinic shows no current finger value', !/72\s*bpm/.test(clinicOff), clinicOff.replace(/\s+/g, ' ').slice(0, 200));

    const tOn = Date.now();
    await postJSON(`/api/patients/${PATIENT}/privacy`, { sensor: 'pulse_stone', on: true });
    const onCalls = await until(() => { const c = posted(/^\/(presence|sensor)/, tOn).map((x) => x.path); return c.length >= 3 ? c : null; }, 6000);
    check('switch on: sensors powered, then control handed back', JSON.stringify(onCalls) === JSON.stringify(['/sensor?ch=0&on=1', '/sensor?ch=1&on=1', '/presence?auto=1']), JSON.stringify(onCalls));
    const back = await until(async () => { const b = await getJSON('/api/bedside/state'); return b.physio && b.physio.pulse_bpm === 72 ? b : null; }, 15000, 500);
    check('switch on: readings resume after the hold', !!back, back ? `after ${((Date.now() - tOn) / 1000).toFixed(1)} s` : 'no physio within 15 s');

    check('no errors in clinic page', errors.clinic.length === 0, errors.clinic.slice(0, 5).join(' | '));
    check('no errors in app page', errors.app.length === 0, errors.app.slice(0, 5).join(' | '));
  } catch (e) {
    check('test ran to the end', false, String(e && e.stack || e).slice(0, 600));
  }

  await cleanup();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed (synthetic input, no hardware)`);
  process.exit(failed ? 1 : 0);
})();
