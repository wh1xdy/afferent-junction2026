// Shared loader for the node tests: runs the plain browser scripts of demo/js in a vm context with a manual clock.
// Options: uuid (real random session ids instead of 'test'), finger (a fake Capacitor.Plugins.AfferentFinger), vitals (also load vitals.js),
// camera (a fake Capacitor.Plugins.AfferentPulse and a document with a `hidden` flag),
// face (the face half of a fake Capacitor.Plugins.AfferentPulse, or 'core' for a Capacitor.registerPlugin proxy of a plugin the native side does not have,
// plus a document with `hidden` and visibilitychange so the visibility rule can be tested),
// storage (a Map used as localStorage; without it there is none, as in a private window),
// games (the real task engine with the breathing task as its only task, instead of the stub tasks),
// breathing (false leaves breathing.js out: the app without the measured breathing),
// audio (an A.Audio to use instead of the silent stub), music (an A.Music to load the engine next to).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const JS = path.join(__dirname, '..', 'js');

const fakeFinger = () => {
  const ls = { state: [], reading: [] };
  return {
    running: false, starts: 0, stops: 0,
    async addListener(ev, fn) { ls[ev].push(fn); return { remove: () => { ls[ev] = ls[ev].filter(f => f !== fn); } }; },
    async start() { this.running = true; this.starts++; return { state: 'scanning' }; },
    async stop() { this.running = false; this.stops++; },
    async status() { return { state: this.running ? 'scanning' : 'off', name: null }; },
    emit(ev, d) { ls[ev].forEach(f => f(d)); },
    count(ev) { return ls[ev].length; },
  };
};

const fakeCamera = () => {
  let ls = [];
  return {
    running: false, starts: 0, stops: 0, reject: null,
    async addListener(ev, fn) { ls.push(fn); return { remove: () => { ls = ls.filter(f => f !== fn); } }; },
    async start() {
      if (this.reject) throw Object.assign(new Error(this.reject), { code: this.reject });
      this.running = true; this.starts++;
      return { state: 'on' };
    },
    async stop() { this.running = false; this.stops++; },
    async status() {
      const off = { state: this.reject || 'off', measuring: false, reason: this.reject || 'off', warmup_s_left: null, face: null, locked: false, t_ms: null };
      return this.running ? { state: 'on', measuring: false, reason: 'exposure_not_locked', warmup_s_left: 8.8, face: null, locked: false, t_ms: null, ...this.now } : off;
    },
    emit(d) { ls.forEach(f => f(d)); },
    count() { return ls.length; },
  };
};

// Same surface as the face half of the AfferentPulse plugin (ios/App/App/FaceMeasures.swift): faceStart() -> { state }, faceStop(),
// faceStatus() -> { state }, events faceState, face, micro, and the five gaze calibration methods with the native results and reasons.
// The JS method faceStart reaches start() here, faceStop stop() and faceStatus status() (see fakePulse).
// The native plugin holds calibrationPoint open for hold_ms; this one answers at once. `cal.point` and `cal.fit` script the answers:
// cal.point = ({ x, y, hold_ms }) => ({ ok, samples, spread_deg, reason }), cal.fit = { ok, gain_x, ..., reason }.
const fakeFace = () => {
  const ls = { faceState: [], face: [], micro: [] };
  const none = { gain_x: null, gain_y: null, offset_x_deg: null, offset_y_deg: null, residual_deg: null };
  return {
    running: false, starts: 0, stops: 0, first: 'starting',
    cal: { started: false, dots: [], stored: null, point: null, fit: null },
    async addListener(ev, fn) { ls[ev].push(fn); return { remove: () => { ls[ev] = ls[ev].filter(f => f !== fn); } }; },
    async start() { this.running = true; this.starts++; return { state: this.first }; },
    async stop() { this.running = false; this.stops++; return {}; },
    async status() { return { state: this.running ? this.first : 'off' }; },
    async calibrationStart() {
      Object.assign(this.cal, { started: true, dots: [] });
      return { screen_w_cm: 6.5, screen_h_cm: 14.1, density: 'model' };
    },
    async calibrationPoint({ x, y, hold_ms } = {}) {
      if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw Object.assign(new Error('x and y are 0 to 1 of the page'), { code: 'bad_point' });
      const no = reason => ({ ok: false, samples: 0, spread_deg: null, reason });
      if (!this.cal.started) return no('not_started');
      if (!this.running) return no('not_running');
      const hold = Math.min(5000, Math.max(300, hold_ms ?? 1000));
      const r = this.cal.point?.({ x, y, hold_ms: hold }) ?? { ok: true, samples: Math.round(hold * 0.06), spread_deg: 0.4, reason: null };
      if (r.ok) this.cal.dots.push({ x, y, samples: r.samples });
      return r;
    },
    async calibrationFinish() {
      const c = this.cal, points = c.dots.length, samples = c.dots.reduce((a, d) => a + d.samples, 0);
      if (!c.started) return { ok: false, ...none, samples: 0, points: 0, reason: 'not_started' };
      c.started = false;
      if (points < 5) return { ok: false, ...none, samples: 0, points, reason: 'too_few_points' };
      const r = { ok: true, gain_x: 2.1, gain_y: 2.4, offset_x_deg: -1.5, offset_y_deg: 3.2, residual_deg: 1.1, reason: null, ...c.fit, samples, points };
      if (r.ok) c.stored = { at_ms: Date.now(), residual_deg: r.residual_deg };
      return r;
    },
    async calibrationStatus() { const s = this.cal.stored; return { calibrated: !!s, at_ms: s?.at_ms ?? null, residual_deg: s?.residual_deg ?? null }; },
    async calibrationClear() { this.cal.stored = null; return {}; },
    emit(ev, d) { ls[ev].forEach(f => f(d)); },
    count(ev) { return ls[ev].length; },
  };
};

