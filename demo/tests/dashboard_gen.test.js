const fs = require('fs');
const path = require('path');
const assert = require('assert');
const DashGen = require('../js/dashboard_gen.js');

const ROOT = path.join(__dirname, '..', '..');
const fixture = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts', 'fixtures', 'qr_body_anna.json'), 'utf8'));
const FORBIDDEN = ['phq9', 'phq9_9', 'cssrs', 'item9', 'display_name', 'patient_id', 'checkin_id', 'displayName'];

const results = [];
const test = (name, fn) => {
  try { fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
};

const html = DashGen.render(fixture(), { source: 'test', patient: 'anna' });

test('returns a full html document', () => {
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('</html>'));
});

test('embeds the body as a script literal', () => {
  const body = fixture();
  const marker = JSON.stringify(body.state.shown).slice(1, -1);
  assert.ok(html.includes(`"${marker}"`), 'state value missing');
  assert.ok(html.includes('('), 'renderer call missing');
});

test('has inline style and no external assets', () => {
  assert.ok(html.includes('<style>'));
  assert.ok(!/src="http|href="http|url\(http|import\(/.test(html), 'external reference found');
  assert.ok(!/src="(?!data:)/.test(html.replace(/<script>/g, '')), 'external script src');
});

test('escapes closing script tags inside data', () => {
  const evil = { state: { shown: 'stable' }, period: { tms_end_date: '2026-11-14' }, note: '</script><img src=x>' };
  const out = DashGen.render(evil, {});
  assert.ok(!out.includes('</script><img'), 'unescaped </script> in payload');
});

test('keeps the qr-body forbidden keys out', () => {
  for (const k of FORBIDDEN) assert.ok(!html.includes(`"${k}"`), `forbidden key leaked: ${k}`);
});

test('renderer source is serializable and self-contained', () => {
  const src = DashGen.renderApp.toString();
  assert.ok(src.includes('function renderApp'));
  assert.ok(!/require\(|import\s/.test(src));
});

test('empty body renders without throwing references', () => {
  const out = DashGen.render({}, {});
  assert.ok(out.includes('<!doctype html>'));
});

// Runs the renderer on a tiny fake DOM and returns each card as { title, text }.
function cards(D) {
  const node = tag => ({ tag, className: '', textContent: '', title: '', style: {}, children: [], append(...k) { this.children.push(...k); } });
  const app = node('main');
  const saved = global.document;
  global.document = { createElement: node, getElementById: () => app };
  try { DashGen.renderApp(D, {}); } finally { global.document = saved; }
  const text = n => [n.textContent, ...n.children.map(text)].filter(Boolean).join(' ');
  return app.children.filter(c => c.className === 'card').map(c => ({ title: c.children[0].textContent, text: text(c) }));
}
const ROOM = { weekly: { temp_c_night: [null, 19.4, 21.6, 22.1, null, 18.7, 20.3, 23.5], humidity_pct: [null, 41, 38, 35, null, 44, 40, 29] },
  nights: 31, simulated: false, sleep_c: [16, 19], night: '23:00 to 07:00' };

test('the bedroom at night: its own card with the last week, nights and the sleep range', () => {
  const c = cards({ ...fixture(), room: ROOM }).find(x => x.title === 'Bedroom at night (8 weeks)');
  assert.ok(c, 'room card');
  for (const t of ['Temperature at night, °C', '23.5', 'Humidity at night, %', '29', '31 nights with a reading', 'about 16 to 19 °C', '23:00 to 07:00']) assert.ok(c.text.includes(t), t);
  assert.ok(!/sim/.test(c.text), 'measured nights carry no simulated mark');
  const sim = cards({ ...fixture(), room: { ...ROOM, simulated: true } }).find(x => x.title === 'Bedroom at night (8 weeks)');
  assert.ok(sim.text.includes('23.5 · sim') && sim.text.includes('with a reading, simulated'));
  assert.ok(!/too (warm|hot|cold)|should|warning|alarm/i.test(c.text), 'no judgement');
});

test('the bedroom at night: no card without a reading, and never from the QR body alone', () => {
  const titles = D => cards(D).map(x => x.title);
  assert.ok(!titles(fixture()).includes('Bedroom at night (8 weeks)'), 'the qr-body has no room');
  assert.ok(!('room' in fixture()));
  const empty = { ...ROOM, weekly: { temp_c_night: Array(8).fill(null), humidity_pct: Array(8).fill(null) }, nights: 0 };
  assert.ok(!titles({ ...fixture(), room: empty }).includes('Bedroom at night (8 weeks)'));
  const dry = cards({ ...fixture(), room: { ...ROOM, weekly: { ...ROOM.weekly, humidity_pct: Array(8).fill(null) } } }).find(x => x.title === 'Bedroom at night (8 weeks)');
  assert.ok(dry.text.includes('Temperature at night') && !dry.text.includes('Humidity at night'));
});

let fail = 0;
for (const [st, name, err] of results) {
  if (st === 'FAIL') { fail++; console.log('FAIL', name, '-', err); }
  else console.log(' ok', name);
}
console.log(`${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
