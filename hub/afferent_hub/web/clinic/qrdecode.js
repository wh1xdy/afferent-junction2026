(() => {
  const C = (window.C = window.C || {});
  const STATUS = { not_ours: 'foreign', part: 'part', damaged: 'invalid', newer_version: 'newer', expired: 'expired', future: 'future', ok: 'ok' };
  const codec = () => window.A?.QR || window.AfferentQR || null;

  function decode(text, now = Math.floor(Date.now() / 1000)) {
    const Q = codec();
    if (!Q) return { status: 'unavailable' };
    let r;
    try { r = Q.decode(String(text || ''), { now: now * 1000 }); } catch { return { status: 'invalid' }; }
    const status = STATUS[r.status] || 'invalid';
    if (status === 'part') return { status, text };
    return { status, reason: r.reason, iat: r.iat, exp: r.exp, cti: r.cti, pub: r.publicKey, fp: r.fingerprint, body: r.body };
  }

  const collector = () => {
    const Q = codec();
    return Q ? new Q.Collector() : { add: (t) => ({ status: String(t).startsWith('AF1:') ? 'complete' : 'not_ours', text: t }) };
  };

  C.qr = { decode, collector, get FEATURES() { return (codec()?.FEATURES || []).map((f) => f[0]); } };
})();
