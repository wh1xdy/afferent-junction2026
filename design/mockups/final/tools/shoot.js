// Usage: PW=<path to playwright-core> node shoot.js [name ...]
const { chromium } = require(process.env.PW || 'playwright-core');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8000/app/design/mockups/final/';
const OUT = path.resolve(__dirname, '../shots');
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };
const shots = [
  ['start-night', 'start.html'],
  ['start-first-night', 'start.html?first=1&cam=1'],
  ['start-day-checkin', 'start.html?sky=dawn&checkin=1'],
  ['start-dark-room', 'start.html?room=dark'],
  ['info', 'info.html'],
  ['anchor', 'anchor.html'],
  ['settings', 'settings.html'],
  ['settings-full-dev', 'settings.html?dev=1', { full: true }],
  ['settings-hub-dialog', 'settings.html?dialog=hub'],
  ['checkin-intro', 'checkin-intro.html'],
  ['checkin-intro-paused', 'checkin-intro.html?paused=1'],
  ['question', 'question.html?q=1'],
  ['question-selected', 'question.html?q=2&sel=1'],
  ['question-long', 'question.html?q=8'],
  ['question-dark', 'question.html?q=4&sky=dawn'],
  ['cssrs-intro', 'checkin-intro.html?v=cssrs'],
  ['cssrs-question', 'question.html?set=cssrs&q=2'],
  ['thanks', 'done.html?v=thanks'],
  ['saved', 'done.html?v=saved'],
  ['support', 'crisis.html?v=support'],
  ['crisis', 'crisis.html?v=crisis'],
  ['talk', 'crisis.html?v=talk'],
  ['end-asleep-touched', 'end.html?v=asleep&touched=1'],
  ['end-night', 'end.html?v=night'],
  ['end-night-offer', 'end.html?v=night&offer=1'],
  ['end-morning', 'end.html?v=morning'],
  ['end-asleep', 'end.html?v=asleep'],
  ['patient', 'patient.html'],
  ['patient-full', 'patient.html', { full: true }],
  ['clinic', 'clinic.html', { desk: true }],
  ['clinic-safety', 'clinic.html?p=juha', { desk: true }],
  ['index', 'index.html', { desk: true, full: true }],
];
(async () => {
  const only = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  for (const [name, url, o = {}] of shots) {
    if (only.length && !only.includes(name)) continue;
    const p = await b.newPage({ viewport: o.desk ? DESK : PHONE, deviceScaleFactor: o.desk ? 1 : 2 });
    p.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    p.on('requestfailed', r => errors.push(`${name}: failed ${r.url()}`));
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(250);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (sw > 0) errors.push(`${name}: horizontal overflow ${sw}px`);
    await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!o.full, animations: 'disabled' });
    await p.close();
  }
  await b.close();
  console.log(errors.length ? errors.join('\n') : 'no errors');
})();
