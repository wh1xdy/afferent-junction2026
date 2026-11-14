const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');
const dir = path.resolve(__dirname, '..');
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const shots = [
  ['start', 'start.html', phone],
  ['settings', 'settings.html', phone],
  ['settings-full', 'settings.html', phone, { full: true }],
  ['info', 'info.html', phone],
  ['question', 'question.html', phone],
  ['question-selected', 'question.html?sel=1', phone],
  ['crisis', 'crisis.html', phone],
  ['end-morning', 'end-morning.html', phone],
  ['end-morning-picked', 'end-morning.html?sel=4', phone],
  ['end-night', 'end-night.html', phone],
  ['end-asleep', 'end-night.html?asleep=1', phone],
  ['patient', 'patient.html', phone],
  ['patient-full', 'patient.html', phone, { full: true }],
  ['patient-dawn', 'patient.html?t=dawn', phone],
  ['clinic', 'clinic.html', desk],
  ['system', 'system.html', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }, { full: true }],
  ['index', 'index.html', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, { full: true }],
];
(async () => {
  const only = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, file, ctx, opt = {}] of shots) {
    if (only.length && !only.includes(name)) continue;
    const p = await b.newPage(ctx);
    p.on('pageerror', e => console.log(name, 'ERROR', e.message));
    await p.goto('file://' + path.join(dir, file));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(opt.wait || 900);
    await p.screenshot({ path: path.join(dir, 'shots', name + '.png'), fullPage: !!opt.full });
    await p.close();
    console.log('shot', name);
  }
  await b.close();
})();
