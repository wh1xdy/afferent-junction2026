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

test('the face numbers of the body are not in the file', () => {
  const body = fixture();
  body.face = { weekly: { smile_share: [null, 0.43219, 0.1, 0, null, 0.2, 0.3, 0.4], blinks_per_min: Array(8).fill(17.8931), gaze_away_share: Array(8).fill(0.05677) },
    days: { smile_share: 19, blinks_per_min: 19, gaze_away_share: 19 }, simulated: { smile_share: false, blinks_per_min: false, gaze_away_share: false } };
  const out = DashGen.render(body, { source: 'test', patient: 'anna' });
  for (const s of ['"face"', 'smile_share', 'blinks_per_min', 'gaze_away_share', '0.43219', '17.8931', '0.05677']) assert.ok(!out.includes(s), s);
  assert.ok(out.includes('"vitals"') && out.includes(JSON.stringify(body.state.shown)), 'the rest of the body is still there');
  assert.ok(body.face, 'the caller\'s body is not changed');
});

test('empty body renders without throwing references', () => {
  const out = DashGen.render({}, {});
  assert.ok(out.includes('<!doctype html>'));
});

let fail = 0;
for (const [st, name, err] of results) {
  if (st === 'FAIL') { fail++; console.log('FAIL', name, '-', err); }
  else console.log(' ok', name);
}
console.log(`${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
