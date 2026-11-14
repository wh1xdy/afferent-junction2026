/*
  End-to-end live demo test (headless Chrome via playwright-core).

  1. Start the hub:   ./start.sh --reset
  2. Run the test:    NODE_PATH=<dir with node_modules/playwright-core> node hub/tests/e2e_live_demo.js
     Options (env):   HUB=http://localhost:8000  CLOCK=morning|night  TIMEOUT_S=240  SHOTS=<dir for screenshots>

  It opens the clinic dashboard and the game (autoplay, ?input=auto) side by side, lets one session
  play to the end and checks: the session reached the hub as Anna's newest session, the dashboard
  updated live without a reload, the bedside light changed at dawn, and neither page threw an error.
  Exit code 0 on pass, 1 on fail. The session stays in the database; reset with
  curl -X POST localhost:8000/api/demo/reset
*/
const { chromium } = require('playwright-core');

const HUB = (process.env.HUB || 'http://localhost:8000').replace(/\/$/, '');
const CLOCK = process.env.CLOCK ? `&clock=${process.env.CLOCK}` : '';
const TIMEOUT_MS = (+process.env.TIMEOUT_S || 240) * 1000;
const SHOTS = process.env.SHOTS || null;
const PATIENT = 'anna';

const getJSON = async (path) => (await fetch(HUB + path, { cache: 'no-store' })).json();
const parse = (f) => { try { return JSON.parse(String(f.payload)); } catch { return null; } };