// What @capacitor/core's registerPlugin gives for a name the native side has not registered: every call rejects.
const unimplemented = () => {
  const fail = async () => { throw Object.assign(new Error('"AfferentPulse" plugin is not implemented on ios'), { code: 'UNIMPLEMENTED' }); };
  return { calls: 0, addListener() { this.calls++; return fail(); }, start: fail, stop: fail, status: fail, faceStart: fail, faceStop: fail, faceStatus: fail,
    calibrationStart: fail, calibrationPoint: fail, calibrationFinish: fail, calibrationStatus: fail, calibrationClear: fail };
};

// The one AfferentPulse plugin as the native side registers it (ios/App/App/AfferentPulse.swift): the camera pulse half
// (start, stop, status, event pulse) is a fakeCamera, the face half (faceStart, faceStop, faceStatus, events faceState, face,
// micro, the calibration methods) a fakeFace. Each half keeps its own counters, as pulse and face start and stop on their own.
const CALIBRATION = ['calibrationStart', 'calibrationPoint', 'calibrationFinish', 'calibrationStatus', 'calibrationClear'];
const fakePulse = (cam, face) => {
  const p = { addListener: async (ev, fn) => { const half = ev === 'pulse' ? cam : face; if (!half) throw new Error(`no listener for ${ev}`); return half.addListener(ev, fn); } };
  if (cam) Object.assign(p, { start: () => cam.start(), stop: () => cam.stop(), status: () => cam.status() });
  if (face) {
    Object.assign(p, { faceStart: () => face.start(), faceStop: () => face.stop(), faceStatus: () => face.status() });
    for (const m of CALIBRATION) p[m] = o => face[m](o);
  }
  return p;
};

// A 2D context that draws nothing and writes every call and every property it is given to `log`.
const recorder = log => {
  const flat = x => x !== null && typeof x === 'object' ? 'object' : x;
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(state, {
    get: (t, k) => k in t ? t[k] : (...a) => { log.push([k, ...a.map(flat)]); return { addColorStop() {} }; },
    set: (t, k, v) => { t[k] = v; log.push([k, flat(v)]); return true; },
  });
};

