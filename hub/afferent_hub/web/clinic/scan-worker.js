importScripts('/app/vendor/qr/jsQR.js');
onmessage = (e) => {
  const { id, data, width, height, invert } = e.data;
  let r = null;
  try { r = jsQR(new Uint8ClampedArray(data), width, height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' }); } catch {}
  postMessage({ id, text: r ? r.data : null, loc: r ? r.location : null, width, height });
};