(async () => {
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); };

  const health = await getJSON('/api/health').catch(() => null);
  if (!health || !health.ok) { console.error(`hub not reachable at ${HUB}`); process.exit(1); }
  const before = await getJSON(`/api/patients/${PATIENT}`);
  const beforeIds = new Set(before.sessions.map((s) => s.session_id));
  const bedsideBefore = await getJSON('/api/bedside/state');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = { clinic: [], app: [] };
  const watch = (page, key) => {
    page.on('pageerror', (e) => errors[key].push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors[key].push('console ' + m.text()); });
  };

  const clinic = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(clinic, 'clinic');
  const clinicMsgs = [];
  clinic.on('websocket', (ws) => ws.on('framereceived', (f) => { const m = parse(f); if (m) clinicMsgs.push({ t: Date.now(), m }); }));
  await clinic.goto(HUB + '/clinic/', { waitUntil: 'networkidle' });
  await clinic.waitForFunction(() => window.C && C.state && C.state.list && C.state.ws && C.state.ws.readyState === 1, null, { timeout: 15000 });
  await clinic.evaluate(() => { window.__noReload = true; });
  const rowBefore = await clinic.evaluate((id) => JSON.parse(JSON.stringify(C.state.list.patients.find((p) => p.id === id))), PATIENT);

  const app = await browser.newPage({ viewport: { width: 430, height: 900 } });
  watch(app, 'app');
  const appSent = [], appRecv = [];
  app.on('websocket', (ws) => {
    ws.on('framesent', (f) => { const m = parse(f); if (m) appSent.push({ t: Date.now(), m }); });
    ws.on('framereceived', (f) => { const m = parse(f); if (m) appRecv.push({ t: Date.now(), m }); });
  });
  await app.goto(`${HUB}/app/?input=auto&patient=${PATIENT}${CLOCK}`, { waitUntil: 'load' });
  await app.waitForSelector('#begin', { state: 'visible', timeout: 15000 });
  await app.waitForTimeout(1000);
  await app.click('#begin');
  const t0 = Date.now();

  let shotAt = 0;
  while (Date.now() - t0 < TIMEOUT_MS) {
    if (appRecv.some((r) => r.m.type === 'ack')) break;
    if (SHOTS && Date.now() - shotAt > 30000) {
      shotAt = Date.now();
      const s = Math.round((shotAt - t0) / 1000);
      await app.screenshot({ path: `${SHOTS}/e2e-app-${s}s.png` }).catch(() => {});
      await clinic.screenshot({ path: `${SHOTS}/e2e-clinic-${s}s.png` }).catch(() => {});
    }
    await app.waitForTimeout(500);
  }
  const elapsed = (Date.now() - t0) / 1000;
  await clinic.waitForTimeout(2500);
  if (SHOTS) {
    await app.screenshot({ path: `${SHOTS}/e2e-app-end.png` }).catch(() => {});
    await clinic.screenshot({ path: `${SHOTS}/e2e-clinic-end.png` }).catch(() => {});
  }

  const sentEnd = appSent.find((s) => s.m.type === 'session_end');
  const ack = appRecv.find((r) => r.m.type === 'ack');
  const sid = sentEnd && sentEnd.m.session && sentEnd.m.session.session_id;
  check('game sent session_end', sentEnd, sentEnd ? `${sid}, status ${sentEnd.m.session.status}, ${elapsed.toFixed(1)} s` : `none after ${elapsed.toFixed(0)} s`);
  check('hub acked session', ack && ack.m.ok !== false, ack ? JSON.stringify(ack.m).slice(0, 160) : 'no ack');

  const after = await getJSON(`/api/patients/${PATIENT}`);
  const newest = after.sessions[after.sessions.length - 1];
  const latest = after.latest_session;
  check('hub stores it as newest session', sid && !beforeIds.has(sid) && newest && newest.session_id === sid && latest && latest.session_id === sid,
    `sessions ${before.sessions.length} -> ${after.sessions.length}, newest ${newest && newest.session_id}, day ${newest && newest.day_index}`);

  const types = (list, pred) => list.filter((x) => pred(x.m)).map((x) => x.m.type);
  const forPatient = (m) => !m.patient_id || m.patient_id === PATIENT;
  const seen = new Set(types(clinicMsgs, forPatient));
  check('dashboard got session_started', seen.has('session_started'));
  check('dashboard got live metrics', clinicMsgs.some((x) => x.m.type === 'live' && forPatient(x.m)), `${clinicMsgs.filter((x) => x.m.type === 'live').length} live`);
  check('dashboard got session_added', seen.has('session_added'));
  check('dashboard got analytics_updated', clinicMsgs.some((x) => x.m.type === 'analytics_updated' && x.m.patient_id === PATIENT));

  const state = await clinic.evaluate((id) => ({
    noReload: window.__noReload === true,
    row: JSON.parse(JSON.stringify(C.state.list.patients.find((p) => p.id === id))),
    toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent),
  }), PATIENT);
  check('dashboard did not reload', state.noReload);
  const rowChanged = JSON.stringify(state.row) !== JSON.stringify(rowBefore);
  check('dashboard row updated in place', rowChanged,
    `composite ${rowBefore.composite} -> ${state.row.composite}, last session ${rowBefore.last_session_iso} -> ${state.row.last_session_iso}, live_now ${state.row.live_now}`);

  const dawnSent = appSent.find((s) => s.m.type === 'light' && s.m.reason === 'dawn');
  const bedsideLights = clinicMsgs.filter((x) => x.m.type === 'bedside_state' && x.m.light).map((x) => ({ t: x.t, ...x.m.light }));
  const atDawn = dawnSent && bedsideLights.find((l) => l.t >= dawnSent.t - 200 && l.reason === 'dawn');
  const bedsideAfter = await getJSON('/api/bedside/state');
  check('game sent dawn light', dawnSent, dawnSent ? JSON.stringify(dawnSent.m) : 'no light with reason dawn');
  check('bedside light changed at dawn', atDawn && (atDawn.rgb !== bedsideBefore.light.rgb || atDawn.level !== bedsideBefore.light.level),
    atDawn ? `${bedsideBefore.light.rgb}/${bedsideBefore.light.level} -> ${atDawn.rgb}/${atDawn.level} (${atDawn.reason}); now ${bedsideAfter.light.rgb}/${bedsideAfter.light.level} (${bedsideAfter.light.reason})` : `bedside lights seen: ${bedsideLights.map((l) => l.reason + ':' + l.level).join(' ')}`);

  check('no errors in clinic page', errors.clinic.length === 0, errors.clinic.slice(0, 5).join(' | '));
  check('no errors in app page', errors.app.length === 0, errors.app.slice(0, 5).join(' | '));

  await browser.close();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
