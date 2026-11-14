// Run: NODE_PATH=<dir with node_modules/playwright-core> node demo/tests/qrpayload.browser.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const DEMO = path.join(__dirname, '..');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const PAGE = `<!doctype html><meta charset="utf-8"><title>qr test</title>
<script src="/app/vendor/qr/qrcode.js"></script><script src="/app/vendor/qr/fflate.js"></script>
<script src="/app/vendor/qr/noble-p256.js"></script><script src="/app/vendor/qr/jsQR.js"></script>
<script src="/app/js/util.js"></script><script src="/app/js/qrpayload.js"></script><canvas id="c"></canvas>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/clinic/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
  const file = url.startsWith('/app/') && path.join(DEMO, path.normalize(url.slice(5)));
  if (!file || !file.startsWith(DEMO) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.addInitScript(() => { Object.defineProperty(Crypto.prototype, 'subtle', { get: () => undefined }); });
    await page.goto(base + '/clinic/');
    const body = await (await fetch(base + '/app/js/qr_body_fallback.json')).json();
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    const out = await page.evaluate(async body => {
      const QR = window.A.QR;
      const k1 = await QR.deviceKey();
      const k2 = await QR.deviceKey();
      const t0 = performance.now();
      const r = QR.encode(body, { key: k2, initial: 'a' });
      const encodeMs = performance.now() - t0;
      const m = QR.matrix(r.text, r.ecl);
      const px = 3, quiet = 4, side = (m.size + 2 * quiet) * px;
      const c = document.getElementById('c');
      c.width = c.height = side;
      const g = c.getContext('2d');
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, side, side);
      g.fillStyle = '#0E1A2E';
      for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.isDark(y, x)) g.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
      const img = g.getImageData(0, 0, side, side);
      const t1 = performance.now();
      const scan = jsQR(img.data, side, side);
      const scanMs = performance.now() - t1;
      const t2 = performance.now();
      const d = QR.decode(scan && scan.data);
      const decodeMs = performance.now() - t2;
      await QR.cacheBody(body);
      const cached = await QR.cachedBody();
      return {
        subtle: !!crypto.subtle, sameKey: QR.fingerprint(k1.public) === QR.fingerprint(k2.public),
        fp: r.fingerprint, version: r.versions[0], ecl: r.ecl, chars: r.chars, scanned: scan && scan.data === r.text,
        status: d.status, verified: d.verified, dfp: d.fingerprint, safety: d.body && d.body.safety.length,
        shown: d.body && d.body.state.shown, ini: d.body && d.body.ini, cached: !!cached && cached.v === 1 && !!cached.cached_iso,
        encodeMs, scanMs, decodeMs, global: window.AfferentQR === QR,
      };
    }, body);
    check('no crypto.subtle on the page', !out.subtle);
    check('device key persists in IndexedDB', out.sameKey, out.fp);
    check(`anna fits version 20 at M (${out.chars} chars, version ${out.version} ${out.ecl})`, out.version <= 20 && out.ecl === 'M');
    check('jsQR reads the canvas at 3 px per module', out.scanned);
    check('decode verifies', out.status === 'ok' && out.verified && out.dfp === out.fp, out.status);
    check('safety and state travel', out.safety === body.safety.length && out.shown === body.state.shown && out.ini === 'A');
    check('body cache round trip', out.cached);
    check('global AfferentQR', out.global);
    check(`timings encode ${out.encodeMs.toFixed(1)} ms, scan ${out.scanMs.toFixed(1)} ms, decode ${out.decodeMs.toFixed(1)} ms`, out.encodeMs < 500 && out.decodeMs < 100);
    check('no network request while encoding and decoding', requests.length === 0, requests.join(', '));
    check('no page errors', errors.length === 0, errors.join('; '));
  } finally {
    await browser.close();
    server.close();
  }
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail && !r.ok ? ': ' + r.detail : ''}`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
