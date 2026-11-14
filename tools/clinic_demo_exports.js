const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const QR = require(path.join(ROOT, 'demo', 'js', 'qrpayload.js'));
const OUT = path.join(ROOT, 'hub', 'afferent_hub', 'web', 'clinic', 'demo-exports.json');
const python = process.env.PYTHON || 'python3';

const bodies = JSON.parse(execFileSync(python, [path.join(__dirname, 'clinic_demo_bodies.py')], { maxBuffer: 1 << 26 }).toString());
const keys = new Map();
const list = bodies.map((e, i) => {
  if (!keys.has(e.label)) keys.set(e.label, QR.newKey());
  const at = Date.parse(e.exported_iso);
  const r = QR.encode(e.body, { key: keys.get(e.label), now: at, initial: e.initial });
  const received = new Date(at + (90 + 37 * i) * 1000);
  const check = QR.decode(r.text || r.parts, { now: received.getTime() });
  if (check.status !== 'ok') throw new Error(`${e.label}: ${check.status}`);
  return { label: e.label, received_iso: received.toISOString(), parts: r.parts };
});
fs.writeFileSync(OUT, JSON.stringify({ schema: 'afferent.clinic-demo-exports/1', exports: list }, null, 1) + '\n');
console.log(`${list.length} exports to ${path.relative(ROOT, OUT)}`);