const load = ({ uuid = false, finger = false, camera = false, vitals = false, face = false, storage = null, games = false, breathing = true, audio = null, music = null } = {}) => {
  const ctx = { console, Math, Date, JSON, Set, Map, Object, Array, Number, String, setTimeout: () => 0, setInterval: () => 0, URLSearchParams, crypto: { randomUUID: uuid ? () => nodeCrypto.randomUUID() : () => 'test' } };
  ctx.window = ctx;
  if (storage) ctx.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, String(v)); }, removeItem: k => { storage.delete(k); } };
  ctx.navigator = {};
  ctx.location = { search: '', protocol: 'file:', pathname: '/' };
  ctx.addEventListener = () => {};
  if (games) {
    const mem = {};
    ctx.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
    ctx.performance = { now: () => 0 };
    ctx.document = { addEventListener: () => {}, getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => recorder([]) }) };
  }
  const plugin = finger ? fakeFinger() : null, cam = camera ? fakeCamera() : null;
  const facePlugin = face === 'core' ? unimplemented() : face ? fakeFace() : null, docListeners = {};
  const pulse = cam || (facePlugin && face !== 'core') ? fakePulse(cam, face === 'core' ? null : facePlugin) : null;
  if (plugin || pulse) ctx.Capacitor = { Plugins: { ...(plugin ? { AfferentFinger: plugin } : {}), ...(pulse ? { AfferentPulse: pulse } : {}) } };
  if (face === 'core') ctx.Capacitor = { ...ctx.Capacitor, registerPlugin: () => facePlugin };
  if (face) ctx.document = { getElementById: () => null, ...ctx.document, hidden: false, addEventListener: (t, f) => (docListeners[t] = docListeners[t] || []).push(f) };
  vm.createContext(ctx);
  const run = f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  run('util.js');
  let clock = 0;
  vm.runInContext(`A.now = () => __clock(); A.config = { baselinePulse: 68, sensors: { bedside_light: false, pulse_stone: true, phone_camera: true }, patientId: 'test', deviceId: 'test', appVersion: 'test', sharing: 'summary', dawnLevel: 15 };`, Object.assign(ctx, { __clock: () => clock }));
  for (const f of ['sensors.js', 'finger.js', 'campulse.js', 'face.js', 'input.js', ...(breathing ? ['breathing.js'] : []), 'record.js']) run(f);
  const noop = () => {};
  ctx.A.Audio = audio || new Proxy({}, { get: () => noop });
  if (music) ctx.A.Music = music;
  const game = id => ({ id, modes: [], make: () => ({ id, max: 12, t: 0, done: false, items: 0, errors: 0, update: noop, draw: noop, choices: [], trials: [], rewards: { rich: 0, lean: 0 }, counts: () => ({ rc: 0, ri: 0, lc: 0, li: 0 }) }) });
  ctx.A.MINIGAMES = { breath: { ...game('breath'), modes: ['calm', 'rest'], world: true }, loyly: { ...game('loyly'), modes: ['calm'] }, threads: { ...game('threads'), modes: ['flow'] }, constellation: { ...game('constellation'), modes: ['flow'] }, fireflies: { ...game('fireflies'), modes: ['wake'] }, beacon: { ...game('beacon'), modes: ['wake', 'fatigue'] }, bells: { ...game('bells'), modes: ['wake', 'fatigue'] }, shutters: { ...game('shutters'), modes: ['fatigue'] } };
  ctx.A.MEASURES = { fork: game('fork'), lanterns: game('lanterns') };
  ctx.A.makeCheckin = () => ({ t: 0, done: false, update: noop, auto(dt, now) { this.done = true; this.finishedAt = now; this.choice = 3; this.decisionMs = 900; } });
  ctx.A.pickGame = (mode, last, played) => {
    const all = Object.keys(ctx.A.MINIGAMES).filter(id => ctx.A.MINIGAMES[id].modes.includes(mode));
    let pool = all.filter(id => id !== last && !played?.has(id));
    if (!pool.length) pool = all.filter(id => id !== last);
    if (!pool.length) pool = all;
    return { id: pool[0], p: 1 / pool.length };
  };
  if (games) for (const f of ['juice.js', 'skill.js', 'minigames.js', 'tasks/breath.js']) run(f);
  run('traverse.js');
  run('engine.js');
  if (vitals) run('vitals.js');
  if (cam && !ctx.document) ctx.document = { hidden: false };
  const fire = t => Promise.all((docListeners[t] || []).map(f => f()));
  return { A: ctx.A, ctx, tick: dt => { clock += dt; }, plugin, cam, facePlugin, fire, doc: ctx.document };
};

// Advance a session in 50 ms steps; `each` runs before every step, `second` once per whole simulated second.
const run = (A, tick, s, seconds, each, second) => {
  for (let i = 0; i < seconds * 20; i++) {
    each?.();
    if (i % 20 === 0) second?.(i / 20);
    tick(0.05); A.Input.update(A.now(), 0.05); s.update(A.now(), 0.05);
  }
};

// Objects made inside the vm context have their own prototypes; compare plain copies.
const plain = x => JSON.parse(JSON.stringify(x));

module.exports = { load, run, plain, fakeFinger, fakeCamera, fakeFace, recorder, JS };
