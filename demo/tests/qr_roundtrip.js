const QR = require('../js/qrpayload.js');

let text = '';
process.stdin.on('data', d => { text += d; });
process.stdin.on('end', () => {
  const now = Date.now();
  const r = QR.encode(JSON.parse(text), { key: QR.newKey(), now });
  const d = QR.decode(r.parts.length === 1 ? r.text : r.parts, { now });
  process.stdout.write(JSON.stringify({ chars: r.chars, cap: QR.CAP_CHARS, parts: r.parts.length, versions: r.versions, ecl: r.ecl, shrink: r.shrink, face_left_out: r.faceLeftOut, status: d.status, verified: d.verified, body: d.body ?? null }) + '\n');
});
