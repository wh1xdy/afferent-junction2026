// Shared loader for the node tests: runs the plain browser scripts of demo/js in a vm context with a manual clock.
// Options: uuid (real random session ids instead of 'test'), finger (a fake Capacitor.Plugins.AfferentFinger), vitals (also load vitals.js),
// storage (a Map used as localStorage; without it there is none, as in a private window),
// games (the real task engine with the breathing task as its only task, instead of the stub tasks),
// breathing (false leaves breathing.js out: the app without the measured breathing).
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

// A 2D context that draws nothing and writes every call and every property it is given to `log`.
const recorder = log => {
  const flat = x => x !== null && typeof x === 'object' ? 'object' : x;
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(state, {
    get: (t, k) => k in t ? t[k] : (...a) => { log.push([k, ...a.map(flat)]); return { addColorStop() {} }; },
    set: (t, k, v) => { t[k] = v; log.push([k, flat(v)]); return true; },
  });
};

const load = ({ uuid = false, finger = false, vitals = false, storage = null, games = false, breathing = true } = {}) => {
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
  const plugin = finger ? fakeFinger() : null;
  if (plugin) ctx.Capacitor = { Plugins: { AfferentFinger: plugin } };
  vm.createContext(ctx);
  const run = f => vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  run('util.js');
  let clock = 0;
  vm.runInContext(`A.now = () => __clock(); A.config = { baselinePulse: 68, sensors: { bedside_light: false, pulse_stone: true, phone_camera: true }, patientId: 'test', deviceId: 'test', appVersion: 'test', sharing: 'summary', dawnLevel: 15 };`, Object.assign(ctx, { __clock: () => clock }));
  for (const f of ['sensors.js', 'finger.js', 'input.js', ...(breathing ? ['breathing.js'] : []), 'record.js']) run(f);
  const noop = () => {};
  ctx.A.Audio = new Proxy({}, { get: () => noop });
  const game = id => ({ id, modes: [], make: () => ({ id, max: 12, t: 0, done: false, items: 0, errors: 0, update: noop, draw: noop, choices: [], trials: [], rewards: { rich: 0, lean: 0 }, counts: () => ({ rc: 0, ri: 0, lc: 0, li: 0 }) }) });
  ctx.A.MINIGAMES = { breath: { ...game('breath'), modes: ['calm', 'rest'], world: true }, loyly: { ...game('loyly'), modes: ['calm'] }, threads: { ...game('threads'), modes: ['flow'] }, constellation: { ...game('constellation'), modes: ['flow'] }, fireflies: { ...game('fireflies'), modes: ['wake'] }, beacon: { ...game('beacon'), modes: ['wake', 'fatigue'] }, bells: { ...game('bells'), modes: ['wake', 'fatigue'] }, shutters: { ...game('shutters'), modes: ['fatigue'] } };
  ctx.A.MEASURES = { fork: game('fork'), lanterns: game('lanterns') };
  ctx.A.makeCheckin = () => ({ t: 0, done: false, update: noop, auto(dt, now) { this.done = true; this.finishedAt = now; this.choice = 3; this.decisionMs = 900; } });
  ctx.A.pickGame = (mode, last, w) => {
    const pool = Object.keys(ctx.A.MINIGAMES).filter(id => ctx.A.MINIGAMES[id].modes.includes(mode) && id !== last && (!w || (w[id] ?? 0) > 0));
    return { id: pool[0], weight: null };
  };
  if (games) for (const f of ['juice.js', 'skill.js', 'minigames.js', 'tasks/breath.js']) run(f);
  run('traverse.js');
  run('engine.js');
  if (vitals) run('vitals.js');
  return { A: ctx.A, ctx, tick: dt => { clock += dt; }, plugin };
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

module.exports = { load, run, plain, fakeFinger, recorder, JS };
